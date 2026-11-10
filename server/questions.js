'use strict';
/**
 * QuestionService — one front door for every category source:
 *   Krillion dailies (default), Campfire Classics, AI-generated, fallback.
 * Also hosts the fast on-the-fly paths used by gimmick rounds and the
 * topic → full question bank generator.
 */
const fs = require('fs');
const path = require('path');
const { Category, sanitizeCategoryDef } = require('./answers');
const { shuffle, pick, polishPrompt, cleanText, promptTokens, answerKey: answerKeyOf, normalize, editDistance } = require('./util');
const wikidata = require('./wikidata');
const hunt = require('./hunt');
const { expandTopic, rankPrompts, findSamePrompt, associationBoard } = require('./fallback');

class QuestionService {
  constructor({ krillion, ai, bankDir, log = console }) {
    this.krillion = krillion;
    this.ai = ai;
    this.log = log;
    this.campfire = new Map(); // id -> def
    this.bankDir = bankDir;
    this.loadCampfire();
  }

  loadCampfire() {
    this.campfire.clear();
    let files = [];
    try { files = fs.readdirSync(this.bankDir).filter((f) => f.endsWith('.json')); } catch { /* none */ }
    for (const f of files) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(this.bankDir, f), 'utf8'));
        for (const q of raw.questions || []) {
          const id = 'c:' + q.id;
          const def = { id, prompt: q.prompt, source: 'campfire', sourceLabel: 'Campfire Classics', golden: q.golden, tiers: q.tiers };
          def.total = new Category(def).size;
          this.campfire.set(id, def);
        }
      } catch (err) { this.log.warn?.(`[bank] could not load ${f}: ${err.message}`); }
    }
    this.log.info?.(`[bank] Campfire Classics: ${this.campfire.size} categories`);
    const warm = () => (this.krillion.ready ? this.buildAnswerIndex() : setTimeout(warm, 5000));
    setTimeout(warm, 8000);
  }

  // ---------------------------------------------------------------- archive search
  /**
   * A compact answer index for "which trails have this answer?": one newline-joined string of normalized
   * answers per trail (~15–20 MB for a million answers, vs ~130 MB for a full map). Built in the background,
   * one Krillion day per tick, so the server never stalls.
   */
  buildAnswerIndex() {
    if (this._answerIndex || this._answerIndexing) return this._answerIndexing;
    const idx = new Map(); // id -> "\nname\tT\nname\tT…\n"
    const line = (raw, t) => `${normalize(String(raw).split('|')[0])}\t${t}`;
    const addDef = (id, def) => {
      const parts = [];
      for (const [tier, list] of Object.entries(def.tiers || {})) for (const a of list) parts.push(line(typeof a === 'string' ? a : a?.answer || '', tier[0]));
      if (def.golden) parts.push(line(typeof def.golden === 'string' ? def.golden : def.golden.answer || '', 'g'));
      idx.set(id, '\n' + parts.join('\n') + '\n');
    };
    this._answerIndexing = new Promise((resolve) => {
      for (const d of this.campfire.values()) addDef(d.id, d);
      const days = [...this.krillion.index.keys()];
      const step = () => {
        const date = days.shift();
        if (!date) { this._answerIndex = idx; this.log.info?.(`[search] answer index ready: ${idx.size} trails`); resolve(idx); return; }
        try { for (const q of this.krillion._loadDay(date)) addDef(q.id || `k-${date}-${q.n}`, q); } catch { /* skip a bad day */ }
        setImmediate(step);
      };
      step();
    });
    return this._answerIndexing;
  }

  /**
   * Archive search. Simple: ranked by how well the prompt matches (typos, plurals, word prefixes as you type,
   * exact phrases first). Advanced: `answer` finds trails that contain an answer; `source`, `min`, `max`, `sort` filter.
   */
  async searchArchive({ q = '', answer = '', source = '', min = 0, max = Infinity, sort = 'best', limit = 120 } = {}) {
    let list = this.allSummaries().filter((x) => (!source || x.source === source) && x.total >= min && x.total <= max);
    const qn = normalize(q);
    if (qn) {
      const qt = promptTokens(q);
      const last = qn.split(' ').pop();
      list = list.map((x) => {
        const pn = normalize(x.prompt);
        const toks = promptTokens(x.prompt);
        let sc = pn.includes(qn) ? 6 : 0; // the exact phrase
        let full = 0;
        for (const t of qt) {
          if (toks.includes(t)) { sc += 3; full++; continue; }
          const close = toks.find((w) => w.length >= 5 && t.length >= 5 && editDistance(w, t) <= 1); // a typo
          if (close) { sc += 2; full++; }
        }
        if (qt.length >= 2 && !full && !pn.includes(qn)) return { ...x, score: 0 }; // a half-typed word alone is not a match
        if (last.length >= 2 && toks.some((w) => w.startsWith(last) && w !== last)) sc += 1.5; // still typing
        return { ...x, score: sc / Math.sqrt(toks.length + qt.length + 1) };
      }).filter((x) => x.score > 0);
    }
    const an = normalize(answer);
    if (an) {
      const idx = this._answerIndex || (await Promise.race([this.buildAnswerIndex(), new Promise((r) => setTimeout(r, 6000))]));
      if (!idx) return { results: [], indexing: true };
      const TIERS = { k: 'kindling', t: 'trailhead', b: 'backcountry', d: 'deepwoods', g: 'golden' };
      const hits = [];
      for (const x of list) {
        const text = idx.get(x.id) || (x.source === 'ai' ? (() => { const c = this.getById(x.id); return c ? '\n' + c.entries.map((e) => `${normalize(e.name)}\t${e.tier[0]}`).join('\n') + '\n' : ''; })() : '');
        if (!text) continue;
        let at = text.indexOf(`\n${an}\t`); // exactly that answer
        let exact = at >= 0;
        if (!exact) { at = text.indexOf(an); if (at < 0 || an.length < 3) continue; at = text.lastIndexOf('\n', at); } // an answer containing it
        const end = text.indexOf('\n', at + 1);
        const [name, t] = text.slice(at + 1, end).split('\t');
        hits.push({ ...x, match: name, matchTier: TIERS[t] || 'trailhead', exact, score: (x.score || 0) + (exact ? 10 : 4) });
      }
      list = hits;
    }
    const by = {
      best: (a, b) => (b.score || 0) - (a.score || 0) || b.total - a.total,
      newest: (a, b) => String(b.date || '').localeCompare(String(a.date || '')),
      most: (a, b) => b.total - a.total,
      fewest: (a, b) => a.total - b.total,
    }[sort] || ((a, b) => (b.score || 0) - (a.score || 0));
    if (qn || an || sort !== 'best') list = [...list].sort(by);
    return { results: list.slice(0, limit).map(({ id, prompt, total, source: src, date, match, matchTier, exact }) => ({ id, prompt, total, source: src, date, match, matchTier, exact })), total: list.length };
  }

  /** Summaries of every known prompt (Krillion + Campfire + generated cache). */
  allSummaries() {
    const out = this.krillion.list().map((q) => ({ id: q.id, prompt: q.prompt, total: q.total, source: 'krillion', date: q.date }));
    for (const d of this.campfire.values()) out.push({ id: d.id, prompt: d.prompt, total: d.total, source: 'campfire' });
    for (const g of this.ai.cachedList()) out.push({ id: 'g:' + g.prompt, prompt: g.prompt, total: g.total, source: 'ai' });
    return out;
  }

  getById(id) {
    if (!id) return null;
    if (id.startsWith('k-')) return this.krillion.getCategory(id);
    if (id.startsWith('c:')) { const d = this.campfire.get(id); return d ? new Category(d) : null; }
    if (id.startsWith('g:')) return this.ai.getCached(id.slice(2));
    return null;
  }

  getDefById(id) {
    if (id?.startsWith('k-')) return this.krillion.getDef(id);
    const c = this.getById(id);
    return c ? { ...c.toJSON(), source: c.source } : null;
  }

  /** Pick the next category for a game. */
  pickForGame(source, usedIds, customDefs, { duel = false } = {}) {
    const tryKrillion = () => {
      if (!this.krillion.ready) return null;
      // duels play ONE bank to the end — pick banks small enough that clearing them (a tie) is possible
      const [id] = duel ? this.krillion.randomIds(1, usedIds, 30, 350) : this.krillion.randomIds(1, usedIds);
      return id ? this.krillion.getCategory(id) : null;
    };
    const tryCampfire = () => {
      const ids = [...this.campfire.keys()].filter((id) => !usedIds.has(id));
      return ids.length ? new Category(this.campfire.get(pick(ids))) : null;
    };
    const tryCustom = () => {
      if (!customDefs?.length) return null;
      let avail = customDefs.filter((d) => !usedIds.has(d.id));
      if (!avail.length) { for (const d of customDefs) usedIds.delete(d.id); avail = customDefs; }
      const d = pick(avail);
      if (d.ref) { const c = this.getById(d.ref); if (c) { c.id = d.id; return c; } return null; }
      return new Category(d);
    };
    let cat = null;
    if (source === 'custom') cat = tryCustom();
    else if (source === 'campfire') cat = tryCampfire();
    else if (source === 'mixed') cat = Math.random() < 0.5 ? (tryKrillion() || tryCampfire()) : (tryCampfire() || tryKrillion());
    else cat = tryKrillion();
    if (!cat) cat = tryKrillion() || tryCampfire();
    if (!cat) {
      // everything used — recycle
      usedIds.clear();
      cat = tryKrillion() || tryCampfire();
    }
    return cat;
  }

  /** Autocomplete for the leader's trail sign / pack editor. */
  suggest(q, limit = 8) {
    const all = this.allSummaries();
    if (!q || q.trim().length < 2) return shuffle(all.filter((s) => s.total >= 30)).slice(0, limit);
    return rankPrompts(q, all).slice(0, limit);
  }

  /**
   * Fastest possible category for a typed prompt:
   * known prompt (instant) → AI streaming generation → association board.
   * Returns a job { category, ready, done, abort, how }.
   */
  quickCategory(rawPrompt, { onProgress, allowKnown = true } = {}) {
    const prompt = polishPrompt(cleanText(rawPrompt, 120));
    if (!prompt) {
      const fail = Promise.reject(new Error('Empty category'));
      fail.catch(() => {});
      return { ready: fail, done: fail, abort() {} };
    }
    if (allowKnown) {
      const same = findSamePrompt(prompt, this.allSummaries());
      if (same) {
        const c = this.getById(same.id);
        if (c) {
          // instant — and if the curated list is small, keep scouting Wikidata for more real answers during play
          let done = Promise.resolve(c);
          if (c.size < 400 && !c.wd) {
            c.respectTiers = true;
            c.complete = false;
            const ext = wikidata.generate(prompt, { into: c, onProgress });
            done = ext.done.catch(() => c).finally(() => { c.complete = true; onProgress?.(c); }).then(() => c);
          }
          return { category: c, ready: Promise.resolve(c), done, abort() {}, how: 'known' };
        }
      }
    }
    const cached = this.ai.getCached(prompt);
    if (cached) return { category: cached, ready: Promise.resolve(cached), done: Promise.resolve(cached), abort() {}, how: 'cache' };
    if (this.ai.enabled) {
      // Claude + Wikidata + Wikipedia (+ web search for live/niche questions), merged live
      const ai = this.ai.generate(prompt, { onProgress });
      let h = null;
      const rescue = (err) => {
        if (/declined|hateful|sexual|family|offensive|inappropriate/i.test(err?.message || '')) throw err;
        h = this._hunt(prompt, { onProgress, allowKnown });
        return h.ready;
      };
      const ready = ai.ready.catch(rescue);
      ready.catch(() => {});
      return {
        ready,
        get category() { return h ? h.category : ai.category; },
        get done() { return h ? h.done : ai.done; },
        get how() { return h ? h.how : ai.how; },
        abort() { ai.abort?.(); h?.abort?.(); },
      };
    }

    // No AI key: the hunt — Wikidata classes, Wikipedia categories and lists, deep re-phrasings,
    // then (for questions too broad to list) an approximation built from the question itself
    return this._hunt(prompt, { onProgress, allowKnown });
  }

  _hunt(prompt, { onProgress, allowKnown = true } = {}) {
    const linked = /linked to "(.+)"/i.exec(prompt);
    const phrase = linked ? linked[1] : prompt
      .replace(/^name\s+/i, '')
      .replace(/^(a|an|the|some|something|someone|any)\s+/i, '')
      .replace(/^(types?|kinds?|sorts?|varieties|variety|brands?)\s+of\s+/i, '');
    // a known trail that covers every content word of the request beats a guess
    const knownCover = () => {
      if (!allowKnown || linked) return null;
      const want = promptTokens(prompt);
      const hit = want.length && rankPrompts(prompt, this.allSummaries()).find((s) => { const t = promptTokens(s.prompt); return s.total >= 15 && want.every((w) => t.includes(w)) && t.length <= want.length + 1; });
      const c = hit && this.getById(hit.id);
      if (c) c.huntHow = 'known';
      return c || null;
    };
    const assoc = async () => { const c = await associationBoard(phrase); c.huntHow = 'assoc'; return c; };
    const job = hunt.huntCategory(prompt, { onProgress, beforeApprox: knownCover, fallbacks: [assoc, () => this.closestKnown(prompt)] });
    // remember verified finds for instant reuse — never a best guess or a word-association board
    job.done = job.done.then((c) => { if (c === job.category && (c.wd || c._wp?.items.size)) this.ai.remember(c); return c; });
    job.ready.catch(() => {}); // callers that only speculate never await this
    job.done.catch(() => {});
    return job;
  }

  /**
   * The closest known trail to a question (approximate, by shared words) — what the ranger falls back
   * to when a typed category can't be mapped at all, instead of a random trail.
   */
  closestKnown(prompt) {
    const want = promptTokens(prompt);
    if (!want.length) return null;
    const hit = rankPrompts(prompt, this.allSummaries()).find((x) => x.total >= 30 && promptTokens(x.prompt).some((w) => want.includes(w)));
    const c = hit && this.getById(hit.id);
    if (c) c.huntHow = 'closest';
    return c || null;
  }

  /** Can unlisted answers in this category be checked live? */
  canJudge(category) {
    return !!category?.wd || !!category?.hunt || (this.ai.enabled && !!category?.generated);
  }

  /**
   * Ranger check for an unlisted answer. Wikidata (free, ~0.5s) and Claude race;
   * the first "valid" wins. Results are cached per category, so a check started
   * while the player was still typing makes Enter instant.
   */
  judge(category, text) {
    const key = answerKeyOf(text);
    const cache = category._judged || (category._judged = new Map());
    if (cache.has(key)) return cache.get(key);
    const tasks = [];
    if (category.wd) tasks.push(wikidata.judge(category.wd, text).then((v) => (v.valid ? { ...v, by: 'wikidata' } : Promise.reject(new Error('no')))));
    if (category.hunt) tasks.push(hunt.judge(category, text).then((v) => (v.valid ? { ...v, by: 'wikipedia' } : Promise.reject(new Error('no')))));
    if (this.ai.enabled && category.generated) {
      // live/niche trails (a channel's videos, this year's releases): Claude checks the web if its memory says no
      const web = category.web || hunt.needsWeb(category.prompt);
      tasks.push(this.ai.judge(category.prompt, text)
        .then((v) => (v.valid || !web ? v : this.ai.webJudge(category.prompt, text)))
        .then((v) => (v.valid ? { ...v, by: 'ai' } : Promise.reject(new Error('no')))));
    }
    const p = tasks.length ? Promise.any(tasks).catch(() => ({ valid: false })) : Promise.resolve({ valid: false });
    p.then((v) => { p.settled = v; });
    cache.set(key, p);
    if (cache.size > 400) cache.delete(cache.keys().next().value);
    return p;
  }

  /** A ranger verdict that has already come back (or null) — used for instant typing hints. */
  judgedSync(category, text) {
    return category?._judged?.get(answerKeyOf(text))?.settled || null;
  }

  /** Echo Trail prompt from the last answer. */
  async echoPrompt(prevPrompt, lastAnswer, signal) {
    if (this.ai.enabled) {
      try { return await this.ai.chainPrompt(prevPrompt, lastAnswer, signal); }
      catch (err) { if (signal?.aborted) throw err; this.log.warn?.(`[echo] ${err.message}`); }
    }
    // no AI: is there a known prompt that mentions the answer?
    const hit = rankPrompts(lastAnswer, this.allSummaries()).find((s) => s.score >= 1.2 && s.total >= 15);
    if (hit) return hit.prompt;
    return `Name something linked to "${cleanText(lastAnswer, 40)}"`;
  }

  /**
   * Topic → full question bank.
   * onPlan(prompts[]) once the category list is decided; onCategory(def) as each finishes.
   */
  async generateBank(topic, count, { onPlan, onCategory, signal } = {}) {
    topic = cleanText(topic, 80);
    count = Math.max(3, Math.min(20, count | 0 || 8));
    if (!topic) throw new Error('Give the ranger a topic first.');

    if (this.ai.enabled) {
      const prompts = await this._planPrompts(topic, count, signal);
      onPlan?.(prompts);
      const queue = prompts.slice();
      const results = [];
      const worker = async () => {
        while (queue.length) {
          if (signal?.aborted) return;
          const p = queue.shift();
          try {
            const job = this.ai.generate(p);
            const cat = await job.done;
            const def = { ...cat.toJSON(), generated: true };
            results.push(def);
            onCategory?.(def);
          } catch (err) { this.log.warn?.(`[bank] "${p}": ${err.message}`); onCategory?.({ prompt: p, error: err.message }); }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      return results;
    }

    // No AI: if the topic itself is a Wikidata class ("dinosaurs", "cheese"), that's a fresh category with thousands of answers…
    const wdTopic = wikidata.generate(`Name a ${topic}`);
    const wdDef = await Promise.race([wdTopic.done, new Promise((r) => setTimeout(r, 12000))]).catch(() => null);
    // …then assemble the rest from every known prompt that fits the topic.
    const expanded = await expandTopic(topic);
    const ranked = rankPrompts(topic, this.allSummaries(), expanded).filter((s) => s.total >= 12);
    const useWd = wdDef && wdDef.size >= 12;
    const chosen = ranked.slice(0, useWd ? count - 1 : count);
    onPlan?.(chosen.map((c) => c.prompt));
    const results = [];
    if (useWd) {
      this.ai.remember(wdDef);
      const def = { ...wdDef.toJSON(), generated: true };
      results.push(def);
      onCategory?.(def);
    }
    for (const c of chosen) {
      const def = { id: c.id, ref: c.id, prompt: c.prompt, source: c.source, total: c.total };
      results.push(def);
      onCategory?.(def);
    }
    if (results.length < count) {
      try {
        const board = await associationBoard(topic);
        const def = board.toJSON();
        results.push(def);
        onCategory?.(def);
      } catch { /* fine */ }
    }
    if (!results.length) throw new Error(`No trails found for "${topic}". Add an ANTHROPIC_API_KEY to generate brand-new categories.`);
    return results;
  }

  async _planPrompts(topic, count, signal) {
    const msg = await this.ai.client.beta.messages.create(this.ai._params({
      max_tokens: 3000,
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: { prompts: { type: 'array', items: { type: 'string' } } },
            required: ['prompts'],
            additionalProperties: false,
          },
        },
      },
      messages: [{
        role: 'user',
        content: `Create ${count} distinct category prompts about the topic "${topic}" for a party game where players take turns naming one valid answer each. Every prompt must start with "Name", have at least 30 verifiably correct answers ranging from obvious to obscure, and come at the topic from a different angle (people, places, things, events, works, terms...). Family-friendly.`,
      }],
    }), { signal: signal || AbortSignal.timeout(20000) });
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const prompts = (JSON.parse(text).prompts || []).map(polishPrompt).filter(Boolean);
    if (!prompts.length) throw new Error('The ranger could not plan that topic.');
    return [...new Set(prompts)].slice(0, count);
  }

  /** Resolve a client-supplied custom pack into playable defs. */
  resolveCustomPack(pack) {
    if (!pack || !Array.isArray(pack.categories)) return null;
    const defs = [];
    pack.categories.slice(0, 60).forEach((c, i) => {
      if (c && typeof c.ref === 'string') {
        const s = this.getById(c.ref);
        if (s) defs.push({ id: 'r-' + i + '-' + c.ref, ref: c.ref, prompt: s.prompt });
        return;
      }
      const d = sanitizeCategoryDef(c, i);
      if (d) defs.push(d);
    });
    return defs.length ? { name: cleanText(pack.name, 40) || 'My Field Guide', defs } : null;
  }
}

module.exports = { QuestionService };
