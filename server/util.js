'use strict';
const crypto = require('crypto');

const randId = (bytes = 8) => crypto.randomBytes(bytes).toString('hex');

const CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'; // no vowels => no accidental words
function roomCode(len = 4) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return s;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const CTRL_RE = new RegExp('[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]', 'g');
function cleanText(s, max) {
  if (typeof s !== 'string') return '';
  // strip control chars, collapse whitespace
  return s.replace(CTRL_RE, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
const stripTags = (s) => s.replace(/<!--.*?-->/g, '').replace(/<[^>]*>/g, '');

// ---------- answer normalization ----------
const WORD_NUM = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' };

const FOLD = { ø: 'o', Ø: 'o', æ: 'ae', Æ: 'ae', œ: 'oe', Œ: 'oe', ß: 'ss', ł: 'l', Ł: 'l', đ: 'd', Đ: 'd', þ: 'th', Þ: 'th', ð: 'd', ı: 'i' };
function normalize(s) {
  return String(s)
    .replace(/[øØæÆœŒßłŁđĐþÞðı]/g, (c) => FOLD[c])
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’‘`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}

function singular(w) {
  if (w.length <= 3) return w;
  if (/(ss|us|is|ous)$/.test(w)) return w;
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (/(ches|shes|xes|zes|sses|oes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
}

// Common abbreviations people type (applied to both answers and guesses).
const ABBR = { st: 'saint', ste: 'sainte', mt: 'mount', mtn: 'mountain', ft: 'fort', dr: 'doctor', mr: 'mister', mrs: 'missus', jr: 'junior', sr: 'senior', vs: 'versus', v: 'versus', n: 'and', pt: 'point', ave: 'avenue', bros: 'brother', bro: 'brother', no: 'number', intl: 'international', natl: 'national', univ: 'university', hwy: 'highway', lk: 'lake', is: 'island' };

function wordList(s) {
  const n = normalize(s);
  if (!n) return [];
  const words = n.split(' ');
  return words.map((w, i) => {
    if (ABBR[w] && !(w === 'is' && words.length < 3) && !(w === 'no' && i === 0) && !(w === 'v' && words.length < 3)) w = ABBR[w];
    return WORD_NUM[w] || singular(w);
  });
}

// Canonical matching key: normalized, abbreviations expanded, each word singularized, spaces removed.
function answerKey(s) {
  return wordList(s).join('');
}

// "fusilli" ≈ "fusili": collapse doubled letters
const squashKey = (k) => k.replace(/(.)\1+/g, '$1');

// Sound-alike key (Metaphone-flavoured): "Tchaikovsky" ≈ "Chaikovsky", "Filadelfia" ≈ "Philadelphia"
function phoneticKey(k) {
  let s = k.replace(/[^a-z]/g, '');
  if (s.length < 4) return '';
  s = s.replace(/^(kn|gn|pn|wr|ps)/, (m) => m[1])
    .replace(/ph/g, 'f').replace(/ght/g, 't').replace(/gh/g, 'g').replace(/th/g, '0')
    .replace(/tch/g, '1').replace(/sch/g, 'sk').replace(/ch/g, '1').replace(/sh/g, '1')
    .replace(/dg(?=[eiy])/g, 'j').replace(/ck/g, 'k').replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k')
    .replace(/q/g, 'k').replace(/x/g, 'ks').replace(/z/g, 's').replace(/wh/g, 'w').replace(/v/g, 'f');
  s = s[0] + s.slice(1).replace(/[aeiouyhw]/g, '');
  return s.replace(/(.)\1+/g, '$1');
}

// Keyboard-aware typo distance: neighbouring keys, vowel swaps, doubled letters
// and transpositions all count as "half mistakes".
const KB_ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const KB_POS = {};
KB_ROWS.forEach((r, y) => [...r].forEach((c, x) => { KB_POS[c] = [x + y * 0.4, y]; }));
const VOWELS = new Set('aeiouy');
function subCost(a, b) {
  if (a === b) return 0;
  const p = KB_POS[a], q = KB_POS[b];
  if (p && q && Math.abs(p[0] - q[0]) <= 1.2 && Math.abs(p[1] - q[1]) <= 1) return 0.55;
  if (VOWELS.has(a) && VOWELS.has(b)) return 0.65;
  return 1;
}
function typoDistance(a, b, max = 3) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max * 2) return max + 1;
  let prev2 = null;
  let prev = new Float32Array(lb + 1), cur = new Float32Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  let lastRowMin = 0;
  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    let rowMin = i;
    const ca = a[i - 1];
    for (let j = 1; j <= lb; j++) {
      const cb = b[j - 1];
      const del = prev[j] + (i > 1 && a[i - 2] === ca ? 0.4 : 1);
      const ins = cur[j - 1] + (j > 1 && b[j - 2] === cb ? 0.4 : 1);
      let v = Math.min(del, ins, prev[j - 1] + subCost(ca, cb));
      if (prev2 && i > 1 && j > 1 && ca === b[j - 2] && a[i - 2] === cb) v = Math.min(v, prev2[j - 2] + 0.6);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    // a swap in the next row can still undo this row's cost, so look two rows back before giving up
    if (rowMin > max && lastRowMin + 0.6 > max) return max + 1;
    lastRowMin = rowMin;
    prev2 = prev.slice();
    [prev, cur] = [cur, prev];
  }
  return prev[lb];
}

/** How many "mistakes" autocorrect forgives for a guess of this length. */
function typoBudget(len, strength = 'strong') {
  if (strength === 'off') return 0;
  if (strength === 'gentle') return len < 5 ? 0 : len < 9 ? 1 : 2;
  if (len <= 2) return 0;
  if (len === 3) return 0.65;
  if (len <= 5) return 1.05;
  if (len <= 8) return 1.6;
  if (len <= 12) return 2.3;
  return Math.min(3.5, len * 0.2);
}

// Damerau-Levenshtein (optimal string alignment) with early exit.
function editDistance(a, b, max = 3) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev2 = null, prev = new Array(lb + 1), cur = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev.slice();
    [prev, cur] = [cur, prev];
  }
  return prev[lb];
}

// words that carry little meaning when comparing category prompts
const STOP = new Set('name a an the of in on at to for from with by and or any some something someone somebody that which who you your can could would might type kind sort famous popular one thing things word words often commonly typically well known'.split(' '));
function promptTokens(prompt) {
  return normalize(prompt).split(' ').filter((w) => w && !STOP.has(w)).map(singular);
}
function promptSimilarity(a, b) {
  const A = new Set(promptTokens(a)), B = new Set(promptTokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

function polishPrompt(p) {
  let s = cleanText(p, 120).replace(/[.?!\s]+$/, '');
  if (!s) return s;
  if (!/^name\b/i.test(s)) {
    const lower = s[0].toLowerCase() + s.slice(1);
    s = /^(a|an|the|something|someone|any)\b/i.test(lower) ? `Name ${lower}` : `Name a ${lower}`;
    s = s.replace(/^Name a ([aeiou])/i, 'Name an $1');
  }
  return s[0].toUpperCase() + s.slice(1);
}

module.exports = {
  randId, roomCode, shuffle, pick, clamp, cleanText, decodeEntities, stripTags,
  normalize, answerKey, wordList, squashKey, phoneticKey, typoDistance, typoBudget, editDistance, promptTokens, promptSimilarity, polishPrompt,
};
