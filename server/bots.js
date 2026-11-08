'use strict';
// Critter bots — fill out custom campsites for practice. Never allowed in ranked.

const LEVELS = {
  cub: { name: 'Cub', think: [0.35, 0.9], fail: 0.22, wrong: 0.3, weights: { kindling: 6, trailhead: 3, backcountry: 1, deepwoods: 0.25, golden: 0.02 } },
  ranger: { name: 'Ranger', think: [0.2, 0.65], fail: 0.1, wrong: 0.18, weights: { kindling: 3, trailhead: 4, backcountry: 3, deepwoods: 1, golden: 0.06 } },
  legend: { name: 'Legend', think: [0.1, 0.42], fail: 0.04, wrong: 0.08, weights: { kindling: 0.6, trailhead: 2, backcountry: 4, deepwoods: 4, golden: 0.2 } },
};

const BOT_NAMES = ['Mossy', 'Pinecone', 'Birchwood', 'Fernando', 'Acorn', 'Juniper', 'Cedar', 'Thistle', 'Bramble', 'Hazel', 'Willow', 'Sprout', 'Clover', 'Sage', 'Nutmeg', 'Chipper'];
const BOT_MASCOTS = ['fox', 'raccoon', 'beaver', 'bunny', 'frog', 'owl', 'bear', 'otter', 'skunk', 'wolf', 'lynx'];
const BOT_HATS = ['none', 'beanie', 'bandana', 'ranger', 'flowers', 'headlamp', 'coonskin', 'lumberjack', 'bucket'];
const BOT_BANNERS = ['pine', 'birch', 'maple', 'lake', 'ember'];
const GIBBERISH = ['umm', 'uhh', 'wait', 'hmm', 'stick', 'tree?', 'rock'];

const rand = (a, b) => a + Math.random() * (b - a);

function makeBot(level, taken) {
  const free = BOT_NAMES.filter((n) => !taken.has(n));
  const name = free.length ? free[Math.floor(Math.random() * free.length)] : 'Critter' + Math.floor(Math.random() * 99);
  return {
    name,
    botLevel: LEVELS[level] ? level : 'ranger',
    equipped: {
      mascot: BOT_MASCOTS[Math.floor(Math.random() * BOT_MASCOTS.length)],
      hat: BOT_HATS[Math.floor(Math.random() * BOT_HATS.length)],
      banner: BOT_BANNERS[Math.floor(Math.random() * BOT_BANNERS.length)],
    },
  };
}

/** Schedule a bot's actions for its current turn. */
function botTakeTurn(room, bot, turnId) {
  const g = room.game;
  if (!g) return;
  const L = LEVELS[bot.botLevel] || LEVELS.ranger;
  const ref = g.turn.hidden ? 9000 : g.turn.totalMs;
  const alive = () => room.game === g && g.turn.id === turnId && (g.stage === 'turn');

  if (Math.random() < L.fail) {
    // freeze up: type something hopeless, never submit
    room.setT(() => { if (alive()) room.relayTyping(bot.id, GIBBERISH[Math.floor(Math.random() * GIBBERISH.length)]); }, ref * 0.4);
    return;
  }
  const think = ref * rand(L.think[0], L.think[1]);
  const minRank = room.minTierRank();
  const weights = { ...L.weights };
  for (const [t, r] of Object.entries({ kindling: 0, trailhead: 1, backcountry: 2, deepwoods: 3, golden: 4 })) if (r < minRank) weights[t] = 0;

  const typeOut = (text, at, done) => {
    const steps = Math.min(text.length, 8);
    for (let i = 1; i <= steps; i++) {
      room.setT(() => { if (alive()) room.relayTyping(bot.id, text.slice(0, Math.ceil((text.length * i) / steps))); }, at + i * 70);
    }
    room.setT(() => { if (alive()) done(); }, at + steps * 70 + 120);
  };

  let t = think;
  if (Math.random() < L.wrong) {
    // a wrong / repeated guess first
    const used = g.log.length ? g.log[Math.floor(Math.random() * g.log.length)].text : GIBBERISH[Math.floor(Math.random() * GIBBERISH.length)];
    const at = Math.max(300, t * 0.5);
    typeOut(used, at, () => room.handleSubmit(bot.id, used));
    t = at + 900 + Math.random() * 800;
  }
  room.setT(() => {
    if (!alive()) return;
    const entry = g.category.sampleUnused(g.usedEntries, weights);
    if (!entry || (weights[entry.tier] ?? 0) === 0) return; // stumped → pop
    typeOut(entry.name, 0, () => room.handleSubmit(bot.id, entry.name));
  }, t);
}

module.exports = { LEVELS, makeBot, botTakeTurn };
