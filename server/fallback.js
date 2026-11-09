'use strict';
/**
 * No-API-key generation ("find a way to do it yourself").
 *  1. Local search: match the requested category/topic against every known
 *     prompt (all Krillion dailies, Campfire Classics, previously generated),
 *     widening the query with Datamuse "means-like" words. Instant.
 *  2. Association board: if nothing fits, build a "Name something linked to X"
 *     board from Datamuse word associations, tiered by word frequency.
 */
const { Category } = require('./answers');
const { promptTokens, normalize, polishPrompt, answerKey, cleanText } = require('./util');

const DM = 'https://api.datamuse.com/words';

async function dm(query) {
  try {
    const res = await fetch(`${DM}?${query}`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

const freqOf = (w) => {
  const t = (w.tags || []).find((x) => x.startsWith('f:'));
  return t ? parseFloat(t.slice(2)) : 0;
};

/** Datamuse-expanded keyword set for a topic (single words, singularized). */
async function expandTopic(topic) {
  const base = promptTokens(topic);
  const words = new Map(base.map((w) => [w, 3]));
  const res = await dm(`ml=${encodeURIComponent(normalize(topic))}&max=40`);
  for (const r of res) {
    for (const w of promptTokens(r.word)) if (!words.has(w)) words.set(w, 1);
  }
  return words;
}

/**
 * Rank candidate prompts by relevance to a query.
 * candidates: [{id, prompt, total, source}]
 */
function rankPrompts(query, candidates, expanded) {
  const q = new Set(promptTokens(query));
  const out = [];
  for (const c of candidates) {
    const toks = promptTokens(c.prompt);
    if (!toks.length) continue;
    let s = 0;
    for (const t of toks) {
      if (q.has(t)) s += 3;
      else if (expanded && expanded.has(t)) s += expanded.get(t);
    }
    if (s <= 0) continue;
    const score = s / Math.sqrt(toks.length + q.size);
    out.push({ ...c, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Exact-ish lookup: is there already a known prompt that IS this category? */
function findSamePrompt(query, candidates) {
  const qk = answerKey(polishPrompt(query));
  const q = new Set(promptTokens(query));
  let best = null, bestSim = 0;
  for (const c of candidates) {
    if (answerKey(c.prompt) === qk) return c;
    const t = new Set(promptTokens(c.prompt));
    let inter = 0;
    for (const w of q) if (t.has(w)) inter++;
    const sim = inter / (q.size + t.size - inter || 1);
    if (sim > bestSim) { bestSim = sim; best = c; }
  }
  // strict: "Name a Pixar movie" must not become "Name a Disney or Pixar movie"
  return bestSim >= 0.75 ? best : null;
}

/** Build a "Name something linked to X" board from word associations. */
async function associationBoard(phrase) {
  const p = cleanText(phrase, 60);
  const n = normalize(p);
  const head = n.split(' ').pop();
  const [ml, trg, gen] = await Promise.all([
    dm(`ml=${encodeURIComponent(n)}&max=200&md=fp`),
    dm(`rel_trg=${encodeURIComponent(head)}&max=120&md=fp`),
    dm(`rel_gen=${encodeURIComponent(head)}&max=120&md=fp`),
  ]);
  const seen = new Map();
  const banned = new Set(n.split(' ').map(answerKey));
  for (const list of [gen, trg, ml]) {
    for (const w of list) {
      const tags = w.tags || [];
      if (!tags.includes('n') && !tags.includes('prop')) continue;
      const k = answerKey(w.word);
      if (!k || k.length < 3 || banned.has(k) || k.includes(answerKey(head))) continue;
      if (!seen.has(k)) seen.set(k, { word: w.word, f: freqOf(w), score: w.score || 0 });
    }
  }
  const items = [...seen.values()];
  if (items.length < 12) throw new Error(`Couldn't find enough trail markers for "${p}".`);
  items.sort((a, b) => b.f - a.f);
  const tiers = { kindling: [], trailhead: [], backcountry: [], deepwoods: [] };
  items.forEach((it, i) => {
    const frac = i / items.length;
    const t = i < 5 ? 'kindling' : frac < 0.25 ? 'trailhead' : frac < 0.55 ? 'backcountry' : 'deepwoods';
    tiers[t].push(it.word);
  });
  const rare = items.slice(Math.floor(items.length / 2)).sort((a, b) => b.score - a.score)[0];
  const golden = rare ? { answer: rare.word, note: `The ranger's favourite link to "${p}".` } : null;
  if (golden) for (const t of Object.keys(tiers)) tiers[t] = tiers[t].filter((w) => w !== golden.answer);
  return new Category({
    id: 'dm-' + Date.now().toString(36),
    prompt: `Name something linked to "${p}"`,
    source: 'assoc',
    sourceLabel: 'Word-association trail',
    golden,
    tiers,
  });
}

module.exports = { expandTopic, rankPrompts, findSamePrompt, associationBoard };
