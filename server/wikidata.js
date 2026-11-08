'use strict';
/**
 * Wikidata generator — real, verifiable answers ranked by real-world fame.
 *
 *  "Name a dog breed"            → instances of dog breed
 *  "Name a type of pasta"        → subtypes of pasta
 *  "Name a Pixar movie"          → films whose dominant link to Pixar is "production company"
 *  "Name a country in Africa"    → countries whose dominant link to Africa is "continent"
 *  "Name a famous painter"       → people whose occupation is painter
 *
 * Fame = number of Wikipedia language editions covering the item (sitelinks).
 * Tiers come from fame percentiles, so broad categories get thousands of
 * Trailhead/Backcountry answers, and Deep Woods only keeps items that at least
 * a couple of Wikipedias cover — obscure, but real and checkable.
 *
 * Bulk lists use the QLever Wikidata engine (fast full-class scans) with the
 * official Wikidata Query Service as fallback. Unlisted answers can be checked
 * live with judge().
 */
const { Category } = require('./answers');
const { cleanText, answerKey, normalize, typoDistance, typoBudget } = require('./util');

const UA = 'MivimooseParty/1.1 (campfire party game; question generator)';
const QLEVER = process.env.MIVI_QLEVER_URL || 'https://qlever.cs.uni-freiburg.de/api/wikidata';
const WDQS = 'https://query.wikidata.org/sparql';
const API = 'https://www.wikidata.org/w/api.php';
const PFX = 'PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/> PREFIX wikibase: <http://wikiba.se/ontology#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> PREFIX schema: <http://schema.org/> PREFIX skos: <http://www.w3.org/2004/02/skos/core#> ';
// Classes whose members are commonly filed under a sibling class too ("Bad Romance" is a *single*).
const CLASS_EXTRA = { Q7366: ['Q134556'], Q134556: ['Q7366'], Q8261: ['Q7725634'] };
const HUMAN = 'Q5';
const LIMIT = 6000;

const searchCache = new Map();
const qid = (uri) => uri.slice(uri.lastIndexOf('/') + 1);

// Polite request queue for the Wikidata/Wikipedia APIs: a few at a time, back off on 429.
const apiQueue = { active: 0, max: 3, q: [] };
function queued(fn) {
  return new Promise((resolve, reject) => {
    const run = () => { apiQueue.active++; fn().then(resolve, reject).finally(() => { apiQueue.active--; if (apiQueue.q.length) apiQueue.q.shift()(); }); };
    if (apiQueue.active < apiQueue.max) run(); else apiQueue.q.push(run);
  });
}

async function getJSON(url, ms, accept = 'application/json') {
  const isApi = !url.includes('/sparql') && !url.includes('qlever');
  const once = async () => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, signal: AbortSignal.timeout(ms) });
      if (res.status === 429 && attempt < 3) {
        const wait = Math.min(4000, (parseFloat(res.headers.get('retry-after')) || 0.6 * (attempt + 1)) * 1000);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
  };
  return isApi ? queued(once) : once();
}

const cap = (s) => s.replace(/^\p{L}/u, (c) => c.toUpperCase());
const titleCase = (s) => s.replace(/(^|[\s-])(\p{L})/gu, (m, a, c) => a + c.toUpperCase());
const singularPhrase = (s) => s.replace(/(\w+)$/, (w) => (/(ss|us|is)$/i.test(w) ? w : w.replace(/ies$/i, 'y').replace(/(ch|sh|x|z)es$/i, '$1').replace(/s$/i, '')));
function labelVariants(text) {
  const base = cleanText(text, 90).replace(/^the\s+/i, '');
  const out = new Set();
  for (const b of [base, singularPhrase(base)]) for (const v of [b, b.toLowerCase(), cap(b.toLowerCase()), titleCase(b), 'The ' + titleCase(b)]) if (v) out.add(v);
  return [...out].slice(0, 10);
}
const lit = (s) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"@en';

