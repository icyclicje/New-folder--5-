'use strict';
/**
 * Mivimoose Party — server entry.
 * Express serves the client; Socket.IO runs rooms, chat and the game engine.
 * Railway: just deploy — it runs `npm start` and injects PORT.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

// tiny .env loader (no dependency); real env vars win
try {
  const envFile = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch { /* ignore */ }

const express = require('express');
const { Server } = require('socket.io');
const { TIERS, MODES, GIMMICKS, SOURCES, DEFAULT_SETTINGS, SETTING_RANGES, LIMITS, RANKS } = require('./config');
const { CATALOG } = require('./cosmetics');
const { ProfileStore } = require('./profiles');
const { KrillionBank } = require('./krillion');
const { AIGen, MODEL } = require('./ai');
const { QuestionService } = require('./questions');
const { Room } = require('./room');
const { LEVELS } = require('./bots');
const { roomCode, cleanText } = require('./util');

const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });

const log = { info: (...a) => console.log(...a), warn: (...a) => console.warn(...a) };

const profiles = new ProfileStore(DATA_DIR);
const krillion = new KrillionBank(DATA_DIR, log);
const ai = new AIGen({ dataDir: DATA_DIR, log });
const questions = new QuestionService({ krillion, ai, bankDir: path.join(__dirname, 'data', 'bank'), log });

const app = express();
app.disable('x-powered-by');
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 4e6, pingInterval: 10000, pingTimeout: 15000 });

const rooms = new Map();
const hub = { io, profiles, questions, ai, krillion, rooms };

// ---------------- HTTP ----------------
app.use(express.json({ limit: '2mb' }));
// no-cache + ETag: after a redeploy every camper gets the matching HTML/JS/CSS on their next load (304s keep it fast)
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: 0, etag: true, extensions: ['html'], setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));

app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.get('/api/status', (_req, res) => {
  res.json({
    krillion: krillion.status,
    campfire: questions.campfire.size,
    ai: { enabled: ai.enabled, model: ai.enabled ? MODEL : null, cached: ai.cache.size },
    rooms: rooms.size,
    online: io.engine.clientsCount,
  });
});

app.get('/api/catalog', (_req, res) => {
  res.json({ tiers: TIERS, modes: MODES, gimmicks: GIMMICKS, sources: SOURCES, defaults: DEFAULT_SETTINGS, ranges: SETTING_RANGES, limits: LIMITS, ranks: RANKS, cosmetics: CATALOG, botLevels: Object.fromEntries(Object.entries(LEVELS).map(([k, v]) => [k, v.name])) });
});

app.get('/api/leaderboard', (_req, res) => res.json(profiles.leaderboard(30)));

app.get('/api/prompts', (req, res) => {
  const q = cleanText(String(req.query.q || ''), 80);
  const source = String(req.query.source || '');
  let list = q ? questions.suggest(q, 40) : questions.allSummaries();
  if (source) list = list.filter((s) => s.source === source);
  res.json(list.slice(0, q ? 40 : 2000).map(({ id, prompt, total, source: src, date }) => ({ id, prompt, total, source: src, date })));
});

app.get('/api/category/:id', (req, res) => {
  const def = questions.getDefById(String(req.params.id));
  if (!def) return res.status(404).json({ error: 'Unknown trail' });
  res.json(def);
});

app.get('/api/rooms', (_req, res) => {
  res.json([...rooms.values()].filter((r) => !r.quick && r.settings.isPublic && !r.destroyed).map((r) => ({
    code: r.code, name: r.name, phase: r.phase, players: r.activeCount(), maxPlayers: r.settings.maxPlayers,
    mode: MODES[r.settings.mode].name, gimmick: r.settings.gimmick !== 'none' ? GIMMICKS[r.settings.gimmick].name : null,
  })));
});

app.get(/^\/(?:r|join)\/([A-Za-z]{4})$/, (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// ---------------- rooms ----------------
function newCode() {
  for (let i = 0; i < 200; i++) { const c = roomCode(4); if (!rooms.has(c)) return c; }
  return roomCode(5);
}

function createRoom(opts) {
  const room = new Room(hub, { code: newCode(), ...opts });
  rooms.set(room.code, room);
  return room;
}

function findQuickRoom(duel = false) {
  let best = null;
  for (const r of rooms.values()) {
    if (!r.quick || r.destroyed || r.phase !== 'lobby' || !!r.duelQuick !== duel) continue;
    const n = r.activeCount();
    if (n >= r.settings.maxPlayers) continue;
    if (!best || n > best.activeCount()) best = r;
  }
  return best || createRoom(duel ? { quick: true, duel: true, name: 'Quick Duel' } : { quick: true });
}

// sweep empty rooms
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (!r.connectedHumans().length && r.emptySince && now - r.emptySince > 60000) {
      r.destroy();
      rooms.delete(code);
    }
  }
}, 15000).unref();

