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
const { shuffle, pick, polishPrompt, cleanText, promptTokens, answerKey: answerKeyOf } = require('./util');
const wikidata = require('./wikidata');
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
    if (this.ai.enabled) return this.ai.generate(prompt, { onProgress }); // Claude + Wikidata, merged live

    // No AI key: 1) Wikidata — real members ranked by fame, thousands for broad categories
    const linked = /linked to "(.+)"/i.exec(prompt);
    const phrase = linked ? linked[1] : prompt
      .replace(/^name\s+/i, '')
      .replace(/^(a|an|the|some|something|someone|any)\s+/i, '')
      .replace(/^(types?|kinds?|sorts?|varieties|variety|brands?)\s+of\s+/i, '');
    const job = { category: null, abort() {}, how: 'wikidata' };
    const wd = linked ? null : wikidata.generate(prompt, { onProgress });
    if (wd) { job.category = wd.category; job.abort = wd.abort; }
    const fallback = async () => {
      // 2) a known trail that covers every content word of the request
      if (allowKnown && !linked) {
        const want = promptTokens(prompt);
        const hit = want.length && rankPrompts(prompt, this.allSummaries()).find((s) => s.total >= 15 && want.every((w) => promptTokens(s.prompt).includes(w)));
        const c = hit && this.getById(hit.id);
        if (c) { job.how = 'known'; return c; }
      }
      // 3) a word-association board
      job.how = 'assoc';
      return associationBoard(phrase);
    };
    job.ready = wd ? wd.ready.catch(fallback) : fallback();
    job.done = wd
      ? wd.done.then((c) => { this.ai.remember(c); return c; }, () => job.ready)
      : job.ready;
    job.ready.catch(() => {}); // callers that only speculate never await this
    job.done.catch(() => {});
    return job;
  }

  /** Can unlisted answers in this category be checked live? */
  canJudge(category) {
    return !!category?.wd || (this.ai.enabled && !!category?.generated);
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
    if (this.ai.enabled && category.generated) tasks.push(this.ai.judge(category.prompt, text).then((v) => (v.valid ? { ...v, by: 'ai' } : Promise.reject(new Error('no')))));
    const p = tasks.length ? Promise.any(tasks).catch(() => ({ valid: false })) : Promise.resolve({ valid: false });
    cache.set(key, p);
    if (cache.size > 400) cache.delete(cache.keys().next().value);
    return p;
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
