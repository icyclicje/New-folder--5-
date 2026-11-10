// Mivimoose Party — "the hunt": deep search for categories Wikidata can't list by class alone.
//
// Free sources, raced and merged into one live category:
//   1. Wikidata class members (wikidata.js)               — precise, ranked by fame
//   2. Wikipedia categories (+ relevant subcategories)    — precise
//   3. Wikipedia "List of …" pages                        — broad, checked against each page's description
//   4. deep search: re-phrasings ("breed of goat" → "goat breed", plurals, synonyms),
//      the topic article's own "List of …" links, and description-checked full-text search
//   5. approximation: when a question is too broad to list ("something red", "something at the beach"),
//      a best-guess trail built from the question's key concept (word associations + the concept's article)
// Fame comes from real Wikipedia readership (30-day pageviews), so tiers track what people actually know.
// Unlisted answers on a hunted trail are checked live too (category membership, description, or — for
// approximate trails — how strongly the answer is tied to the question's concept).

const { Category } = require('./answers');
const { cleanText, answerKey, normalize, wordList, decodeEntities } = require('./util');
const wikidata = require('./wikidata');

const CONTACT = (process.env.MIVI_CONTACT || '').trim();
const UA = `MivimooseParty/1.2 (campfire party game; question generator${CONTACT ? '; ' + CONTACT : ''})`;
const WP = 'https://en.wikipedia.org/w/api.php';
const WD_API = 'https://www.wikidata.org/w/api.php';
const DM = 'https://api.datamuse.com/words';

const READY_AT = 12; // playable as soon as this many answers are in
const SMALL_OK = 4; // a small but verified category is still a category
const STOP = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'by', 'from', 'with', 'that', 'is', 'are', 'you', 'your', 'can', 'find', 'found', 'some', 'any', 'one', 'name', 'thing', 'something', 'someone', 'famous', 'popular', 'type', 'kind', 'sort', 'which', 'who', 'what', 'be', 'it', 'its', 'their', 'there', 'would', 'might', 'often', 'usually', 'commonly']);
// everyday nouns too vague to be an answer on their own
const GENERIC = new Set(['thing', 'things', 'way', 'time', 'people', 'person', 'part', 'place', 'area', 'use', 'type', 'kind', 'lot', 'number', 'word', 'name', 'year', 'day', 'side', 'end', 'line', 'field', 'range', 'front', 'back', 'top', 'bottom', 'point', 'case', 'fact', 'group', 'state', 'level', 'form', 'world', 'life', 'house', 'home', 'water', 'make', 'get', 'are', 'she', 'he', 'one', 'set', 'run', 'lead', 'act', 'term', 'sense', 'deal', 'figure', 'rate', 'unit', 'item', 'object', 'stuff', 'material', 'example', 'ingredient', 'ingredients', 'recipe', 'variety', 'version', 'style']);
const SYN = { movie: 'film', movies: 'films', show: 'television series', 'tv show': 'television series', cartoon: 'animated series', car: 'automobile', song: 'song', book: 'novel', singer: 'singer', band: 'band' };

// ---------------------------------------------------------------- polite HTTP
// Wikimedia asks anonymous clients not to hammer the API: two requests at a time, spaced out,
// and everyone backs off together when it says 429.
const MAX_ACTIVE = 1, GAP_MS = 110; // serial, as Wikimedia asks of anonymous clients
let active = 0, lastStart = 0, coolUntil = 0;
const waiting = [];
function pump() {
  if (!waiting.length) return;
  // cooling down after a 429: everything queued fails at once (sources move on instead of stalling)
  if (rateLimited()) { for (const t of waiting.splice(0)) t.reject(new Error('Wikipedia is rate-limiting — skipped')); return; }
  if (active >= MAX_ACTIVE) return;
  const wait = Math.max(lastStart + GAP_MS - Date.now(), 0);
  if (wait > 0) { setTimeout(pump, wait); return; }
  lastStart = Date.now();
  active++;
  const { fn, resolve, reject } = waiting.shift();
  fn().then(resolve, reject).finally(() => { active--; pump(); });
  pump();
}
function slot(fn, priority = false) {
  return new Promise((resolve, reject) => { (priority ? waiting.unshift.bind(waiting) : waiting.push.bind(waiting))({ fn, resolve, reject }); pump(); });
}
const httpCache = new Map();
function lru(m, n) { while (m.size > n) m.delete(m.keys().next().value); }
/** Is Wikipedia telling us to back off? Then every source skips it instantly (the hunt never stalls on retries). */
const rateLimited = () => Date.now() < coolUntil;
function get(url, ms = 7000, priority = false) {
  if (httpCache.has(url)) return httpCache.get(url);
  if (rateLimited()) return Promise.reject(new Error('Wikipedia is rate-limiting — skipped'));
  const p = slot(async () => {
    if (rateLimited()) throw new Error('Wikipedia is rate-limiting — skipped');
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA }, signal: AbortSignal.timeout(ms) });
    if (res.status === 429) {
      const secs = Math.min(300, Math.max(30, parseFloat(res.headers.get('retry-after')) || 60));
      coolUntil = Math.max(coolUntil, Date.now() + secs * 1000);
      throw new Error('HTTP 429 (Wikipedia rate limit)');
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, priority);
  httpCache.set(url, p);
  lru(httpCache, 900);
  p.catch(() => httpCache.delete(url));
  return p;
}
const wp = (params, ms, priority) => get(`${WP}?format=json&formatversion=2&${new URLSearchParams(params)}`, ms, priority);
// Datamuse is a separate service with generous limits — it doesn't wait in Wikipedia's queue
const dmCache = new Map();
function dm(params) {
  const url = `${DM}?${params}`;
  if (!dmCache.has(url)) {
    const p = fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    dmCache.set(url, p);
    lru(dmCache, 600);
  }
  return dmCache.get(url);
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- phrase helpers
const content = (s) => wordList(s).filter((w) => !STOP.has(w));
const stem = (w) => w.slice(0, Math.max(4, Math.min(6, w.length - 1)));
function pluralWord(w) {
  if (/(s|x|z|ch|sh)$/.test(w)) return w + 'es';
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';
  if (w === 'person') return 'people';
  if (w === 'man') return 'men';
  if (w === 'woman') return 'women';
  if (w === 'child') return 'children';
  return w + 's';
}
const pluralPhrase = (p) => { const w = p.split(' '); w[w.length - 1] = pluralWord(w[w.length - 1]); return w.join(' '); };
/** Strip Wikipedia's disambiguating parentheses: "Mercury (planet)" → "Mercury". */
function cleanTitle(t) { return cleanText(String(t).replace(/\s*\([^)]*\)\s*$/, ''), 80); }
const BAD_TITLE = /^(lists? of|outline of|index of|glossary of|timeline of|history of|template:|portal:|wikipedia:|help:|category:|file:|image:)/i;
const BAD_DESC = /disambiguation|topics referred to by the same term|wikimedia list article|list article/i;