/** Exact English-label lookup on QLever (~0.5s) — fallback when the search API is unavailable. */
async function labelLookup(text, limit) {
  const values = labelVariants(text).map(lit).join(' ');
  const q = `SELECT ?i (SAMPLE(?l) AS ?label) (SAMPLE(?d) AS ?desc) (MAX(?s) AS ?sl) WHERE { VALUES ?l { ${values} } ?i rdfs:label ?l . ?i wikibase:sitelinks ?s . OPTIONAL { ?i schema:description ?d . FILTER(LANG(?d) = "en") } } GROUP BY ?i ORDER BY DESC(?sl) LIMIT ${limit}`;
  const rows = await sparql(q, { ms: 5000 });
  return rows.map((r) => ({ id: qid(r.i.value), label: r.label?.value || text, description: r.desc?.value || '', matched: r.label?.value || text, sl: +(r.sl?.value || 0) }));
}

/**
 * Find items by name: Wikidata's search API (~0.2s, labels + aliases, popularity-ordered),
 * falling back to an exact-label SPARQL lookup. Returns [{id, label, description, matched}].
 */
async function search(text, limit = 7) {
  const key = normalize(text) + ':' + limit;
  if (searchCache.has(key)) return searchCache.get(key);
  const url = `${API}?action=wbsearchentities&format=json&language=en&uselang=en&type=item&limit=${limit}&search=${encodeURIComponent(cleanText(text, 90))}`;
  const api = getJSON(url, 2500).then((j) => (j.search || []).map((s) => ({ id: s.id, label: s.label || '', description: s.description || '', matched: s.match?.text || s.label || '' })));
  const nonEmpty = (pr) => pr.then((r) => (r.length ? r : Promise.reject(new Error('empty'))));
  // the API (aliases, ~0.2s) usually wins; the label index covers rate limits / outages
  const p = Promise.any([nonEmpty(api), nonEmpty(new Promise((r) => setTimeout(r, 350)).then(() => labelLookup(text, limit)))]).catch(() => []);
  searchCache.set(key, p);
  p.then((r) => { if (!r.length) searchCache.delete(key); }, () => searchCache.delete(key));
  if (searchCache.size > 3000) searchCache.delete(searchCache.keys().next().value);
  return p;
}

/** Bounded queries: ask both engines at once and take the first good answer. */
function sparqlRace(query, ms) {
  const one = (ep) => getJSON(`${ep}?format=json&query=${encodeURIComponent(PFX + query)}`, ms, 'application/sparql-results+json').then((j) => j.results?.bindings || []);
  return Promise.any([one(WDQS), one(QLEVER)]);
}

/** Run SPARQL on QLever (fast scans) and fall back to WDQS. */
async function sparql(query, { ms = 9000, prefer = 'qlever' } = {}) {
  const order = prefer === 'qlever' ? [QLEVER, WDQS] : [WDQS, QLEVER];
  let lastErr;
  for (const ep of order) {
    try {
      const j = await getJSON(`${ep}?format=json&query=${encodeURIComponent(PFX + query)}`, ms, 'application/sparql-results+json');
      return j.results?.bindings || [];
    } catch (err) { lastErr = err; }
  }
  throw lastErr || new Error('Wikidata unreachable');
}

// ---------------------------------------------------------------- prompt → (class, entity)
const REL = /^(.+?)\s+(?:from|by|in|on|of|starring|featuring|with|set in|made by|written by|directed by|released by|produced by|performed by|sung by|created by|played by|voiced by|owned by|based in|located in|native to)\s+(.+)$/i;

