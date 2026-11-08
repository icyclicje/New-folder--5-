'use strict';
const { TIER_BY_KEY } = require('./config');
const { answerKey, editDistance, cleanText } = require('./util');

const TIER_KEYS = ['kindling', 'trailhead', 'backcountry', 'deepwoods', 'golden'];

/**
 * A playable category: prompt + tiered answer list with a fast lookup index.
 * Entries are "Canonical|alias|alias" strings.
 */
class Category {
  constructor(def = {}) {
    this.id = def.id || 'cat-' + Math.random().toString(36).slice(2, 9);
    this.prompt = def.prompt || 'Name something';
    this.source = def.source || 'custom';
    this.sourceLabel = def.sourceLabel || '';
    this.generated = !!def.generated; // AI/fallback generated → AI judge may accept unlisted answers
    this.entries = [];
    this.index = new Map();
    this._keys = []; // [key, entry] for fuzzy search
    this.complete = def.complete !== false; // false while still streaming in
    if (def.golden) {
      const g = typeof def.golden === 'string' ? { answer: def.golden } : def.golden;
      if (g && g.answer) this.add(g.answer, 'golden', g.note);
    }
    const tiers = def.tiers || {};
    for (const t of ['kindling', 'trailhead', 'backcountry', 'deepwoods', 'golden']) {
      for (const raw of tiers[t] || []) {
        if (typeof raw === 'string') this.add(raw, t);
        else if (raw && raw.answer) this.add(raw.answer, t, raw.note);
      }
    }
  }

  /** Add (or re-tier) an entry. Returns the entry or null. */
  add(raw, tier, note) {
    if (!TIER_BY_KEY[tier]) return null;
    const parts = String(raw).split('|').map((p) => cleanText(p, 80)).filter(Boolean);
    if (!parts.length) return null;
    const keys = [...new Set(parts.map(answerKey).filter(Boolean))];
    if (!keys.length) return null;
    // existing entry?
    for (const k of keys) {
      const ex = this.index.get(k);
      if (ex) {
        // golden is a designation; otherwise the more common tier wins (keeps scoring fair)
        if (tier === 'golden' && ex.tier !== 'golden') ex.tier = 'golden';
        else if (ex.tier !== 'golden' && TIER_BY_KEY[tier].rank < TIER_BY_KEY[ex.tier].rank) ex.tier = tier;
        if (note && !ex.note) ex.note = cleanText(note, 200);
        for (const k2 of keys) if (!this.index.has(k2)) { this.index.set(k2, ex); this._keys.push([k2, ex]); }
        for (const part of parts) if (part !== ex.name && !ex.aliases.includes(part) && ex.aliases.length < 8) ex.aliases.push(part);
        return ex;
      }
    }
    const entry = { id: this.entries.length, name: parts[0], aliases: parts.slice(1, 9), tier, note: note ? cleanText(note, 200) : undefined };
    this.entries.push(entry);
    for (const k of keys) { this.index.set(k, entry); this._keys.push([k, entry]); }
    return entry;
  }

  /** Find the entry matching a typed answer. */
  match(input, { typo = true } = {}) {
    const key = answerKey(input);
    if (!key) return null;
    const exact = this.index.get(key);
    if (exact) return { entry: exact, fuzzy: false };
    if (!typo || key.length < 5) return null;
    const max = key.length >= 9 ? 2 : 1;
    let best = null, bestD = max + 1, ambiguous = false;
    for (const [k, e] of this._keys) {
      if (Math.abs(k.length - key.length) > max) continue;
      const d = editDistance(key, k, max);
      if (d < bestD) { best = e; bestD = d; ambiguous = false; }
      else if (d === bestD && best && e !== best) ambiguous = true;
    }
    if (best && bestD <= max && !ambiguous) return { entry: best, fuzzy: true };
    return null;
  }

  counts() {
    const c = { kindling: 0, trailhead: 0, backcountry: 0, deepwoods: 0, golden: 0 };
    for (const e of this.entries) c[e.tier]++;
    return c;
  }

  get size() { return this.entries.length; }

  goldenEntry() { return this.entries.find((e) => e.tier === 'golden') || null; }

  /** Pick an unused entry (for critter bots), weighted toward a tier profile. */
  sampleUnused(used, weights) {
    const pool = this.entries.filter((e) => !used.has(e.id));
    if (!pool.length) return null;
    const byTier = {};
    for (const e of pool) (byTier[e.tier] ||= []).push(e);
    const avail = Object.keys(byTier);
    let total = 0;
    for (const t of avail) total += weights[t] || 0.01;
    let r = Math.random() * total;
    for (const t of avail) {
      r -= weights[t] || 0.01;
      if (r <= 0) return byTier[t][Math.floor(Math.random() * byTier[t].length)];
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /** Public summary for clients (never leaks the answers). */
  publicInfo() {
    return { id: this.id, prompt: this.prompt, source: this.source, sourceLabel: this.sourceLabel, counts: this.counts(), total: this.size, complete: this.complete };
  }

  /** Full dump (for the custom pack editor / end-of-round reveal). */
  toJSON() {
    const tiers = { kindling: [], trailhead: [], backcountry: [], deepwoods: [] };
    let golden = null;
    for (const e of this.entries) {
      const raw = [e.name, ...(e.aliases || [])].join('|');
      if (e.tier === 'golden' && !golden) golden = { answer: raw, note: e.note || '' };
      else tiers[e.tier === 'golden' ? 'deepwoods' : e.tier].push(raw);
    }
    return { id: this.id, prompt: this.prompt, source: this.source, golden, tiers };
  }
}

/** Validate & sanitize a user-supplied category definition (custom packs). */
function sanitizeCategoryDef(def, i = 0) {
  if (!def || typeof def !== 'object') return null;
  const prompt = cleanText(def.prompt, 120);
  if (!prompt) return null;
  const tiers = {};
  let n = 0;
  for (const t of ['kindling', 'trailhead', 'backcountry', 'deepwoods']) {
    const arr = Array.isArray(def.tiers?.[t]) ? def.tiers[t] : [];
    tiers[t] = arr.filter((x) => typeof x === 'string').map((x) => cleanText(x, 160)).filter(Boolean).slice(0, 6000);
    n += tiers[t].length;
  }
  let golden = null;
  if (def.golden) {
    const g = typeof def.golden === 'string' ? { answer: def.golden } : def.golden;
    const answer = cleanText(g.answer, 160);
    if (answer) { golden = { answer, note: cleanText(g.note || '', 200) }; n++; }
  }
  if (n < 1) return null;
  return { id: 'u-' + i + '-' + Math.random().toString(36).slice(2, 7), prompt, source: 'custom', golden, tiers, generated: !!def.generated };
}

module.exports = { Category, sanitizeCategoryDef, TIER_KEYS };
