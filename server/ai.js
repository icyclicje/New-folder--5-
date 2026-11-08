'use strict';
/**
 * On-the-fly category generation with Claude.
 *
 * Speed strategy ("insanely quick"):
 *  - Four parallel *streaming* requests, one per rarity slice, at low effort.
 *  - Answers are parsed line-by-line as they stream and merged live into a
 *    Category, so a round can start the moment the common answers arrive
 *    (usually ~2–4s) while the deep cuts keep pouring in during play.
 *  - Results are cached on disk, so a repeated category is instant.
 *  - Unlisted answers can be checked by a tiny "ranger judge" call.
 *
 * Requires ANTHROPIC_API_KEY. Without it, fallback.js handles generation.
 */
const fs = require('fs');
const path = require('path');
const { Category } = require('./answers');
const { cleanText, polishPrompt, answerKey } = require('./util');

let Anthropic = null;
try { Anthropic = require('@anthropic-ai/sdk'); Anthropic = Anthropic.default || Anthropic; } catch { /* optional */ }

const MODEL = process.env.MIVI_AI_MODEL || 'claude-opus-5-5';
const FAST = process.env.MIVI_AI_FAST === '1'; // Opus fast mode (premium pricing)
const USE_FALLBACKS = process.env.MIVI_AI_FALLBACKS !== '0';

const SYSTEM = `You build answer boards for Mivimoose Party, a fast multiplayer party game in the style of Krillion: players take turns naming ONE valid answer to a category prompt, and nicher answers score more.

Rarity tiers (how many people would think of the answer):
- KINDLING: the handful of answers almost everyone says first.
- TRAILHEAD: common answers many people would think of.
- BACKCOUNTRY: valid answers only a minority would think of.
- DEEP WOODS: obscure, expert-level answers most people never think of.
- GOLDEN ANTLER: exactly one designated answer — the most satisfying, delightful "aha!" answer that is still undeniably correct.

Output rules:
- Plain text only. One answer per line. No numbering, bullets, headings, or commentary.
- Line format: Canonical Name | alias | alias   (aliases optional: alternate names/spellings people might type; never plurals or case variants).
- Every answer must be genuinely and verifiably correct for the prompt. Never invent items. Accuracy beats volume.
- No duplicates. Family-friendly only.`;

const SLICES = [
  {
    key: 'core',
    maxTokens: 2500,
    instr: (p) => `Category: "${p}"

First line: "PROMPT: <the category as a clear, family-friendly 'Name a/an ...' prompt (fix typos, keep the intent)>". If the category is hateful, sexual, or has fewer than ~8 valid answers, instead output only "REJECT: <short reason>" and stop.
Then "GOLDEN: <answer | aliases>" and "NOTE: <one fun fact about it, under 120 characters>".
Then 4–6 lines starting "K: " — the KINDLING answers.
Then 10–20 lines starting "T: " — TRAILHEAD answers.`,
  },
  {
    key: 'backcountry', tier: 'backcountry', maxTokens: 3500,
    instr: (p) => `Category: "${p}"

List 25–45 BACKCOUNTRY answers: uncommon but recognizable — skip the obvious answers everyone says first. If fewer exist, list what exists.`,
  },
  {
    key: 'deepA', tier: 'deepwoods', maxTokens: 4500,
    instr: (p) => `Category: "${p}"

List 30–70 DEEP WOODS answers (obscure, expert-level, still clearly correct) whose canonical name starts with a letter from A to L (or a digit). If fewer exist, list what exists.`,
  },
  {
    key: 'deepB', tier: 'deepwoods', maxTokens: 4500,
    instr: (p) => `Category: "${p}"

List 30–70 DEEP WOODS answers (obscure, expert-level, still clearly correct) whose canonical name starts with a letter from M to Z. If fewer exist, list what exists.`,
  },
];