function corePhrase(prompt) {
  let s = cleanText(prompt, 140).replace(/\([^)]*\)/g, ' ').replace(/[“”"]/g, '').replace(/[.?!]+$/, '').trim();
  s = s.replace(/^name\s+/i, '');
  for (let i = 0; i < 3; i++) s = s.replace(/^(a|an|the|any|some|one|famous|well[- ]known|popular|real|notable|classic|single)\s+/i, '');
  s = s.replace(/^(types?|kinds?|sorts?|varieties|variety|styles?|forms?)\s+of\s+/i, '');
  s = s.replace(/^breeds?\s+of\s+(.+)$/i, '$1 breed');
  return s.replace(/\s+/g, ' ').trim();
}

const BAD_CLASS_DESC = /family name|given name|surname|disambiguation|wikimedia|scholarly article|album by|single by|song by|episode|human settlement|city in|town in|village in|district|commune|band\b|musical group|video game|television series|film by|\d{4} film|journal|magazine|company|brand of|software/i;
const OCCUPATION_DESC = /\b(person|people|someone|one|individual|artist|practitioner)\s+who\b|\boccupation\b|\bprofession\b|\bprofessional\b|\bspecialist\b/i;

/** Candidate classes whose label/alias exactly matches the phrase. */
async function classCandidates(phrase) {
  const want = answerKey(phrase);
  if (!want) return [];
  const res = await search(phrase, 8);
  return res.filter((r) => (answerKey(r.label) === want || answerKey(r.matched) === want) && !BAD_CLASS_DESC.test(r.description)).slice(0, 3);
}

async function entityFor(phrase) {
  const p = phrase.replace(/^the\s+/i, '');
  const want = answerKey(p);
  const res = await search(p, 5);
  return res.find((r) => answerKey(r.label) === want || answerKey(r.matched) === want) || null;
}

/** Work out what to query. Returns [{cls, ent, occupation}] plans in preference order. */
async function plan(prompt) {
  const phrase = corePhrase(prompt);
  if (!phrase || phrase.split(' ').length > 7) return [];
  const plans = [];
  const asClass = async (clsPhrase, entPhrase) => {
    const [cands, ent] = await Promise.all([classCandidates(clsPhrase), entPhrase ? entityFor(entPhrase) : null]);
    if (entPhrase && !ent) return [];
    return cands.map((c) => ({ cls: c, ent, occupation: OCCUPATION_DESC.test(c.description), taxon: !OCCUPATION_DESC.test(c.description) && TAXON_DESC.test(c.description) }));
  };
  // Every reading of the phrase is looked up in parallel, then taken in priority order:
  // 1) the whole phrase is a class ("dog breed", "pasta", "painter")
  // 2) "<class> in/by/from <entity>" ("country in Africa")
  // 3) "<entity> <class>" ("Pixar movie", "Stephen King novel")
  const readings = [[phrase]];
  const m = REL.exec(phrase);
  if (m) readings.push([m[1], m[2]]);
  const words = phrase.split(' ');
  for (let i = words.length - 1; i >= 1; i--) readings.push([words.slice(i).join(' '), words.slice(0, i).join(' ')]);
  const results = await Promise.all(readings.slice(0, 6).map(([c, e]) => asClass(c, e).catch(() => [])));
  for (const r of results) if (r.length) { plans.push(...r); break; }
  return plans;
}

/** Plans from a Claude LOOKUP hint like "film | Pixar" or "dog breed". */
async function planFromHint(hint) {
  const [clsPhrase, entPhrase] = String(hint).split('|').map((s) => cleanText(s, 60)).filter(Boolean);
  if (!clsPhrase) return [];
  const [cands, ent] = await Promise.all([classCandidates(clsPhrase), entPhrase ? entityFor(entPhrase) : null]);
  if (entPhrase && !ent) return [];
  return cands.map((c) => ({ cls: c, ent, occupation: OCCUPATION_DESC.test(c.description), taxon: !OCCUPATION_DESC.test(c.description) && TAXON_DESC.test(c.description) }));
}

// ---------------------------------------------------------------- queries
// taxonomy: "Name a dinosaur" means genera/species *descended from* the clade (and not birds!)
const TAXON_DESC = /\b(clade|genus|species|family|order|class|suborder|superfamily|infraorder|infraclass|subclass|superorder|phylum|subfamily|tribe|taxon)\b.*\bof\b|\btaxon\b/i;
const TAXON_EXCLUDE = { Q430: ['Q5113'] }; // dinosaurs → no birds
const TAXON_GENUS = new Set(['Q430', 'Q42295', 'Q23038290']); // dinosaurs, pterosaurs: people name genera

function membership(p, depth) {
  if (p.occupation) {
    return depth === 'fast'
      ? `?i wdt:P31 wd:${HUMAN} . ?i wdt:P106 wd:${p.cls.id} . BIND(1 AS ?k)`
      : `?i wdt:P31 wd:${HUMAN} . ?i wdt:P106/wdt:P279* wd:${p.cls.id} . BIND(1 AS ?k)`;
  }
  if (p.taxon) {
    const minus = (TAXON_EXCLUDE[p.cls.id] || []).map((x) => `MINUS { ?i wdt:P171+ wd:${x} }`).join(' ');
    const rank = TAXON_GENUS.has(p.cls.id) ? '{ ?i wdt:P105 wd:Q34740 } UNION { ?i wdt:P105 wd:Q7432 }' : '?i wdt:P105 wd:Q7432 .';
    return `?i wdt:P171+ wd:${p.cls.id} . ${rank} ${minus} BIND(1 AS ?k)`;
  }
  // constants + UNION (a VALUES ?c join is 10× slower on both engines)
  const classes = [p.cls.id, ...(CLASS_EXTRA[p.cls.id] || [])];
  const union = (fn) => classes.map((c) => `{ ${fn('wd:' + c)} }`).join(' UNION ');
  if (depth === 'fast') return `${union((c) => `?i wdt:P31 ${c} . BIND(1 AS ?k)`)} UNION { ?i wdt:P279 wd:${p.cls.id} . BIND(2 AS ?k) }`;
  if (p.mode === 'subclass') return `?i wdt:P279/wdt:P279+ wd:${p.cls.id} . BIND(2 AS ?k)`;
  return `${union((c) => `?i wdt:P31 ?t . ?t wdt:P279* ${c} .`)} BIND(1 AS ?k)`;
}

function buildQuery(p, depth) {
  // the entity goes first: "things linked to Pixar" is a tiny set to check class membership on
  const ent = p.ent ? (p.prop ? `?i wdt:${p.prop} wd:${p.ent.id} .` : `?i ?p wd:${p.ent.id} .`) : '';
  const sel = p.ent && !p.prop ? '?p' : '';
  const desc = p.occupation ? 'OPTIONAL { ?i schema:description ?d . FILTER(LANG(?d) = "en") }' : '';
  return `SELECT DISTINCT ?i ?l ?sl ?k ${sel} ${p.occupation ? '?d' : ''} WHERE { ${ent} ${membership(p, depth)} ?i wikibase:sitelinks ?sl . ?i rdfs:label ?l . FILTER(LANG(?l) = "en") ${desc} } ORDER BY DESC(?sl) LIMIT ${LIMIT}`;
}

function tidyLabel(l) {
  let s = l.replace(/\s*\((?:film|movie|song|album|novel|book|dog|breed|cheese|pasta|plant|genus|species|band|tv series|television series|video game|[^)]*\d{4}[^)]*)\)\s*$/i, '').trim();
  if (/^[a-z]/.test(s)) s = s[0].toUpperCase() + s.slice(1);
  return s;
}

