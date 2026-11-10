'use strict';
// Shared game constants: tiers, modes, gimmicks, defaults.

// Five tiers — same count and point ladder as Krillion's rarity system,
// re-skinned for the campsite.
const TIERS = [
  { key: 'kindling',    name: 'Kindling',      pts: 10,  color: '#d9b77e', icon: '🪵', blurb: 'The first thing everyone tosses on the fire.' },
  { key: 'trailhead',   name: 'Trailhead',     pts: 30,  color: '#8fcf6a', icon: '🥾', blurb: 'A well-worn path — plenty of hikers get here.' },
  { key: 'backcountry', name: 'Backcountry',   pts: 60,  color: '#46b3b0', icon: '🏕️', blurb: 'Off the beaten path. Only some campers find it.' },
  { key: 'deepwoods',   name: 'Deep Woods',    pts: 85,  color: '#9b7bea', icon: '🌲', blurb: 'Genuinely obscure. Most campers never wander this far.' },
  { key: 'golden',      name: 'Golden Antler', pts: 100, color: '#ffcc3d', icon: '🦌', blurb: 'The single nichest answer on the trail — and it can wander deeper as the ranger keeps scouting.' },
];
const TIER_BY_KEY = Object.fromEntries(TIERS.map((t, i) => [t.key, { ...t, rank: i }]));

// Krillion tier slug -> our tier key
const KRILLION_TIER_MAP = {
  plankton: 'kindling',
  schooler: 'trailhead',
  rare: 'backcountry',
  deepcut: 'deepwoods',
  krillion: 'golden',
};

// Base modes. Every mode is symmetric: same fuse rules for every seat,
// random first holder, fixed clockwise order.
const MODES = {
  classic: {
    name: 'Campfire Classic',
    icon: '🔥',
    desc: 'The original. A visible fuse every turn — answer before the moose poofs. New category after every poof.',
    fuse: 'turn', fuseSec: 12, lives: 2, extraLives: true, rotateEvery: 0, minTier: 'kindling',
  },
  mystery: {
    name: 'Mystery Fuse',
    icon: '❓',
    desc: 'A hidden fuse burns for the whole round. Nobody knows when the moose will blow — pass it fast!',
    fuse: 'hidden', fuseSec: 30, lives: 2, extraLives: true, rotateEvery: 0, minTier: 'kindling',
  },
  wildfire: {
    name: 'Wildfire',
    icon: '🌋',
    desc: 'The fuse gets shorter with every pass until someone pops. Fresh category every 10 answers.',
    fuse: 'shrink', fuseSec: 14, lives: 2, extraLives: true, rotateEvery: 10, minTier: 'kindling',
  },
  deepwoods: {
    name: 'Deep Woods',
    icon: '🌲',
    desc: 'Kindling answers are banned — too easy! Only Trailhead or nicher counts. Longer fuse to think.',
    fuse: 'turn', fuseSec: 16, lives: 2, extraLives: true, rotateEvery: 0, minTier: 'trailhead',
  },
  trailmix: {
    name: 'Trail Mix',
    icon: '🥜',
    desc: 'A brand-new category on every single turn. Stay sharp!',
    fuse: 'turn', fuseSec: 13, lives: 2, extraLives: true, rotateEvery: 1, minTier: 'kindling',
  },
  duel: {
    name: 'Duel (1v1)',
    icon: '⚔️',
    desc: 'Two campers, ONE question bank for the whole match. Trade answers until someone poofs — hike the entire bank and it is a tie.',
    fuse: 'turn', fuseSec: 10, lives: 1, extraLives: false, rotateEvery: 0, minTier: 'kindling', duel: true,
  },
  lonewolf: {
    name: 'Lone Wolf',
    icon: '🐺',
    desc: 'One life. No extra lives. Sudden death around the fire.',
    fuse: 'turn', fuseSec: 10, lives: 1, extraLives: false, rotateEvery: 0, minTier: 'kindling',
  },
};