class AIGen {
  constructor({ dataDir, log = console } = {}) {
    this.log = log;
    this.cacheFile = path.join(dataDir, 'generated.json');
    this.cache = new Map(); // promptKey -> def
    this.judgeCache = new Map();
    this.inflight = new Map(); // promptKey -> job
    try {
      const raw = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
      for (const d of raw) this.cache.set(d.key, d);
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

  _saveCache() {
    const arr = [...this.cache.values()].slice(-400);
    fs.writeFile(this.cacheFile, JSON.stringify(arr), () => {});
  }

  static promptKey(p) { return answerKey(p).slice(0, 120); }

  /** Cached generated categories (for instant reuse / suggestions). */
  cachedList() {
    return [...this.cache.values()].map((d) => ({ id: d.id, prompt: d.prompt, total: d.total }));
  }

  getCached(prompt) {
    const d = this.cache.get(AIGen.promptKey(prompt));
    return d ? new Category({ ...d, generated: true }) : null;
  }

  async _streamLines(instr, maxTokens, onLine, signal) {
    const stream = this.client.beta.messages.stream(this._params({
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
  }

  /**
   * Generate a category on the fly.
   * Returns { category, ready, done, abort }:
   *  - category: live Category (complete=false until done)
   *  - ready: resolves once the core slice (prompt/golden/common answers) is in
   *  - done: resolves when every slice has finished
   */
  generate(rawPrompt, { onProgress } = {}) {
    const prompt = polishPrompt(rawPrompt);
    const key = AIGen.promptKey(prompt);
    const cached = this.cache.get(key);
    if (cached) {
      const category = new Category({ ...cached, generated: true });
      return { category, ready: Promise.resolve(category), done: Promise.resolve(category), abort() {}, cached: true };
    }
    if (this.inflight.has(key)) return this.inflight.get(key);

    const controller = new AbortController();
    const category = new Category({ id: 'ai-' + Date.now().toString(36), prompt, source: 'ai', sourceLabel: 'Ranger-generated', generated: true, complete: false });
    let rejectReason = null;
    let lastProgress = 0;
    const progress = () => {
      const now = Date.now();
      if (onProgress && now - lastProgress > 150) { lastProgress = now; onProgress(category); }
    };

    const runSlice = (slice) => this._streamLines(slice.instr(prompt), slice.maxTokens, (line) => {
      if (slice.key === 'core') {
        const m = /^(PROMPT|REJECT|GOLDEN|NOTE|K|T)\s*:\s*(.+)$/i.exec(line.replace(/^[-*•\s]+/, ''));
        if (!m) return;
        const tag = m[1].toUpperCase(), val = m[2].trim();
        if (tag === 'PROMPT') category.prompt = polishPrompt(val) || category.prompt;
        else if (tag === 'REJECT') { rejectReason = cleanText(val, 140); controller.abort(); }
        else if (tag === 'GOLDEN') category.add(val, 'golden');
        else if (tag === 'NOTE') { const g = category.goldenEntry(); if (g) g.note = cleanText(val, 200); }
        else if (tag === 'K') category.add(val, 'kindling');
        else if (tag === 'T') category.add(val, 'trailhead');
      } else {
        // strip list markers ("- ", "• ", "12. ") but keep answers that start with digits ("7 Up")
        const clean = line.replace(/^(?:[-*•]\s*|\d{1,3}[.)]\s+)/, '').replace(/^[KTBDG]:\s*/, '').trim();
        if (clean.length > 1 && clean.length < 120) category.add(clean, slice.tier);
      }
      progress();
    }, controller.signal);

    const corePromise = runSlice(SLICES[0]);
    const rest = SLICES.slice(1).map((s) => runSlice(s).catch((err) => {
      if (!controller.signal.aborted) this.log.warn?.(`[ai] slice ${s.key} failed: ${err.message}`);
    }));

    const ready = corePromise.then(() => {
      if (rejectReason) throw new Error(rejectReason);
      if (category.size < 4) throw new Error('Not enough answers for that category.');
      return category;
    }, (err) => {
      if (rejectReason) throw new Error(rejectReason);
      throw err;
    });

    const done = Promise.allSettled([ready, ...rest]).then(([r]) => {
      this.inflight.delete(key);
      if (r.status === 'rejected') throw r.reason;
      category.complete = true;
      const def = { key, ...category.toJSON(), total: category.size, generated: true };
      this.cache.set(key, def);
      this._saveCache();
      onProgress?.(category);
      return category;
    });
    done.catch(() => {});
    ready.catch(() => { controller.abort(); this.inflight.delete(key); });

    const job = { category, ready, done, abort: () => controller.abort(), cached: false };
    this.inflight.set(key, job);
    return job;
  }

  /** Ask a ranger whether an unlisted answer is valid. ~1s. */
  async judge(prompt, answer) {
    const ck = AIGen.promptKey(prompt) + '::' + answerKey(answer);
    if (this.judgeCache.has(ck)) return this.judgeCache.get(ck);
    const msg = await this.client.beta.messages.create(this._params({
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
            },
            required: ['valid', 'canonical', 'tier'],
            additionalProperties: false,
          },
        },
      },
      messages: [{
        role: 'user',
        content: `Party game referee. Category: "${prompt}". A player answered: "${cleanText(answer, 60)}".
Is this a genuinely correct answer for the category (allow minor misspellings and common alternate names)? If valid, give its canonical name and how commonly people would think of it: kindling (almost everyone), trailhead (common), backcountry (uncommon), deepwoods (obscure).`,
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