/** The question's phrase readings, most specific first. */
function readings(prompt) {
  const core = wikidata.corePhrase(prompt).toLowerCase();
  const out = [core];
  const of = /^(.+?)\s+of\s+(.+)$/.exec(core);
  if (of) out.push(`${of[2]} ${of[1]}`);
  for (const [a, b] of Object.entries(SYN)) if (new RegExp(`\\b${a}\\b`).test(core)) out.push(core.replace(new RegExp(`\\b${a}\\b`), b));
  return [...new Set(out.filter((x) => x && x.split(' ').length <= 7))];
}

/** Does a page description fit the class phrase? ("Breed of goat" fits "goat breed"; a city doesn't fit "cheese".) */
function descFitsCore(desc, core) {
  const want = content(core);
  if (!desc || !want.length) return false;
  const d = wordList(desc);
  const ds = new Set(d.map(stem));
  const head = want[want.length - 1];
  return ds.has(stem(head)) || (want.length > 1 && want.every((w) => ds.has(stem(w))));
}

// ---------------------------------------------------------------- Wikipedia sources
async function searchTitles(q, ns = 0, limit = 8) {
  const j = await wp({ action: 'query', list: 'search', srsearch: q, srnamespace: ns, srlimit: limit, srprop: '' }).catch(() => null);
  return (j?.query?.search || []).map((r) => r.title);
}

/** Titles, descriptions and monthly readers for up to ~800 pages (batched 50 at a time). */
async function pageInfo(titles) {
  const out = new Map();
  const list = [...new Set(titles)].slice(0, 250);
  const batches = [];
  for (let i = 0; i < list.length; i += 50) batches.push(list.slice(i, i + 50));
  await Promise.all(batches.map(async (b) => {
    const j = await wp({ action: 'query', prop: 'description|pageviews', pvipdays: 30, redirects: 1, titles: b.join('|') }, 9000).catch(() => null);
    if (!j) return;
    const back = new Map();
    for (const x of [...(j.query?.normalized || []), ...(j.query?.redirects || [])]) back.set(x.to, back.get(x.from) || x.from);
    for (const pg of j.query?.pages || []) {
      if (pg.missing || pg.invalid) continue;
      const vals = Object.values(pg.pageviews || {}).filter((v) => Number.isFinite(v));
      const info = { title: pg.title, desc: pg.description || '', views: vals.length ? (vals.reduce((a, c) => a + c, 0) / vals.length) * 30 : 0 };
      out.set(pg.title, info);
      const from = back.get(pg.title);
      if (from) out.set(from, info);
    }
  }));
  return out;
}

/** Category members, following subcategories whose names still fit the class (depth 2, bounded). */
async function categoryPages(catTitle, core, budget = 1500) {
  const want = content(core);
  const fitsCat = (t) => { const w = new Set(wordList(t.replace(/^category:/i, '')).map(stem)); return want.every((x) => w.has(stem(x))); };
  const pages = [], seenCats = new Set([catTitle]);
  let frontier = [catTitle];
  for (let depth = 0; depth < 3 && frontier.length && pages.length < budget; depth++) {
    if (depth > 0 && pages.length >= 120) break; // plenty already: skip the per-country / per-type subcategories
    const next = [];
    await Promise.all(frontier.slice(0, depth ? 8 : 1).map(async (cat) => {
      let cont = null, rounds = 0;
      do {
        const j = await wp({ action: 'query', list: 'categorymembers', cmtitle: cat, cmtype: 'page|subcat', cmlimit: 500, ...(cont ? { cmcontinue: cont } : {}) }, 9000).catch(() => null);
        if (!j) break;
        for (const m of j.query?.categorymembers || []) {
          if (m.ns === 14) { if (!seenCats.has(m.title) && fitsCat(m.title)) { seenCats.add(m.title); next.push(m.title); } } else if (m.ns === 0 && !BAD_TITLE.test(m.title)) pages.push(m.title);
        }
        cont = j.continue?.cmcontinue;
      } while (cont && ++rounds < 3 && pages.length < budget);
    }));
    frontier = next;
  }
  return { pages: [...new Set(pages)].slice(0, budget), cats: seenCats };
}

