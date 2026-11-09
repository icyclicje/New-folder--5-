'use strict';
/**
 * End-to-end smoke test against a running server (default http://localhost:3000).
 *   npm start   (in one terminal)
 *   npm run check
 * Drives real Socket.IO clients through full games, both gimmick modes,
 * quick-play matchmaking, chat/typing relay and the generators.
 */
const { io } = require('socket.io-client');

const BASE = process.env.BASE || 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✔' : '  ✘'} ${msg}`); if (!cond) failures++; };

function client(name) {
  const s = io(BASE, { transports: ['websocket'], forceNew: true });
  const c = { s, name, state: null, events: [], chats: [], typing: [], id: null };
  s.on('state', (st) => { c.state = st; });
  s.on('ev', (ev) => { c.events.push(ev); c.onEv?.(ev); });
  s.on('chat', (m) => c.chats.push(m));
  s.on('typing', (t) => c.typing.push(t));
  c.hints = [];
  s.on('hint', (h) => c.hints.push(h));
  c.emit = (ev, data) => new Promise((res) => s.emit(ev, data, res));
  c.hello = async () => { const r = await c.emit('hello', { name }); c.id = r.profile.id; return r; };
  c.waitEv = (type, ms = 20000, pred = () => true) => new Promise((res, rej) => {
    const found = c.events.find((e) => e.type === type && pred(e) && !e._seen);
    if (found) { found._seen = true; return res(found); }
    const t = setTimeout(() => rej(new Error(`${name}: timeout waiting for ${type}`)), ms);
    const prev = c.onEv;
    c.onEv = (ev) => { prev?.(ev); if (ev.type === type && pred(ev) && !ev._seen) { ev._seen = true; clearTimeout(t); c.onEv = prev; res(ev); } };
  });
  return c;
}

const defCache = new Map();
async function answersFor(catId) {
  if (!defCache.has(catId)) defCache.set(catId, await fetch(`${BASE}/api/category/${encodeURIComponent(catId)}`).then((r) => (r.ok ? r.json() : null)));
  const def = defCache.get(catId);
  if (!def) return [];
  const all = [];
  for (const t of ['kindling', 'trailhead', 'backcountry', 'deepwoods']) for (const a of def.tiers[t] || []) all.push(a.split('|')[0]);
  if (def.golden) all.push(def.golden.answer.split('|')[0]);
  return all;
}

/** Make `c` auto-answer on its turn (until `stopAfter` accepted answers). */
function autoPlay(c, { stopAfter = Infinity, wrongFirst = false } = {}) {
  let answered = 0;
  const used = new Set();
  let catId = null;
  let catDef = null;
  const prev = c.onEv;
  c.onEv = async (ev) => {
    prev?.(ev);
    if (ev.type === 'category') { catId = ev.category.id; used.clear(); catDef = ev.category; }
    if (ev.type === 'accept') used.add(ev.answer.toLowerCase());
    if (ev.type === 'turn' && ev.pid === c.id && answered < stopAfter) {
      const id = catId || c.state?.game?.category?.id;
      let list = id ? await answersFor(id) : [];
      if (!list.length && c.state?.game?.category) {
        // generated categories (leader/echo) aren't fetchable by id — peek via the reveal-less path: use log-free guess
        list = [];
      }
      const pickAns = list.find((a) => !used.has(a.toLowerCase()));
      c.s.emit('typing', { text: (pickAns || 'hmm').slice(0, 3) });
      if (wrongFirst && answered === 0) c.s.emit('submit', { text: 'xyzzy plugh' });
      await sleep(250);
      if (pickAns) { c.s.emit('submit', { text: pickAns }); answered++; }
    }
  };
  return () => answered;
}