// Gimmicks layer on top of any mode. Special rounds fire every N poofs, every round (1) or every turn (0).
const GIMMICKS = {
  none: { name: 'No Gimmick', icon: '🏕️', desc: 'Just the classic loop.' },
  leaderpick: {
    name: "Leader's Pick",
    icon: '🪓',
    desc: 'On each special round a camper carves a brand-new category onto the trail sign — the one with the most lives, everyone in turn, or someone at random (your call) — and answers are generated on the fly.',
  },
  echotrail: {
    name: 'Echo Trail',
    icon: '📣',
    desc: 'On each special round the last answer guessed echoes into the next category, so the trail keeps branching.',
  },
};

const SOURCES = {
  krillion: { name: 'Krillion Dailies', desc: 'Real daily prompts with thousands of tiered answers (default).' },
  campfire: { name: 'Campfire Classics', desc: 'Hand-built camping & outdoors categories.' },
  mixed: { name: 'Trail Mix (Both)', desc: 'Krillion dailies and Campfire Classics shuffled together.' },
  custom: { name: 'My Field Guide', desc: 'Your own categories — handmade or AI-generated.' },
};

const DEFAULT_SETTINGS = {
  mode: 'classic',
  gimmick: 'none',
  specialEvery: 3,
  source: 'krillion',
  maxPlayers: 8,
  lives: 2,
  fuseSec: 12,
  extraLives: true,
  extraLifeGoal: 400,
  typoTolerance: 'strong', // autocorrect: off | gentle | strong
  aiJudge: true,
  isPublic: false,
  duelTrail: '',
  customPack: null,
  // --- custom campsite rules ---
  pickSec: 40, // Leader's Pick: seconds to carve a custom category
  roundLimit: 0, // game length: 0 = last camper standing, N = the game ends after round N (standings by lives, then points)
  pickBy: 'leader', // Leader's Pick: who carves — leader (most lives) | rotate (everyone takes turns) | random
  genTrailMax: 14, // custom / generated trails move on after this many answers (0 = until a poof)
  trailMax: 0, // EVERY trail moves on after this many answers (0 = until a poof)
  tierFloor: 'auto', // auto (mode decides) | kindling | trailhead | backcountry — the most common tier that still counts
  moosePath: 'clockwise', // clockwise | random — where the moose runs after a good answer
  goldenLife: false, // finding a Golden Antler heals one lost life
  showTyping: true, // everyone sees the holder's live typing
  revealLeftovers: true, // show unfound answers after a poof
  liveHints: true, // the holder sees autocorrect / ranger previews while typing
};

// Ranges for the numeric custom rules (shared by server validation and the lobby UI).
const SETTING_RANGES = {
  pickSec: [15, 90, 5],
  genTrailMax: [0, 40, 2],
  roundLimit: [0, 30, 1],
  trailMax: [0, 40, 2],
};

const LIMITS = {
  minPlayers: 2,
  maxPlayers: 8,
  nameMax: 18,
  chatMax: 200,
  answerMax: 48,
  promptMax: 90,
  customPackMaxCategories: 60,
  customPackMaxAnswers: 6000,
};

const RANKS = [
  { min: -Infinity, name: 'Tenderfoot', icon: '🌱' },
  { min: 900, name: 'Camper', icon: '⛺' },
  { min: 1100, name: 'Trailblazer', icon: '🥾' },
  { min: 1250, name: 'Park Ranger', icon: '🎖️' },
  { min: 1400, name: 'Wilderness Guide', icon: '🧭' },
  { min: 1600, name: 'Legend of the Lodge', icon: '🦌' },
];
function rankFor(rating) {
  let r = RANKS[0];
  for (const k of RANKS) if (rating >= k.min) r = k;
  return r;
}

module.exports = {
  TIERS, TIER_BY_KEY, KRILLION_TIER_MAP, MODES, GIMMICKS, SOURCES,
  DEFAULT_SETTINGS, SETTING_RANGES, LIMITS, RANKS, rankFor,
};