function badLabel(label, clsLabel) {
  if (!label || label.length > 70 || /^Q\d+$/.test(label)) return true;
  if (/\b(list of|lists of|category:|template:|wikipedia|wikimedia|disambiguation)\b/i.test(label)) return true;
  const n = normalize(label);
  const c = normalize(clsLabel);
  if (!c) return false;
  // groupings like "ancient dog breeds", "tube-shaped macaroni products"
  if (n.endsWith(c + 's') || n.endsWith(c + 'es') || /\b(products|groups?|types|varieties|forms)$/.test(n)) return true;
  if (n === c) return true;
  return false;
}

/** Turn ranked rows into tiered entries (percentile curve with real-fame floor). */
function addRows(category, rows, p, owner = true) {
  const seen = category._wdSeen || (category._wdSeen = new Set());
  const fresh = [];
  for (const r of rows) {
    const id = qid(r.i.value);
    if (seen.has(id)) continue;
    const label = tidyLabel(r.l.value);
    if (badLabel(label, p.cls.label)) continue;
    seen.add(id);
    const sl = +r.sl.value;
    // people: rank by fame *as this occupation* — "George W. Bush, painter" shouldn't be Kindling
    let fame = sl;
    if (p.occupation) {
      const stem = normalize(p.cls.label).split(' ').pop().slice(0, 5);
      const d = (r.d?.value || '').toLowerCase();
      if (!(d.includes(stem) || /polymath/.test(d))) fame = sl * 0.12;
    }
    fresh.push({ id, label, sl, fame });
  }
  if (!fresh.length) return 0;
  const all = (category._wdAll || (category._wdAll = [])).concat(fresh).sort((a, b) => b.fame - a.fame);
  category._wdAll = all;
  // drop near-unknown items from big lists so Deep Woods stays sensible, THEN cut tiers over what's left
  const floor = all.length > 80 ? 2 : 0;
  const kept = all.filter((it) => it.sl >= floor);
  const n = kept.length;
  if (!n) return 0;
  const kCount = Math.max(3, Math.min(6, Math.round(n * 0.01)));
  const tCut = Math.max(kCount + 8, Math.round(n * 0.2));
  const bCut = Math.max(tCut + 10, Math.round(n * 0.62));
  const cut = { trailhead: kept[Math.min(n - 1, tCut)]?.sl ?? 0, backcountry: kept[Math.min(n - 1, bCut)]?.sl ?? 0, floor };
  category.wd = { ...category.wd, cut };
  let added = 0;
  kept.forEach((it, rank) => {
    const tier = rank < kCount ? 'kindling' : rank < tCut ? 'trailhead' : rank < bCut ? 'backcountry' : 'deepwoods';
    // extending a curated list (Krillion/Campfire)? only ADD new answers — never re-tier the curated ones
    if (category.respectTiers && category.match(it.label, { typo: 'off' })) return;
    const before = category.size;
    category.add(it.label, category.respectTiers && tier === 'kindling' ? 'trailhead' : tier);
    if (category.size > before) added++;
  });
  // Golden Antler: the NICHEST member that's still verifiable (fewest Wikipedia editions, ≥2 for big lists)
  if (owner && n >= 8) {
    const minSl = Math.max(1, floor);
    const pool = kept.filter((x) => x.sl >= minSl);
    if (pool.length) {
      const lowest = pool[pool.length - 1].sl;
      if (lowest < category.goldenScore) {
        const ties = pool.filter((x) => x.sl === lowest);
        const pickIt = ties[Math.floor(Math.random() * ties.length)];
        const e = category.add(pickIt.label, 'deepwoods');
        if (e && category.offerGolden(e, lowest) !== false && category.goldenEntry() === e) {
          describe(pickIt.id).then((d) => { if (d && !e.note) e.note = d; }).catch(() => {});
        }
      }
    }
  }
  return added;
}