/** First link of every bullet / table row of a "List of …" page. */
function parseListWikitext(text) {
  let t = String(text || '').replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  t = t.split(/\n==+\s*(?:See also|References|Notes|Footnotes|External links|Further reading|Bibliography|Sources|Citations)\s*==+/i)[0];
  const linkRe = /\[\[([^[\]|#]+)(?:#[^[\]|]*)?(?:\|([^[\]]+))?\]\]/g;
  const items = [], seen = new Set();
  const take = (chunk) => {
    for (const m of chunk.matchAll(linkRe)) {
      const target = m[1].trim();
      if (/^(file|image|category|wikipedia|wp|help|template|portal|wikt|s|commons):/i.test(target) || BAD_TITLE.test(target)) continue;
      const k = target.toLowerCase();
      if (!seen.has(k)) { seen.add(k); items.push({ title: target, label: m[2] ? cleanText(m[2].replace(/'''?/g, ''), 80) : null }); }
      return;
    }
  };
  for (const line of t.split('\n')) if (/^[*#]+/.test(line)) take(line.replace(/\{\{[^{}]*\}\}/g, ''));
  for (const row of t.split(/\n\|-/).slice(1)) take(row.split('\n|}')[0]);
  return items.slice(0, 1500);
}

async function listPagesFor(core) {
  const want = content(core);
  const titles = await searchTitles(`intitle:list ${pluralPhrase(core)}`, 0, 10);
  const ok = titles.filter((t) => /^lists? of /i.test(t) && want.every((w) => wordList(t).map(stem).includes(stem(w))));
  // prefer the general list over a regional one ("List of goat breeds" before "List of Iberian goat breeds")
  return ok.sort((a, b) => a.length - b.length).slice(0, 2);
}

async function listItems(title) {
  const j = await wp({ action: 'parse', page: title, prop: 'wikitext', redirects: 1 }, 10000).catch(() => null);
  return parseListWikitext(j?.parse?.wikitext);
}

/** Merge Wikipedia finds into the live category and re-cut tiers by readership. */
function ingestWiki(category, items, src) {
  const ctx = category._wp || (category._wp = { items: new Map(), cats: new Set(), lists: new Set() });
  let fresh = 0;
  for (const it of items) {
    const name = cleanTitle(it.title);
    const k = answerKey(name);
    if (!k || k.length < 2 || ctx.items.has(k)) continue;
    const alt = [it.title !== name ? cleanText(it.title, 80) : null, it.label && answerKey(it.label) !== k ? it.label : null].filter(Boolean);
    ctx.items.set(k, { name, alt, views: it.views || 0, desc: it.desc || '', src, title: it.title });
    fresh++;
  }
  if (fresh) category.sources?.add('wikipedia');
  return fresh;
}

function retierWiki(category) {
  const ctx = category._wp;
  if (!ctx) return 0;
  const all = [...ctx.items.values()].sort((a, b) => b.views - a.views);
  const n = all.length;
  if (!n) return 0;
  const k = Math.max(3, Math.min(8, Math.round(n * 0.03)));
  const t = Math.max(k + 6, Math.round(n * 0.3));
  const b = Math.max(t + 8, Math.round(n * 0.7));
  ctx.cut = { trailhead: all[Math.min(n - 1, t)].views, backcountry: all[Math.min(n - 1, b)].views };
  let added = 0;
  all.forEach((it, i) => {
    const tier = i < k ? 'kindling' : i < t ? 'trailhead' : i < b ? 'backcountry' : 'deepwoods';
    const before = category.size;
    category.add([it.name, ...it.alt].join('|'), tier);
    if (category.size > before) added++;
  });
  return added;
}

/** Wikipedia categories + lists for one phrase. Returns how many answers were added. */
async function wikiHunt(category, core, tried) {
  const want = content(core);
  if (!want.length) return 0;
  const ctx = category._wp || (category._wp = { items: new Map(), cats: new Set(), lists: new Set() });
  const plural = pluralPhrase(core);
  const [catHits, lists] = await Promise.all([searchTitles(plural, 14, 6), listPagesFor(core)]);
  const cat = catHits.find((t) => { const w = new Set(wordList(t.replace(/^category:/i, '')).map(stem)); return want.every((x) => w.has(stem(x))) && w.size <= want.length + 2; });
  let added = 0;
  const jobs = [];
  if (cat && !tried.has(cat)) {
    tried.add(cat);
    jobs.push((async () => {
      const { pages, cats } = await categoryPages(cat, core);
      for (const c of cats) ctx.cats.add(c);
      if (!pages.length) return;
      const info = await pageInfo(pages);
      const items = pages.map((p) => info.get(p) || { title: p, views: 0, desc: '' }).filter((i) => !BAD_DESC.test(i.desc) && answerKey(cleanTitle(i.title)) !== answerKey(core));
      ingestWiki(category, items, 'category');
      added += retierWiki(category);
      category.hunt.cats = ctx.cats;
      category.hunt.wpLabel ||= cat.replace(/^Category:/, '');
    })().catch(() => {}));
  }
  await jobs[0];
  for (const lt of (category._wp?.items.size || 0) >= 150 ? [] : lists) {
    if (tried.has(lt)) continue;
    tried.add(lt);
    jobs.push((async () => {
      const raw = await listItems(lt);
      if (raw.length < 4) return;
      const info = await pageInfo(raw.map((r) => r.title));
      let items = raw.map((r) => ({ ...r, ...(info.get(r.title) || { views: 0, desc: '' }), title: info.get(r.title)?.title || r.title, label: r.label }));
      items = items.filter((i) => !BAD_DESC.test(i.desc));
      // lists link plenty of non-members (countries, people, sources): keep the ones whose description fits,
      // unless the list's descriptions just use other words (then the list itself is the authority)
      const fit = items.filter((i) => descFitsCore(i.desc, core));
      if (fit.length >= Math.max(8, items.length * 0.3)) items = fit;
      ingestWiki(category, items, 'list');
      ctx.lists.add(lt);
      added += retierWiki(category);
      category.hunt.wpLabel ||= lt;
    })().catch(() => {}));
  }
  await Promise.all(jobs);
  return added;
}

/** Deep search: the topic article's own "List of …" links, then description-checked full-text search. */
async function deepWiki(category, core, tried) {
  const want = content(core);
  const head = want[want.length - 1];
  if (!head) return 0;
  let added = 0;
  const topic = (await searchTitles(want.join(' '), 0, 3))[0];
  if (topic) {
    const j = await wp({ action: 'query', prop: 'links', titles: topic, plnamespace: 0, pllimit: 'max', redirects: 1 }).catch(() => null);
    const lists = (j?.query?.pages?.[0]?.links || []).map((l) => l.title).filter((t) => /^lists? of /i.test(t) && wordList(t).map(stem).includes(stem(head)) && !tried.has(t)).slice(0, 2);
    for (const lt of lists) {
      tried.add(lt);
      const raw = await listItems(lt).catch(() => []);
      if (raw.length < 4) continue;
      const info = await pageInfo(raw.map((r) => r.title));
      let items = raw.map((r) => ({ ...r, ...(info.get(r.title) || { views: 0, desc: '' }) })).filter((i) => !BAD_DESC.test(i.desc));
      const fit = items.filter((i) => descFitsCore(i.desc, core));
      if (fit.length >= Math.max(8, items.length * 0.3)) items = fit;
      ingestWiki(category, items, 'list');
      category._wp.lists.add(lt);
      added += retierWiki(category);
      category.hunt.wpLabel ||= lt;
    }
  }
  // full-text search, keeping only pages whose own description says they belong
  const hits = await searchTitles(`"${core}"`, 0, 50);
  if (hits.length) {
    const info = await pageInfo(hits);
    const items = hits.map((h) => info.get(h)).filter((i) => i && descFitsCore(i.desc, core) && !BAD_DESC.test(i.desc) && answerKey(cleanTitle(i.title)) !== answerKey(core));
    if (items.length) { ingestWiki(category, items, 'search'); added += retierWiki(category); }
  }
  return added;
}

// ---------------------------------------------------------------- approximation (too broad to list)
/** What is the question really about? → { concept, kind: 'link' | 'place' | 'adj' | 'kinds' | 'topic' } */
function conceptOf(prompt) {
  const p = cleanText(prompt, 160).replace(/[“”]/g, '"');
  let m = /linked to "(.+?)"/i.exec(p);
  if (m) return { concept: m[1], kind: 'link' };
  const core = wikidata.corePhrase(p).toLowerCase();
  m = /\b(?:at|in|on|inside|near|around|from)\s+(?:the|a|an|your|my|any)?\s*([a-z][a-z' -]{2,40})$/i.exec(core);
  if (m && /^(something|things?|stuff|items?|objects?|anything)\b|\b(find|found|see|seen|use|used|bring|pack|keep|kept)\b/.test(core)) return { concept: m[1].trim(), kind: 'place' };
  m = /\b(?:associated with|related to|linked to|connected to|to do with|about)\s+(?:the|a|an)?\s*(.{3,40})$/i.exec(core);
  if (m) return { concept: m[1].trim(), kind: 'topic' };
  m = /^(?:something|things?|an? (?:object|item|thing)|anything)\s+(?:that(?:'s| is| are)?\s+|which is\s+)?([a-z]+)$/i.exec(core);
  if (m) return { concept: m[1], kind: 'adj' };
  const words = content(core);
  if (words.length === 1) return { concept: words[0], kind: 'kinds' };
  return { concept: words.slice(-2).join(' ') || core, kind: 'topic' };
}

async function approxHunt(category, prompt) {
  const { concept, kind } = conceptOf(prompt);
  // a two-word class name ("pizza topping", "goat breed"): what means the same, plus what the modifier brings to mind
  const classLike = kind === 'topic' && !/\b(associated with|related to|linked to|connected to|to do with|about)\b/i.test(prompt) && concept.split(' ').length > 1;
  const mod = classLike ? normalize(concept).split(' ').slice(0, -1).join(' ') : null;
  const c = normalize(concept);
  if (!c) return 0;
  const head = c.split(' ').pop();
  const H = encodeURIComponent(head), Q = encodeURIComponent(c);
  // [source, weight, compound?] — compounds ("beach towel") come from words that follow the concept
  const plan = kind === 'adj' ? [[`rel_jja=${H}&max=300&md=fp`, 1.3]]
    : kind === 'place' ? [[`rel_trg=${H}&max=250&md=fp`, 1], [`ml=things+at+the+${H}&max=150&md=fp`, 0.6]]
      : kind === 'kinds' ? [[`rel_gen=${H}&max=300&md=fp`, 1.3], [`rel_trg=${H}&max=120&md=fp`, 0.7]]
        : kind === 'link' ? [[`rel_trg=${Q}&max=250&md=fp`, 1], [`ml=${Q}&max=150&md=fp`, 0.7]]
          : classLike ? [[`ml=${Q}&max=120&md=fp`, 1.2], [`rel_trg=${encodeURIComponent(mod)}&max=150&md=fp`, 0.4]]
            : [[`rel_trg=${H}&max=250&md=fp`, 1], [`ml=${Q}&max=150&md=fp`, 0.8]];
  const results = await Promise.all(plan.map(([q]) => dm(q)));
  // the concept's own article: what Wikipedia itself connects to it
  const topicJ = await wp({ action: 'query', list: 'search', srsearch: concept, srlimit: 1, srprop: '' }, 6000, true).catch(() => null);
  const topic = topicJ?.query?.search?.[0]?.title;
  const linksJ = topic ? await wp({ action: 'query', prop: 'links', titles: topic, plnamespace: 0, pllimit: 'max', redirects: 1 }, 7000, true).catch(() => null) : null;
  const linked = new Set((linksJ?.query?.pages?.[0]?.links || []).map((l) => answerKey(cleanTitle(l.title))));
  const banned = new Set(wordList(c).concat(content(prompt)).map(answerKey));
  const freqOf = (w) => { const fq = (w.tags || []).find((t) => t.startsWith('f:')); return fq ? parseFloat(fq.slice(2)) : 0; };
  const cap = (w) => w.replace(/^\w/, (ch) => ch.toUpperCase());
  const pool = new Map();
  results.forEach((list, si) => {
    const [, weight, compound] = plan[si];
    list.forEach((w, rank) => {
      const tags = w.tags || [];
      const pos = tags.filter((t) => !t.startsWith('f:'));
      const isNoun = pos.includes('n') || pos.includes('N') || (kind === 'link' && pos.includes('prop'));
      if (!isNoun || (kind !== 'link' && pos.includes('prop'))) return; // things, not verbs, adjectives or place names
      let word = String(w.word).toLowerCase();
      if (classLike) {
        if (word.startsWith(mod + ' ')) return; // "pizza parlor" is about pizza, not a topping
        if (word.endsWith(' ' + mod)) word = word.slice(0, -(mod.length + 1)); // "pepperoni pizza" → pepperoni
        if (si === 0 && rank >= 45) return; // only the strongest "means like" matches
      }
      const k = answerKey(word);
      const f = freqOf(w);
      if (!k || k.length < 3 || GENERIC.has(word) || f > 300 || banned.has(k) || [...banned].some((b) => b.length > 3 && (k.includes(b) || k.startsWith(stem(b))))) return; // "pizzeria" restates "pizza"
      const name = compound ? `${cap(head)} ${word}` : cap(word);
      const key = answerKey(name);
      const ambiguous = pos.length > 2 || (pos[0] && !/^n$/i.test(pos[0])); // "light" (n/adj/v/adv), "color"
      const score = ((1 - rank / Math.max(1, list.length)) * weight + (linked.has(k) ? 0.9 : 0)) * (ambiguous ? 0.55 : 1);
      const cur = pool.get(key);
      if (cur) { cur.score += score * 0.6; cur.hits++; } else pool.set(key, { name, alias: compound ? cap(word) : null, score, f, hits: 1 });
    });
  });
  const picked = [...pool.values()].filter((x) => x.score > 0.3 || x.hits > 1).sort((a, b) => b.score - a.score).slice(0, 140);
  if (picked.length < 8) return 0;
  // easy answers = strongly linked AND everyday; rare-but-linked ones are the deep cuts
  picked.sort((a, b) => b.score * Math.log10(10 + b.f) - a.score * Math.log10(10 + a.f));
  const n = picked.length;
  const k = Math.max(4, Math.round(n * 0.05)), t = Math.round(n * 0.35), b = Math.round(n * 0.75);
  picked.forEach((x, i) => category.add(x.name, i < k ? 'kindling' : i < t ? 'trailhead' : i < b ? 'backcountry' : 'deepwoods'));
  const strongest = [...picked].sort((a, b2) => b2.score - a.score);
  category.hunt.approxOnly = !category.wd && !category._wp?.items.size;
  category.hunt.approx = { concept: c, kind, mod, assoc: strongest.slice(0, 60).map((x) => answerKey(x.alias || x.name)), words: new Set(picked.map((x) => answerKey(x.name))) };
  category.sources?.add('approx');
  return n;
}

// ---------------------------------------------------------------- live web (channels, videos)
const WEBBY = /\b(youtube|youtuber|tiktok|tiktoker|twitch|streamer|podcast|instagram|influencer|subreddit|reddit|meme|viral|trending|newest|latest|recent(ly)?|this year|last year|20[2-3]\d|channel|vlog|episode of|video (?:from|by|on|of))\b/i;
/** Does this question need live web data (videos, channels, recent releases)? */
function needsWeb(prompt) { return WEBBY.test(String(prompt)); }

/** Free fallback for creator/channel questions: their famous videos and works on Wikidata. */
async function creatorWorks(category, prompt) {
  const m = /\b(?:from|by|on|of)\s+(?:the\s+)?(.+?)(?:'s)?(?:\s+(?:youtube\s+)?(?:channel|account|page))?\s*$/i.exec(wikidata.corePhrase(prompt));
  if (!m) return 0;
  const who = cleanText(m[1], 60);
  const s = await get(`${WD_API}?action=wbsearchentities&format=json&language=en&type=item&limit=3&search=${encodeURIComponent(who)}`).catch(() => null);
  const ent = s?.search?.[0]?.id;
  if (!ent) return 0;
  const rows = await wikidata.sparqlRows(`SELECT ?i ?l ?sl WHERE { { ?i wdt:P170 wd:${ent} } UNION { ?i wdt:P175 wd:${ent} } UNION { ?i wdt:P123 wd:${ent} } UNION { ?i wdt:P50 wd:${ent} } UNION { ?i wdt:P162 wd:${ent} }
    { ?i wdt:P1651 ?yt } UNION { ?i wdt:P31 wd:Q193977 }
    ?i rdfs:label ?l FILTER(LANG(?l) = "en") ?i wikibase:sitelinks ?sl } LIMIT 400`, 9000).catch(() => []);
  const seen = new Set();
  const items = rows.map((r) => ({ name: cleanText(r.l?.value || '', 80), sl: +(r.sl?.value || 0) })).filter((x) => x.name && !seen.has(answerKey(x.name)) && seen.add(answerKey(x.name)));
  if (!items.length) return 0;
  items.sort((a, b) => b.sl - a.sl);
  const n = items.length, k = Math.max(2, Math.round(n * 0.05)), t = Math.round(n * 0.35), b = Math.round(n * 0.75);
  items.forEach((x, i) => category.add(x.name, i < k ? 'kindling' : i < t ? 'trailhead' : i < b ? 'backcountry' : 'deepwoods'));
  category.hunt.creator = who;
  category.sources?.add('wikidata');
  return n;
}

// ---------------------------------------------------------------- the hunt
function labelOf(category) {
  const h = category.hunt || {};
  const parts = [];
  if (category.wd) parts.push(`Wikidata · ${category.wd.clsLabel}`);
  if (category._wp?.items.size) parts.push(category.wd ? 'Wikipedia' : `Wikipedia · ${h.wpLabel || 'lists'}`);
  if (h.creator && !parts.length) parts.push(`Wikidata · works by ${h.creator}`);
  if (h.approx && !category.wd && !category._wp?.items.size) parts.push(`Ranger's best guess · around “${h.approx.concept}”`);
  return parts.join(' + ') || 'Ranger scouting';
}

/**
 * Hunt down a category without an AI key. Returns { category, ready, done, abort, how }.
 *  - ready: resolves (with this category, or a stand-in from `fallbacks`) as soon as it is playable
 *  - done:  resolves when every source has reported in (the category keeps growing during play)
 * `fallbacks`: async functions tried in order if nothing at all can be found, e.g. a known trail.
 */
function huntCategory(prompt, { onProgress, beforeApprox = null, fallbacks = [] } = {}) {
  const category = new Category({ id: 'hunt-' + Date.now().toString(36), prompt, source: 'hunt', sourceLabel: '', generated: true, complete: false, goldenScale: 'sl' });
  category.sources = new Set();
  category.hunt = { core: wikidata.corePhrase(prompt), cats: new Set() };
  const t0 = Date.now();
  const log = (s) => (category.searchLog ||= []).push(`${s} @${Date.now() - t0}ms`);
  let aborted = false;
  const alive = () => !aborted && category.active !== false;
  let isReady = false, readyResolve, readyReject;
  const ready = new Promise((res, rej) => { readyResolve = res; readyReject = rej; });
  const markReady = (c = category) => { if (isReady) return; isReady = true; if (c === category) category.sourceLabel = labelOf(category); readyResolve(c); };
  const progress = () => {
    category.sourceLabel = labelOf(category);
    if (!isReady && category.size >= READY_AT) markReady();
    onProgress?.(category);
  };
  const job = { category, ready, abort: () => { aborted = true; wd?.abort(); }, how: 'hunt' };
  const linked = /linked to "(.+)"/i.test(prompt);
  const tried = new Set();
  const settled = (p, label) => p.then((n) => { if (n) { log(`${label} +${n}`); progress(); } return n; }, (e) => { log(`${label} failed: ${e.message}`); return 0; });

  // 1) precise sources, all at once
  let wd = null;
  const stage1 = [];
  // broad questions ("something red", "something at the beach", "linked to …") have no class or list to find
  const { kind } = conceptOf(prompt);
  const broad = linked || kind === 'place' || kind === 'adj' || /\b(associated with|related to|linked to|connected to|to do with)\b/i.test(prompt);
  const webby = needsWeb(prompt);
  if (!broad) {
    wd = wikidata.generate(prompt, { into: category, goldenOwner: true, onProgress: () => { category.sources.add('wikidata'); progress(); } });
    stage1.push(wd.ready.then(() => { log('wikidata ready'); progress(); return 1; }, (e) => { log(`wikidata: ${e.message}`); return 0; }));
    for (const r of readings(prompt)) stage1.push(settled(wikiHunt(category, r, tried), `wikipedia "${r}"`));
    if (needsWeb(prompt)) stage1.push(settled(creatorWorks(category, prompt), 'creator works'));
  }
  const stage1Done = Promise.all(stage1);

  // 2) deep search when the quick pass comes up thin
  let deepP = null;
  const deep = () => deepP || (deepP = (async () => {
    if (!alive() || linked) return 0;
    log('deep search');
    let n = 0;
    for (const r of readings(prompt)) n += await settled(deepWiki(category, r, tried), `deep "${r}"`);
    return n;
  })());

  // 3) approximate from the question when it's too broad to list
  let approxP = null;
  const approx = () => approxP || (approxP = (async () => {
    if (!alive() || category.size >= READY_AT) return 0;
    log('approximating');
    return settled(approxHunt(category, prompt), 'approximate');
  })());

  if (broad && !webby) approx(); // nothing to list precisely: start the best guess at once (precise sources still merge in)
  const precise = () => Promise.all([stage1Done, deepP].filter(Boolean));

  (async () => {
    // a curated trail that covers the question word for word beats any search
    const early = beforeApprox && (await Promise.resolve().then(beforeApprox).catch(() => null));
    if (early && early.size >= SMALL_OK && broad) { job.how = 'known'; wd?.abort(); markReady(early); return; }
    // quick pass: up to ~3.5s, then dig deeper in parallel
    await Promise.race([stage1Done, delay(3500)]);
    if (isReady || !alive()) return;
    if (!broad) deep();
    await Promise.race([Promise.all([precise(), approxP].filter(Boolean)), delay(broad ? 5000 : 8000)]);
    if (isReady || !alive()) return;
    if (category.size >= SMALL_OK) { markReady(); return; } // small but real ("Name a planet")
    if (early && early.size >= SMALL_OK) { job.how = 'known'; wd?.abort(); markReady(early); return; }
    if (!webby) { approx(); await Promise.race([approxP, delay(5000)]); }
    if (isReady || !alive()) return;
    if (category.size >= SMALL_OK) { markReady(); return; }
    await Promise.race([Promise.all([precise(), approxP].filter(Boolean)), delay(4000)]);
    if (isReady || !alive()) return;
    if (category.size >= SMALL_OK) { markReady(); return; }
    // nothing playable: stand-ins (association board, closest known trail…) — but a live-web question
    // (a channel's videos) has no honest stand-in without web search, so it says what it needs instead
    for (const fb of webby ? [] : fallbacks) {
      const c = await Promise.resolve().then(fb).catch(() => null);
      if (c && c.size >= SMALL_OK) { job.how = c.huntHow || 'known'; wd?.abort(); markReady(c); return; }
    }
    if (!isReady) readyReject(new Error(webby ? `“${prompt}” needs a live web search (set ANTHROPIC_API_KEY)` : `The ranger searched everywhere but couldn't map “${prompt}”`));
  })().catch((e) => { if (!isReady) readyReject(e); });

  const done = ready.then(async (c) => {
    if (c !== category) return c;
    await Promise.allSettled([stage1Done, wd?.done, deepP, approxP].filter(Boolean));
    // keep digging during play if the quick pass was thin
    if (alive() && category.size < 60 && !linked) { await deep(); }
    if (alive() && category.size < 30 && !webby) await approx();
    // a Golden Antler from Wikipedia readership if Wikidata didn't place one
    if (alive() && !category.goldenEntry() && category._wp?.items.size) await wikiGolden(category).catch(() => {});
    category.sourceLabel = labelOf(category);
    category.complete = true;
    onProgress?.(category);
    return category;
  });
  // Wikidata finishing first must not mark the trail complete while other sources are still digging
  let finished = false;
  done.then(() => { finished = true; }, () => { finished = true; });
  wd?.done.then(() => { if (!finished) category.complete = false; }).catch(() => {});
  ready.catch(() => {});
  done.catch(() => {});
  job.done = done;
  return job;
}

/** The nichest Wikipedia-listed answer becomes the Golden Antler, with a real fact. */
async function wikiGolden(category) {
  const ctx = category._wp;
  const pool = [...ctx.items.values()].filter((x) => x.views > 0 && (!x.desc || descFitsCore(x.desc, category.hunt.core) || ctx.lists.size === 0)).sort((a, b) => a.views - b.views);
  for (const it of pool.slice(0, 6)) {
    const e = category.match(it.name, { typo: 'off' })?.entry;
    if (!e || e.tier === 'kindling' || e.tier === 'trailhead') continue;
    const j = await wp({ action: 'query', prop: 'extracts', exintro: 1, explaintext: 1, exsentences: 1, redirects: 1, titles: it.title }).catch(() => null);
    const fact = cleanText(j?.query?.pages?.[0]?.extract || it.desc || '', 160);
    const note = `${fact}${fact ? ' ' : ''}Only ~${Math.max(1, Math.round(it.views)).toLocaleString('en-US')} people a month read its Wikipedia page.`;
    category.goldenScale = 'views';
    if (category.offerGolden(e, it.views, note)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- live judge for hunted trails
const judgeCache = new Map();
/**
 * Is an unlisted answer valid on a hunted trail? Finds its Wikipedia page, then accepts it if
 * the page sits in one of the trail's Wikipedia categories, its description fits the class, or —
 * on an approximate trail — it is strongly tied to the question's concept.
 */
function judge(category, answer) {
  const h = category?.hunt;
  if (!h) return Promise.resolve({ valid: false });
  const key = `${category.id}|${answerKey(answer)}`;
  if (judgeCache.has(key)) return judgeCache.get(key);
  const p = judgeRaw(category, h, answer).catch(() => ({ valid: false }));
  judgeCache.set(key, p);
  lru(judgeCache, 4000);
  return p;
}

async function judgeRaw(category, h, answer) {
  const a = cleanText(answer, 60);
  const ak = answerKey(a);
  if (!ak) return { valid: false };
  const titles = await searchTitles(a, 0, 4);
  const title = titles.find((t) => answerKey(cleanTitle(t)) === ak) || titles.find((t) => answerKey(t).startsWith(ak) || ak.startsWith(answerKey(cleanTitle(t)))) || null;
  let info = null;
  if (title) {
    const j = await wp({ action: 'query', prop: 'description|pageviews|categories|extracts', pvipdays: 30, cllimit: 'max', clshow: '!hidden', exintro: 1, explaintext: 1, exsentences: 2, redirects: 1, titles: title }).catch(() => null);
    const pg = j?.query?.pages?.[0];
    if (pg && !pg.missing) {
      const vals = Object.values(pg.pageviews || {}).filter((v) => Number.isFinite(v));
      info = { title: pg.title, desc: pg.description || '', extract: pg.extract || '', cats: (pg.categories || []).map((c) => c.title), views: vals.length ? (vals.reduce((x, y) => x + y, 0) / vals.length) * 30 : 0 };
    }
  }
  const tierBy = (views) => { const c = category._wp?.cut; return !c ? 'backcountry' : views >= c.trailhead ? 'trailhead' : views >= c.backcountry ? 'backcountry' : 'deepwoods'; };
  if (info && !BAD_DESC.test(info.desc)) {
    const verdict = (how) => ({ valid: true, canonical: cleanTitle(info.title), names: [cleanTitle(info.title), a], tier: tierBy(info.views), how });
    if (h.cats?.size && info.cats.some((c) => h.cats.has(c))) return verdict('wikipedia category');
    if (h.core && !h.approx && descFitsCore(info.desc, h.core)) return verdict('wikipedia description');
    if (h.approx) {
      const text = wordList(`${info.desc} ${info.extract}`).map(stem);
      const want = [h.approx.concept, ...h.approx.assoc.slice(0, 25)].flatMap((w) => wordList(w)).filter((w) => w.length > 3).map(stem);
      const hits = new Set(want.filter((w) => text.includes(w)));
      if (hits.has(stem(h.approx.concept.split(' ').pop())) || hits.size >= 2) return { ...verdict('approximate: page mentions the concept'), tier: 'backcountry' };
    }
  }
  // approximate trails: does the answer's own web of associations point back at the question's concept?
  // (a seashell's associations include "beach"; the words used to describe a strawberry include "red")
  if (h.approx) {
    const concept = normalize(h.approx.concept);
    const head = concept.split(' ').pop();
    const n = normalize(a);
    const forms = [...new Set([n, n.replace(/ /g, '')])].map(encodeURIComponent); // "fire truck" / "firetruck"
    let ok = false;
    if (h.approx.kind === 'adj') {
      // the adjective must be one of the first words people use to describe it (strawberry → wild, ripe, RED)
      const lists = await Promise.all(forms.map((x) => dm(`rel_jjb=${x}&max=10`)));
      ok = lists.some((l) => l.some((w) => answerKey(w.word) === answerKey(head)));
    } else {
      const lists = await Promise.all(forms.flatMap((x) => [dm(`rel_trg=${x}&max=60`), dm(`ml=${x}&max=40`)]));
      const near = new Set(lists.flat().map((w) => answerKey(w.word)));
      const assocHits = h.approx.assoc.slice(0, 25).filter((w) => near.has(w)).length;
      ok = near.has(answerKey(head)) || near.has(answerKey(concept)) || (h.approx.mod && near.has(answerKey(h.approx.mod))) || assocHits >= 2;
    }
    if (ok) {
      return { valid: true, canonical: info ? cleanTitle(info.title) : a.replace(/^w/, (c) => c.toUpperCase()), names: [a], tier: 'backcountry', how: 'approximate: tied to the question' };
    }
  }
  return { valid: false };
}

/** Wikipedia hunt into an existing (AI-generated) category when Wikidata can't list it. Returns answers added. */
async function wikiInto(category, prompt, onProgress) {
  category.hunt ||= { core: wikidata.corePhrase(prompt), cats: new Set() };
  category.sources ||= new Set();
  const tried = new Set();
  let n = 0;
  for (const r of readings(prompt)) n += await wikiHunt(category, r, tried).catch(() => 0);
  if (category.size < 60) for (const r of readings(prompt)) n += await deepWiki(category, r, tried).catch(() => 0);
  if (n) onProgress?.(category);
  return n;
}

module.exports = { huntCategory, wikiInto, judge, needsWeb, conceptOf, readings, parseListWikitext, descFitsCore };