// ---------------- sockets ----------------
const genBudget = new Map(); // profileId -> timestamps of generation requests

function allowGen(pid, weight = 1) {
  const now = Date.now();
  const arr = (genBudget.get(pid) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (arr.length + weight > 40) return false;
  for (let i = 0; i < weight; i++) arr.push(now);
  genBudget.set(pid, arr);
  return true;
}

io.on('connection', (socket) => {
  let profile = null;
  const room = () => (socket.data.roomCode ? rooms.get(socket.data.roomCode) : null);
  const ackSafe = (ack) => (typeof ack === 'function' ? ack : () => {});

  function leaveCurrent() {
    const r = room();
    if (r && profile) {
      socket.leave(r.code);
      r.removePlayer(profile.id);
    }
    socket.data.roomCode = null;
  }

  function joinRoom(r, ack) {
    if (!profile) return ack({ ok: false, error: 'Say hello to the ranger first.' });
    const cur = room();
    if (cur && cur !== r) leaveCurrent();
    const can = r.canJoin(profile);
    if (!can.ok) return ack(can);
    // if this profile is connected elsewhere in this room, take over the seat
    r.addHuman(profile, socket);
    ack({ ok: true, code: r.code });
  }

  socket.on('hello', (data = {}, ack) => {
    ack = ackSafe(ack);
    profile = profiles.getOrCreate(String(data.token || ''), data.name);
    socket.data.pid = profile.id;
    ack({ ok: true, token: profile.token, profile: profiles.publicView(profile) });
  });

  socket.on('profile:update', (data = {}, ack) => {
    ack = ackSafe(ack);
    if (!profile) return ack({ ok: false });
    profiles.update(profile.token, { name: data.name, equipped: data.equipped });
    const r = room();
    if (r) {
      const p = r.players.get(profile.id);
      if (p) { p.name = profile.name; p.equipped = { ...profile.equipped }; r.emitState(); }
    }
    ack({ ok: true, profile: profiles.publicView(profile) });
  });

  socket.on('room:create', (data = {}, ack) => {
    ack = ackSafe(ack);
    if (!profile) return ack({ ok: false, error: 'Say hello first.' });
    const r = createRoom({ settings: data.settings || {}, name: data.name || `${profile.name}'s Campsite` });
    joinRoom(r, ack);
    if (data.pack) r.setCustomPack(profile.id, data.pack);
  });

  socket.on('room:join', (data = {}, ack) => {
    ack = ackSafe(ack);
    const code = String(data.code || '').toUpperCase().replace(/[^A-Z]/g, '');
    const r = rooms.get(code);
    if (!r || r.destroyed) return ack({ ok: false, error: `No campsite with code ${code || '????'} — check the trail marker.` });
    joinRoom(r, ack);
  });

  socket.on('room:quick', (_data, ack) => {
    ack = ackSafe(ack);
    if (!profile) return ack({ ok: false, error: 'Say hello first.' });
    const cur = room();
    if (cur?.quick && !cur.duelQuick && cur.phase === 'lobby') return ack({ ok: true, code: cur.code });
    joinRoom(findQuickRoom(false), ack);
  });

  // ⚔️ Quick 1v1 Duel: matchmake into a 2-camper, one-question-bank duel
  socket.on('room:quickduel', (_data, ack) => {
    ack = ackSafe(ack);
    if (!profile) return ack({ ok: false, error: 'Say hello first.' });
    const cur = room();
    if (cur?.duelQuick && cur.phase === 'lobby') return ack({ ok: true, code: cur.code });
    joinRoom(findQuickRoom(true), ack);
  });

  socket.on('room:leave', (_d, ack) => { leaveCurrent(); ackSafe(ack)({ ok: true }); });

  socket.on('room:settings', (data = {}) => { const r = room(); if (r && profile) r.updateSettings(profile.id, data.settings || {}); });

  socket.on('room:rename', (data = {}) => {
    const r = room();
    if (r && profile && r.hostId === profile.id && !r.quick) { r.name = cleanText(data.name, 32) || r.name; r.emitState(); }
  });

  socket.on('room:pack', (data = {}, ack) => {
    ack = ackSafe(ack);
    const r = room();
    if (!r || !profile) return ack({ ok: false });
    ack(r.setCustomPack(profile.id, data.pack));
  });

  socket.on('room:start', (_d, ack) => {
    ack = ackSafe(ack);
    const r = room();
    if (!r || !profile) return ack({ ok: false });
    ack(r.startGame(profile.id));
  });

  socket.on('room:kick', (data = {}) => {
    const r = room();
    if (!r || !profile || r.hostId !== profile.id || r.quick || r.phase !== 'lobby') return;
    const target = r.players.get(String(data.pid || ''));
    if (!target || target.id === profile.id) return;
    r.removePlayer(target.id, 'kicked');
    if (!target.isBot) {
      const s = io.sockets.sockets.get(target.socketId);
      if (s) { s.leave(r.code); s.data.roomCode = null; s.emit('kicked'); }
    }
  });

  socket.on('room:bot', (data = {}, ack) => {
    ack = ackSafe(ack);
    const r = room();
    if (!r || !profile || r.hostId !== profile.id) return ack({ ok: false, error: 'Only the camp counselor can invite critters.' });
    if (data.action === 'remove') {
      const bot = [...r.players.values()].reverse().find((p) => p.isBot);
      if (bot) r.removePlayer(bot.id);
      return ack({ ok: true });
    }
    ack(r.addBot(String(data.level || 'ranger')));
  });

  socket.on('chat', (data = {}) => { const r = room(); if (r && profile) r.handleChat(profile.id, data.text); });
  socket.on('typing', (data = {}) => { const r = room(); if (r && profile) r.relayTyping(profile.id, data.text); });
  socket.on('submit', (data = {}) => { const r = room(); if (r && profile) r.handleSubmit(profile.id, data.text); });
  socket.on('leader:pick', (data = {}) => { const r = room(); if (r && profile) r.handleLeaderPick(profile.id, data.text); });

  socket.on('suggest', (data = {}, ack) => {
    ack = ackSafe(ack);
    ack(questions.suggest(cleanText(String(data.q || ''), 80), 8).map((s) => ({ id: s.id, prompt: s.prompt, total: s.total, source: s.source })));
  });

  // ---- Field Guide editor: generate one category on the fly ----
  socket.on('gen:category', (data = {}, ack) => {
    ack = ackSafe(ack);
    if (!profile) return ack({ ok: false, error: 'Say hello first.' });
    const prompt = cleanText(String(data.prompt || ''), LIMITS.promptMax);
    if (prompt.length < 3) return ack({ ok: false, error: 'Write a longer category.' });
    if (!allowGen(profile.id, 1)) return ack({ ok: false, error: 'The ranger needs a breather — try again in a few minutes.' });
    const started = Date.now();
    let last = 0;
    const job = questions.quickCategory(prompt, {
      allowKnown: !!data.allowKnown,
      onProgress: (cat) => {
        const now = Date.now();
        if (now - last < 250) return;
        last = now;
        socket.emit('gen:progress', { reqId: data.reqId, prompt: cat.prompt, counts: cat.counts(), total: cat.size });
      },
    });
    job.done.then((cat) => {
      ack({ ok: true, how: job.how, ms: Date.now() - started, def: { ...cat.toJSON(), generated: cat.generated || job.how === 'ai' || job.how === 'cache' } });
    }).catch((err) => ack({ ok: false, error: err.message || 'Generation failed.' }));
  });

  // ---- Topic → full question bank ----
  socket.on('gen:bank', (data = {}, ack) => {
    ack = ackSafe(ack);
    if (!profile) return ack({ ok: false, error: 'Say hello first.' });
    if (socket.data.bankBusy) return ack({ ok: false, error: 'Already building a bank — hang tight.' });
    const topic = cleanText(String(data.topic || ''), 80);
    const count = Math.max(3, Math.min(20, parseInt(data.count, 10) || 8));
    if (topic.length < 2) return ack({ ok: false, error: 'Give the ranger a topic.' });
    if (ai.enabled && !allowGen(profile.id, Math.ceil(count / 2))) return ack({ ok: false, error: 'The ranger needs a breather — try again in a few minutes.' });
    socket.data.bankBusy = true;
    const reqId = data.reqId;
    ack({ ok: true, ai: ai.enabled });
    questions.generateBank(topic, count, {
      onPlan: (prompts) => socket.emit('bank:plan', { reqId, topic, prompts }),
      onCategory: (def) => socket.emit('bank:category', { reqId, def }),
    }).then((defs) => socket.emit('bank:done', { reqId, topic, count: defs.length }))
      .catch((err) => socket.emit('bank:error', { reqId, error: err.message || 'Bank generation failed.' }))
      .finally(() => { socket.data.bankBusy = false; });
  });

  socket.on('disconnect', () => {
    const r = room();
    if (r && profile) r.onDisconnect(profile.id);
  });
});

server.listen(PORT, () => {
  log.info(`🦌 Mivimoose Party is camping on http://localhost:${PORT}`);
  log.info(`   data dir: ${DATA_DIR}`);
  log.info(`   AI generation: ${ai.enabled ? 'ON (' + MODEL + ')' : 'off — set ANTHROPIC_API_KEY to enable (word-association fallback active)'}`);
  if (process.env.KRILLION_SYNC !== '0') krillion.startAutoRefresh(3);
});

// A party game should never go down because one promise misbehaved.
process.on('unhandledRejection', (err) => console.warn('[unhandledRejection]', err?.message || err));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));

function shutdown() {
  profiles.flushSync();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
