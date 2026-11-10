'use strict';
/**
 * Wikidata search engine — real, verifiable answers ranked by real-world fame.
 *
 *  "Name a dog breed"            → instances of dog breed
 *  "Name a vegetable"            → kinds of vegetable (Garlic, Spinach — common names, not "Allium sativum")
 *  "Name a bird"                 → every famous bird group (Owl, Penguin, Eagle) + thousands of species
 *  "Name a Pixar movie"          → films whose dominant link to Pixar is "production company"
 *  "Name a country in Africa"    → countries whose dominant link to Africa is "continent"
 *  "Name a famous painter"       → people whose occupation is painter, ranked by fame *as a painter*
 *
 * Search pipeline (each step merges into the live category while campers play):
 *  1. Popular pass (~1–2s): every member with real fame (≥ ~18 Wikipedia editions), instance AND
 *     subclass modelling at any depth, English-Wikipedia titles as display names. The round can
 *     start here — the Kindling/Trailhead answers people actually say are already on the map.
 *  2. Common names: English aliases for the famous members ("soccer", "pigeon", "T. rex").
 *  3. The long tail (background): thousands of Backcountry / Deep Woods members, then deeper pages.
 *  4. Taxon categories: famous common-name items described as members ("eagle: large bird").
 *  5. Golden Antler: the nichest verifiable member — fewest Wikipedia editions, ties broken by
 *     the fewest Wikipedia readers — with its Wikipedia first sentence as the fun fact.
 *
 * Fame = number of Wikipedia language editions covering the item (sitelinks), discounted when
 * English Wikipedia has no article. Tiers come from fame percentiles.
 *
 * Bulk lists use the QLever Wikidata engine with the official Wikidata Query Service as fallback.
 * Unlisted answers are checked live with judge(): name search, then a description check
 * ("eagle — large carnivorous bird") raced against a SPARQL class-membership check.
 */
const { Category } = require('./answers');
const { cleanText, answerKey, normalize, typoDistance, typoBudget, wordList } = require('./util');

const CONTACT = cleanText(process.env.MIVI_CONTACT || '', 120);
const UA = `MivimooseParty/1.2 (campfire party game; question generator${CONTACT ? '; ' + CONTACT : ''})`;
const QLEVER = process.env.MIVI_QLEVER_URL || 'https://qlever.cs.uni-freiburg.de/api/wikidata';
const WDQS = 'https://query.wikidata.org/sparql';
const API = 'https://www.wikidata.org/w/api.php';
const WP_API = 'https://en.wikipedia.org/w/api.php';
const PFX = 'PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/> PREFIX wikibase: <http://wikiba.se/ontology#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> PREFIX schema: <http://schema.org/> PREFIX skos: <http://www.w3.org/2004/02/skos/core#> ';
// Classes whose members are commonly filed under a sibling class too ("Bad Romance" is a *single*, Ford is an *automobile manufacturer*).
const CLASS_EXTRA = {
  Q7366: ['Q134556'], Q134556: ['Q7366'], // song ↔ single
  Q8261: ['Q7725634'], // novel → literary work
  Q10429667: ['Q786820'], Q786820: ['Q10429667'], // car brand ↔ automobile manufacturer
  Q185583: ['Q5159627'], // candy → confectionery
};
const HUMAN = 'Q5';
const LIMIT = 6000;
const POP_LIMIT = 3000;
const ENWIKI = 'OPTIONAL { ?s schema:about ?i ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?t }';

const searchCache = new Map();
const planCache = new Map();
const qid = (uri) => uri.slice(uri.lastIndexOf('/') + 1);
const lru = (map, max) => { while (map.size > max) map.delete(map.keys().next().value); };

// Polite request queue for the Wikidata/Wikipedia APIs: a few at a time, back off on 429.
const apiQueue = { active: 0, max: 4, q: [] };
function queued(fn) {
  return new Promise((resolve, reject) => {
    const run = () => { apiQueue.active++; fn().then(resolve, reject).finally(() => { apiQueue.active--; if (apiQueue.q.length) apiQueue.q.shift()(); }); };
    if (apiQueue.active < apiQueue.max) run(); else apiQueue.q.push(run);
  });
}

// Rate-limit circuit breaker: a host that says 429 is left alone for a while and the other engine takes over.
const cooldown = new Map(); // host -> until (ms)
const hostOf = (url) => { try { return new URL(url).host; } catch { return url; } };
const cooling = (url) => (cooldown.get(hostOf(url)) || 0) > Date.now();
function coolDown(url, res) {
  const secs = Math.min(120, Math.max(15, parseFloat(res?.headers?.get?.('retry-after')) || 30));
  cooldown.set(hostOf(url), Date.now() + secs * 1000);
}

async function getJSON(url, ms, accept = 'application/json') {
  const isApi = !url.includes('/sparql') && !url.includes('qlever');
  if (cooling(url)) throw new Error('rate-limited (cooling down)');
  const once = async () => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA, Accept: accept }, signal: AbortSignal.timeout(ms) });
      if (res.status === 429) {
        // query engines: hand over to the other engine right away; APIs: brief polite retry
        if (!isApi || attempt >= 2) { coolDown(url, res); throw new Error('HTTP 429'); }
        const wait = Math.min(3000, (parseFloat(res.headers.get('retry-after')) || 0.6 * (attempt + 1)) * 1000);
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
 * raced against an exact-label SPARQL lookup. Returns [{id, label, description, matched}].
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
  lru(searchCache, 3000);
  return p;
}

