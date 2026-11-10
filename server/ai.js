'use strict';
/**
 * On-the-fly category generation with Claude (+ Wikidata in parallel).
 *
 * Speed & depth strategy:
 *  - A small "core" stream returns the polished prompt, a SIZE estimate, a
 *    Wikidata LOOKUP hint and the obvious answers within a couple of seconds.
 *    The round is playable as soon as ~12 answers exist.
 *  - The moment SIZE arrives, letter-range "fan-out" streams launch in parallel —
 *    more of them for bigger categories — each tagging every answer with a tier.
 *    Broad categories end up with thousands of Trailhead/Backcountry answers;
 *    tiny ones aren't padded with nonsense.
 *  - Wikidata runs at the same time and merges real, fame-ranked members.
 *  - While the category is still in play, extra "waves" keep searching deeper.
 *  - Golden Antler: when the category maps to a Wikidata class, Wikidata picks the nichest
 *    VERIFIABLE member (fewest Wikipedia editions, then fewest readers). Claude's NICHEST
 *    suggestions are checked against Wikidata and only take the antler if they're real and
 *    nicher still. Without a Wikidata class, Claude's lowest "% who'd know it" wins.
 *
 * Requires ANTHROPIC_API_KEY. Without it, questions.js uses Wikidata + fallbacks.
 */
const fs = require('fs');
const path = require('path');
const { Category } = require('./answers');
const { cleanText, polishPrompt, answerKey } = require('./util');
const wikidata = require('./wikidata');
const hunt = require('./hunt');

let Anthropic = null;
try { Anthropic = require('@anthropic-ai/sdk'); Anthropic = Anthropic.default || Anthropic; } catch { /* optional */ }

const MODEL = process.env.MIVI_AI_MODEL || 'claude-opus-5-5';
const FAST = process.env.MIVI_AI_FAST === '1'; // Opus fast mode (premium pricing)
const USE_FALLBACKS = process.env.MIVI_AI_FALLBACKS !== '0';
const CONCURRENCY = Math.max(2, parseInt(process.env.MIVI_AI_CONCURRENCY || '16', 10));
const WAVES = Math.max(0, parseInt(process.env.MIVI_AI_WAVES || '1', 10)); // extra deep-search waves while in play
const READY_AT = 12;
const SLICE_MODEL = process.env.MIVI_AI_SLICE_MODEL || MODEL; // e.g. a faster model for the bulk letter slices
const JUDGE_MODEL = process.env.MIVI_AI_JUDGE_MODEL || MODEL; // e.g. a faster model for live referee calls
const CACHE_VERSION = 3; // bump when generation quality changes so stale boards are re-scouted
const CACHE_MAX_ENTRIES = 80000; // total answers kept in the notebook on disk

const SYSTEM = `You build answer boards for Mivimoose Party, a fast multiplayer party game in the style of Krillion: players take turns naming ONE valid answer to a category prompt, and nicher answers score more.

Rarity tiers (how readily people think of an answer):
- K (Kindling): the handful almost everyone says first.
- T (Trailhead): a typical person could come up with it within a minute.
- B (Backcountry): known to fans, enthusiasts or well-read people.
- D (Deep Woods): genuinely obscure, but verifiable in a specialist reference.
For broad categories most valid answers are T or B — reserve D for the truly obscure.

Rules:
- Plain text only, one item per line, exactly in the requested format. No numbering, headings or commentary.
- Every answer must be real and unambiguously satisfy the prompt. Never invent, stretch the category, or include near-misses. Fewer correct answers beat more doubtful ones.
- Canonical names are the most common English name ("Garlic", not "Allium sativum"). Aliases (optional, after "|") are other names people really type: short forms, nicknames, scientific or original-language names ("T. rex", "soccer") — never plurals or case variants.
- Family-friendly only.`;

