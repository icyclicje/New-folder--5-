'use strict';
// Tiny JSON-file profile store (ratings, wins, cosmetics). Point DATA_DIR at a
// Railway volume to keep it across deploys.
const fs = require('fs');
const path = require('path');
const { randId, cleanText } = require('./util');
const { LIMITS, rankFor } = require('./config');
const { sanitizeEquip, unlockedIds } = require('./cosmetics');

const CRITTER_NAMES = ['Mossy', 'Pinecone', 'Birchwood', 'Fernando', 'Acorn', 'Juniper', 'Cedar', 'Thistle', 'Bramble', 'Hazel', 'Willow', 'Sprout', 'Maple', 'Aspen', 'Clover', 'Sage'];

class ProfileStore {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'profiles.json');
    this.byToken = new Map();
    this.byId = new Map();
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const p of raw) { this.byToken.set(p.token, p); this.byId.set(p.id, p); }
    } catch { /* fresh */ }
    this._dirty = false;
    setInterval(() => this.flush(), 5000).unref();
  }

  flush() {
    if (!this._dirty) return;
    this._dirty = false;
    const tmp = this.file + '.tmp';
    fs.writeFile(tmp, JSON.stringify([...this.byToken.values()]), (err) => {
      if (!err) fs.rename(tmp, this.file, () => {});
    });
  }

  flushSync() {
    try { fs.writeFileSync(this.file, JSON.stringify([...this.byToken.values()])); this._dirty = false; } catch { /* best effort */ }
  }

  save() { this._dirty = true; }

  get(token) { return token ? this.byToken.get(token) || null : null; }

  getOrCreate(token, name) {
    let p = this.get(token);
    if (!p) {
      p = {
        id: randId(6), token: randId(16),
        name: cleanText(name, LIMITS.nameMax) || `${CRITTER_NAMES[Math.floor(Math.random() * CRITTER_NAMES.length)]}${Math.floor(Math.random() * 90 + 10)}`,
        rating: 1000, peakRating: 1000, games: 0, wins: 0, rankedGames: 0, rankedWins: 0,
        goldens: 0, answers: 0, bestScore: 0, createdAt: Date.now(),
        equipped: { mascot: ['fox', 'raccoon', 'beaver', 'bunny'][Math.floor(Math.random() * 4)], hat: 'none', banner: 'pine' },
      };
      this.byToken.set(p.token, p);
      this.byId.set(p.id, p);
      this.save();
    }
    return p;
  }

  update(token, { name, equipped }) {
    const p = this.get(token);
    if (!p) return null;
    if (name != null) { const n = cleanText(name, LIMITS.nameMax); if (n) p.name = n; }
    if (equipped) p.equipped = sanitizeEquip(equipped, p);
    this.save();
    return p;
  }

  publicView(p) {
    if (!p) return null;
    const r = rankFor(p.rating);
    return {
      id: p.id, name: p.name, rating: Math.round(p.rating), peakRating: Math.round(p.peakRating || p.rating),
      rank: r.name, rankIcon: r.icon, games: p.games, wins: p.wins, rankedGames: p.rankedGames,
      rankedWins: p.rankedWins, goldens: p.goldens, answers: p.answers, bestScore: p.bestScore,
      equipped: p.equipped, unlocked: [...unlockedIds(p)],
    };
  }

  leaderboard(limit = 25) {
    return [...this.byId.values()]
      .filter((p) => p.rankedGames > 0)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit)
      .map((p) => ({ id: p.id, name: p.name, rating: Math.round(p.rating), rank: rankFor(p.rating).name, rankIcon: rankFor(p.rating).icon, wins: p.wins, rankedGames: p.rankedGames, equipped: p.equipped }));
  }
}

/** Multiplayer Elo by placement: every pair is a mini-match. */
function ratingChanges(results) {
  // results: [{profile, placement}] placement 1 = winner
  const n = results.length;
  const deltas = new Map();
  if (n < 2) return deltas;
  for (const a of results) {
    const k = a.profile.rankedGames < 10 ? 48 : 28;
    let sum = 0;
    for (const b of results) {
      if (a === b) continue;
      const expected = 1 / (1 + Math.pow(10, (b.profile.rating - a.profile.rating) / 400));
      const score = a.placement < b.placement ? 1 : a.placement > b.placement ? 0 : 0.5;
      sum += score - expected;
    }
    deltas.set(a.profile.id, Math.round((k * sum) / (n - 1)));
  }
  return deltas;
}

module.exports = { ProfileStore, ratingChanges, CRITTER_NAMES };
