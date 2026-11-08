'use strict';
// Trading Post catalog — cosmetics unlocked by wins, Golden Antler finds, or rating.
// Art for every id is drawn client-side in public/js/art.js.

const CATALOG = {
  mascot: [
    { id: 'fox', name: 'Fox', req: null },
    { id: 'raccoon', name: 'Raccoon', req: null },
    { id: 'beaver', name: 'Beaver', req: null },
    { id: 'bunny', name: 'Snowshoe Hare', req: null },
    { id: 'frog', name: 'Tree Frog', req: { wins: 1 } },
    { id: 'owl', name: 'Barn Owl', req: { wins: 3 } },
    { id: 'bear', name: 'Black Bear', req: { wins: 5 } },
    { id: 'otter', name: 'River Otter', req: { wins: 8 } },
    { id: 'skunk', name: 'Skunk', req: { wins: 12 } },
    { id: 'wolf', name: 'Grey Wolf', req: { wins: 16 } },
    { id: 'lynx', name: 'Lynx', req: { wins: 22 } },
    { id: 'moose', name: 'Mini Mivimoose', req: { wins: 35 } },
  ],
  hat: [
    { id: 'none', name: 'Bare Head', req: null },
    { id: 'beanie', name: 'Knit Beanie', req: { wins: 1 } },
    { id: 'bandana', name: 'Trail Bandana', req: { wins: 2 } },
    { id: 'ranger', name: 'Ranger Hat', req: { wins: 4 } },
    { id: 'flowers', name: 'Wildflower Crown', req: { wins: 6 } },
    { id: 'headlamp', name: 'Headlamp', req: { wins: 9 } },
    { id: 'coonskin', name: 'Coonskin Cap', req: { wins: 13 } },
    { id: 'lumberjack', name: 'Lumberjack Cap', req: { wins: 18 } },
    { id: 'bucket', name: 'Fishing Bucket Hat', req: { wins: 24 } },
    { id: 'antlers', name: 'Antler Headband', req: { wins: 32 } },
    { id: 'pinecrown', name: 'Pinecone Crown', req: { wins: 45 } },
    { id: 'goldantlers', name: 'Golden Antlers', req: { goldens: 10 } },
  ],
  banner: [
    { id: 'pine', name: 'Pine Green', req: null, color: '#2f6b3a' },
    { id: 'birch', name: 'Birch Bark', req: null, color: '#cfc4a8' },
    { id: 'maple', name: 'Autumn Maple', req: { wins: 2 }, color: '#c4512b' },
    { id: 'lake', name: 'Glacier Lake', req: { wins: 5 }, color: '#2b7fa8' },
    { id: 'ember', name: 'Campfire Ember', req: { wins: 10 }, color: '#e8792b' },
    { id: 'aurora', name: 'Northern Lights', req: { wins: 20 }, color: 'aurora' },
    { id: 'starry', name: 'Starry Night', req: { wins: 30 }, color: 'starry' },
    { id: 'gold', name: 'Golden Lodge', req: { rating: 1600 }, color: 'gold' },
  ],
};

function isUnlocked(item, profile) {
  if (!item.req) return true;
  if (!profile) return false;
  if (item.req.wins != null && (profile.wins || 0) < item.req.wins) return false;
  if (item.req.goldens != null && (profile.goldens || 0) < item.req.goldens) return false;
  if (item.req.rating != null && (profile.peakRating || profile.rating || 0) < item.req.rating) return false;
  return true;
}

function unlockedIds(profile) {
  const out = new Set();
  for (const type of Object.keys(CATALOG)) for (const it of CATALOG[type]) if (isUnlocked(it, profile)) out.add(type + ':' + it.id);
  return out;
}

function sanitizeEquip(equip, profile) {
  const cur = { mascot: 'fox', hat: 'none', banner: 'pine', ...(profile?.equipped || {}) };
  const out = { ...cur };
  for (const type of Object.keys(CATALOG)) {
    const want = equip?.[type];
    const item = CATALOG[type].find((i) => i.id === want);
    if (item && isUnlocked(item, profile)) out[type] = item.id;
  }
  return out;
}

module.exports = { CATALOG, isUnlocked, unlockedIds, sanitizeEquip };