// #GEAR# marks a property path the official service should walk from the (bound) item upward — QLever needs no hint
const forEngine = (ep, query) => query.replace(/#GEAR#/g, ep === WDQS ? 'hint:Prior hint:gearing "forward" .' : '');
const sparqlOn = (ep, query, ms) => getJSON(`${ep}?format=json&query=${encodeURIComponent(PFX + forEngine(ep, query))}`, ms, 'application/sparql-results+json').then((j) => j.results?.bindings || []);

/** Bounded queries: ask both engines at once and take the first good answer. */
function sparqlRace(query, ms) {
  return Promise.any([sparqlOn(WDQS, query, ms), sparqlOn(QLEVER, query, ms)]);
}

/** Bounded lookups (ranger checks): the official service answers these in ~0.2s; QLever only if it's unavailable. */
async function sparqlCheck(query, ms) {
  for (const ep of [WDQS, QLEVER].sort((a, b) => cooling(a) - cooling(b))) {
    try { return await sparqlOn(ep, query, ms); } catch { /* next engine */ }
  }
  return [];
}

/**
 * Both engines at once; resolves with the first NON-EMPTY result (or [] if both come back empty).
 * The engines' data differs a little (one may be missing a claim), so "found it" beats "fastest".
 */
function sparqlFound(query, ms, grace = 650) {
  return new Promise((resolve) => {
    let pending = 2, timer = null, done = false;
    const finish = (rows) => { if (!done) { done = true; clearTimeout(timer); resolve(rows); } };
    const settle = (rows) => {
      if (rows?.length) return finish(rows);
      // one engine says "nothing": give the other a short grace period, not its full timeout
      if (--pending === 0) return finish([]);
      timer = setTimeout(() => finish([]), grace);
    };
    sparqlOn(WDQS, query, ms).then(settle, () => settle(null));
    sparqlOn(QLEVER, query, ms).then(settle, () => settle(null));
  });
}

/** Run SPARQL on QLever (fast scans) and fall back to WDQS. */
async function sparql(query, { ms = 9000, prefer = 'qlever' } = {}) {
  const order = (prefer === 'qlever' ? [QLEVER, WDQS] : [WDQS, QLEVER]).sort((a, b) => cooling(a) - cooling(b));
  let lastErr;
  for (const ep of order) {
    try {
      const j = await getJSON(`${ep}?format=json&query=${encodeURIComponent(PFX + forEngine(ep, query))}`, ms, 'application/sparql-results+json');
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
  for (let i = 0; i < 3; i++) s = s.replace(/^(a|an|the|any|some|one|famous|well[- ]known|popular|real|notable|classic|single|common|type of|kind of)\s+/i, '');
  s = s.replace(/^(types?|kinds?|sorts?|varieties|variety|styles?|forms?)\s+of\s+/i, '');
  s = s.replace(/^breeds?\s+of\s+(.+)$/i, '$1 breed');
  return s.replace(/\s+/g, ' ').trim();
}

const BAD_CLASS_DESC = /family name|given name|surname|disambiguation|wikimedia|scholarly article|album by|single by|song by|episode|human settlement|city in|town in|village in|district|commune|band\b|musical group|video game|television series|film by|\d{4} film|journal|magazine|company|brand of|software/i;
const OCCUPATION_DESC = /\b(person|people|someone|one|individual|artist|practitioner)\s+who\b|\boccupation\b|\bprofession\b|\bprofessional\b|\bspecialist\b/i;
// taxonomy: "Name a dinosaur" means genera/species *descended from* the clade (and not birds!)
const TAXON_DESC = /\b(clade|genus|species|family|order|class|suborder|superfamily|infraorder|infraclass|subclass|superorder|phylum|subfamily|tribe|taxon)\b.*\bof\b|\btaxon\b/i;
const TAXON_EXCLUDE = { Q430: ['Q5113'] }; // dinosaurs → no birds
const TAXON_GENUS = new Set(['Q430', 'Q42295', 'Q23038290']); // dinosaurs, pterosaurs: people name genera

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

const toPlan = (c, ent) => ({ cls: c, ent, occupation: OCCUPATION_DESC.test(c.description), taxon: !OCCUPATION_DESC.test(c.description) && TAXON_DESC.test(c.description) });

/** Work out what to query. Returns [{cls, ent, occupation, taxon}] plans in preference order. */
function plan(prompt) {
  const phrase = corePhrase(prompt);
  const key = answerKey(phrase);
  if (!phrase || phrase.split(' ').length > 7) return Promise.resolve([]);
  if (planCache.has(key)) return planCache.get(key).then((plans) => plans.map((p) => ({ ...p })));
  const p = (async () => {
    const asClass = async (clsPhrase, entPhrase) => {
      const [cands, ent] = await Promise.all([classCandidates(clsPhrase), entPhrase ? entityFor(entPhrase) : null]);
      if (entPhrase && !ent) return [];
      return cands.map((c) => toPlan(c, ent));
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
    const results = await Promise.all(readings.slice(0, 5).map(([c, e]) => asClass(c, e).catch(() => [])));
    for (const r of results) if (r.length) return r;
    return [];
  })();
  planCache.set(key, p);
  p.then((r) => { if (!r.length) planCache.delete(key); }, () => planCache.delete(key));
  lru(planCache, 400);
  return p.then((plans) => plans.map((x) => ({ ...x })));
}

/** Plans from a Claude LOOKUP hint like "film | Pixar" or "dog breed". */
async function planFromHint(hint) {
  const [clsPhrase, entPhrase] = String(hint).split('|').map((s) => cleanText(s, 60)).filter(Boolean);
  if (!clsPhrase) return [];
  const [cands, ent] = await Promise.all([classCandidates(clsPhrase), entPhrase ? entityFor(entPhrase) : null]);
  if (entPhrase && !ent) return [];
  return cands.map((c) => toPlan(c, ent));
}

// ---------------------------------------------------------------- queries
// k codes: 1 direct instance · 2 direct subclass · 3 deeper instance · 4 deeper subclass
const KPAT = { 1: (c) => `?i wdt:P31 ${c} .`, 2: (c) => `?i wdt:P279 ${c} .`, 3: (c) => `?i wdt:P31/wdt:P279+ ${c} .`, 4: (c) => `?i wdt:P279/wdt:P279+ ${c} .` };

function membership(p, depth) {
  if (p.occupation) return `?i wdt:P31 wd:${HUMAN} . ?i wdt:P106/wdt:P279* wd:${p.cls.id} . BIND(1 AS ?k)`;
  if (p.taxon) {
    const minus = (TAXON_EXCLUDE[p.cls.id] || []).map((x) => `MINUS { ?i wdt:P171+ wd:${x} }`).join(' ');
    // popular pass: every rank — "owl" is an order, "penguin" a family, "swan" a genus
    if (depth === 'popular') return `?i wdt:P171+ wd:${p.cls.id} . ${minus} BIND(1 AS ?k)`;
    const rank = TAXON_GENUS.has(p.cls.id) ? '{ ?i wdt:P105 wd:Q34740 } UNION { ?i wdt:P105 wd:Q7432 }' : '?i wdt:P105 wd:Q7432 .';
    return `?i wdt:P171+ wd:${p.cls.id} . ${rank} ${minus} BIND(1 AS ?k)`;
  }
  // constants + UNION (a VALUES ?c join is 10× slower on both engines)
  const classes = [p.cls.id, ...(CLASS_EXTRA[p.cls.id] || [])];
  const codes = depth === 'popular' || !p.kmode ? [1, 2, 3, 4] : p.kmode === 'subclass' ? [1, 2, 4] : [1, 2, 3];
  const parts = [];
  for (const c of classes) for (const k of codes) parts.push(`{ ${KPAT[k]('wd:' + c)} BIND(${k} AS ?k) }`);
  if (p.ent) parts.push(`{ ${classNamed(p.cls.label)} BIND(3 AS ?k) }`);
  return parts.join(' UNION ');
}

/** "?i is an instance of some class whose English name ends in <head noun>" (animated film, short film…). */
function classNamed(clsLabel) {
  const head = normalize(clsLabel).split(' ').pop().replace(/[^a-z]/g, '');
  if (!head || head.length < 3) return '?i wdt:P31 wd:Q0 .';
  return `?i wdt:P31 ?c5 . ?c5 rdfs:label ?c5l . FILTER(LANG(?c5l) = "en") FILTER(LCASE(STR(?c5l)) = "${head}" || STRENDS(LCASE(STR(?c5l)), " ${head}"))`;
}

function buildQuery(p, depth, { min = 0, limit = LIMIT, offset = 0 } = {}) {
  // the entity goes first: "things linked to Pixar" is a tiny set to check class membership on
  const ent = p.ent ? (p.prop ? `?i wdt:${p.prop} wd:${p.ent.id} .` : `?i ?p wd:${p.ent.id} .`) : '';
  const sel = p.ent && !p.prop ? '?p' : '';
  const desc = p.occupation ? 'OPTIONAL { ?i schema:description ?d . FILTER(LANG(?d) = "en") }' : '';
  const minF = min > 0 ? `FILTER(?sl >= ${min})` : '';
  return `SELECT DISTINCT ?i ?l ?t ?sl ?k ${sel} ${p.occupation ? '?d' : ''} WHERE { ${ent} ${membership(p, depth)} ?i wikibase:sitelinks ?sl . ${minF} ?i rdfs:label ?l . FILTER(LANG(?l) = "en") ${ENWIKI} ${desc} } ORDER BY DESC(?sl) LIMIT ${limit}${offset ? ' OFFSET ' + offset : ''}`;
}

/** Collapse SPARQL rows (one per k-code / property) into items. */
function groupRows(rows) {
  const m = new Map();
  for (const r of rows) {
    if (!r.i || !r.l) continue;
    const id = qid(r.i.value);
    let it = m.get(id);
    if (!it) m.set(id, (it = { id, label: r.l.value, title: '', sl: +(r.sl?.value || 0), ks: new Set(), props: new Set(), d: '' }));
    if (r.k) it.ks.add(+r.k.value);
    if (r.p) it.props.add(r.p.value);
    if (r.t && !it.title) it.title = r.t.value;
    if (r.d && !it.d) it.d = r.d.value;
  }
  return [...m.values()].sort((a, b) => b.sl - a.sl);
}

/**
 * Decide how this class is modelled (members as instances or as subclasses) and drop the
 * odd paths: for "sport" (kinds-of) the NBA (an instance of a league…) doesn't count; for
 * "dog breed" (instances) deeper subclass groupings don't. Entity categories keep the
 * dominant relation to the entity ("production company" for Pixar).
 */
function shape(items, p) {
  if (!p.occupation && !p.taxon && !p.kmode) {
    let inst = 0, sub = 0;
    for (const it of items.slice(0, 300)) {
      const i = it.ks.has(1) || it.ks.has(3), s = it.ks.has(2) || it.ks.has(4);
      if (i && !s) inst++; else if (s && !i) sub++;
    }
    p.kmode = sub > inst ? 'subclass' : 'instance';
  }
  let kept = items;
  if (p.kmode) kept = items.filter((it) => (p.kmode === 'subclass' ? it.ks.has(1) || it.ks.has(2) || it.ks.has(4) : it.ks.has(1) || it.ks.has(2) || it.ks.has(3)));
  if (p.ent && !p.prop) {
    const counts = new Map();
    for (const it of kept) for (const pr of it.props) counts.set(pr, (counts.get(pr) || 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) {
      p.prop = qid(top[0]);
      kept = kept.filter((it) => it.props.has(top[0]));
    }
  }
  return kept;
}

// ---------------------------------------------------------------- names & filters
const LATIN_END = /(idae|inae|iformes|aceae|ales|oidea|ini|ia|us|um|is|ae|a|es|on|ops|ix|ex|ensis)$/;
/** "Allium sativum", "Strigiformes", "Corvus", "Brassica rapa subsp. chinensis" */
function looksLatin(s) {
  if (/\b(subsp|var|ssp|f)\.\s/.test(s)) return true;
  const w = s.split(' ');
  if (!/^[A-Z][a-z]+$/.test(w[0]) || w.length > 3) return false;
  if (w.length === 1) return LATIN_END.test(w[0]) && w[0].length >= 5;
  return w.slice(1).every((x) => /^[a-z]+$/.test(x)) && LATIN_END.test(w[w.length - 1]);
}

function tidyLabel(l) {
  let s = l.replace(/\s*\((?:film|movie|song|album|novel|book|dog|breed|cheese|pasta|plant|genus|species|band|tv series|television series|video game|[^)]*\d{4}[^)]*)\)\s*$/i, '').trim();
  if (/^[a-z]/.test(s)) s = s[0].toUpperCase() + s.slice(1);
  return s;
}
const tidyTitle = (t) => tidyLabel(t.replace(/\s*\([^)]*\)\s*$/, '').trim());

// "Ford Motor Company" → Ford, "Audi AG" → Audi, "Tesla, Inc." → Tesla
const CORP_SUFFIX = /(?:,?\s+(?:inc|incorporated|corp|corporation|co|company|ltd|limited|llc|plc|ag|se|sa|s\.a|spa|s\.p\.a|gmbh|nv|bv|ab|asa|oy|kk|holdings?|group|motor company|motor corporation|motor co|motors|motor cars|automobiles|automobile company|automotive|car company|cars|brewery|brewing company|records|studios?|entertainment|productions?|industries)\.?)+$/i;
const NOT_SHORT = new Set('general national united american international royal standard british first new great the city state'.split(' '));
function shortName(name) {
  const s = name.replace(CORP_SUFFIX, '').trim();
  if (s === name || s.length < 3 || NOT_SHORT.has(s.toLowerCase())) return null;
  return s;
}

/** Display name + aliases: English Wikipedia's common name beats a Latin label; corporate suffixes become aliases. */
function chooseName(label, title) {
  const L = tidyLabel(label);
  const T = title ? tidyTitle(title) : '';
  let out;
  if (!T || T.length > 60) out = { name: L, alt: [] };
  else if (normalize(T) === normalize(L)) out = { name: /^[A-Z]/.test(T) ? T : L, alt: [] };
  else if (looksLatin(L)) out = { name: T, alt: [L] };
  else out = { name: L, alt: [T] };
  for (const n of [out.name, ...out.alt]) { const sh = shortName(n); if (sh && !out.alt.includes(sh)) out.alt.push(sh); }
  return out;
}

function badLabel(label, clsLabel) {
  if (!label || label.length > 70 || /^Q\d+$/.test(label)) return true;
  if (/\b(list of|lists of|category:|template:|wikipedia|wikimedia|disambiguation|outline of|index of|history of)\b/i.test(label)) return true;
  if (/^[\d\s.,:/-]+$/.test(label) || /[{}[\]<>|#@]/.test(label)) return true;
  const n = normalize(label);
  const c = normalize(clsLabel);
  if (!c) return false;
  // groupings like "ancient dog breeds", "tube-shaped macaroni products"
  if (n.endsWith(c + 's') || n.endsWith(c + 'es') || /\b(products|groups?|types|varieties|forms)$/.test(n)) return true;
  if (n === c) return true;
  return false;
}

/** "team sport", "root vegetable", "string instrument" — kinds-of-the-class rather than answers. */
function isGrouping(name, p) {
  if (p.taxon || p.occupation) return false;
  const head = wordList(p.cls.label).pop();
  const w = wordList(name);
  return w.length >= 2 && w[w.length - 1] === head;
}

// ---------------------------------------------------------------- description sense check
const CLASSIFIER = /^(?:(?:a|an|the|any|one|many|several|some|large|small|common|extinct|domesticated|wild|various|any of)\s+)*(?:species|subspecies|genus|genera|family|subfamily|superfamily|order|suborder|infraorder|tribe|clade|class|group|type|kind|breed|variety|cultivar|form|common name|name|member)\s+(?:of|for|in|within)\s+(.*)$/;
const HEAD_STOP = /\b(?:of|in|from|by|for|that|which|who|whose|where|with|including|used|kept|found|native|known|made|caused|adapted|played|consisting|endemic|living|located|named|described|and|or|to|on|at|as|specifically|especially|mainly|usually|typically|often|than|between|during|after|before)\b/;
/** The words that say what something IS: "species of bird of prey" → [bird]; "large carnivorous bird" → [large, carnivorous, bird]. */
function headWords(desc) {
  let d = normalize(desc || '');
  for (let i = 0; i < 3; i++) { const m = CLASSIFIER.exec(d); if (!m) break; d = m[1]; }
  const cut = d.split(HEAD_STOP)[0].trim();
  return cut ? cut.split(' ').slice(-5).map((w) => wordList(w)[0] || w) : [];
}
/** Does this description say the item is one of the class? ("eagle — large carnivorous bird" ✓ for birds) */
function descFits(desc, clsLabel) {
  const want = wordList(clsLabel || '');
  if (!want.length || want.length > 3) return false;
  const head = headWords(desc);
  if (!head.length || /\bfictional|character|film|song|album|band|company|brand|team|logo|emblem|mascot|ship|aircraft|novel|book|episode\b/.test(head.join(' '))) return false;
  let at = 0;
  for (const w of head) if (w === want[at]) at++; // the class words, in order (e.g. "dog breed")
  return at === want.length;
}

// ---------------------------------------------------------------- building the category
/** Turn query items into category nodes (deduped, named, scored). Returns how many were new. */
function ingest(category, items, p) {
  const ctx = category._wd || (category._wd = { items: new Map(), entryOf: new Map() });
  let fresh = 0;
  const stem = p.occupation ? normalize(p.cls.label).split(' ').pop().slice(0, 5) : '';
  for (const it of items) {
    const ex = ctx.items.get(it.id);
    if (ex) { if (!ex.title && it.title) ex.title = it.title; continue; }
    const { name, alt } = chooseName(it.label, it.title);
    if (badLabel(name, p.cls.label)) continue;
    let fame = it.sl;
    // people: rank by fame *as this occupation* — "George W. Bush, painter" shouldn't be Kindling
    if (p.occupation) {
      const d = (it.d || '').toLowerCase();
      if (!(d.includes(stem) || /polymath/.test(d))) fame *= 0.12;
    }
    if (!it.title) fame *= 0.6; // English speakers rarely know what English Wikipedia doesn't cover
    ctx.items.set(it.id, { id: it.id, name, alt, title: it.title, sl: it.sl, fame, grouping: isGrouping(name, p), common: !!it.common });
    fresh++;
  }
  return fresh;
}

/**
 * (Re)cut tiers over everything found so far. While only the popular pass is in, the cut is
 * gentler (those are all well-known); once the long tail arrives the usual percentiles apply.
 * Re-tiering only ever moves an answer to a MORE common tier (fair scoring mid-round).
 */
function retier(category, p, full) {
  const ctx = category._wd;
  if (!ctx) return 0;
  const all = [...ctx.items.values()].sort((a, b) => b.fame - a.fame);
  const floor = full && all.length > 80 ? 2 : 0;
  const kept = all.filter((x) => x.sl >= floor);
  const n = kept.length;
  if (!n) return 0;
  const kCount = Math.max(3, Math.min(8, Math.round(n * 0.012)));
  const tCut = Math.max(kCount + 8, Math.round(n * (full ? 0.2 : 0.45)));
  const bCut = Math.max(tCut + 10, Math.round(n * (full ? 0.62 : 0.85)));
  const sls = kept.map((x) => x.sl).sort((a, b) => b - a); // fame can be re-weighted (people), cuts stay in sitelinks
  category.wd = { ...category.wd, cut: { trailhead: sls[Math.min(n - 1, tCut)], backcountry: sls[Math.min(n - 1, bCut)], floor } };
  let added = 0;
  kept.forEach((it, rank) => {
    let tier = rank < kCount ? 'kindling' : rank < tCut ? 'trailhead' : rank < bCut ? 'backcountry' : 'deepwoods';
    if (it.grouping && tier === 'kindling') tier = 'trailhead';
    if (category.respectTiers) {
      // extending a curated list (Krillion/Campfire)? only ADD new answers — never re-tier the curated ones
      if (ctx.curated?.has(it.id)) return;
      if (!ctx.entryOf.has(it.id)) {
        const cur = [it.name, ...it.alt].map((n) => category.match(n, { typo: 'off' })?.entry).find(Boolean);
        if (cur) { ctx.entryOf.set(it.id, cur); (ctx.curated ||= new Set()).add(it.id); return; }
      }
      if (tier === 'kindling') tier = 'trailhead';
    }
    const before = category.size;
    const e = category.add([it.name, ...it.alt].join('|'), tier);
    if (e) ctx.entryOf.set(it.id, e);
    if (category.size > before) added++;
  });
  return added;
}

/** Common names for the famous members: "soccer", "pigeon", "T. rex", "Alsatian". */
async function enrichAliases(category, p, max = 700) {
  const ctx = category._wd;
  if (!ctx) return 0;
  const top = [...ctx.items.values()].sort((a, b) => b.fame - a.fame).slice(0, max).filter((it) => ctx.entryOf.has(it.id) && !it.aliased);
  if (!top.length) return 0;
  const head = answerKey(p.cls.label);
  let n = 0;
  const chunks = [];
  for (let i = 0; i < top.length; i += 220) chunks.push(top.slice(i, i + 220));
  await Promise.all(chunks.map(async (chunk) => {
    const rows = await sparql(`SELECT ?i ?a WHERE { VALUES ?i { ${chunk.map((x) => 'wd:' + x.id).join(' ')} } { ?i skos:altLabel ?a . FILTER(LANG(?a) = "en") } UNION { ?i wdt:P1843 ?a . FILTER(LANG(?a) = "en") } }`, { ms: 9000 }).catch(() => []);
    const byId = new Map();
    for (const r of rows) { const id = qid(r.i.value); (byId.get(id) || byId.set(id, []).get(id)).push(r.a.value); }
    for (const it of chunk) {
      it.aliased = true;
      const e = ctx.entryOf.get(it.id);
      for (const a of byId.get(it.id) || []) {
        const k = answerKey(a);
        if (a.length > 40 || k.length < 2 || k === head || /[,;()[\]]/.test(a) || /^[\d\s.-]+$/.test(a)) continue;
        if (category.addAlias(e, a)) n++;
      }
    }
  }));
  return n;
}

/** Taxon categories: famous common-name items that aren't taxa ("eagle", "duck", "hawk"). */
async function commonNameItems(p) {
  const head = wordList(p.cls.label).pop();
  if (!head || head.length < 3) return [];
  const rows = await sparql(`SELECT ?i ?l ?t ?sl ?d WHERE { ?i wikibase:sitelinks ?sl . FILTER(?sl >= 35) ?i schema:description ?d . FILTER(LANG(?d) = "en") FILTER(CONTAINS(LCASE(?d), "${head.replace(/[^a-z ]/g, '')}")) ?i rdfs:label ?l . FILTER(LANG(?l) = "en") ${ENWIKI} } ORDER BY DESC(?sl) LIMIT 500`, { ms: 15000 });
  return groupRows(rows).filter((it) => descFits(it.d, p.cls.label)).map((it) => ({ ...it, common: true }));
}

/** Monthly English-Wikipedia readers for up to 50 titles (one request). Map title → views/month. */
async function pageviews(titles) {
  const out = new Map();
  if (!titles.length) return out;
  const j = await getJSON(`${WP_API}?action=query&format=json&formatversion=2&prop=pageviews&pvipdays=60&redirects=1&titles=${encodeURIComponent(titles.slice(0, 50).join('|'))}`, 5000);
  const back = new Map();
  for (const x of [...(j.query?.normalized || []), ...(j.query?.redirects || [])]) back.set(x.to, back.get(x.from) || x.from);
  for (const pg of j.query?.pages || []) {
    if (!pg.pageviews) continue;
    const vals = Object.values(pg.pageviews).filter((v) => Number.isFinite(v));
    if (!vals.length) continue;
    const perMonth = (vals.reduce((a, b) => a + b, 0) / vals.length) * 30;
    out.set(back.get(pg.title) || pg.title, perMonth);
  }
  return out;
}

/** A fun-fact note for the Golden Antler: Wikipedia's first sentence (+ how few people read it). */
async function describe(id, title, perMonth) {
  let first = '';
  try {
    let t = title;
    if (!t) {
      const j = await getJSON(`${API}?action=wbgetentities&format=json&props=sitelinks&sitefilter=enwiki&ids=${id}`, 3000);
      t = j.entities?.[id]?.sitelinks?.enwiki?.title;
    }
    if (t) {
      const s = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, '_'))}`, 3000);
      first = (s.extract || '').split(/(?<=[.!?])\s+(?=[A-Z])/)[0] || '';
    }
  } catch { /* fall through */ }
  const readers = Number.isFinite(perMonth) ? (perMonth < 1 ? 'Hardly anyone reads its Wikipedia page.' : `Only ~${Math.max(1, Math.round(perMonth))} people a month read its Wikipedia page.`) : 'So niche that hardly any encyclopedia covers it.';
  if (!first) return readers;
  if (first.length > 196 - readers.length) first = first.slice(0, 194 - readers.length).replace(/\s+\S*$/, '') + '…';
  return `${first} ${readers}`;
}

/**
 * Golden Antler: the NICHEST member that's still verifiable — it must have an English Wikipedia
 * article; fewest Wikipedia editions wins, ties go to the fewest monthly readers.
 */
async function chooseGolden(category, p) {
  const ctx = category._wd;
  if (!ctx || ctx.items.size < 8) return false;
  const floor = ctx.items.size > 80 ? 2 : 1;
  const pool = [...ctx.items.values()].filter((it) => it.title && it.sl >= floor && !it.grouping && !it.common && ctx.entryOf.has(it.id))
    .filter((it) => { const e = ctx.entryOf.get(it.id); return !category.isClaimed?.(e) && e.tier !== 'kindling' && e.tier !== 'trailhead'; })
    .sort((a, b) => a.sl - b.sl);
  if (!pool.length) return false;
  const lowest = pool[0].sl;
  if (lowest + 1 >= category.goldenScore) return false; // nothing nicher than the current antler
  let band = pool.filter((it) => it.sl === lowest);
  if (band.length > 50) band = band.sort(() => Math.random() - 0.5).slice(0, 50);
  const views = await pageviews(band.map((it) => it.title)).catch(() => new Map());
  let best = null, bestViews = Infinity;
  for (const it of band) {
    const v = views.get(it.title);
    if (v == null) continue;
    if (v < bestViews) { best = it; bestViews = v; }
  }
  if (!best) best = band[Math.floor(Math.random() * band.length)];
  const score = best.sl + (Number.isFinite(bestViews) ? Math.min(bestViews, 999999) / 1e6 : 0.5);
  const e = ctx.entryOf.get(best.id);
  if (!e || !(score < category.goldenScore)) return false;
  const moved = category.offerGolden(e, score);
  // the jackpot reads best under its encyclopedia name ("Arkansas Traveler", not "Traveller")
  const T = tidyTitle(best.title);
  const owner = T && category.index.get(answerKey(T));
  if (category.goldenEntry() === e && T && T !== e.name && !looksLatin(T) && T.length <= 60 && (!owner || owner === e)) {
    category.addAlias(e, T);
    e.aliases = [e.name, ...e.aliases.filter((a) => a !== T)].slice(0, 12);
    e.name = T;
  }
  if (category.goldenEntry() === e) {
    best.golden = true;
    describe(best.id, best.title, bestViews).then((d) => { if (d && category.goldenEntry() === e) e.note = cleanText(d, 200); }).catch(() => {});
  }
  return moved;
}

/**
 * Generate (or fill) a category from Wikidata.
 * Returns { category, ready, done, abort, how } like the AI generator.
 * `into` lets the AI generator / a curated list merge Wikidata answers into its own live category.
 * `goldenOwner`: whether Wikidata picks the Golden Antler (default: only for its own categories).
 */
function generate(prompt, { into = null, onProgress, minItems = 12, hint = null, goldenOwner } = {}) {
  const owner = goldenOwner ?? !into;
  const category = into || new Category({ id: 'wd-' + Date.now().toString(36), prompt, source: 'wikidata', sourceLabel: 'Wikidata trail', generated: true, complete: false, goldenScale: 'sl' });
  let aborted = false;
  const active = () => !aborted && category.active !== false;
  const t0 = Date.now();
  // popular members: the preferred reading asks both engines at once (first good answer wins, the other merges in later)
  const popular = (p, both) => {
    const min = p.ent ? 0 : p.taxon ? 25 : p.occupation ? 12 : 18;
    const q = buildQuery(p, 'popular', { min, limit: p.ent ? LIMIT : POP_LIMIT });
    const a = sparqlOn(QLEVER, q, 9000).catch(() => null);
    const b = both ? sparqlOn(WDQS, q, 9000).catch(() => null) : Promise.resolve(null);
    p.both = Promise.all([a, b]);
    const nonEmpty = (pr) => pr.then((r) => (r && r.length ? r : Promise.reject(new Error('empty'))));
    return Promise.any([nonEmpty(a), nonEmpty(b)]).catch(async () => (both || (await a) !== null ? [] : sparqlOn(WDQS, q, 9000).catch(() => []))) // empty is an answer; only an outage falls back
      .then((rows) => ({ p, items: shape(groupRows(rows), p) }));
  };
  const run = (async () => {
    const plans = hint ? await planFromHint(hint) : await plan(prompt);
    if (!plans.length) throw new Error('No Wikidata class for that category');
    // popular members for every candidate class at once; the first (in preference order) with enough wins
    const results = await Promise.all(plans.map((p, i) => popular(p, i === 0).catch(() => ({ p, items: [] }))));
    let best = results.find((r) => r.items.length >= (r.p.ent ? 5 : minItems));
    if (!best && results.length && !aborted && !results[0].p.ent) {
      // a class whose members are all obscure: go straight for the full list of the preferred reading
      const r = results[0];
      const rows = await sparql(buildQuery(r.p, 'full'), { ms: 9000 }).catch(() => []);
      r.items = shape(groupRows(rows), r.p);
      r.fullDone = true;
      if (r.items.length >= (r.p.ent ? 5 : minItems)) best = r;
    }
    if (!best || aborted) throw new Error('Wikidata found too few answers');
    const p = best.p;
    p.fullDone = !!best.fullDone || !!p.ent; // entity lists come back complete in one go
    p.popularCount = best.items.length;
    category.wd = { cls: p.cls.id, clsLabel: p.cls.label, ent: p.ent?.id || null, prop: p.prop || null, mode: p.kmode || 'instance', occupation: p.occupation, taxon: !!p.taxon };
    if (!category.sourceLabel || category.source === 'wikidata') category.sourceLabel = `Wikidata · ${p.cls.label}${p.ent ? ' · ' + p.ent.label : ''}`;
    category.catWords = new Set([...(category.catWords || []), ...wordList(p.cls.label)]);
    ingest(category, best.items, p);
    retier(category, p, p.fullDone);
    category.searchLog = [`popular ${best.items.length} in ${Date.now() - t0}ms`];
    onProgress?.(category);
    return p;
  })();
  const ready = run.then(() => category);
  const done = run.then(async (p) => {
    const step = async (label, fn) => {
      if (!active()) return;
      const t = Date.now();
      try { const n = await fn(); category.searchLog?.push(`${label} +${n ?? 0} in ${Date.now() - t}ms`); if (n && active()) onProgress?.(category); } catch (err) { category.searchLog?.push(`${label} failed: ${err.message}`); }
    };
    await Promise.all([
      // the engines' data differs slightly (QLever can miss a claim — e.g. Picasso's occupation): merge the official service's famous members
      step('second engine', async () => {
        const min = p.ent ? 0 : p.taxon ? 25 : p.occupation ? 12 : 18;
        const [a, b] = p.both ? await p.both : [null, null];
        const rows = [...(a || []), ...(b || (await sparqlOn(WDQS, buildQuery(p, 'popular', { min, limit: p.ent ? LIMIT : POP_LIMIT }), 20000)))];
        const n = ingest(category, shape(groupRows(rows), p), p);
        if (!n) return 0;
        const added = retier(category, p, p.fullDone);
        await enrichAliases(category, p).catch(() => 0);
        return added;
      }),
      // common names for the famous ones, so "soccer", "pigeon" and "T. rex" all count
      step('aliases', () => enrichAliases(category, p)),
      // taxon categories: "eagle", "duck", "hawk" are common names, not taxa
      p.taxon ? step('common names', async () => { const items = await commonNameItems(p); ingest(category, items, p); return retier(category, p, p.fullDone); }) : null,
      // the long tail: thousands of Backcountry / Deep Woods answers
      !p.fullDone ? step('long tail', async () => {
        const rows = await sparql(buildQuery(p, 'full'), { ms: 15000 });
        p.lastPageFull = rows.length >= LIMIT * 0.9;
        ingest(category, shape(groupRows(rows), p), p);
        p.fullDone = true;
        return retier(category, p, true);
      }) : null,
    ]);
    if (owner) await step('golden', async () => ((await chooseGolden(category, p)) ? 1 : 0));
    // …and further down the fame ladder for huge classes, while campers are still on this trail
    for (let page = 1; page <= 2 && p.lastPageFull && active(); page++) {
      await step(`page ${page}`, async () => {
        const rows = await sparql(buildQuery(p, 'full', { offset: LIMIT * page }), { ms: 15000 });
        p.lastPageFull = rows.length >= LIMIT * 0.9;
        ingest(category, shape(groupRows(rows), p), p);
        const n = retier(category, p, true);
        if (owner) await chooseGolden(category, p);
        return n;
      });
    }
    if (owner) category.complete = true;
    return category;
  });
  ready.catch(() => {});
  done.catch(() => {});
  return { category, ready, done, abort: () => { aborted = true; }, how: 'wikidata' };
}

// ---------------------------------------------------------------- live judge
const judgeCache = new Map();

/** Fame lookup for one item (for tiering a judged answer). */
async function sitelinksOf(id) {
  const rows = await sparqlCheck(`SELECT ?sl WHERE { wd:${id} wikibase:sitelinks ?sl }`, 2500);
  return rows.length ? +(rows[0].sl.value || 0) : null;
}

const tierFor = (sl, cut) => {
  const c = cut || { trailhead: 30, backcountry: 8 };
  return !Number.isFinite(sl) ? 'trailhead' : sl >= c.trailhead ? 'trailhead' : sl >= c.backcountry ? 'backcountry' : 'deepwoods';
};

/**
 * Is `answer` a member of the category's Wikidata class? Results are cached per class.
 * Name search (~0.2s), then a description sense check ("eagle — large carnivorous bird")
 * raced against a bounded SPARQL membership check on both engines (~0.3–0.9s).
 */
function judge(wd, answer) {
  if (!wd?.cls) return Promise.resolve({ valid: false });
  const key = `${wd.cls}|${wd.ent || ''}|${wd.prop || ''}|${answerKey(answer)}`;
  if (judgeCache.has(key)) return judgeCache.get(key);
  const p = judgeRaw(wd, answer).catch(() => ({ valid: false }));
  judgeCache.set(key, p);
  lru(judgeCache, 6000);
  return p;
}

async function judgeRaw(wd, answer) {
  const typed = cleanText(answer, 80);
  const tk = answerKey(typed);
  if (tk.length < 2) return { valid: false };
  const clsWords = new Set(wordList(wd.clsLabel || ''));
  if (tk === answerKey(wd.clsLabel || '')) return { valid: false }; // "bird" isn't a bird
  const named = (c) => answerKey(c.matched) === tk || answerKey(c.label) === tk;
  const cands = (await search(typed, 20)).filter((c) => {
    // the found name must really be what they typed (search is prefix-fuzzy: "Ca" must not become "Cars")
    const mk = answerKey(c.matched), lk = answerKey(c.label);
    if (mk === tk || lk === tk) return true;
    const b = typoBudget(tk.length);
    if (typoDistance(tk, mk, b) <= b || typoDistance(tk, lk, b) <= b) return true;
    const words = wordList(c.label);
    if (tk.length >= 4 && words[words.length - 1] === tk) return true; // surname: "Monet" → Claude Monet
    // "cheddar" → "Cheddar cheese": the extra words are just the category's own noun
    return words.length > 1 && words[0] === tk && words.slice(1).every((x) => clsWords.has(x) || ['cheese', 'dog', 'cat', 'tree', 'plant', 'bird', 'fish'].includes(x));
  });
  if (!cands.length && !wd.ent) return { valid: false };
  const canonicalOf = (c) => {
    const l = tidyLabel(c.label || typed);
    return looksLatin(l) && c.matched && normalize(c.matched) !== normalize(c.label) ? cap(c.matched) : l;
  };
  const tasks = [];
  // 1) the description already says what it is: "eagle — large carnivorous bird"
  if (!wd.occupation && !wd.ent) {
    const fit = cands.find((c) => named(c) && descFits(c.description, wd.clsLabel)) || cands.find((c) => descFits(c.description, wd.clsLabel));
    if (fit) tasks.push(sitelinksOf(fit.id).then((sl) => ({ valid: true, canonical: canonicalOf(fit), names: [fit.label, fit.matched].filter(Boolean), tier: tierFor(sl, wd.cut), sl: sl ?? undefined, how: 'description' })));
  }
  // 2) class membership on the knowledge graph
  const classes = [wd.cls, ...(CLASS_EXTRA[wd.cls] || [])];
  const member = wd.occupation
    ? `?i wdt:P31 wd:${HUMAN} . ?i wdt:P106/wdt:P279* wd:${wd.cls} .`
    : wd.taxon ? `?i wdt:P171+ wd:${wd.cls} . #GEAR#` + (TAXON_EXCLUDE[wd.cls] || []).map((x) => ` MINUS { ?i wdt:P171+ wd:${x} . #GEAR# }`).join('')
    : wd.ent ? `{ ?i (wdt:P31|wdt:P279)/wdt:P279* ?c . FILTER(${classes.map((c) => '?c = wd:' + c).join(' || ')}) } UNION { ${classNamed(wd.clsLabel || '')} }`
    : `?i (wdt:P31|wdt:P279)/wdt:P279* ?c . FILTER(${classes.map((c) => '?c = wd:' + c).join(' || ')})`;
  const ent = wd.ent ? (wd.prop ? `?i wdt:${wd.prop} wd:${wd.ent} .` : `?i ?p wd:${wd.ent} .`) : '';
  if (cands.length) {
    tasks.push(sparqlCheck(`SELECT ?i ?sl WHERE { VALUES ?i { ${cands.map((c) => 'wd:' + c.id).join(' ')} } ${member} ${ent} ?i wikibase:sitelinks ?sl . } LIMIT 10`, 3500).then((rows) => {
      const hit = cands.find((c) => rows.some((r) => qid(r.i.value) === c.id));
      if (!hit) throw new Error('not a member');
      const sl = +(rows.find((r) => qid(r.i.value) === hit.id).sl.value || 0);
      return { valid: true, canonical: canonicalOf(hit), names: [hit.label, hit.matched].filter(Boolean), tier: tierFor(sl, wd.cut), sl, how: 'membership' };
    }));
  }
  // 3) entity categories: look the exact name up *within* the entity's works (bounded, fast)
  if (wd.ent) {
    tasks.push(sparqlCheck(`SELECT ?i ?sl ?l WHERE { VALUES ?l { ${labelVariants(typed).map(lit).join(' ')} } ?i rdfs:label ?l . ${ent} ${member} ?i wikibase:sitelinks ?sl . } LIMIT 5`, 3500).then((rows) => {
      if (!rows.length) throw new Error('not found');
      const sl = +(rows[0].sl?.value || 0);
      return { valid: true, canonical: tidyLabel(rows[0].l?.value || typed), tier: tierFor(sl, wd.cut), sl, how: 'entity' };
    }));
  }
  if (!tasks.length) return { valid: false };
  return Promise.any(tasks).catch(() => ({ valid: false }));
}

/** Raw SPARQL rows (both engines, QLever first) — for the hunt's one-off lookups. */
const sparqlRows = (query, ms = 9000) => sparql(query, { ms });

module.exports = { generate, judge, plan, corePhrase, descFits, headWords, looksLatin, chooseName, pageviews, sparqlRows };