/** A fun-fact note for the Golden Antler: Wikipedia's first sentence, or how few Wikipedias know it. */
async function describe(id) {
  const j = await getJSON(`${API}?action=wbgetentities&format=json&props=descriptions|sitelinks&languages=en&sitefilter=enwiki&ids=${id}`, 3000);
  const ent = j.entities?.[id];
  const desc = ent?.descriptions?.en?.value;
  const title = ent?.sitelinks?.enwiki?.title;
  if (title) {
    try {
      const s = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, 3000);
      const first = (s.extract || '').split(/(?<=[.!?])\s+/)[0];
      if (first && first.length <= 170) return first;
      if (first) return first.slice(0, 165).replace(/\s+\S*$/, '') + '…';
    } catch { /* fall through */ }
  }
  return desc ? `${desc[0].toUpperCase()}${desc.slice(1)} — so niche that hardly any encyclopedia covers it.` : 'So niche that hardly any encyclopedia covers it.';
}

/** Choose instance vs subclass mode and the dominant relation to the entity. */
function shape(rows, p) {
  let inst = 0, sub = 0;
  for (const r of rows) (r.k?.value === '2' ? sub++ : inst++);
  p._inst = inst; p._sub = sub;
  p.mode = p.occupation || p.taxon || sub === 0 || inst >= Math.max(25, sub) ? 'instance' : 'subclass';
  let kept = rows.filter((r) => (p.mode === 'subclass' ? r.k?.value === '2' : r.k?.value !== '2'));
  if (p.ent && !p.prop) {
    const counts = new Map();
    for (const r of kept) if (r.p) counts.set(r.p.value, (counts.get(r.p.value) || 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) {
      p.prop = top[0].slice(top[0].lastIndexOf('/') + 1);
      kept = kept.filter((r) => r.p?.value === top[0]);
    }
  }
  return kept;
}

/**
 * Generate (or fill) a category from Wikidata.
 * Returns { category, ready, done, abort, how } like the AI generator.
 * `into` lets the AI generator merge Wikidata answers into its own live category.
 */
function generate(prompt, { into = null, onProgress, minItems = 12, hint = null } = {}) {
  const owner = !into; // when merging into an AI category, Claude owns the Golden Antler
  const category = into || new Category({ id: 'wd-' + Date.now().toString(36), prompt, source: 'wikidata', sourceLabel: 'Wikidata trail', generated: true, complete: false, goldenScale: 'sl' });
  let aborted = false;
  const run = (async () => {
    const plans = hint ? await planFromHint(hint) : await plan(prompt);
    if (!plans.length) throw new Error('No Wikidata class for that category');
    // try candidate classes in parallel, keep the first (in preference order) with enough results.
    // Entity-scoped queries ("Pixar movie") search the whole subclass tree straight away — the entity keeps them fast.
    const results = await Promise.all(plans.map((p) => {
      if (p.ent && !p.occupation) p.mode = 'instance';
      p.firstQ = (p.ent && !p.occupation) || p.taxon ? 'deep' : 'fast';
      const q = buildQuery(p, p.firstQ);
      return sparql(q, { ms: 9000 }).then((rows) => ({ p, rows: shape(rows, p) })).catch(() => ({ p, rows: [] }));
    }));
    for (const r of results) {
      if (r.p.mode === 'subclass' && r.p._inst < 25 && !r.p.taxon && !r.p.occupation) {
        const probe = { ...r.p, mode: 'instance' };
        const rows = await sparql(buildQuery(probe, 'deep'), { ms: 9000 }).catch(() => []);
        const kept = shape(rows, probe);
        if (kept.length >= Math.max(25, r.p._sub)) { Object.assign(r.p, probe, { mode: 'instance', firstQ: 'deep' }); r.rows = kept; }
      }
    }
    const best = results.find((r) => r.rows.length >= (r.p.ent ? 5 : minItems));
    if (!best || aborted) throw new Error('Wikidata found too few answers');
    const p = best.p;
    category.wd = { cls: p.cls.id, clsLabel: p.cls.label, ent: p.ent?.id || null, prop: p.prop || null, mode: p.mode, occupation: p.occupation, taxon: !!p.taxon };
    if (!category.sourceLabel || category.source === 'wikidata') category.sourceLabel = `Wikidata · ${p.cls.label}${p.ent ? ' · ' + p.ent.label : ''}`;
    addRows(category, best.rows, p, owner);
    p.firstPageFull = best.rows.length >= LIMIT * 0.9;
    onProgress?.(category);
    return p;
  })();
  const ready = run.then(() => category);
  const active = () => !aborted && category.active !== false;
  const done = run.then(async (p) => {
    // keep searching: deeper subclass trees ("animated feature film" is still a film)…
    try {
      if (active()) {
        const rows = await sparql(buildQuery(p, 'deep'), { ms: 12000 });
        if (active() && addRows(category, rows, p, owner)) onProgress?.(category);
      }
    } catch { /* first pass is plenty */ }
    // …and further down the fame ladder for huge classes, while campers are still on this trail
    for (let page = 1; page <= 2 && p.firstPageFull && active(); page++) {
      try {
        const rows = await sparql(buildQuery(p, p.firstQ || 'fast').replace(`LIMIT ${LIMIT}`, `LIMIT ${LIMIT} OFFSET ${LIMIT * page}`), { ms: 15000 });
        if (!rows.length) break;
        if (active() && addRows(category, shape(rows, p), p, owner)) onProgress?.(category);
      } catch { break; }
    }
    if (owner) category.complete = true;
    return category;
  });
  ready.catch(() => {});
  done.catch(() => {});
  return { category, ready, done, abort: () => { aborted = true; }, how: 'wikidata' };
}

/**
 * Is `answer` a member of the category's Wikidata class?
 * Name search (~0.2s) + a bounded membership check raced across two engines (~0.3–0.9s).
 */
async function judge(wd, answer) {
  if (!wd?.cls) return { valid: false };
  const typed = cleanText(answer, 80);
  const tk = answerKey(typed);
  if (tk.length < 2) return { valid: false };
  const cands = (await search(typed, 20)).filter((c) => {
    // the found name must really be what they typed (search is prefix-fuzzy: "Ca" must not become "Cars")
    const mk = answerKey(c.matched), lk = answerKey(c.label);
    if (mk === tk || lk === tk) return true;
    const b = typoBudget(tk.length);
    if (typoDistance(tk, mk, b) <= b || typoDistance(tk, lk, b) <= b) return true;
    const words = normalize(c.label).split(' ');
    if (tk.length >= 4 && answerKey(words[words.length - 1]) === tk) return true; // surname: "Monet" → Claude Monet
    // "cheddar" → "Cheddar cheese": the extra words are just the category's own noun
    const clsWords = new Set(normalize(wd.clsLabel || '').split(' ').map(answerKey));
    return words.length > 1 && answerKey(words[0]) === tk && words.slice(1).every((x) => clsWords.has(answerKey(x)) || ['cheese', 'dog', 'cat', 'tree', 'plant', 'bird', 'fish'].includes(x));
  });
  const classes = [wd.cls, ...(CLASS_EXTRA[wd.cls] || [])];
  const member = wd.occupation
    ? `?i wdt:P31 wd:${HUMAN} . ?i wdt:P106/wdt:P279* wd:${wd.cls} .`
    : wd.taxon ? `?i wdt:P171+ wd:${wd.cls} .` + (TAXON_EXCLUDE[wd.cls] || []).map((x) => ` MINUS { ?i wdt:P171+ wd:${x} }`).join('')
    : wd.mode === 'subclass' ? `?i (wdt:P31|wdt:P279)/wdt:P279* wd:${wd.cls} .` : `?i wdt:P31|wdt:P279 ?t . ?t wdt:P279* ?c . FILTER(${classes.map((c) => '?c = wd:' + c).join(' || ')})`;
  const ent = wd.ent ? (wd.prop ? `?i wdt:${wd.prop} wd:${wd.ent} .` : `?i ?p wd:${wd.ent} .`) : '';
  if (!cands.length && !wd.ent) return { valid: false };
  // entity categories: also look the exact name up *within* the entity's works (bounded, fast)
  const byName = wd.ent
    ? sparqlRace(`SELECT ?i ?sl ?l WHERE { VALUES ?l { ${labelVariants(typed).map(lit).join(' ')} } ?i rdfs:label ?l . ${ent} ${member} ?i wikibase:sitelinks ?sl . } LIMIT 5`, 3500).catch(() => [])
    : Promise.resolve([]);
  const byId = cands.length
    ? sparqlRace(`SELECT ?i ?sl WHERE { VALUES ?i { ${cands.map((c) => 'wd:' + c.id).join(' ')} } ${member} ${ent} ?i wikibase:sitelinks ?sl . } LIMIT 10`, 3500).catch(() => [])
    : Promise.resolve([]);
  const [named, rows] = await Promise.all([byName, byId]);
  if (named.length && !rows.length) {
    const sl0 = +(named[0].sl?.value || 0);
    const cut0 = wd.cut || { trailhead: 30, backcountry: 8 };
    return { valid: true, canonical: tidyLabel(named[0].l?.value || typed), tier: sl0 >= cut0.trailhead ? 'trailhead' : sl0 >= cut0.backcountry ? 'backcountry' : 'deepwoods', sl: sl0 };
  }
  const hit = cands.find((c) => rows.some((r) => qid(r.i.value) === c.id));
  if (!hit) return { valid: false };
  const sl = +(rows.find((r) => qid(r.i.value) === hit.id).sl.value || 0);
  const cut = wd.cut || { trailhead: 30, backcountry: 8 };
  const tier = sl >= cut.trailhead ? 'trailhead' : sl >= cut.backcountry ? 'backcountry' : 'deepwoods';
  return { valid: true, canonical: tidyLabel(hit.label || typed), tier, sl };
}

module.exports = { generate, judge, plan, corePhrase };
