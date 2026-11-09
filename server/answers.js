'use strict';
const { TIER_BY_KEY } = require('./config');
const { answerKey, wordList, squashKey, phoneticKey, typoDistance, typoBudget, cleanText } = require('./util');

const SOUND_GROUPS = ['ckqsxz', 'fpv', 'jg', 'wvu', 'aeiouy'];
const PEOPLE_RE = /\b(person|people|composer|actor|actress|singer|artist|player|author|writer|poet|president|scientist|character|celebrit|chef|athlete|rapper|painter|director|musician|comedian|youtuber|villain|hero|wrestler|coach|philosopher|inventor|explorer|astronaut|leader|monarch|emperor|pope|footballer|quarterback|pitcher|golfer|tennis player|driver|model|designer|architect|novelist|playwright|dancer|drummer|guitarist|band member|beatle|host|presenter|anchor|journalist|politician|senator|prime minister|general|saint|god|goddess|deity)/i;
const addTo = (map, k, e) => { if (!k) return; let s = map.get(k); if (!s) map.set(k, (s = new Set())); s.add(e); };
// words too generic to identify an answer on their own
const GENERIC_WORDS = new Set('and the of a an in on at to for new old big little great grand royal saint mount river lake island city state national park street road house club team band movie film song show game book war world day night king queen man woman boy girl black white red blue green gold golden silver dog cat bird fish tree flower cheese pasta sauce breed'.split(' '));

const TIER_KEYS = ['kindling', 'trailhead', 'backcountry', 'deepwoods', 'golden'];
// prompt words that never describe the answer itself
const PROMPT_STOP = new Set('name a an the of in on at to for from with by and or any some something someone somebody that which who you your can could would might type types kind kinds sort sorts famous popular one thing things word words often commonly typically well known real classic notable common other another'.split(' '));