const FANOUT = {
  tiny: [],
  small: [['A', 'Z']],
  medium: [['A', 'F'], ['G', 'L'], ['M', 'R'], ['S', 'Z']],
  large: [['A', 'C'], ['D', 'F'], ['G', 'I'], ['J', 'L'], ['M', 'O'], ['P', 'R'], ['S', 'S'], ['T', 'Z']],
  huge: [['A', 'B'], ['C', 'C'], ['D', 'E'], ['F', 'G'], ['H', 'I'], ['J', 'K'], ['L', 'M'], ['N', 'O'], ['P', 'P'], ['Q', 'R'], ['S', 'S'], ['T', 'T'], ['U', 'Z']],
};
const PER_SLICE = { tiny: 80, small: 150, medium: 120, large: 140, huge: 170 };
const TAG = { K: 'kindling', T: 'trailhead', B: 'backcountry', D: 'deepwoods' };

const coreInstr = (p) => `Category: "${p}"

Line 1: "PROMPT: <the category as a clear, family-friendly 'Name a/an ...' prompt (fix typos, keep the intent)>" — or, if it is hateful, sexual, or has fewer than ~8 valid answers, only "REJECT: <short reason>" and stop.
Line 2: "SIZE: tiny|small|medium|large|huge" — roughly how many valid answers exist (<40, 40–200, 200–1000, 1000–5000, 5000+).
Line 3: "LOOKUP: <class>" or "LOOKUP: <class> | <entity>" if the answers are simply members of one encyclopedia class (e.g. "dog breed", "film | Pixar", "country | Africa", "painter"); otherwise "LOOKUP: none".
Then 5–8 lines "K: <answer | aliases>" — the answers most people say first.
Then 10–16 lines "T: <answer | aliases>" — other well-known answers.
Last line: "NICHEST: <the most obscure answer you are certain is correct> | <estimated % of people who'd recognise it, e.g. 0.3> | <fun fact under 120 characters>".`;

const sliceInstr = (p, [a, b], n, wave) => `Category: "${p}"

List up to ${n} ${wave ? 'MORE answers that most lists would miss — favour B and D, skip the famous ones —' : 'answers'} whose canonical name starts with ${a === b ? `the letter ${a}` : `a letter from ${a} to ${b}`} (ignore a leading "The", "A" or "An"; include digits with A).
Each line: "TIER|Canonical name|alias|alias" where TIER is T, B or D (aliases optional).
Final line: "NICHEST|<the most obscure answer in your list>|<estimated % of people who'd recognise it>|<fun fact under 120 characters>".
If no valid answers start with those letters, output only "NONE".`;

const webInstr = (p, n) => `Category: "${p}"

This category needs current or niche facts, so search the web first — official pages and channels, Wikipedia lists, fan wikis, charts and databases — and only list answers the results confirm.
Then output up to ${n} answers, one per line and nothing else: "TIER|Canonical name|alias|alias", where TIER is K (almost everyone would say it), T (well known), B (fans would know it) or D (obscure). Use any view counts, sales or chart positions you saw to set the tier. For videos, songs or episodes, the canonical name is the exact title.
Final line: "NICHEST|<the most obscure answer in your list>|<estimated % of people who'd recognise it>|<fun fact under 120 characters>".`;

const WEB_TOOL = { type: 'web_search_20260209', name: 'web_search' };
const WEB_TOOL_BASIC = { type: 'web_search_20250305', name: 'web_search' }; // for models without dynamic filtering

class Limiter {
  constructor(n) { this.n = n; this.active = 0; this.q = []; }
  run(fn, priority = false) {
    return new Promise((resolve, reject) => {
      const task = () => { this.active++; fn().then(resolve, reject).finally(() => { this.active--; this.next(); }); };
      if (this.active < this.n) task();
      else if (priority) this.q.unshift(task); else this.q.push(task);
    });
  }
  next() { while (this.q.length && this.active < this.n) this.q.shift()(); }
}

class AIGen {
  constructor({ dataDir, log = console } = {}) {
    this.log = log;
    this.cacheFile = path.join(dataDir, 'generated.json');
    this.cache = new Map(); // promptKey -> def (AI and Wikidata-generated categories)
    this.judgeCache = new Map();
    this.inflight = new Map();
    this.limiter = new Limiter(CONCURRENCY);
    try {
      const raw = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
      for (const d of raw) if ((d.v || 0) >= CACHE_VERSION) this.cache.set(d.key, d);
    } catch { /* none yet */ }
    this._client = null;
  }

