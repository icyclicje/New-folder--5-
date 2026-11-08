'use strict';
/**
 * Krillion question bank.
 * Crawls every daily Krillion prompt (from Dive #1 onward) published at
 * wordanswer.today/krillion-answers, maps its rarity tiers onto the five
 * Mivimoose tiers, and caches each day on disk (gzipped) so the server only
 * ever downloads a day once. Full answer lists are loaded lazily per day.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { KRILLION_TIER_MAP } = require('./config');
const { Category } = require('./answers');
const { decodeEntities, stripTags, answerKey, shuffle, cleanText } = require('./util');

const BASE = (process.env.KRILLION_BASE || 'https://wordanswer.today').replace(/\/$/, '');
const FIRST_DAY = process.env.KRILLION_FIRST_DAY || '2026-07-16'; // Dive #1
const UA = 'MivimooseParty/1.0 (campfire party game; caches each day once)';
const TIER_RANK = { kindling: 0, trailhead: 1, backcountry: 2, deepwoods: 3, golden: 4 };
// Older dailies had a sixth "Too Clever" trap tier (15 pts) — fold it into Kindling.
const TIER_MAP = { ...KRILLION_TIER_MAP, tooclever: 'kindling' };

function dayRange(from, to) {
  const out = [];
  const d = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Parse one day page into question definitions. */
function parseDayHtml(html, date) {
  const questions = [];
  const parts = html.split(/id="krillion-prompt-(\d+)"/);
  // parts: [pre, num, chunk, num, chunk, ...]
  for (let i = 1; i < parts.length; i += 2) {
    const n = parseInt(parts[i], 10);
    const chunk = parts[i + 1] || '';
    const h3 = chunk.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    if (!h3) continue;
    const prompt = cleanText(decodeEntities(stripTags(h3[1].replace(/<svg[\s\S]*?<\/svg>/g, ''))), 160).replace(/\s*\.$/, '');
    if (!prompt) continue;
    const byKey = new Map();
    let golden = null;
    const tierParts = chunk.split('<details data-tier="').slice(1);
    for (const tp of tierParts) {
      const slug = tp.slice(0, tp.indexOf('"'));
      const tier = TIER_MAP[slug];
      if (!tier) continue;
      const body = tp.slice(0, tp.indexOf('</details>') > 0 ? tp.indexOf('</details>') : undefined);
      const liRe = /<li data-answer="true"[^>]*>([\s\S]*?)<\/li>/g;
      let m;
      while ((m = liRe.exec(body))) {
        const t = m[1].match(/data-answer-text="true">([\s\S]*?)<\/span>/);
        if (!t) continue;
        const text = cleanText(decodeEntities(stripTags(t[1])), 100);
        const k = answerKey(text);
        if (!k) continue;
        const ex = byKey.get(k);
        if (ex) {
          if (tier === 'golden' || (ex.tier !== 'golden' && TIER_RANK[tier] < TIER_RANK[ex.tier])) ex.tier = tier;
          continue;
        }
        const entry = { text, tier };
        if (tier === 'golden') {
          const q = m[1].match(/data-quip="true">([\s\S]*?)<\/span>/);
          if (q) entry.note = cleanText(decodeEntities(stripTags(q[1])).replace(/^[—–-]\s*/, ''), 200);
        }
        byKey.set(k, entry);
      }
    }
    const tiers = { kindling: [], trailhead: [], backcountry: [], deepwoods: [] };
    for (const e of byKey.values()) {
      if (e.tier === 'golden') {
        if (!golden) golden = { answer: e.text, note: e.note || '' };
        else tiers.deepwoods.push(e.text);
      } else tiers[e.tier].push(e.text);
    }
    const total = byKey.size;
    if (total < 3) continue;
    questions.push({ n, prompt, golden, tiers });
  }
  return questions;
}

class KrillionBank {
  constructor(dataDir, log = console) {
    this.dir = path.join(dataDir, 'krillion');
    this.log = log;
    this.index = new Map(); // date -> [{id, n, prompt, total}]
    this.dayCache = new Map(); // date -> questions (LRU)
    this.crawling = false;
    this.lastCrawl = 0;
    this.status = { days: 0, prompts: 0, crawling: false, lastError: null, latest: null };
    fs.mkdirSync(this.dir, { recursive: true });
    this._loadIndex();
  }

  _indexFile() { return path.join(this.dir, 'index.json'); }

  _loadIndex() {
    try {
      const raw = JSON.parse(fs.readFileSync(this._indexFile(), 'utf8'));
      for (const [date, qs] of Object.entries(raw.days || {})) {
        if (fs.existsSync(this._dayFile(date))) this.index.set(date, qs);
      }
    } catch { /* first run */ }
    this._refreshStatus();
  }

  _saveIndex() {
    const days = Object.fromEntries([...this.index.entries()].sort());
    fs.writeFileSync(this._indexFile(), JSON.stringify({ updatedAt: Date.now(), days }));
  }

  _dayFile(date) { return path.join(this.dir, date + '.json.gz'); }

