'use strict';
/**
 * A campsite: lobby, chat, settings and the authoritative game engine.
 *
 * Game stages: intro → turn ⇄ judging → intermission → (picking|generating)? → turn … → over
 */
const { MODES, GIMMICKS, SOURCES, DEFAULT_SETTINGS, SETTING_RANGES, LIMITS, TIER_BY_KEY, TIERS, rankFor } = require('./config');
const { clamp, cleanText, randId, shuffle, pick, answerKey } = require('./util');
const { ratingChanges } = require('./profiles');
const { unlockedIds, CATALOG } = require('./cosmetics');
const { makeBot, botTakeTurn, LEVELS } = require('./bots');

const INTRO_MS = 3200;
const POP_PAUSE_MS = 3000;
const GEN_TIMEOUT_MS = 25000;
const RESULTS_MS = 15000;
const QUICK_START_MS = 20000;
const QUICK_FULL_START_MS = 5000;

/** Race a promise against a timeout without leaving a dangling rejected promise. */
function withTimeout(promise, ms, message) {
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(message)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

function normalizeSettings(input, prev = DEFAULT_SETTINGS) {
  const s = { ...prev };
  const i = input || {};
  if (MODES[i.mode]) {
    if (i.mode !== prev.mode) {
      // adopt the mode's defaults unless explicitly overridden in the same update
      const m = MODES[i.mode];
      s.lives = m.lives; s.fuseSec = m.fuseSec; s.extraLives = m.extraLives;
    }
    s.mode = i.mode;
  }
  if (GIMMICKS[i.gimmick]) s.gimmick = i.gimmick;
  if (SOURCES[i.source]) s.source = i.source;
  if (i.specialEvery != null) s.specialEvery = clamp(i.specialEvery | 0, 2, 6);
  if (i.maxPlayers != null) s.maxPlayers = clamp(i.maxPlayers | 0, LIMITS.minPlayers, LIMITS.maxPlayers);
  if (i.lives != null) s.lives = clamp(i.lives | 0, 1, 5);
  if (i.fuseSec != null) s.fuseSec = clamp(Number(i.fuseSec) || 12, 5, 40);
  if (i.extraLives != null) s.extraLives = !!i.extraLives;
  if (i.extraLifeGoal != null) s.extraLifeGoal = clamp(i.extraLifeGoal | 0, 150, 1500);
  if (i.typoTolerance != null) s.typoTolerance = i.typoTolerance === true ? 'strong' : i.typoTolerance === false ? 'off' : ['off', 'gentle', 'strong'].includes(i.typoTolerance) ? i.typoTolerance : s.typoTolerance;
  if (i.aiJudge != null) s.aiJudge = !!i.aiJudge;
  if (i.isPublic != null) s.isPublic = !!i.isPublic;
  if (i.duelTrail != null) s.duelTrail = cleanText(String(i.duelTrail), LIMITS.promptMax);
  for (const [k, [lo, hi]] of Object.entries(SETTING_RANGES)) if (i[k] != null && Number.isFinite(Number(i[k]))) s[k] = clamp(Math.round(Number(i[k])), lo, hi);
  if (['auto', 'kindling', 'trailhead', 'backcountry'].includes(i.tierFloor)) s.tierFloor = i.tierFloor;
  if (['clockwise', 'random'].includes(i.moosePath)) s.moosePath = i.moosePath;
  for (const k of ['goldenLife', 'showTyping', 'revealLeftovers', 'liveHints']) if (i[k] != null) s[k] = !!i[k];
  if (s.mode === 'lonewolf') { s.lives = 1; s.extraLives = false; }
  if (s.mode === 'duel') { s.maxPlayers = 2; s.gimmick = 'none'; s.extraLives = false; }
  return s;
}

class Room {
  constructor(hub, { code, quick = false, duel = false, settings, name }) {
    this.hub = hub;
    this.code = code;
    this.quick = quick;
    this.ranked = quick;
    this.name = cleanText(name, 32) || (quick ? 'Quick Trek' : 'Campsite ' + code);
    this.duelQuick = quick && duel;
    this.settings = normalizeSettings(quick ? { mode: duel ? 'duel' : 'classic', source: 'krillion', maxPlayers: duel ? 2 : 8, isPublic: true } : settings, DEFAULT_SETTINGS);
    if (quick && !duel) Object.assign(this.settings, { gimmick: 'none', lives: 2, fuseSec: 12, extraLives: true, extraLifeGoal: 400 });
    if (quick && duel) Object.assign(this.settings, { gimmick: 'none', lives: 1, fuseSec: 10, extraLives: false, duelTrail: '' });
    this.customPack = null; // { name, defs }
    this.players = new Map();
    this.hostId = null;
    this.phase = 'lobby';
    this.chat = [];
    this.game = null;
    this.timers = new Set();
    this.autoStartAt = null;
    this.autoStartTimer = null;
    this.createdAt = Date.now();
    this.emptySince = Date.now();
    this._stateQueued = false;
  }

  // ---------------- infrastructure ----------------
  get io() { return this.hub.io; }

  setT(fn, ms) {
    const t = setTimeout(() => { this.timers.delete(t); try { fn(); } catch (err) { console.error('[room timer]', err); } }, Math.max(0, ms));
    this.timers.add(t);
    return t;
  }
  clearT(t) { if (t) { clearTimeout(t); this.timers.delete(t); } }
  clearAllTimers() { for (const t of this.timers) clearTimeout(t); this.timers.clear(); }

  emitEv(type, data = {}) { this.io.to(this.code).emit('ev', { type, ...data, t: Date.now() }); }

  emitState() {
    if (this._stateQueued) return;
    this._stateQueued = true;
    setImmediate(() => {
      this._stateQueued = false;
      if (this.destroyed) return;
      this.io.to(this.code).emit('state', this.snapshot());
    });
  }

  sys(text, kind = 'sys') {
    const msg = { id: randId(4), kind, text: cleanText(text, 240), ts: Date.now() };
    this.chat.push(msg);
    if (this.chat.length > 80) this.chat.shift();
    this.io.to(this.code).emit('chat', msg);
  }

  // ---------------- players ----------------
  humans() { return [...this.players.values()].filter((p) => !p.isBot && !p.left); }
  connectedHumans() { return this.humans().filter((p) => p.connected); }
  activeCount() { return [...this.players.values()].filter((p) => !p.left && !p.spectator).length; }

  freeSeat() {
    const taken = new Set([...this.players.values()].filter((p) => !p.left && !p.spectator).map((p) => p.seat));
    for (let i = 0; i < LIMITS.maxPlayers; i++) if (!taken.has(i)) return i;
    return -1;
  }

  canJoin(profile) {
    const existing = this.players.get(profile.id);
    if (existing && !existing.left) return { ok: true };
    if (this.destroyed) return { ok: false, error: 'That campsite has been packed up.' };
    const active = this.activeCount();
    if (this.phase === 'lobby' && active >= this.settings.maxPlayers) return { ok: false, error: 'This campsite is full — every log is taken!' };
    if (this.players.size >= 24) return { ok: false, error: 'Too many campers here already.' };
    return { ok: true };
  }

  addHuman(profile, socket) {
    let p = this.players.get(profile.id);
    const isNew = !p || p.left;
    if (!p || p.left) {
      const spectator = this.phase !== 'lobby' || this.activeCount() >= this.settings.maxPlayers;
      p = {
        id: profile.id, isBot: false, name: profile.name, equipped: { ...profile.equipped },
        rating: Math.round(profile.rating), seat: spectator ? -1 : this.freeSeat(), spectator,
        connected: true, socketId: socket.id, joinedAt: Date.now(),
      };
      this.resetPlayerGame(p);
      this.players.set(p.id, p);
    }
    p.connected = true;
    p.socketId = socket.id;
    p.name = profile.name;
    p.equipped = { ...profile.equipped };
    p.rating = Math.round(profile.rating);
    p.disconnectedAt = null;
    socket.join(this.code);
    socket.data.roomCode = this.code;
    if (!this.hostId || !this.players.get(this.hostId) || this.players.get(this.hostId).left || this.players.get(this.hostId).isBot) this.hostId = p.id;
    if (isNew) this.sys(`${p.name} wandered into camp${p.spectator ? ' (watching from the treeline)' : ''}.`, 'join');
    socket.emit('chat:history', this.chat);
    this.emptySince = null;
    this.checkAutoStart();
    this.emitState();
    return p;
  }

  addBot(level) {
    if (this.quick) return { ok: false, error: 'No critters allowed on ranked treks.' };
    if (this.phase !== 'lobby') return { ok: false, error: 'Wait for the next game to invite critters.' };
    if (this.activeCount() >= this.settings.maxPlayers) return { ok: false, error: 'No empty logs left.' };
    const taken = new Set([...this.players.values()].map((p) => p.name));
    const b = makeBot(level, taken);
    const p = { id: 'bot-' + randId(4), isBot: true, ...b, rating: 0, seat: this.freeSeat(), spectator: false, connected: true };
    this.resetPlayerGame(p);
    this.players.set(p.id, p);
    this.sys(`${p.name} the ${LEVELS[p.botLevel].name} critter scurried up to the fire.`, 'join');
    this.emitState();
    return { ok: true };
  }

  removePlayer(pid, reason = 'left') {
    const p = this.players.get(pid);
    if (!p || p.left) return;
    const inGame = this.game && this.game.stage !== 'over' && this.game.order.includes(pid);
    if (inGame) {
      p.left = true;
      p.connected = false;
      if (p.alive) this.forfeit(p);
    } else {
      this.players.delete(pid);
    }
    if (!p.isBot) {
      const msg = reason === 'kicked' ? `${p.name} was escorted out of camp by the ranger.` : `${p.name} packed up and hiked home.`;
      this.sys(msg, 'leave');
    }
    if (this.hostId === pid) {
      const next = this.humans().find((h) => h.connected && h.id !== pid);
      this.hostId = next ? next.id : null;
      if (next) this.sys(`${next.name} is now the camp counselor (host).`);
    }
    if (!this.connectedHumans().length) this.emptySince = Date.now();
    this.checkAutoStart();
    this.emitState();
  }

  onDisconnect(pid) {
    const p = this.players.get(pid);
    if (!p) return;
    p.connected = false;
    p.disconnectedAt = Date.now();
    if (!this.connectedHumans().length) this.emptySince = Date.now();
    // grace period for refreshes / flaky connections
    this.setT(() => {
      const q = this.players.get(pid);
      if (q && !q.connected && q.disconnectedAt && Date.now() - q.disconnectedAt >= 29000) {
        if (this.phase === 'lobby' || !this.game?.order.includes(pid)) this.removePlayer(pid);
      }
    }, 30000);
    this.checkAutoStart();
    this.emitState();
  }

  resetPlayerGame(p) {
    Object.assign(p, {
      lives: 0, maxLives: 0, alive: false, score: 0, meter: 0, lastAnswer: null, wrong: [],
      placement: null, answers: 0, goldens: 0, ratingDelta: null,
    });
  }

  // ---------------- settings ----------------
  updateSettings(pid, input) {
    if (pid !== this.hostId || this.quick || this.phase !== 'lobby') return;
    const prevMax = this.settings.maxPlayers;
    if (input?.mode === 'duel' && this.activeCount() > 2) {
      this.sys('⚔️ Duels are 1v1 — send extra campers (or critters) home first.');
      return;
    }
    this.settings = normalizeSettings(input, this.settings);
    if (this.settings.maxPlayers < this.activeCount()) this.settings.maxPlayers = Math.max(prevMax > this.activeCount() ? this.activeCount() : prevMax, this.activeCount());
    this.emitState();
  }

  setCustomPack(pid, pack) {
    if (pid !== this.hostId || this.quick) return { ok: false, error: 'Only the camp counselor can hand out field guides.' };
    if (this.phase !== 'lobby' && this.settings.source === 'custom' && !this.game) return { ok: false };
    const resolved = this.hub.questions.resolveCustomPack(pack);
    if (!resolved) return { ok: false, error: 'That field guide has no usable categories.' };
    this.customPack = resolved;
    if (this.phase === 'playing' && this.game) this.game.customDefs = resolved.defs; // live-growing topic banks
    this.settings.source = 'custom';
    this.emitState();
    return { ok: true, count: resolved.defs.length };
  }

  // ---------------- chat & typing ----------------
  handleChat(pid, raw) {
    const p = this.players.get(pid);
    if (!p) return;
    const text = cleanText(raw, LIMITS.chatMax);
    if (!text) return;
    const now = Date.now();
    p.chatTimes = (p.chatTimes || []).filter((t) => now - t < 6000);
    if (p.chatTimes.length >= 5) return;
    p.chatTimes.push(now);
    const msg = { id: randId(4), kind: 'chat', pid, name: p.name, banner: p.equipped?.banner, text, ts: now };
    this.chat.push(msg);
    if (this.chat.length > 80) this.chat.shift();
    this.io.to(this.code).emit('chat', msg);
  }

  relayTyping(pid, raw) {
    const g = this.game;
    if (!g) return;
    const text = cleanText(String(raw ?? ''), LIMITS.answerMax);
    if ((g.stage === 'turn' || g.stage === 'judging') && g.turn?.pid === pid) {
      g.turn.typed = text;
      if (this.settings.showTyping) this.io.to(this.code).emit('typing', { pid, text });
      else this.io.to(this.code).emit('typing', { pid, text: text ? '•'.repeat(Math.min(14, text.length)) : '' });
      this.sendHint(pid, text);
      this.prejudge(text);
    } else if (g.stage === 'picking' && g.special?.leaderId === pid) {
      this.io.to(this.code).emit('typing', { pid, text, carving: true });
      this.speculateLeader(text);
    }
  }

  // ---------------- auto start (quick play) ----------------
  checkAutoStart() {
    if (!this.quick || this.phase !== 'lobby') return;
    const n = this.connectedHumans().filter((p) => !p.spectator).length;
    if (n < 2) {
      if (this.autoStartTimer) { this.clearT(this.autoStartTimer); this.autoStartTimer = null; this.autoStartAt = null; this.emitState(); }
      return;
    }
    const wantAt = Date.now() + (n >= this.settings.maxPlayers ? QUICK_FULL_START_MS : QUICK_START_MS);
    if (!this.autoStartAt || wantAt < this.autoStartAt) {
      this.clearT(this.autoStartTimer);
      this.autoStartAt = wantAt;
      this.autoStartTimer = this.setT(() => { this.autoStartTimer = null; this.autoStartAt = null; this.startGame(null, true); }, wantAt - Date.now());
      this.emitState();
    }
  }

  // ---------------- game: start ----------------
  startGame(pid, auto = false) {
    if (this.phase !== 'lobby') return { ok: false, error: 'A game is already burning.' };
    if (!auto && pid !== this.hostId) return { ok: false, error: 'Only the camp counselor can light the fire.' };
    if (this.settings.source === 'custom' && !this.customPack) return { ok: false, error: 'Pick a field guide (custom pack) first, or switch the question source.' };
    // drop disconnected humans before seating
    for (const p of [...this.players.values()]) if (!p.isBot && !p.connected) this.players.delete(p.id);
    const participants = [...this.players.values()].filter((p) => !p.spectator && !p.left).sort((a, b) => a.seat - b.seat).slice(0, this.settings.maxPlayers);
    if (participants.length < 2) return { ok: false, error: 'You need at least 2 campers around the fire (add a critter bot to practice).' };
    const hasBots = participants.some((p) => p.isBot);
    const s = this.settings;
    const mode = MODES[s.mode];
    const maxLives = s.extraLives && mode.extraLives !== false ? s.lives + 1 : s.lives;
    for (const p of this.players.values()) {
      this.resetPlayerGame(p);
      if (participants.includes(p)) Object.assign(p, { lives: s.lives, maxLives, alive: true, spectator: false });
      else p.spectator = true;
    }
    this.clearT(this.autoStartTimer);
    this.autoStartTimer = null; this.autoStartAt = null;
    this.phase = 'playing';
    this.game = {
      id: randId(4),
      order: participants.map((p) => p.id),
      ranked: this.ranked && !hasBots,
      stage: 'intro',
      round: 1,
      passes: 0,
      category: null,
      catAnswers: 0,
      usedEntries: new Set(),
      usedBy: new Map(),
      usedCats: new Set(),
      customDefs: this.customPack?.defs || null,
      log: [],
      turn: null,
      turnSeq: 0,
      roundFuseEndsAt: null,
      lastAccepted: null,
      special: null,
      echoSpec: null,
      nextHolder: null,
      startedAt: Date.now(),
      introEndsAt: Date.now() + INTRO_MS,
    };
    this.sys(`🔥 The fire is lit! ${participants.length} campers, ${mode.name}${s.gimmick !== 'none' ? ' + ' + GIMMICKS[s.gimmick].name : ''}.`, 'game');
    this.emitEv('gamestart', { introMs: INTRO_MS });
    this.emitState();
    const first = pick(participants).id;
    const g = this.game;
    if (mode.duel && s.duelTrail) {
      // a duel on one custom trail: start scouting during the intro so it's ready when the fire's lit
      g.nextHolder = first;
      const t0 = Date.now();
      const job = this.hub.questions.quickCategory(s.duelTrail, { onProgress: (c) => this.categoryProgress(c) });
      job.ready.then((cat) => {
        if (this.game !== g) return;
        this.setT(() => { if (this.game === g) { this.setCategory(cat, 'duel', { how: job.how, ms: Date.now() - t0 }); this.startTurn(first); } }, Math.max(0, g.introEndsAt - Date.now()));
      }, (err) => {
        if (this.game !== g) return;
        this.sys(`🌧️ Couldn't scout “${s.duelTrail}” (${err.message}) — dueling on a random trail instead.`);
        this.setT(() => { if (this.game === g) { this.nextCategory('start'); this.startTurn(first); } }, Math.max(0, g.introEndsAt - Date.now()));
      });
      return { ok: true };
    }
    this.setT(() => {
      if (!this.game) return;
      this.nextCategory('start');
      this.startTurn(first);
    }, INTRO_MS);
    return { ok: true };
  }

  isDuel() { return !!MODES[this.settings.mode]?.duel; }

  /** Live answer counts while a generated category keeps searching during play. */
  categoryProgress(cat) {
    const g = this.game;
    if (!g || g.category !== cat) return;
    const now = Date.now();
    if (now - (this._lastCatProgress || 0) < 700) return;
    this._lastCatProgress = now;
    this.emitState();
    if (cat.complete && this.isDuel()) this.checkDuelTie();
  }

  /** Start a ranger check while the holder is still typing, so Enter is instant. */
  prejudge(text) {
    const g = this.game;
    if (!g?.category || !this.settings.aiJudge || !this.hub.questions.canJudge(g.category)) return;
    clearTimeout(this._prejudgeT);
    if (text.length < 3) return;
    const turn = g.turn;
    this._prejudgeT = setTimeout(() => {
      if (this.game !== g || g.turn !== turn || g.stage !== 'turn') return;
      if (this.matchSafe(text)) return; // already on the list
      const limit = this.hub.ai.enabled ? 4 : 6; // Wikidata checks are free (but rate-limited); Claude checks cost a little
      turn.prejudged = (turn.prejudged || 0) + 1;
      if (turn.prejudged > limit) return;
      const cat = g.category;
      if (this.settings.liveHints && !this.hub.questions.judgedSync(cat, text)) this.emitHint(turn.pid, { text, status: 'checking' });
      this.hub.questions.judge(cat, text).then((v) => {
        if (this.game !== g || g.turn !== turn || g.category !== cat || answerKey(turn.typed || '') !== answerKey(text)) return;
        if (this.settings.liveHints) this.emitHint(turn.pid, v?.valid ? { text, status: 'verified', answer: cleanText(v.canonical || text, 80) } : { text, status: 'none' });
      }, () => {});
    }, 240);
  }

  /** Autocorrect lookup that can never take a turn down with it. */
  matchSafe(text) {
    const g = this.game;
    try { return g?.category ? g.category.match(text, { typo: this.settings.typoTolerance, used: g.usedEntries }) : null; }
    catch (err) { console.error('[match]', err); return null; }
  }

  emitHint(pid, hint) {
    const p = this.players.get(pid);
    if (!p || p.isBot || !p.connected) return;
    this.io.to(p.socketId).emit('hint', hint);
  }

  /**
   * Live autocorrect preview for the holder only: "✓ Tyrannosaurus", "already hiked by Sam",
   * "Kindling is banned". Nothing is shown for text that isn't on the map (no answer fishing).
   */
  sendHint(pid, text) {
    const g = this.game;
    if (!this.settings.liveHints || !g?.category || g.stage !== 'turn') return;
    if (answerKey(text).length < 2) return this.emitHint(pid, { text, status: 'none' });
    const m = this.matchSafe(text);
    if (!m) {
      const cached = this.hub.questions.judgedSync(g.category, text);
      if (cached?.valid) return this.emitHint(pid, { text, status: 'verified', answer: cleanText(cached.canonical || text, 80) });
      return this.emitHint(pid, { text, status: 'none' });
    }
    const e = m.entry;
    if (g.usedEntries.has(e.id)) return this.emitHint(pid, { text, status: 'taken', answer: e.name, by: this.players.get(g.usedBy.get(e.id))?.name || '' });
    if (TIER_BY_KEY[e.tier].rank < this.minTierRank()) return this.emitHint(pid, { text, status: 'banned', answer: e.name, tier: e.tier });
    this.emitHint(pid, { text, status: m.fuzzy ? 'fuzzy' : 'match', answer: e.name });
  }

  minTierKey() { const f = this.settings.tierFloor; return f && f !== 'auto' ? f : MODES[this.settings.mode].minTier || 'kindling'; }
  minTierRank() { return TIER_BY_KEY[this.minTierKey()]?.rank || 0; }

  /** Answers allowed on the current trail before the moose moves on (0 = until a poof). */
  trailLimit() {
    const g = this.game;
    if (!g?.category || this.isDuel()) return 0;
    const s = this.settings;
    const lims = [MODES[s.mode].rotateEvery, s.trailMax, (g.category.generated || g.catSpecial) ? s.genTrailMax : 0].filter((n) => n > 0);
    return lims.length ? Math.min(...lims) : 0;
  }

  /** Where the moose runs after a good answer. */
  passFrom(pid) {
    if (this.settings.moosePath === 'random') {
      const others = this.aliveIds().filter((id) => id !== pid);
      if (others.length) return pick(others);
    }
    return this.nextAlive(pid);
  }

  // ---------------- game: categories ----------------
  setCategory(cat, reason, extra = {}) {
    const g = this.game;
    if (g.category && g.category !== cat) g.category.active = false; // stop background searching on the old trail
    cat.active = true;
    cat.isClaimed = (e) => g.usedEntries.has(e.id);
    cat.onGoldenMove = () => {
      if (this.game !== g || g.category !== cat) return;
      const now = Date.now();
      if (now - (g.lastGoldenNews || 0) < 12000 || !['turn', 'judging'].includes(g.stage)) return;
      g.lastGoldenNews = now;
      this.emitEv('goldenmoved', {});
      this.sys('🦌 The ranger found something even nichier — the Golden Antler wandered deeper into the woods…', 'game');
    };
    g.category = cat;
    g.catAnswers = 0;
    g.catSpecial = ['leader', 'echo'].includes(reason);
    g.usedEntries = new Set();
    g.usedBy = new Map();
    g.log = [];
    g.usedCats.add(cat.id);
    for (const p of this.players.values()) p.lastAnswer = null;
    this.emitEv('category', { category: cat.publicInfo(), reason, ...extra });
    setImmediate(() => cat.warm?.());
  }

  nextCategory(reason) {
    const g = this.game;
    const cat = this.hub.questions.pickForGame(this.settings.source, g.usedCats, g.customDefs, { duel: this.isDuel() });
    if (!cat) { this.sys('The ranger lost the map — no categories available!'); return; }
    this.setCategory(cat, reason);
  }

  eligibleRemaining() {
    const g = this.game;
    const minRank = this.minTierRank();
    let n = 0;
    for (const e of g.category.entries) if (!g.usedEntries.has(e.id) && TIER_BY_KEY[e.tier].rank >= minRank) n++;
    return n;
  }

  // ---------------- game: turns ----------------
  aliveIds() { return this.game ? this.game.order.filter((id) => this.players.get(id)?.alive) : []; }

  nextAlive(pid) {
    const order = this.game.order;
    const idx = order.indexOf(pid);
    for (let i = 1; i <= order.length; i++) {
      const cand = order[(idx + i) % order.length];
      if (this.players.get(cand)?.alive) return cand;
    }
    return null;
  }

  turnFuseMs() {
    const g = this.game;
    const s = this.settings;
    const mode = MODES[s.mode];
    const now = Date.now();
    if (mode.fuse === 'hidden') {
      if (!g.roundFuseEndsAt) {
        const base = s.fuseSec * 1000;
        g.roundFuseEndsAt = now + Math.max(10000, base * (0.5 + Math.random()));
      }
      return Math.max(3000, g.roundFuseEndsAt - now);
    }
    if (mode.fuse === 'shrink') return Math.max(4000, s.fuseSec * 1000 - g.passes * 650);
    return s.fuseSec * 1000;
  }

  startTurn(pid) {
    const g = this.game;
    if (!g || !pid) return;
    const p = this.players.get(pid);
    if (!p || !p.alive) { const n = this.nextAlive(pid); if (n && n !== pid) return this.startTurn(n); return; }
    this.clearT(g.turnTimer);
    const total = this.turnFuseMs();
    const hidden = MODES[this.settings.mode].fuse === 'hidden';
    g.turn = { pid, id: ++g.turnSeq, startedAt: Date.now(), endsAt: Date.now() + total, totalMs: total, hidden, judgeCount: 0, paused: null };
    g.stage = 'turn';
    p.wrong = [];
    const turnId = g.turn.id;
    g.turnTimer = this.setT(() => this.onFuse(turnId), total);
    this.emitEv('turn', { pid, turnId, remainingMs: total, totalMs: total, hidden });
    this.emitState();
    if (p.isBot) botTakeTurn(this, p, turnId);
    this.maybeSpeculateEcho();
  }

  handleSubmit(pid, raw) {
    const g = this.game;
    if (!g || g.stage !== 'turn' || g.turn?.pid !== pid) return;
    const p = this.players.get(pid);
    const text = cleanText(String(raw ?? ''), LIMITS.answerMax);
    if (!p || !text) return;
    const now = Date.now();
    if (now - (p.lastSubmit || 0) < 120) return;
    p.lastSubmit = now;
    const m = this.matchSafe(text);
    if (m) return this.resolveMatch(p, text, m.entry, { fuzzy: m.fuzzy });
    if (this.canJudge()) return this.judge(p, text);
    this.reject(p, text, 'unknown');
  }

  canJudge() {
    const g = this.game;
    return this.settings.aiJudge && this.hub.questions.canJudge(g.category) && g.turn.judgeCount < 3;
  }

  async judge(p, text) {
    const g = this.game;
    const turn = g.turn;
    turn.judgeCount++;
    const remaining = Math.max(0, turn.endsAt - Date.now());
    this.clearT(g.turnTimer);
    turn.paused = remaining;
    turn.pausedAt = Date.now();
    g.stage = 'judging';
    this.emitEv('judging', { pid: p.id, text });
    this.emitState();
    let verdict;
    // usually already settled by the typing pre-check → effectively instant
    try { verdict = await this.hub.questions.judge(g.category, text); }
    catch (err) { verdict = { valid: false, error: true }; }
    if (this.game !== g || g.turn !== turn || g.stage !== 'judging') return;
    const pausedFor = Date.now() - turn.pausedAt;
    if (g.roundFuseEndsAt) g.roundFuseEndsAt += pausedFor;
    const remain = Math.max(1500, turn.paused);
    turn.endsAt = Date.now() + remain;
    turn.paused = null;
    g.stage = 'turn';
    g.turnTimer = this.setT(() => this.onFuse(turn.id), remain);
    this.emitEv('resume', { pid: p.id, turnId: turn.id, remainingMs: remain, totalMs: turn.totalMs });
    if (verdict && verdict.valid) {
      const canon = cleanText(verdict.canonical || '', 80) || text;
      const cat = g.category;
      // the item may already be on the map under another of its names ("T rex" → Tyrannosaurus)
      const names = [canon, ...(verdict.names || []).map((n) => cleanText(n, 80))].filter(Boolean);
      let entry = names.map((n) => cat.match(n, { typo: false })?.entry).find(Boolean);
      const tier = TIER_BY_KEY[verdict.tier] && verdict.tier !== 'golden' ? verdict.tier : 'deepwoods';
      if (!entry) entry = cat.add([...new Set([...names, text])].join('|'), tier);
      else cat.addAlias(entry, text);
      // a player answer nicher than the current Golden Antler takes the antler (if nobody's found it yet)
      if (entry && !g.usedEntries.has(entry.id)) {
        const score = cat.goldenScale === 'sl' ? verdict.sl : cat.goldenScale === 'pct' ? verdict.known_pct : undefined;
        if (Number.isFinite(score) && score < cat.goldenScore) {
          const prev = cat.onGoldenMove;
          cat.onGoldenMove = null; // no "it wandered off" news — they're standing on it
          if (cat.offerGolden(entry, score, `Found by ${p.name} — nichier than anything on the ranger's map!`)) this.sys(`🦌✨ ${p.name}'s answer is so niche it became the new Golden Antler!`, 'game');
          cat.onGoldenMove = prev;
        }
      }
      if (entry) return this.resolveMatch(p, text, entry, { judged: true });
    }
    this.reject(p, text, verdict?.error ? 'judge-error' : 'unknown');
  }

  reject(p, text, reason, extra = {}) {
    p.wrong = [...(p.wrong || []), { text, reason }].slice(-4);
    this.emitEv('reject', { pid: p.id, text, reason, ...extra });
    this.emitState();
  }

  resolveMatch(p, text, entry, { fuzzy = false, judged = false } = {}) {
    const g = this.game;
    if (g.usedEntries.has(entry.id)) {
      const by = this.players.get(g.usedBy.get(entry.id));
      return this.reject(p, text, 'taken', { answer: entry.name, by: by?.name });
    }
    const tier = TIER_BY_KEY[entry.tier];
    if (tier.rank < this.minTierRank()) return this.reject(p, text, 'too-common', { answer: entry.name, tier: entry.tier });

    // ✔ accepted
    this.clearT(g.turnTimer);
    g.usedEntries.add(entry.id);
    g.usedBy.set(entry.id, p.id);
    const pts = tier.pts;
    p.score += pts;
    p.answers++;
    if (entry.tier === 'golden') p.goldens++;
    let lifeGained = false;
    const goal = this.settings.extraLifeGoal;
    if (entry.tier === 'golden' && this.settings.goldenLife && p.lives < p.maxLives) {
      p.lives++;
      lifeGained = true;
    } else if (this.settings.extraLives && p.lives < p.maxLives) {
      p.meter += pts;
      if (p.meter >= goal) {
        p.lives++;
        p.meter = p.lives >= p.maxLives ? 0 : p.meter - goal;
        lifeGained = true;
      }
    }
    p.lastAnswer = { text: entry.name, tier: entry.tier };
    p.wrong = [];
    g.log.push({ pid: p.id, name: p.name, text: entry.name, tier: entry.tier, pts });
    if (g.log.length > 80) g.log.shift();
    g.lastAccepted = { pid: p.id, text: entry.name, prompt: g.category.prompt };
    g.catAnswers++;
    g.passes++;
    this.emitEv('accept', {
      pid: p.id, typed: text, answer: entry.name, tier: entry.tier, pts, fuzzy, judged, lifeGained,
      note: entry.tier === 'golden' ? entry.note || '' : undefined, lives: p.lives, meter: p.meter, score: p.score,
    });
    if (lifeGained) this.sys(`🍡 ${p.name} roasted a perfect marshmallow and earned an extra life!`, 'game');
    if (entry.tier === 'golden') this.sys(`🦌✨ ${p.name} found the GOLDEN ANTLER answer: ${entry.name}!`, 'game');

    if (this.isDuel()) {
      // one question bank for the whole duel — hike it all and it's a tie
      if (this.checkDuelTie()) return;
    } else {
      const limit = this.trailLimit();
      const rotate = MODES[this.settings.mode].rotateEvery;
      if (limit && g.catAnswers >= limit) {
        if (limit !== rotate) this.sys(`🗺️ ${g.catAnswers} answers on “${g.category.prompt}” — the moose heads down a fresh trail!`, 'game');
        this.nextCategory('limit');
      } else if (this.eligibleRemaining() < 2) {
        this.sys('🗺️ That trail is all hiked out — new category!');
        this.nextCategory('rotate');
      }
    }
    this.startTurn(this.passFrom(p.id));
  }

  /** Duel: the bank is empty (and the ranger has stopped scouting) → tie. */
  checkDuelTie() {
    const g = this.game;
    if (!g || g.stage === 'over' || !g.category) return false;
    if (this.eligibleRemaining() > 0 || g.category.complete === false) return false;
    this.clearT(g.turnTimer);
    g.stage = 'intermission';
    this.sys(`🤝 Every answer on “${g.category.prompt}” has been hiked — the duel is a TIE!`, 'game');
    this.emitState();
    this.setT(() => this.endGame(null, { tie: true }), 1800);
    return true;
  }

  onFuse(turnId) {
    const g = this.game;
    if (!g || g.turn?.id !== turnId || g.stage !== 'turn') return;
    const p = this.players.get(g.turn.pid);
    this.clearT(g.turnTimer);
    g.stage = 'intermission';
    p.lives = Math.max(0, p.lives - 1);
    const eliminated = p.lives <= 0;
    if (eliminated) {
      p.alive = false;
      p.placement = this.aliveIds().length + 1;
    }
    g.passes = 0;
    g.roundFuseEndsAt = null;
    // reveal some of what was left on the trail
    const unused = g.category.entries.filter((e) => !g.usedEntries.has(e.id));
    const golden = unused.find((e) => e.tier === 'golden');
    const reveal = this.settings.revealLeftovers ? shuffle(unused.filter((e) => e.tier !== 'golden' && e.tier !== 'kindling')).slice(0, 5).map((e) => ({ text: e.name, tier: e.tier })) : [];
    if (golden && this.settings.revealLeftovers) reveal.unshift({ text: golden.name, tier: 'golden', note: golden.note || '' });
    this.emitEv('pop', { pid: p.id, lives: p.lives, eliminated, placement: p.placement, reveal, prompt: g.category.prompt });
    if (eliminated) this.sys(`💥 ${p.name}'s moose went POOF! They're out of the woods (placed #${p.placement}).`, 'game');

    const alive = this.aliveIds();
    if (alive.length <= 1) {
      this.emitState();
      this.setT(() => this.endGame(alive[0] || null), 2400);
      return;
    }
    g.round++;
    g.nextHolder = this.nextAlive(p.id);
    g.intermissionEndsAt = Date.now() + POP_PAUSE_MS;
    const duel = this.isDuel();
    const special = !duel && this.settings.gimmick !== 'none' && (g.round - 1) % this.settings.specialEvery === 0;
    if (special && this.settings.gimmick === 'echotrail') this.prepareEcho(); // start right away, during the pause
    this.emitState();
    this.setT(() => {
      if (this.game !== g) return;
      if (special) this.beginSpecial();
      else if (duel) this.startTurn(g.nextHolder); // a duel stays on its one trail
      else { this.nextCategory('pop'); this.startTurn(g.nextHolder); }
    }, POP_PAUSE_MS);
  }

  forfeit(p) {
    const g = this.game;
    p.alive = false;
    p.lives = 0;
    p.placement = this.aliveIds().length + 1;
    this.emitEv('forfeit', { pid: p.id, placement: p.placement });
    const alive = this.aliveIds();
    if (g.stage === 'over') return;
    if (alive.length <= 1) {
      this.clearT(g.turnTimer);
      if (g.stage !== 'intermission') g.stage = 'intermission';
      this.setT(() => this.endGame(alive[0] || null), 1200);
      return;
    }
    if ((g.stage === 'turn' || g.stage === 'judging') && g.turn?.pid === p.id) {
      this.clearT(g.turnTimer);
      this.startTurn(this.nextAlive(p.id));
    } else if (g.stage === 'picking' && g.special?.leaderId === p.id) {
      this.autoLeaderPick();
    }
    if (g.nextHolder === p.id) g.nextHolder = this.nextAlive(p.id);
  }

  // ---------------- gimmicks ----------------
  specialIn() {
    const g = this.game;
    if (!g || this.settings.gimmick === 'none') return null;
    const N = this.settings.specialEvery;
    const r = (g.round - 1) % N;
    return r === 0 && g.round > 1 ? 0 : N - r;
  }

  leaderId() {
    const alive = this.aliveIds().map((id) => this.players.get(id));
    alive.sort((a, b) => b.lives - a.lives || b.score - a.score || a.seat - b.seat);
    return alive[0]?.id;
  }

  /** Is there a clear leader right now (more lives, or same lives and more points, than the runner-up)? */
  clearLeader() {
    const alive = this.aliveIds().map((id) => this.players.get(id)).sort((a, b) => b.lives - a.lives || b.score - a.score);
    if (alive.length < 2) return alive[0]?.id || null;
    const [a, b] = alive;
    return a.lives > b.lives || a.score > b.score ? a.id : null;
  }

  beginSpecial() {
    const g = this.game;
    if (this.settings.gimmick === 'leaderpick') {
      const leaderId = this.leaderId();
      const suggestions = this.hub.questions.suggest('', 6).map((s) => s.prompt);
      const pickMs = this.settings.pickSec * 1000;
      g.stage = 'picking';
      g.special = { type: 'leaderpick', leaderId, deadline: Date.now() + pickMs, totalMs: pickMs, suggestions, specCount: 0, specText: null };
      const leader = this.players.get(leaderId);
      this.sys(`🪓 Special round! ${leader?.name} has the most lives and gets to carve the next trail sign.`, 'game');
      this.emitEv('special', { kind: 'leaderpick', leaderId, deadline: pickMs, totalMs: pickMs, suggestions });
      this.emitState();
      g.special.timer = this.setT(() => this.autoLeaderPick(), pickMs);
      if (leader?.isBot) this.setT(() => { if (g.stage === 'picking' && g.special?.leaderId === leaderId) this.handleLeaderPick(leaderId, pick(suggestions)); }, 2600);
    } else if (this.settings.gimmick === 'echotrail') {
      this.runEcho();
    }
  }

  autoLeaderPick() {
    const g = this.game;
    if (!g || g.stage !== 'picking') return;
    const typed = g.special.lastTyped && g.special.lastTyped.length >= 3 ? g.special.lastTyped : null;
    this.handleLeaderPick(g.special.leaderId, typed || pick(g.special.suggestions), true);
  }

  /** Speculatively start generating while the leader is still typing. */
  speculateLeader(text) {
    const g = this.game;
    if (!g?.special) return;
    g.special.lastTyped = cleanText(text, LIMITS.promptMax);
    this.clearT(g.special.specTimer);
    if (!this.hub.ai.enabled || g.special.specCount >= 2 || g.special.lastTyped.length < 6) return;
    g.special.specTimer = this.setT(() => {
      if (this.game !== g || g.stage !== 'picking') return;
      const t = g.special.lastTyped;
      if (!t || t === g.special.specText) return;
      g.special.specText = t;
      g.special.specCount++;
      this.hub.questions.quickCategory(t); // result is deduped/cached in the generator
    }, 1100);
  }

  handleLeaderPick(pid, raw, auto = false) {
    const g = this.game;
    if (!g || g.stage !== 'picking' || g.special?.leaderId !== pid) return;
    const text = cleanText(String(raw ?? ''), LIMITS.promptMax);
    if (text.length < 3) return;
    this.clearT(g.special.timer);
    this.clearT(g.special.specTimer);
    const leader = this.players.get(pid);
    this.runGeneration(text, 'leader', { by: leader?.name, auto });
  }

  /** Generate a category on the fly and start the round as soon as it's playable. */
  runGeneration(text, reason, extra = {}) {
    const g = this.game;
    g.stage = 'generating';
    g.special = { ...(g.special || {}), type: g.special?.type || reason, generating: text, progress: 0, startedAt: Date.now() };
    this.emitEv('generating', { text, reason, ...extra });
    this.emitState();
    let lastEmit = 0;
    const job = this.hub.questions.quickCategory(text, {
      onProgress: (cat) => {
        if (this.game !== g) return;
        if (g.category === cat) return this.categoryProgress(cat); // still scouting during play
        const now = Date.now();
        if (now - lastEmit < 200) return;
        lastEmit = now;
        this.io.to(this.code).emit('genprogress', { count: cat.size, prompt: cat.prompt, counts: cat.counts(), sources: [...(cat.sources || [cat.source])], ms: now - g.special?.startedAt });
      },
    });
    withTimeout(job.ready, GEN_TIMEOUT_MS, 'The ranger took too long scouting.').then((cat) => {
      if (this.game !== g || g.stage !== 'generating') return;
      this.setCategory(cat, reason, { ...extra, how: job.how, ms: Date.now() - g.special.startedAt });
      // keep pushing late-arriving answers to the counter
      job.done?.then?.((c) => { if (this.game === g && g.category === c) this.io.to(this.code).emit('genprogress', { count: c.size, counts: c.counts(), done: true }); }).catch(() => {});
      g.special = null;
      this.startTurn(g.nextHolder);
    }).catch((err) => {
      if (this.game !== g || g.stage !== 'generating') return;
      job.abort?.();
      this.sys(`🌧️ The trail washed out (${err.message}). Grabbing a random category instead.`);
      g.special = null;
      this.nextCategory('pop');
      this.startTurn(g.nextHolder);
    });
  }

  echoTarget() { return this.game?.lastAccepted || null; }

  /** Pre-compute the echo prompt while the pre-echo round is being played. */
  maybeSpeculateEcho() {
    const g = this.game;
    if (!g || this.settings.gimmick !== 'echotrail') return;
    if (g.round % this.settings.specialEvery !== 0) return; // next round isn't an echo round
    const last = g.lastAccepted;
    if (!last) return;
    if (g.echoSpec?.answer === last.text) return;
    g.echoSpec?.controller?.abort();
    const controller = new AbortController();
    const spec = { answer: last.text, controller, prompt: null, started: false };
    spec.promise = this.hub.questions.echoPrompt(last.prompt, last.text, controller.signal).then((p) => { spec.prompt = p; return p; });
    spec.promise.catch(() => {});
    g.echoSpec = spec;
    // if the holder is struggling (≥50% of fuse gone), start building the board too
    const turn = g.turn;
    if (turn && !turn.hidden && this.hub.ai.enabled) {
      this.setT(() => {
        if (this.game !== g || g.turn !== turn || g.stage !== 'turn' || g.echoSpec !== spec) return;
        spec.promise.then((p) => { if (g.echoSpec === spec && !spec.started) { spec.started = true; this.hub.questions.quickCategory(p); } }).catch(() => {});
      }, turn.totalMs * 0.5);
    }
  }

  prepareEcho() {
    const g = this.game;
    const last = g.lastAccepted;
    if (!last) return;
    if (!g.echoSpec || g.echoSpec.answer !== last.text) this.maybeSpeculateEcho();
    const spec = g.echoSpec;
    if (spec && !spec.started && this.hub.ai.enabled) {
      spec.promise.then((p) => { if (!spec.started) { spec.started = true; this.hub.questions.quickCategory(p); } }).catch(() => {});
    }
  }

  runEcho() {
    const g = this.game;
    const last = g.lastAccepted;
    if (!last) { this.nextCategory('pop'); this.startTurn(g.nextHolder); return; }
    g.stage = 'generating';
    g.special = { type: 'echotrail', from: last.text, generating: `Echoing “${last.text}”…`, startedAt: Date.now() };
    this.sys(`📣 Echo round! "${last.text}" echoes through the canyon…`, 'game');
    this.emitEv('special', { kind: 'echotrail', from: last.text });
    this.emitState();
    const spec = g.echoSpec && g.echoSpec.answer === last.text ? g.echoSpec : null;
    const promptP = spec ? spec.promise : this.hub.questions.echoPrompt(last.prompt, last.text);
    withTimeout(promptP, 9000, 'echo timeout')
      .then((prompt) => {
        if (this.game !== g) return;
        g.echoSpec = null;
        this.runGeneration(prompt, 'echo', { from: last.text });
      })
      .catch(() => {
        if (this.game !== g) return;
        g.echoSpec = null;
        this.runGeneration(`Name something linked to "${last.text}"`, 'echo', { from: last.text });
      });
  }

  // ---------------- game: end ----------------
  endGame(winnerId, { tie = false } = {}) {
    const g = this.game;
    if (!g || g.stage === 'over') return;
    this.clearT(g.turnTimer);
    g.stage = 'over';
    if (g.category) g.category.active = false;
    const winner = winnerId ? this.players.get(winnerId) : null;
    if (winner) { winner.placement = 1; }
    const parts = g.order.map((id) => this.players.get(id)).filter(Boolean);
    if (tie) for (const p of parts) if (p.alive) p.placement = 1; // everyone still standing shares the win
    for (const p of parts) if (p.placement == null) p.placement = parts.length;
    const humans = parts.filter((p) => !p.isBot);
    const store = this.hub.profiles;
    const countsForWins = humans.length >= 2;
    const ranked = g.ranked && humans.length >= 2 && humans.length === parts.length;
    const profs = new Map();
    for (const h of humans) { const pr = store.byId.get(h.id); if (pr) profs.set(h.id, pr); }
    const before = new Map([...profs].map(([id, pr]) => [id, unlockedIds(pr)]));
    let deltas = new Map();
    if (ranked) deltas = ratingChanges([...profs].map(([id, pr]) => ({ profile: pr, placement: this.players.get(id).placement })));
    const results = [];
    for (const p of parts.sort((a, b) => a.placement - b.placement)) {
      const pr = profs.get(p.id);
      let unlocks = [];
      if (pr) {
        pr.games++;
        pr.answers += p.answers;
        pr.goldens += p.goldens;
        pr.bestScore = Math.max(pr.bestScore, p.score);
        if (p.placement === 1 && countsForWins && !tie) pr.wins++;
        if (ranked) {
          pr.rankedGames++;
          if (p.placement === 1 && !tie) pr.rankedWins++;
          const d = deltas.get(p.id) || 0;
          pr.rating = Math.max(100, pr.rating + d);
          pr.peakRating = Math.max(pr.peakRating || 0, pr.rating);
          p.ratingDelta = d;
          p.rating = Math.round(pr.rating);
        }
        const after = unlockedIds(pr);
        unlocks = [...after].filter((x) => !before.get(p.id).has(x)).map((key) => {
          const [type, id] = key.split(':');
          return { type, id, name: CATALOG[type].find((i) => i.id === id)?.name || id };
        });
      }
      results.push({
        pid: p.id, name: p.name, isBot: p.isBot, placement: p.placement, score: p.score, answers: p.answers,
        goldens: p.goldens, ratingDelta: p.ratingDelta, rating: p.rating, rank: pr ? rankFor(pr.rating).name : null, unlocks, equipped: p.equipped,
      });
    }
    store.save();
    this.phase = 'ended';
    if (winner) this.sys(`🏆 ${winner.name} is the last camper standing! ${countsForWins ? '' : '(Wins only count with 2+ human campers.)'}`, 'game');
    this.emitEv('gameover', { winnerId, results, ranked, tie, resultsMs: RESULTS_MS });
    this.emitState();
    // refresh profiles for everyone who played
    for (const h of humans) {
      const sock = this.io.sockets.sockets.get(h.socketId);
      const pr = profs.get(h.id);
      if (sock && pr) sock.emit('profile', store.publicView(pr));
    }
    this.setT(() => this.backToLobby(), RESULTS_MS);
  }

  backToLobby() {
    if (this.destroyed) return;
    this.clearAllTimers();
    this.game = null;
    this.phase = 'lobby';
    for (const p of [...this.players.values()]) {
      if (p.left || (!p.isBot && !p.connected)) { this.players.delete(p.id); continue; }
      this.resetPlayerGame(p);
    }
    // seat spectators if there's room
    for (const p of this.players.values()) {
      if (p.spectator && this.activeCount() < this.settings.maxPlayers) { p.spectator = false; p.seat = this.freeSeat(); }
    }
    if (!this.players.get(this.hostId) || this.players.get(this.hostId)?.isBot) {
      const h = this.connectedHumans()[0];
      this.hostId = h ? h.id : null;
    }
    this.emitEv('lobby');
    this.checkAutoStart();
    this.emitState();
  }

  destroy() {
    this.destroyed = true;
    this.clearAllTimers();
  }

  // ---------------- snapshot ----------------
  snapshot() {
    const g = this.game;
    const now = Date.now();
    const players = [...this.players.values()].filter((p) => !(p.left && !g)).map((p) => ({
      id: p.id, name: p.name, isBot: p.isBot, botLevel: p.botLevel, seat: p.seat, spectator: p.spectator,
      connected: p.connected, left: !!p.left, equipped: p.equipped, rating: p.rating,
      rank: p.isBot ? null : rankFor(p.rating || 1000).name,
      lives: p.lives, maxLives: p.maxLives, alive: p.alive, score: p.score, meter: p.meter,
      lastAnswer: p.lastAnswer, wrong: p.wrong, placement: p.placement, answers: p.answers, goldens: p.goldens,
    }));
    let game = null;
    if (g) {
      const turn = g.turn ? {
        pid: g.turn.pid, id: g.turn.id, totalMs: g.turn.totalMs, hidden: g.turn.hidden,
        remainingMs: g.stage === 'judging' ? g.turn.paused : Math.max(0, g.turn.endsAt - now),
        paused: g.stage === 'judging',
      } : null;
      game = {
        stage: g.stage, round: g.round, ranked: g.ranked,
        category: g.category ? g.category.publicInfo() : null,
        used: g.usedEntries.size,
        log: g.log.slice(-40),
        turn,
        introMs: g.stage === 'intro' ? Math.max(0, g.introEndsAt - now) : 0,
        intermissionMs: g.stage === 'intermission' ? Math.max(0, (g.intermissionEndsAt || now) - now) : 0,
        specialIn: this.specialIn(),
        duel: this.isDuel(),
        remaining: g.category ? this.eligibleRemaining() : null,
        special: g.special ? {
          type: g.special.type, leaderId: g.special.leaderId, suggestions: g.special.suggestions,
          remainingMs: g.special.deadline ? Math.max(0, g.special.deadline - now) : null, totalMs: g.special.totalMs || null,
          generating: g.special.generating, from: g.special.from,
        } : null,
        leaderId: this.settings.gimmick === 'leaderpick' && g.stage !== 'intro' ? this.clearLeader() : null,
        minTier: this.minTierKey(),
        trailLeft: (() => { const l = this.trailLimit(); return l ? Math.max(0, l - g.catAnswers) : null; })(),
        catSpecial: !!g.catSpecial,
        echoFrom: this.settings.gimmick === 'echotrail' ? g.lastAccepted?.text || null : null,
        order: g.order,
      };
    }
    return {
      code: this.code, name: this.name, quick: this.quick, ranked: this.ranked, hostId: this.hostId, phase: this.phase,
      settings: this.settings,
      customPack: this.customPack ? { name: this.customPack.name, count: this.customPack.defs.length, prompts: this.customPack.defs.slice(0, 60).map((d) => d.prompt) } : null,
      autoStartMs: this.autoStartAt ? Math.max(0, this.autoStartAt - now) : null,
      players, game, serverNow: now,
      tiers: TIERS.map((t) => t.key),
    };
  }
}

module.exports = { Room, normalizeSettings };