async function main() {
  console.log(`🦌 Mivimoose self-test against ${BASE}\n`);
  const status = await fetch(`${BASE}/api/status`).then((r) => r.json());
  ok(status.krillion.prompts > 0, `Krillion bank loaded: ${status.krillion.prompts} prompts / ${status.krillion.days} days`);
  ok(status.campfire >= 30, `Campfire Classics loaded: ${status.campfire} categories`);
  const cat = await fetch(`${BASE}/api/catalog`).then((r) => r.json());
  ok(cat.tiers.length === 5 && Object.keys(cat.modes).length >= 6, '5 tiers + 6 modes in catalog');

  // ---------------------------------------------------------- game 1: classic + bot
  console.log('\n🔥 Game 1 — classic, 2 humans + 1 critter bot');
  const A = client('Alder'), B = client('Birch');
  await A.hello(); await B.hello();
  ok(!!A.id && !!B.id && A.id !== B.id, 'two profiles created');
  const created = await A.emit('room:create', { settings: { mode: 'classic', source: 'krillion', lives: 1, fuseSec: 6 } });
  ok(created.ok && /^[A-Z]{4}$/.test(created.code), `room created: ${created.code}`);
  const joined = await B.emit('room:join', { code: created.code });
  ok(joined.ok, 'B joined by code');
  const bad = await B.emit('room:join', { code: 'ZZZZ' });
  ok(!bad.ok, 'bad code rejected: ' + bad.error);
  const bot = await A.emit('room:bot', { action: 'add', level: 'legend' });
  ok(bot.ok, 'critter bot added');
  const notHost = await B.emit('room:start', {});
  ok(!notHost.ok, 'non-host cannot start');
  A.s.emit('chat', { text: 'Who brought the marshmallows?' });
  await sleep(300);
  ok(B.chats.some((m) => m.text === 'Who brought the marshmallows?'), 'chat relayed');

  autoPlay(A, { stopAfter: 3, wrongFirst: true });
  // B never answers → pops & is eliminated (lives 1)
  const start = await A.emit('room:start', {});
  ok(start.ok, 'game started');
  const catEv = await A.waitEv('category', 10000);
  ok(!!catEv.category.prompt, `first category: “${catEv.category.prompt}” (${catEv.category.total} answers)`);
  const rej = await A.waitEv('reject', 40000, (e) => e.pid === A.id).catch(() => null);
  ok(rej && rej.reason === 'unknown', 'wrong guess rejected as not on the map');
  const acc = await B.waitEv('accept', 40000, (e) => e.pid === A.id).catch(() => null);
  ok(!!acc, acc ? `A's answer accepted: ${acc.answer} (${acc.tier}, +${acc.pts})` : 'A answer accepted');
  ok(B.typing.some((t) => t.pid === A.id), 'B saw A typing live');
  const popB = await A.waitEv('pop', 40000, (e) => e.pid === B.id).catch(() => null);
  ok(popB && popB.eliminated, 'B popped and was eliminated');
  ok(Array.isArray(popB?.reveal), `pop revealed ${popB?.reveal?.length} left-over answers`);
  const over = await A.waitEv('gameover', 90000).catch(() => null);
  ok(!!over, over ? `game over — winner: ${over.results.find((r) => r.placement === 1)?.name}` : 'game over');
  ok(over && over.results.length === 3, 'results include all 3 campers');
  await sleep(500);
  A.s.close(); B.s.close();

  // ---------------------------------------------------------- game 2: leader's pick
  console.log("\n🪓 Game 2 — Leader's Pick (special every 2 rounds)");
  const C = client('Cedar'), D = client('Dogwood');
  await C.hello(); await D.hello();
  const r2 = await C.emit('room:create', { settings: { mode: 'classic', gimmick: 'leaderpick', specialEvery: 2, lives: 3, fuseSec: 5, source: 'campfire' } });
  await D.emit('room:join', { code: r2.code });
  autoPlay(C, { stopAfter: 50 });
  await C.emit('room:start', {});
  const special = await C.waitEv('special', 60000).catch(() => null);
  ok(special && special.kind === 'leaderpick' && special.leaderId === C.id, 'special round: C (most lives) gets to carve the sign');
  ok(special && special.totalMs === 40000, `carving time comes from the room rules (${(special?.totalMs || 0) / 1000}s)`);
  const t0 = Date.now();
  C.s.emit('typing', { text: 'Name a type of che' });
  C.s.emit('leader:pick', { text: 'Name a type of cheese' });
  const lcat = await D.waitEv('category', 30000, (e) => e.reason === 'leader').catch(() => null);
  ok(!!lcat, lcat ? `leader category live in ${Date.now() - t0}ms: “${lcat.category.prompt}” (${lcat.category.total} answers, via ${lcat.how})` : 'leader category generated');
  D.s.emit('room:leave', {});
  const over2 = await C.waitEv('gameover', 20000).catch(() => null);
  ok(over2 && over2.winnerId === C.id, 'D forfeits by leaving → C wins');
  C.s.close(); D.s.close();

  // ---------------------------------------------------------- game 3: echo trail
  console.log('\n📣 Game 3 — Echo Trail');
  const E = client('Elm'), F = client('Fir');
  await E.hello(); await F.hello();
  const r3 = await E.emit('room:create', { settings: { mode: 'classic', gimmick: 'echotrail', specialEvery: 2, lives: 3, fuseSec: 5, source: 'krillion' } });
  await F.emit('room:join', { code: r3.code });
  autoPlay(E, { stopAfter: 50 });
  await E.emit('room:start', {});
  const sp3 = await E.waitEv('special', 60000).catch(() => null);
  ok(sp3 && sp3.kind === 'echotrail', `echo round triggered from “${sp3?.from}”`);
  const ecat = await F.waitEv('category', 30000, (e) => e.reason === 'echo').catch(() => null);
  ok(!!ecat, ecat ? `echo category: “${ecat.category.prompt}” (${ecat.category.total} answers, via ${ecat.how})` : 'echo category generated');
  E.s.close(); F.s.close();

  // ---------------------------------------------------------- game 4: custom rules, live hints, trail length
  console.log('\n⚙️ Game 4 — custom rules, live autocorrect hints, trail length');
  const Gk = client('Ginkgo'), Kp = client('Kapok');
  await Gk.hello(); await Kp.hello();
  const rulesPack = { name: 'Rules test', categories: [
    { prompt: 'Name a fruit', golden: { answer: 'Durian' }, tiers: { kindling: ['Apple', 'Banana', 'Orange', 'Grape'], trailhead: ['Mango', 'Kiwi', 'Papaya', 'Peach'], backcountry: ['Lychee', 'Guava'], deepwoods: ['Rambutan'] } },
    { prompt: 'Name a colour', golden: { answer: 'Vermilion' }, tiers: { kindling: ['Red', 'Blue', 'Green', 'Yellow'], trailhead: ['Purple', 'Pink', 'Teal', 'Brown'], backcountry: ['Maroon', 'Indigo'], deepwoods: ['Puce'] } },
  ] };
  const r4R = await Gk.emit('room:create', { settings: { mode: 'classic', lives: 3, fuseSec: 12, trailMax: 2, genTrailMax: 0, tierFloor: 'kindling', moosePath: 'random', pickSec: 999, liveHints: true, revealLeftovers: false } });
  await Kp.emit('room:join', { code: r4R.code });
  await Gk.emit('room:pack', { pack: rulesPack });
  await sleep(300);
  const st4R = Gk.state?.settings || {};
  ok(st4R.trailMax === 2 && st4R.moosePath === 'random' && st4R.tierFloor === 'kindling', 'custom rules saved (trail length 2, random moose path, all tiers count)');
  ok(st4R.pickSec === 90, `out-of-range rules are clamped (pick time 999 → ${st4R.pickSec}s)`);
  const localR = (prompt) => { const d = rulesPack.categories.find((c) => c.prompt === prompt); return d ? Object.values(d.tiers).flat() : []; };
  const used4R = new Set();
  let catNowR = null;
  const answererR = (c, withHints) => {
    const prev = c.onEv;
    c.onEv = async (ev) => {
      prev?.(ev);
      if (ev.type === 'category') { catNowR = ev.category.prompt; used4R.clear(); }
      if (ev.type === 'accept') used4R.add(ev.answer.toLowerCase());
      if (ev.type === 'turn' && ev.pid === c.id) {
        const a = localR(catNowR || c.state?.game?.category?.prompt).find((x) => !used4R.has(x.toLowerCase()));
        if (!a) return;
        if (withHints && !c.hintChecked) {
          c.hintChecked = true;
          c.s.emit('typing', { text: a });
          await sleep(350);
          c.s.emit('typing', { text: a.slice(0, -1) + a.slice(-1).repeat(2) }); // a doubled-letter slip
          await sleep(350);
        }
        c.s.emit('typing', { text: a });
        await sleep(120);
        c.s.emit('submit', { text: a });
      }
    };
  };
  answererR(Gk, true); answererR(Kp, false);
  await Gk.emit('room:start', {});
  const limR = await Gk.waitEv('category', 60000, (e) => e.reason === 'limit').catch(() => null);
  ok(!!limR, limR ? `after 2 answers the moose moved to a fresh trail: “${limR.category.prompt}”` : 'trail length limit moved the moose on');
  ok(Gk.hints.some((h) => h.status === 'match'), 'live hint: exact answer shows ✓ to the holder');
  ok(Gk.hints.some((h) => h.status === 'fuzzy'), 'live hint: a typo shows the autocorrected answer');
  ok(!Kp.hints.some((h) => h.status === 'fuzzy'), 'hints are private to the holder (the other camper never saw the typo hint)');
  Gk.s.close(); Kp.s.close();

  // ---------------------------------------------------------- game 5: every turn is a special round
  console.log('\n🔁 Game 5 — every turn is a special round');
  const Hm = client('Hemlock'), Iw = client('Ironwood');
  await Hm.hello(); await Iw.hello();
  const r5 = await Hm.emit('room:create', { settings: { mode: 'classic', gimmick: 'echotrail', specialEvery: 0, lives: 3, fuseSec: 12 } });
  await Iw.emit('room:join', { code: r5.code });
  await Hm.emit('room:pack', { pack: rulesPack });
  await sleep(300);
  ok(Hm.state?.settings?.specialEvery === 0, 'a special round every turn can be selected');
  let answered5 = false;
  let cat5 = null;
  for (const c of [Hm, Iw]) {
    const prev = c.onEv;
    c.onEv = (ev) => {
      prev?.(ev);
      if (ev.type === 'category') cat5 = ev.category.prompt;
      if (ev.type === 'turn' && ev.pid === c.id && !answered5) {
        const a = localR(cat5 || c.state?.game?.category?.prompt)[0];
        if (a) { answered5 = true; c.s.emit('submit', { text: a }); }
      }
    };
  }
  await Hm.emit('room:start', {});
  const acc5 = await Hm.waitEv('accept', 30000).catch(() => null);
  const sp5 = await Hm.waitEv('special', 5000).catch(() => null);
  ok(!!acc5 && sp5?.kind === 'echotrail', sp5 ? `the accepted answer “${acc5.answer}” started a special round right away (echo of “${sp5.from}”)` : 'an accepted answer starts a special round');
  const after5 = Hm.events.slice(Hm.events.indexOf(acc5)).map((e) => e.type);
  ok(after5.indexOf('special') > 0 && (after5.indexOf('turn') < 0 || after5.indexOf('special') < after5.indexOf('turn')), 'the next camper waits for the special round (no turn starts in between)');
  ok(Hm.state?.game?.specialIn === 0, 'the HUD reports a special round every turn');
  const ecat5 = await Iw.waitEv('category', 30000, (e) => e.reason === 'echo').catch(() => null);
  ok(!!ecat5, ecat5 ? `mid-round echo trail carved: “${ecat5.category.prompt}”` : 'echo category generated mid-round');
  const turn5 = ecat5 ? await Iw.waitEv('turn', 10000, (e) => e.pid === Iw.id).catch(() => null) : null;
  ok(!!turn5, 'play resumes with the next camper on the new trail');
  Hm.s.close(); Iw.s.close();

  // ---------------------------------------------------------- quick play
  console.log('\n🥾 Quick Trek matchmaking');
  const Q1 = client('Quaking Aspen'), Q2 = client('Quince');
  await Q1.hello(); await Q2.hello();
  const q1 = await Q1.emit('room:quick', {});
  const q2 = await Q2.emit('room:quick', {});
  ok(q1.ok && q2.ok && q1.code === q2.code, `both matched into the same ranked party (${q1.code})`);
  await sleep(400);
  ok(Q1.state?.quick && Q1.state?.autoStartMs > 0, `auto-start countdown running (${Math.round((Q1.state?.autoStartMs || 0) / 1000)}s)`);
  const botTry = await Q1.emit('room:bot', { action: 'add' });
  ok(!botTry.ok, 'no bots allowed in ranked');
  Q1.s.close(); Q2.s.close();

  // ---------------------------------------------------------- duel: one bank, tie when cleared
  console.log('\n⚔️ Duel — one question bank, clear it for a tie');
  const H = client('Hickory'), J = client('Juniper');
  await H.hello(); await J.hello();
  const rd = await H.emit('room:create', { settings: { mode: 'duel', fuseSec: 8 } });
  await J.emit('room:join', { code: rd.code });
  const tiny = { name: 'Tiny trail', categories: [{ prompt: 'Name a primary color', golden: { answer: 'Red' }, tiers: { kindling: ['Blue', 'Yellow'], trailhead: [], backcountry: [], deepwoods: [] } }] };
  const sp = await H.emit('room:pack', { pack: tiny });
  ok(sp.ok, 'duel uses a one-category field guide');
  await sleep(200);
  ok(H.state?.settings?.maxPlayers === 2 && H.state?.settings?.mode === 'duel', 'duel locks the campsite to 2 seats');
  for (const c of [H, J]) {
    const answers = ['Blue', 'Yellow', 'Red'];
    const prev = c.onEv;
    c.onEv = (ev) => { prev?.(ev); if (ev.type === 'turn' && ev.pid === c.id) setTimeout(() => c.s.emit('submit', { text: answers.find((a) => !c.events.some((e) => e.type === 'accept' && e.answer === a)) }), 150); };
  }
  await H.emit('room:start', {});
  const tieOver = await H.waitEv('gameover', 30000).catch(() => null);
  ok(tieOver && tieOver.tie === true && tieOver.results.every((r) => r.placement === 1), 'whole bank hiked → the duel ends in a TIE');
  H.s.close(); J.s.close();

  console.log('\n⚔️ Quick 1v1 matchmaking');
  const D1 = client('Douglas'), D2 = client('Dogwood Jr');
  await D1.hello(); await D2.hello();
  const d1 = await D1.emit('room:quickduel', {});
  const d2 = await D2.emit('room:quickduel', {});
  ok(d1.ok && d2.ok && d1.code === d2.code, `both matched into the same duel (${d1.code})`);
  await sleep(400);
  ok(D1.state?.settings?.mode === 'duel' && D1.state?.autoStartMs > 0 && D1.state.autoStartMs <= 5000, `duel auto-starts in ${Math.round((D1.state?.autoStartMs || 0) / 1000)}s`);
  D1.s.close(); D2.s.close();

  // ---------------------------------------------------------- generators
  console.log('\n🧭 Generators');
  {
    const W = client('Wikiwoods');
    await W.hello();
    const tw = Date.now();
    const g1 = await W.emit('gen:category', { prompt: 'Name a dinosaur', reqId: 'w' });
    const n1 = g1.ok ? Object.values(g1.def.tiers).flat().length + (g1.def.golden ? 1 : 0) : 0;
    ok(g1.ok && n1 > 300 && g1.def.golden, g1.ok ? `“Name a dinosaur” → ${n1} answers via ${g1.how} in ${Date.now() - tw}ms (🦌 nichest: ${g1.def.golden?.answer})` : 'dinosaur generation: ' + g1.error);
    if (g1.ok) ok(g1.def.tiers.trailhead.length + g1.def.tiers.backcountry.length > 500, `middle tiers: ${g1.def.tiers.trailhead.length} Trailhead + ${g1.def.tiers.backcountry.length} Backcountry`);
    W.s.close();
  }
  const G = client('Ginkgo');
  await G.hello();
  const tg = Date.now();
  const gen = await G.emit('gen:category', { prompt: 'Name a pizza topping', reqId: 'x' });
  ok(gen.ok, gen.ok ? `category generated in ${Date.now() - tg}ms via ${gen.how}: ${Object.values(gen.def.tiers).flat().length + (gen.def.golden ? 1 : 0)} answers` : 'category generation: ' + gen.error);
  const bankDefs = [];
  G.s.on('bank:category', (d) => bankDefs.push(d.def));
  const done = new Promise((res) => { G.s.on('bank:done', res); G.s.on('bank:error', res); });
  const b = await G.emit('gen:bank', { topic: 'animals', count: 6, reqId: 'y' });
  ok(b.ok, 'topic bank started');
  const bd = await Promise.race([done, sleep(60000)]);
  ok(bd && !bd.error && bankDefs.length >= 3, `topic bank “animals”: ${bankDefs.length} categories (${bankDefs.slice(0, 4).map((d) => d.prompt).join(' / ')}…)`);
  const pack = { name: 'Test Guide', categories: [...bankDefs.slice(0, 3), { prompt: 'Name a primary color', golden: { answer: 'Red' }, tiers: { kindling: ['Blue', 'Yellow'], trailhead: [], backcountry: [], deepwoods: [] } }] };
  const r4 = await G.emit('room:create', { settings: {} });
  const setPack = await G.emit('room:pack', { pack });
  ok(setPack.ok && setPack.count === 4, 'custom field guide applied to room');
  G.s.close();

  console.log(failures ? `\n❌ ${failures} check(s) failed` : '\n✅ All trails clear!');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