  _refreshStatus() {
    let prompts = 0;
    for (const qs of this.index.values()) prompts += qs.length;
    const dates = [...this.index.keys()].sort();
    Object.assign(this.status, { days: this.index.size, prompts, latest: dates[dates.length - 1] || null, crawling: this.crawling });
  }

  get ready() { return this.status.prompts > 0; }

  async _fetch(url) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(45000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  }

  /** Download any days we don't have yet (newest first). Safe to call repeatedly. */
  async crawl({ maxDays = parseInt(process.env.KRILLION_MAX_DAYS || '0', 10) } = {}) {
    if (this.crawling) return;
    this.crawling = true;
    this._refreshStatus();
    try {
      // find the latest published day from the hub
      const hub = await this._fetch(`${BASE}/krillion-answers`);
      const dates = hub ? [...hub.matchAll(/href="\/krillion-answers\/(\d{4}-\d{2}-\d{2})[/"]/g)].map((m) => m[1]) : [];
      const today = new Date().toISOString().slice(0, 10);
      const latest = dates.sort().pop() || today;
      let want = dayRange(FIRST_DAY, latest).reverse();
      if (maxDays > 0) want = want.slice(0, maxDays);
      const missing = want.filter((d) => !this.index.has(d));
      if (missing.length) this.log.info?.(`[krillion] ${missing.length} day(s) to fetch (have ${this.index.size})`);
      for (const date of missing) {
        try {
          const html = await this._fetch(`${BASE}/krillion-answers/${date}`);
          if (!html) continue;
          const qs = parseDayHtml(html, date);
          if (!qs.length) continue;
          fs.writeFileSync(this._dayFile(date), zlib.gzipSync(JSON.stringify(qs)));
          this.index.set(date, qs.map((q) => ({
            id: `k-${date}-${q.n}`, n: q.n, prompt: q.prompt,
            total: (q.golden ? 1 : 0) + q.tiers.kindling.length + q.tiers.trailhead.length + q.tiers.backcountry.length + q.tiers.deepwoods.length,
          })));
          this._saveIndex();
          this._refreshStatus();
        } catch (err) {
          this.status.lastError = String(err.message || err);
          this.log.warn?.(`[krillion] ${date}: ${this.status.lastError}`);
        }
        await new Promise((r) => setTimeout(r, 350)); // be polite
      }
      this.lastCrawl = Date.now();
      this.log.info?.(`[krillion] bank ready: ${this.status.prompts} prompts across ${this.status.days} days`);
    } catch (err) {
      this.status.lastError = String(err.message || err);
      this.log.warn?.(`[krillion] crawl failed: ${this.status.lastError}`);
    } finally {
      this.crawling = false;
      this._refreshStatus();
    }
  }

  /** Re-crawl periodically to pick up each new daily. */
  startAutoRefresh(hours = 3) {
    this.crawl();
    setInterval(() => this.crawl(), hours * 3600 * 1000).unref();
  }

  _loadDay(date) {
    if (this.dayCache.has(date)) {
      const v = this.dayCache.get(date);
      this.dayCache.delete(date); this.dayCache.set(date, v);
      return v;
    }
    const qs = JSON.parse(zlib.gunzipSync(fs.readFileSync(this._dayFile(date))).toString('utf8'));
    this.dayCache.set(date, qs);
    while (this.dayCache.size > 12) this.dayCache.delete(this.dayCache.keys().next().value);
    return qs;
  }

  /** All prompt summaries (for pickers / search). */
  list() {
    const out = [];
    for (const [date, qs] of this.index) for (const q of qs) out.push({ id: q.id, date, prompt: q.prompt, total: q.total });
    return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id.localeCompare(b.id)));
  }

  has(id) { return !!this._summary(id); }

  _summary(id) {
    const m = /^k-(\d{4}-\d{2}-\d{2})-(\d+)$/.exec(id || '');
    if (!m) return null;
    return (this.index.get(m[1]) || []).find((q) => q.n === +m[2]) || null;
  }

  /** Raw definition for a prompt id. */
  getDef(id) {
    const m = /^k-(\d{4}-\d{2}-\d{2})-(\d+)$/.exec(id || '');
    if (!m || !this.index.has(m[1])) return null;
    const q = this._loadDay(m[1]).find((x) => x.n === +m[2]);
    if (!q) return null;
    return { id, prompt: q.prompt, source: 'krillion', sourceLabel: `Krillion · ${m[1]}`, golden: q.golden, tiers: q.tiers };
  }

  getCategory(id) {
    const def = this.getDef(id);
    return def ? new Category(def) : null;
  }

  /** Random prompt ids not in `exclude`, preferring prompts with enough answers. */
  randomIds(count, exclude = new Set(), minTotal = 25) {
    const all = [];
    for (const qs of this.index.values()) for (const q of qs) if (!exclude.has(q.id)) all.push(q);
    let pool = all.filter((q) => q.total >= minTotal);
    if (pool.length < count) pool = all;
    return shuffle(pool).slice(0, count).map((q) => q.id);
  }
}

module.exports = { KrillionBank, parseDayHtml };