  get enabled() {
    return !!(Anthropic && (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN));
  }

  get client() {
    if (!this._client) this._client = new Anthropic({ maxRetries: 1 });
    return this._client;
  }

  _params(extra) {
    const p = { model: MODEL, ...extra };
    const betas = [];
    if (USE_FALLBACKS) { betas.push('server-side-fallback-2026-07-01'); p.fallbacks = 'default'; }
    if (FAST) { betas.push('fast-mode-2026-02-01'); p.speed = 'fast'; }
    if (betas.length) p.betas = betas;
    return p;
  }

  static promptKey(p) { return answerKey(p).slice(0, 120); }

  /** Remember a finished generated category (AI or Wikidata) for instant reuse. */
  remember(category, extra = {}) {
    const key = AIGen.promptKey(category.prompt);
    if (!key || category.size < 5) return;
    this.cache.delete(key); // re-insert as newest
    this.cache.set(key, { key, v: CACHE_VERSION, ...category.toJSON(), total: category.size, generated: true, source: category.source, sourceLabel: category.sourceLabel, ...extra });
    let total = 0;
    for (const d of this.cache.values()) total += d.total || 0;
    while (this.cache.size > 1 && (this.cache.size > 300 || total > CACHE_MAX_ENTRIES)) {
      const [k, d] = this.cache.entries().next().value;
      total -= d.total || 0;
      this.cache.delete(k);
    }
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => fs.writeFile(this.cacheFile, JSON.stringify([...this.cache.values()]), () => {}), 1000);
  }

  cachedList() {
    return [...this.cache.values()].map((d) => ({ id: d.id, prompt: d.prompt, total: d.total }));
  }

  getCached(prompt) {
    const d = this.cache.get(AIGen.promptKey(polishPrompt(prompt))) || this.cache.get(AIGen.promptKey(prompt));
    return d ? new Category({ ...d, generated: true, sourceLabel: d.sourceLabel || 'Ranger notebook' }) : null;
  }

  async _streamLines(instr, maxTokens, onLine, signal, priority = false, model = MODEL) {
    return this.limiter.run(async () => {
      if (signal?.aborted) return null;
      const stream = this.client.beta.messages.stream(this._params({
        model,
        max_tokens: maxTokens,
        system: SYSTEM,
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: instr }],
      }), { signal });
      let buf = '';
      stream.on('text', (delta) => {
        buf += delta;
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) onLine(line);
        }
      });
      const msg = await stream.finalMessage();
      if (buf.trim()) onLine(buf.trim());
      if (msg.stop_reason === 'refusal') throw new Error('The ranger declined that category.');
      return msg;
    }, priority);
  }

  /**
   * Generate a category on the fly. Returns { category, ready, done, abort, how }.
   *  - ready: resolves once the round is playable (~12 answers)
   *  - done:  resolves when the first full search pass is finished (waves may continue while in play)
   */
  generate(rawPrompt, { onProgress } = {}) {
    const prompt = polishPrompt(rawPrompt);
    const key = AIGen.promptKey(prompt);
    const cached = this.cache.get(key);
    if (cached) {
      const category = new Category({ ...cached, generated: true });
      return { category, ready: Promise.resolve(category), done: Promise.resolve(category), abort() {}, how: 'cache' };
    }
    if (this.inflight.has(key)) return this.inflight.get(key);

    const controller = new AbortController();
    const signal = controller.signal;
    const category = new Category({ id: 'ai-' + Date.now().toString(36), prompt, source: 'ai', sourceLabel: 'Ranger-generated', generated: true, complete: false, goldenScale: 'pct' });
    category.sources = new Set(['ai']);
    const web = hunt.needsWeb(prompt);
    if (web) category.web = true;
    const webController = new AbortController(); // a "too few answers" REJECT must not stop the web rescue
    let rejectReason = null;
    let promptSeen = false;
    let size = null;
    let lastProgress = 0;
    const tasks = [];
    let readyResolve, readyReject;
    const ready = new Promise((res, rej) => { readyResolve = res; readyReject = rej; });
    let isReady = false;
    const markReady = () => { if (!isReady && !rejectReason) { isReady = true; readyResolve(category); } };
    const progress = (force) => {
      if (!isReady && promptSeen && category.size >= READY_AT) markReady();
      const now = Date.now();
      if (onProgress && (force || now - lastProgress > 150)) { lastProgress = now; onProgress(category); }
    };
    // Golden Antler candidates from Claude wait until we know whether Wikidata can verify them
    const nicheQueue = [];
    let nicheMode = null; // 'verify' (Wikidata class known) | 'pct' (no class — trust Claude's estimate)
    const offerNiche = (answer, pct, fact) => {
      const n = parseFloat(String(pct).replace(/[^\d.]/g, ''));
      if (!answer || !Number.isFinite(n) || answer.length > 80) return;
      if (!nicheMode) { nicheQueue.push([answer, n, fact]); return; }
      if (nicheMode === 'pct') { const e = category.add(answer, 'deepwoods'); category.offerGolden(e, n, fact); return; }
      wikidata.judge(category.wd, answer).then((v) => {
        if (!v?.valid || !Number.isFinite(v.sl) || signal.aborted) return;
        const e = category.match(v.canonical || answer, { typo: false })?.entry || category.add(`${cleanText(v.canonical || answer, 80)}|${answer}`, 'deepwoods');
        if (e && e.tier !== 'kindling' && e.tier !== 'trailhead') category.offerGolden(e, v.sl + 0.5, fact);
      }).catch(() => {});
    };
    const settleNiche = (mode) => {
      if (nicheMode) return;
      nicheMode = mode;
      category.goldenScale = mode === 'verify' ? 'sl' : 'pct';
      for (const c of nicheQueue.splice(0)) offerNiche(...c);
    };

    // Wikidata in parallel: from the raw prompt now, or from Claude's LOOKUP hint if that fails
    // deep search on the web (Claude's web search tool) — once per category
    let webP = null;
    const runWeb = (why) => webP || (webP = this.webHunt(prompt, {
      signal: webController.signal,
      onLine: (tier, rest) => { category.add(rest, tier); category.sources.add('web'); if (!promptSeen && category.size >= READY_AT) promptSeen = true; progress(); },
      onNiche: (a, pct, fact) => offerNiche(a, pct, fact),
    }).then((n) => { this.log.info?.(`[ai] web search (${why}) found ${n} for "${prompt}"`); return n; })
      .catch((err) => { if (!webController.signal.aborted) this.log.warn?.(`[ai] web search failed: ${err.message}`); return 0; }));
    // free Wikipedia lists/categories when Wikidata has no class for it
    let freeP = null;
    const runFree = () => freeP || (freeP = hunt.wikiInto(category, prompt, () => progress()).catch(() => 0));
    if (web) tasks.push(runWeb('live web question'));
    // a Wikipedia list that IS this category ("List of Pixar films") is the most complete answer key there is
    tasks.push(hunt.listsInto(category, prompt, () => { category.sources.add('wikipedia'); progress(); }).catch(() => 0));

    const wdOpts = () => ({ into: category, goldenOwner: true, onProgress: () => { category.sources.add('wikidata'); progress(); } });
    let wdJob = wikidata.generate(prompt, wdOpts());
    let hint = null;
    const wdTried = wdJob.ready.then(() => true, () => false);
    wdTried.then((ok) => { if (ok) settleNiche('verify'); });
    tasks.push(wdJob.done.catch(() => {}));
    const tryHint = () => wdTried.then((ok) => {
      if (ok) return;
      if (!hint || hint === 'none' || signal.aborted) { settleNiche('pct'); tasks.push(runFree()); return; }
      wdJob = wikidata.generate(prompt, { ...wdOpts(), hint });
      wdJob.ready.then(() => settleNiche('verify'), () => { settleNiche('pct'); tasks.push(runFree()); });
      return wdJob.done.catch(() => {});
    });

    const launchFanout = (sz) => {
      if (size) return;
      size = FANOUT[sz] ? sz : 'medium';
      const ranges = size === 'tiny' ? [['A', 'Z']] : FANOUT[size];
      const n = PER_SLICE[size];
      for (const r of ranges) tasks.push(runSlice(sliceInstr(prompt, r, n, false), Math.round(n * 9)).catch((err) => { if (!signal.aborted) this.log.warn?.(`[ai] slice ${r.join('-')} failed: ${err.message}`); }));
      if (size === 'tiny' || size === 'small') tasks.push(wdTried.then((ok) => (ok ? 0 : runWeb('niche category'))));
    };

    const runSlice = (instr, maxTokens) => this._streamLines(instr, maxTokens, (line) => {
      if (line === 'NONE' || /^NONE\b/i.test(line)) return;
      if (line === 'NONE') return;
      const parts = line.split('|').map((s) => s.trim());
      const tag = parts[0].toUpperCase().replace(/[^A-Z]/g, '');
      if (tag === 'NICHEST') { offerNiche(parts[1], parts[2], parts.slice(3).join(' ')); return; }
      const tier = TAG[tag];
      const rest = parts.slice(1).filter(Boolean).join('|');
      if (tier && rest && rest.length < 120) category.add(rest, tier === 'kindling' ? 'trailhead' : tier);
      progress();
    }, signal, false, SLICE_MODEL);

    const core = this._streamLines(coreInstr(prompt), 2200, (line) => {
      const m = /^(PROMPT|REJECT|SIZE|LOOKUP|NICHEST|K|T)\s*:\s*(.+)$/i.exec(line.replace(/^[-*•\s]+/, ''));
      if (!m) return;
      const tag = m[1].toUpperCase(), val = m[2].trim();
      if (tag === 'PROMPT') { category.prompt = polishPrompt(val) || category.prompt; promptSeen = true; }
      else if (tag === 'REJECT') {
        const why = cleanText(val, 140);
        if (/few|not enough|too (?:small|narrow|niche|obscure)|obscure|insufficient|unclear|ambiguous|not sure|unknown/i.test(why) && !/hate|sexual|explicit|offensive|violen|inappropriate/i.test(why)) {
          promptSeen = true; // keep the player's wording and search the web for it
          tasks.push(runWeb('rescue: ' + why), runFree());
        } else { rejectReason = why; controller.abort(); webController.abort(); wdJob.abort(); readyReject(new Error(rejectReason)); }
      }
      else if (tag === 'SIZE') launchFanout(val.toLowerCase().replace(/[^a-z]/g, ''));
      else if (tag === 'LOOKUP') { hint = cleanText(val, 80).toLowerCase() === 'none' ? 'none' : cleanText(val, 80); tasks.push(tryHint()); }
      else if (tag === 'K') category.add(val, 'kindling');
      else if (tag === 'T') category.add(val, 'trailhead');
      else if (tag === 'NICHEST') { const [a, pct, ...fact] = val.split('|').map((s) => s.trim()); offerNiche(a, pct, fact.join(' ')); }
      progress();
    }, signal, true);

    // a thin first pass searches harder (web + Wikipedia) before giving up
    const rescueThin = async (fallbackMsg) => {
      if (isReady || rejectReason) return;
      await Promise.allSettled([runWeb('thin first pass'), wdTried.then((ok) => (ok ? 0 : runFree()))]);
      if (category.size >= 4) { promptSeen = true; markReady(); } else if (!isReady) readyReject(new Error(rejectReason || fallbackMsg));
    };
    core.then(() => {
      promptSeen = true;
      if (!size) launchFanout('medium');
      if (category.size >= 4) markReady();
      else rescueThin('Not enough answers for that category.');
    }, (err) => { rescueThin(err.message); });

    // first full pass, then deeper waves while the category is still being played
    const waitAll = async () => {
      let seen = 0;
      while (seen < tasks.length) { const batch = tasks.slice(seen); seen = tasks.length; await Promise.allSettled(batch); }
    };
    const done = (async () => {
      await core.catch(() => {});
      await waitAll();
      if (!nicheMode) settleNiche(category.wd ? 'verify' : 'pct');
      if (rejectReason) throw new Error(rejectReason);
      if (category.size < 4) throw new Error('Not enough answers for that category.');
      progress(true);
      this.inflight.delete(key);
      this.remember(category);
      return category;
    })();
    done.then(async () => {
      // keep searching past the first pass while campers are still on this trail
      if (!WAVES || !['medium', 'large', 'huge'].includes(size)) { category.complete = true; onProgress?.(category); return; }
      for (let w = 0; w < WAVES && category.active !== false && !signal.aborted; w++) {
        const ranges = FANOUT[size];
        await Promise.allSettled(ranges.map((r) => runSlice(sliceInstr(category.prompt, r, PER_SLICE[size], true), Math.round(PER_SLICE[size] * 9))));
        progress(true);
      }
      category.complete = true;
      this.remember(category);
      onProgress?.(category);
    }, () => {});
    done.catch(() => {});
    ready.catch(() => { controller.abort(); wdJob.abort(); this.inflight.delete(key); });

    const job = { category, ready, done, abort: () => { controller.abort(); webController.abort(); wdJob.abort(); }, how: 'ai' };
    this.inflight.set(key, job);
    return job;
  }

  /**
   * Deep search with Claude's web search tool, for categories Claude can't list reliably from memory:
   * a YouTube channel's videos, this year's releases, small fandoms. Streams "TIER|name" lines into onLine.
   * Returns how many answers it found.
   */
  async webHunt(prompt, { signal, onLine, onNiche, max = 150, maxUses = 5 } = {}) {
    let tool = { ...WEB_TOOL, max_uses: maxUses };
    const messages = [{ role: 'user', content: webInstr(prompt, max) }];
    let found = 0;
    const handle = (raw) => {
      const line = raw.replace(/^[-*•\s]+/, '').trim();
      if (!line.includes('|')) return;
      const parts = line.split('|').map((x) => x.trim());
      const tag = parts[0].toUpperCase().replace(/[^A-Z]/g, '');
      if (tag === 'NICHEST') { onNiche?.(parts[1], parts[2], parts.slice(3).join(' ')); return; }
      const tier = TAG[tag];
      const rest = parts.slice(1).filter(Boolean).join('|');
      if (tier && rest && rest.length < 160) { found++; onLine?.(tier, rest); }
    };
    for (let turn = 0; turn < 4; turn++) {
      if (signal?.aborted) break;
      let msg;
      try {
        msg = await this.limiter.run(async () => {
          const stream = this.client.beta.messages.stream(this._params({
            max_tokens: 12000,
            system: SYSTEM,
            tools: [tool],
            output_config: { effort: 'medium' },
            messages,
          }), { signal: signal || AbortSignal.timeout(120000) });
          let buf = '';
          stream.on('text', (delta) => {
            buf += delta;
            let nl;
            while ((nl = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, nl)); buf = buf.slice(nl + 1); }
          });
          const m = await stream.finalMessage();
          if (buf.trim()) handle(buf);
          return m;
        }, true);
      } catch (err) {
        // a model without the newer search tool: retry once with the basic one
        if (err?.status === 400 && tool.type === WEB_TOOL.type && /web_search|tool/i.test(err.message || '')) { tool = { ...WEB_TOOL_BASIC, max_uses: maxUses }; continue; }
        throw err;
      }
      if (msg.stop_reason === 'refusal') break;
      // a long server-side search loop pauses; send it back as-is and the server picks up where it left off
      if (msg.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: msg.content }); continue; }
      break;
    }
    return found;
  }

  /** Web-checked referee for live/niche trails, when Claude's memory alone says no. ~3–8s. */
  async webJudge(prompt, answer) {
    const ck = 'web::' + AIGen.promptKey(prompt) + '::' + answerKey(answer);
    if (this.judgeCache.has(ck)) return this.judgeCache.get(ck);
    let tool = { ...WEB_TOOL, max_uses: 2 };
    const ask = () => this.client.beta.messages.create(this._params({
      max_tokens: 3000,
      tools: [tool],
      output_config: { effort: 'low' },
      messages: [{
        role: 'user',
        content: `Party game referee. Category: "${prompt}". A player answered: "${cleanText(answer, 80)}".
Search the web to check whether this is a genuinely correct answer (allow misspellings, short forms and alternate titles; reject near-misses). Reply with exactly one line and nothing else:
"VALID|<canonical name>|<kindling, trailhead, backcountry or deepwoods>|<estimated % of people who'd recognise it>" or "INVALID".`,
      }],
    }), { signal: AbortSignal.timeout(20000) });
    let msg;
    try { msg = await ask(); } catch (err) {
      if (err?.status === 400 && /web_search|tool/i.test(err.message || '')) { tool = { ...WEB_TOOL_BASIC, max_uses: 2 }; msg = await ask(); } else throw err;
    }
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const m = /VALID\|([^|\n]+)\|\s*(kindling|trailhead|backcountry|deepwoods)\s*\|\s*([\d.]+)/i.exec(text);
    const out = m && !/INVALID/i.test(text.slice(0, m.index)) ? { valid: true, canonical: cleanText(m[1], 80), tier: m[2].toLowerCase(), known_pct: parseFloat(m[3]), by: 'web' } : { valid: false };
    this.judgeCache.set(ck, out);
    return out;
  }

  /** Ask a ranger whether an unlisted answer is valid (+ how niche it is). ~1s. */
  async judge(prompt, answer) {
    const ck = AIGen.promptKey(prompt) + '::' + answerKey(answer);
    if (this.judgeCache.has(ck)) return this.judgeCache.get(ck);
    const msg = await this.client.beta.messages.create(this._params({
      model: JUDGE_MODEL,
      max_tokens: 1500,
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              valid: { type: 'boolean' },
              canonical: { type: 'string' },
              tier: { type: 'string', enum: ['kindling', 'trailhead', 'backcountry', 'deepwoods'] },
              known_pct: { type: 'number' },
            },
            required: ['valid', 'canonical', 'tier', 'known_pct'],
            additionalProperties: false,
          },
        },
      },
      messages: [{
        role: 'user',
        content: `Party game referee. Category: "${prompt}". A player answered: "${cleanText(answer, 60)}".
Is this a genuinely correct answer for the category (allow misspellings, singular/plural, short forms, nicknames and common alternate names; reject near-misses and things that only relate to the category)? If valid, give its canonical name, how readily people think of it — kindling (almost everyone), trailhead (common), backcountry (fans/enthusiasts), deepwoods (obscure) — and known_pct: the estimated % of people who'd recognise it.`,
      }],
    }), { signal: AbortSignal.timeout(7000) });
    if (msg.stop_reason === 'refusal') return { valid: false };
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    let out = { valid: false };
    try { out = JSON.parse(text); } catch { /* treat as invalid */ }
    this.judgeCache.set(ck, out);
    if (this.judgeCache.size > 3000) this.judgeCache.delete(this.judgeCache.keys().next().value);
    return out;
  }

  /** Echo Trail: build a related category from the last answer. */
  async chainPrompt(prevPrompt, lastAnswer, signal) {
    const msg = await this.client.beta.messages.create(this._params({
      max_tokens: 1200,
      output_config: { effort: 'low' },
      messages: [{
        role: 'user',
        content: `Party game. The previous category was "${prevPrompt}" and the last answer given was "${cleanText(lastAnswer, 60)}".
Write the NEXT category so it branches off that answer (it must clearly involve or relate to "${cleanText(lastAnswer, 60)}"), e.g. answer "Pizza" -> "Name a pizza topping"; answer "Barn owl" -> "Name an animal that hunts at night".
It must have at least 40 valid answers and be family-friendly. Reply with only the prompt, starting with "Name".`,
      }],
    }), { signal: signal || AbortSignal.timeout(8000) });
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim().split('\n')[0];
    const p = polishPrompt(text.replace(/^["']|["']$/g, ''));
    if (!p || p.length < 8) throw new Error('No echo prompt');
    return p;
  }
}

module.exports = { AIGen, MODEL };