/** Words of the category itself ("dog", "breed" for "Name a dog breed") — stripped from guesses like "golden retriever dog". */
function categoryWords(prompt) {
  return new Set(wordList(String(prompt || '').replace(/^name\s+/i, '')).filter((w) => w.length >= 3 && !PROMPT_STOP.has(w)));
}

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
    this.wd = def.wd || null; // Wikidata class info → free live judging of unlisted answers
    this.entries = [];
    this.index = new Map();
    this._keys = []; // [key, entry] for fuzzy search
    this.squash = new Map(); // doubled letters collapsed → Set(entry)
    this.phon = new Map(); // sound-alike key → Set(entry)
    this.words = new Map(); // distinctive single word → Set(entry)
    this.tails = new Map();
    this.wordsPrimary = new Map();
    this.sorted = new Map(); // words in any order: "rex tyrannosaurus" → Tyrannosaurus rex
    this.core = new Map(); // answer minus the category's own words: "cheddar" → Cheddar cheese
    this.catWords = categoryWords(this.prompt);
    this.complete = def.complete !== false; // false while still streaming in
    // Golden Antler bookkeeping: lower score = nicher. Curated goldens (Krillion, handmade) are fixed (-Infinity).
    this.goldenScore = Infinity;
    this.goldenScale = def.goldenScale || null; // 'pct' (AI: % of people who'd know it) | 'sl' (Wikidata fame)
    this.isClaimed = null; // set by the room while in play: (entry) => already answered?
    this.onGoldenMove = null; // set by the room: (newEntry, oldEntry) => void
    if (def.golden) {
      const g = typeof def.golden === 'string' ? { answer: def.golden } : def.golden;
      if (g && g.answer) this.add(g.answer, 'golden', g.note, g.score ?? -Infinity);
    }
    const tiers = def.tiers || {};
    for (const t of ['kindling', 'trailhead', 'backcountry', 'deepwoods']) {
      for (const raw of tiers[t] || []) {
        if (typeof raw === 'string') this.add(raw, t);
        else if (raw && raw.answer) this.add(raw.answer, t, raw.note);
      }
    }
  }

  /**
   * Offer an entry as the Golden Antler. It wins if it's nicher (lower score) than the
   * current one and the current one hasn't been found yet. Returns true if it moved.
   */
  offerGolden(entry, score = -Infinity, note) {
    if (!entry) return false;
    const cur = this.goldenEntry();
    if (cur === entry) { if (score < this.goldenScore) this.goldenScore = score; if (note && !entry.note) entry.note = cleanText(note, 200); return false; }
    if (Number.isFinite(score) && TIER_BY_KEY[entry.tier].rank < 2) return false; // too well-known to be the nichest
    if (cur) {
      if (!(score < this.goldenScore)) return false;
      if (this.isClaimed?.(cur)) return false; // already found — the antler stays put
      cur.tier = cur.prevTier && cur.prevTier !== 'golden' ? cur.prevTier : 'deepwoods';
    }
    entry.prevTier = entry.tier;
    entry.tier = 'golden';
    this.goldenScore = score;
    if (note) entry.note = cleanText(note, 200);
    if (cur) this.onGoldenMove?.(entry, cur);
    return true;
  }

  /** Add (or re-tier) an entry. Returns the entry or null. `score` only matters for golden offers. */
  add(raw, tier, note, score) {
    if (tier === 'golden') {
      const e = this.add(raw, 'deepwoods');
      if (e) this.offerGolden(e, score ?? -Infinity, note);
      return e;
    }
    if (!TIER_BY_KEY[tier]) return null;
    const parts = String(raw).split('|').map((p) => cleanText(p, 80)).filter(Boolean);
    if (!parts.length) return null;
    const keys = [...new Set(parts.map(answerKey).filter(Boolean))];
    if (!keys.length) return null;
    // existing entry?
    for (const k of keys) {
      const ex = this.index.get(k);
      if (ex) {
        // the more common tier wins (keeps scoring fair). A generated golden that turns out
        // to be common (another source says Kindling/Trailhead) loses the antler.
        if (ex.tier === 'golden') {
          if (Number.isFinite(this.goldenScore) && TIER_BY_KEY[tier].rank < 2 && !this.isClaimed?.(ex)) { ex.tier = tier; this.goldenScore = Infinity; }
        } else if (TIER_BY_KEY[tier].rank < TIER_BY_KEY[ex.tier].rank) ex.tier = tier;
        if (ex.prevTier && TIER_BY_KEY[tier].rank < TIER_BY_KEY[ex.prevTier].rank) ex.prevTier = tier;
        if (note && !ex.note) ex.note = cleanText(note, 200);
        for (const k2 of keys) if (!this.index.has(k2)) this._indexKey(k2, ex);
        for (const part of parts) if (part !== ex.name && !ex.aliases.includes(part) && ex.aliases.length < 8) { ex.aliases.push(part); this._indexWords(part, ex); }
        return ex;
      }
    }
    const entry = { id: this.entries.length, name: parts[0], aliases: parts.slice(1, 9), tier, note: note ? cleanText(note, 200) : undefined };
    this.entries.push(entry);
    for (const k of keys) this._indexKey(k, entry);
    for (const part of parts) this._indexWords(part, entry);
    return entry;
  }

  _indexKey(k, entry) {
    this.index.set(k, entry);
    this._keys.push([k, entry]);
    addTo(this.squash, squashKey(k), entry);
    if (k.length >= 5) {
      const pk = phoneticKey(k);
      if (pk.length >= 3) { let arr = this.phon.get(pk); if (!arr) this.phon.set(pk, (arr = [])); arr.push([k, entry]); }
    }
  }

  _indexWords(text, entry) {
    const w = wordList(text);
    if (w.length >= 2 && w.length <= 4) {
      (this._multi ||= []).push([w, entry, text === entry.name]);
      this._wordsBuiltAt = -1;
      this._coreBuiltAt = -1;
      addTo(this.sorted, [...w].sort().join(' '), entry);
    }
  }

  /** Index an extra name for an existing entry ("soccer" → Association football). Never steals another entry's name. */
  addAlias(entry, raw) {
    if (!entry) return false;
    const a = cleanText(String(raw || ''), 80);
    const k = answerKey(a);
    if (!k || this.index.has(k)) return false;
    this._indexKey(k, entry);
    if (entry.aliases.length < 12) entry.aliases.push(a);
    this._indexWords(a, entry);
    return true;
  }

  /** "Cheddar cheese" also answers to "cheddar", "Golden Retriever dog" to Golden Retriever. */
  _buildCore() {
    const sig = this.size + ':' + this.catWords.size;
    if (this._coreBuiltAt === sig || !this.catWords.size) return;
    // a list that's still growing during play rebuilds at most every 2.5s (keeps per-keystroke hints instant)
    if (this._coreTime && Date.now() - this._coreTime < 2500 && this.core.size) return;
    this._coreTime = Date.now();
    this.core = new Map();
    for (const [w, entry] of this._multi || []) {
      const rest = w.filter((x) => !this.catWords.has(x));
      if (rest.length && rest.length < w.length && rest.join('').length >= 4) addTo(this.core, rest.join(''), entry);
    }
    this._coreBuiltAt = sig;
  }

  /**
   * "Gump" → Forrest Gump, "Tulip" → Tulip tree, "Tchaikovsky" → Pyotr Ilyich Tchaikovsky.
   * A single word identifies an answer only if it's distinctive *within this category*:
   * words that show up across many answers here ("roll", "cake", "tree") never count.
   */
  _buildWords() {
    if (this._wordsBuiltAt === this.size || !this._multi) return;
    if (this._wordsTime && Date.now() - this._wordsTime < 2500 && this.words.size) return;
    this._wordsTime = Date.now();
    const freq = new Map();
    for (const [w] of this._multi) for (const x of new Set(w)) freq.set(x, (freq.get(x) || 0) + 1);
    const common = Math.max(3, this.size * 0.004);
    const frequent = (x) => x.length >= 3 && (freq.get(x) || 0) >= common;
    const people = !!this.wd?.occupation || PEOPLE_RE.test(this.prompt);
    this.words = new Map();
    this.wordsPrimary = new Map(); // same, but only from an answer's main name (beats aliases like "the Italian Monet")
    this.tails = new Map(); // "van gogh" → Vincent van Gogh, "da vinci" → Leonardo da Vinci
    for (const [w, entry, primary] of this._multi) {
      const distinct = w.filter((x) => x.length >= 4 && !GENERIC_WORDS.has(x) && !frequent(x));
      const rest = w.filter((x) => !distinct.includes(x));
      const put = (map, k) => { addTo(map, k, entry); if (primary && map === this.words) addTo(this.wordsPrimary, k, entry); };
      // "Tulip tree", "Sushi roll", "Banana pie": the other words are category staples
      if (distinct.length === 1 && rest.length && rest.every((x) => frequent(x) || GENERIC_WORDS.has(x) && x.length >= 3)) put(this.words, distinct[0]);
      // surnames in people categories: "Tchaikovsky", "Gump"
      else if (people && w.length <= 4) {
        const last = w[w.length - 1];
        if (last.length >= 4 && !GENERIC_WORDS.has(last)) put(this.words, last);
        if (w.length >= 3) put(this.tails, w.slice(-2).join(' '));
      }
    }
    this._wordsBuiltAt = this.size;
  }

  // a changed first letter is a big tell that it's a different word — unless it sounds the same
  static _firstLetterPenalty(a, b) {
    if (a === b) return 0;
    for (const g of SOUND_GROUPS) if (g.includes(a) && g.includes(b)) return 0.15;
    return 0.75;
  }

  /**
   * Pick from tied candidates: unique → the only fresh (unused) one →
   * the single most common tier among the fresh ones (the conservative, lower-scoring read).
   */
  static _choose(set, used, famousFirst = false) {
    if (!set) return null;
    let list = [...new Set(set)];
    if (!list.length) return null;
    if (list.length === 1) return list[0];
    if (used) {
      const fresh = list.filter((e) => !used.has(e.id));
      if (fresh.length === 1) return fresh[0];
      if (fresh.length) list = fresh;
    }
    const minRank = Math.min(...list.map((e) => TIER_BY_KEY[e.tier].rank));
    const common = list.filter((e) => TIER_BY_KEY[e.tier].rank === minRank);
    if (common.length === 1) return common[0];
    // name-only hints ("Monet"): the most famous holder of that name (lists are built most-famous-first)
    return famousFirst && common.length ? common.reduce((a, b) => (b.id < a.id ? b : a)) : null;
  }

  /**
   * Find the entry matching a typed answer.
   * typo: 'strong' (default) | 'gentle' | 'off' (booleans accepted: true = strong).
   * used: Set of entry ids already hiked — ties resolve toward a fresh answer.
   */
  match(input, { typo = 'strong', used = null, _inner = false } = {}) {
    const strength = typo === true ? 'strong' : typo === false ? 'off' : typo;
    const key = answerKey(input);
    if (!key) return null;
    const exact = this.index.get(key);
    if (exact) return { entry: exact, fuzzy: false };
    if (strength === 'off') return null;
    const strong = strength === 'strong';
    const w0 = wordList(input);

    // 0) the same words in another order, or the answer minus the category's own words
    if (w0.length >= 2 && w0.length <= 4) {
      const e = Category._choose(this.sorted.get([...w0].sort().join(' ')), used);
      if (e) return { entry: e, fuzzy: true, how: 'order' };
    }
    if (this.catWords.size) {
      this._buildCore();
      const e = Category._choose(this.core.get(key), used);
      if (e) return { entry: e, fuzzy: true, how: 'category' };
    }

    // 0b) an exact distinctive word or surname ("Monet", "Gump", "van Gogh") beats any typo guess
    const people = !!this.wd?.occupation || PEOPLE_RE.test(this.prompt);
    if (w0.length === 1 && w0[0].length >= 4 && !GENERIC_WORDS.has(w0[0]) && !this.catWords.has(w0[0]) && (people || this.size <= 2000)) {
      this._buildWords();
      const e = Category._choose(this.wordsPrimary.get(w0[0]), used, people) || Category._choose(this.words.get(w0[0]), used, people);
      if (e) return { entry: e, fuzzy: true, how: 'word' };
    }
    if (people && w0.length === 2) {
      this._buildWords();
      const e = Category._choose(this.tails.get(w0.join(' ')), used, true);
      if (e) return { entry: e, fuzzy: true, how: 'surname' };
    }

    // 1) doubled-letter slips: "fusili" → Fusilli
    if (strong) {
      const e = Category._choose(this.squash.get(squashKey(key)), used);
      if (e) return { entry: e, fuzzy: true, how: 'letters' };
    }

    // 2) keyboard-aware edit distance — the budget tightens on huge lists, where near-misses are everywhere
    const crowd = this.size > 4000 ? 0.8 : this.size > 1500 ? 0.88 : this.size > 500 ? 0.95 : 1;
    const budget = typoBudget(key.length, strength) * crowd;
    if (budget > 0) {
      let bestD = Infinity;
      const near = [];
      for (const [k, e] of this._keys) {
        if (Math.abs(k.length - key.length) > budget * 2.5) continue;
        const pen = strong ? Category._firstLetterPenalty(key[0], k[0]) : key[0] === k[0] ? 0 : 1;
        if (pen >= budget) continue;
        const d = typoDistance(key, k, budget - pen) + pen;
        if (d > budget) continue;
        near.push([d, e, k]);
        if (d < bestD) bestD = d;
      }
      if (near.length) {
        let close = near.filter(([d]) => d - bestD < 0.2);
        if (new Set(close.map(([, e]) => e)).size > 1) {
          // tie-break: longest shared beginning ("beavr" → Beaver, not Bear)
          const pre = (k) => { let i = 0; while (i < k.length && i < key.length && k[i] === key[i]) i++; return i; };
          const best = Math.max(...close.map(([, , k]) => pre(k)));
          close = close.filter(([, , k]) => pre(k) === best);
        }
        const e = Category._choose(close.map(([, en]) => en), used);
        if (e) return { entry: e, fuzzy: true, how: 'typo' };
      }
    }
    if (!strong) return null;

    // 3) sounds-alike: "Sekwoya" → Sequoia, "Chaikovsky" → Tchaikovsky (spelling must still be in the ballpark)
    if (key.length >= 5) {
      const pk = phoneticKey(key);
      const loose = budget * 1.3 + 0.2;
      const hits = pk.length >= 3 ? (this.phon.get(pk) || []).filter(([k]) => typoDistance(key, k, loose) <= loose).map(([, e]) => e) : [];
      const e = Category._choose(hits, used);
      if (e) return { entry: e, fuzzy: true, how: 'sound' };
    }

    const w = w0;

    // 5) they named the category too: "golden retreiver dog", "the cheddar cheese" → try again without it
    if (!_inner && this.catWords.size && w.length >= 2) {
      const rest = w.filter((x) => !this.catWords.has(x));
      if (rest.length && rest.length < w.length) {
        const m = this.match(rest.join(' '), { typo: strength, used, _inner: true });
        if (m) return { ...m, fuzzy: true };
      }
    }
    return null;
  }

  /** Build the lazy lookup indexes ahead of the first guess (called when a trail goes live). */
  warm() { try { this._buildWords(); this._buildCore(); } catch { /* best effort */ } }

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
      if (e.tier === 'golden' && !golden) golden = { answer: raw, note: e.note || '', score: Number.isFinite(this.goldenScore) ? this.goldenScore : undefined };
      else tiers[e.tier === 'golden' ? 'deepwoods' : e.tier].push(raw);
    }
    const wd = this.wd ? { cls: this.wd.cls, clsLabel: this.wd.clsLabel, ent: this.wd.ent, prop: this.wd.prop, mode: this.wd.mode, occupation: this.wd.occupation, taxon: this.wd.taxon, cut: this.wd.cut } : undefined;
    return { id: this.id, prompt: this.prompt, source: this.source, golden, tiers, wd, goldenScale: this.goldenScale || undefined };
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
  // generated categories keep their Wikidata class so unlisted answers can still be checked live
  const w = def.wd;
  const wd = w && /^Q\d+$/.test(w.cls) && (!w.ent || /^Q\d+$/.test(w.ent)) && (!w.prop || /^P\d+$/.test(w.prop))
    ? { cls: w.cls, clsLabel: cleanText(w.clsLabel || '', 60), ent: w.ent || null, prop: w.prop || null, mode: w.mode === 'subclass' ? 'subclass' : 'instance', occupation: !!w.occupation, taxon: !!w.taxon, cut: w.cut && typeof w.cut === 'object' ? { trailhead: +w.cut.trailhead || 0, backcountry: +w.cut.backcountry || 0, floor: +w.cut.floor || 0 } : undefined }
    : null;
  if (golden && Number.isFinite(+def.golden?.score)) golden.score = +def.golden.score;
  return { id: 'u-' + i + '-' + Math.random().toString(36).slice(2, 7), prompt, source: 'custom', golden, tiers, generated: !!def.generated, wd, goldenScale: ['pct', 'sl'].includes(def.goldenScale) ? def.goldenScale : null };
}

module.exports = { Category, sanitizeCategoryDef, TIER_KEYS, categoryWords };
