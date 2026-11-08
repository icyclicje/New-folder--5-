// Mivimoose Party — every sound is synthesized live with Web Audio:
// twig snaps, woodpecker knocks, cricket ticks, bird chirps, banjo plucks,
// owl hoots, elk bugles, wolf howls, crackling fire and a moose that goes POOF.

let ctx = null, master = null, sfxBus = null, ambBus = null, noiseBuf = null;
const prefs = { volume: 0.7, ambient: true, muted: false };
try { Object.assign(prefs, JSON.parse(localStorage.getItem('mivi-audio') || '{}')); } catch { /* private mode */ }

function savePrefs() { try { localStorage.setItem('mivi-audio', JSON.stringify(prefs)); } catch { /* ignore */ } }

function ensure() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = prefs.muted ? 0 : prefs.volume;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  ambBus = ctx.createGain(); ambBus.gain.value = 0.32; ambBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  if (prefs.ambient) startAmbient();
  return ctx;
}

// unlock on first gesture
['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => ensure(), { once: false, passive: true }));

const now = () => ctx.currentTime;

function env(gainNode, t, a, peak, d, sustain = 0.0001) {
  const g = gainNode.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
  g.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
}

function tone({ type = 'sine', f = 440, f2 = null, t = 0, a = 0.005, d = 0.2, peak = 0.3, bus = null, filter = null, q = 1, vib = 0, vibRate = 6 }) {
  if (!ensure()) return;
  bus = bus || sfxBus;
  const t0 = now() + t;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + a + d);
  const g = ctx.createGain();
  env(g, t0, a, peak, d);
  let node = o;
  if (vib) {
    const lfo = ctx.createOscillator(); const lg = ctx.createGain();
    lfo.frequency.value = vibRate; lg.gain.value = vib;
    lfo.connect(lg).connect(o.frequency); lfo.start(t0); lfo.stop(t0 + a + d + 0.05);
  }
  if (filter) {
    const f1 = ctx.createBiquadFilter(); f1.type = filter.type || 'lowpass'; f1.frequency.value = filter.f; f1.Q.value = q;
    node.connect(f1); node = f1;
  }
  node.connect(g).connect(bus);
  o.start(t0); o.stop(t0 + a + d + 0.05);
}

function noise({ t = 0, a = 0.002, d = 0.1, peak = 0.3, type = 'bandpass', f = 2000, f2 = null, q = 1, bus = null }) {
  if (!ensure()) return;
  bus = bus || sfxBus;
  const t0 = now() + t;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t0); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + a + d);
  const g = ctx.createGain();
  env(g, t0, a, peak, d);
  src.connect(fl).connect(g).connect(bus);
  src.start(t0, Math.random()); src.stop(t0 + a + d + 0.05);
}

// Karplus-Strong plucked string — campfire guitar / banjo
const pluckCache = new Map();
function pluck(freq, t = 0, peak = 0.35, bright = 0.5) {
  if (!ensure()) return;
  const key = Math.round(freq) + ':' + bright;
  let buf = pluckCache.get(key);
  if (!buf) {
    const sr = ctx.sampleRate, len = Math.floor(sr * 1.4);
    buf = ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / freq));
    const ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0;
    const decay = 0.996 - (1 - bright) * 0.004;
    for (let i = 0; i < len; i++) {
      const next = (idx + 1) % N;
      const v = decay * 0.5 * (ring[idx] + ring[next]);
      out[i] = ring[idx];
      ring[idx] = v;
      idx = next;
    }
    pluckCache.set(key, buf);
  }
  const t0 = now() + t;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain(); g.gain.value = peak;
  src.connect(g).connect(sfxBus); src.start(t0);
}

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

// ---------------------------------------------------------------- effects
export const sfx = {
  click() { noise({ f: 3200, q: 2, d: 0.035, peak: 0.25 }); noise({ t: 0.012, f: 1600, q: 3, d: 0.03, peak: 0.15 }); },
  hover() { noise({ f: 5000, q: 0.7, d: 0.05, peak: 0.04, type: 'highpass' }); },
  rustle() { for (let i = 0; i < 4; i++) noise({ t: i * 0.03, f: 3500 + Math.random() * 2500, q: 0.8, d: 0.04, peak: 0.06 }); },
  // woodpecker double-knock: your turn!
  yourTurn() {
    for (let i = 0; i < 3; i++) { noise({ t: i * 0.07, f: 1400, q: 6, d: 0.04, peak: 0.45 }); tone({ t: i * 0.07, f: 900, f2: 500, d: 0.05, peak: 0.25, type: 'triangle' }); }
    tone({ t: 0.25, f: NOTE(79), f2: NOTE(84), d: 0.12, peak: 0.12 });
  },
  turn() { noise({ f: 1100, q: 5, d: 0.05, peak: 0.2 }); },
  // cricket tick — speeds up near the end
  tick(urgent = false) {
    const f = urgent ? 5200 : 4400;
    for (let i = 0; i < (urgent ? 3 : 2); i++) tone({ t: i * 0.028, f, d: 0.018, peak: urgent ? 0.09 : 0.05, type: 'sine' });
  },
  heartbeat() { tone({ f: 70, f2: 45, d: 0.12, peak: 0.5 }); tone({ t: 0.16, f: 65, f2: 42, d: 0.1, peak: 0.35 }); },
  // fire crackle
  crackle(n = 3, peak = 0.12) { for (let i = 0; i < n; i++) noise({ t: Math.random() * 0.25, f: 1800 + Math.random() * 3000, q: 4, d: 0.015, peak: peak * (0.5 + Math.random()) }); },
  // accepted answers — nicher tiers get fancier
  accept(tier = 'kindling') {
    if (tier === 'golden') return this.golden();
    this.crackle(4, 0.1);
    const chirp = (t, f1, f2) => tone({ t, f: f1, f2, d: 0.07, peak: 0.12, type: 'sine' });
    if (tier === 'kindling') { chirp(0, 2600, 3600); }
    else if (tier === 'trailhead') { chirp(0, 2600, 3800); chirp(0.09, 3000, 4200); pluck(NOTE(67), 0.02, 0.25); }
    else if (tier === 'backcountry') { pluck(NOTE(62), 0, 0.3); pluck(NOTE(66), 0.07, 0.3); pluck(NOTE(69), 0.14, 0.32); chirp(0.2, 3000, 4400); }
    else if (tier === 'deepwoods') {
      // owl hoot + banjo roll
      tone({ f: 420, f2: 380, a: 0.04, d: 0.25, peak: 0.22, type: 'sine', vib: 6, vibRate: 5 });
      tone({ t: 0.35, f: 400, f2: 340, a: 0.05, d: 0.35, peak: 0.2, type: 'sine', vib: 5 });
      [62, 66, 69, 74].forEach((n, i) => pluck(NOTE(n), 0.05 + i * 0.06, 0.28, 0.7));
    }
  },
  // elk bugle + sparkle chime
  golden() {
    tone({ type: 'sawtooth', f: 380, f2: 1500, a: 0.18, d: 0.55, peak: 0.16, filter: { type: 'bandpass', f: 1300 }, q: 3, vib: 25, vibRate: 7 });
    tone({ t: 0.7, type: 'sawtooth', f: 1400, f2: 500, a: 0.02, d: 0.35, peak: 0.1, filter: { type: 'bandpass', f: 1100 }, q: 3 });
    [76, 79, 83, 88, 91].forEach((n, i) => tone({ t: 0.25 + i * 0.08, f: NOTE(n), d: 0.5, peak: 0.12, type: 'triangle' }));
    [55, 59, 62, 67].forEach((n, i) => pluck(NOTE(n), 0.3 + i * 0.05, 0.3, 0.8));
  },
  // wooden "tok" + froggy croak
  reject(reason) {
    noise({ f: 700, q: 4, d: 0.06, peak: 0.35 });
    tone({ f: 180, f2: 120, d: 0.12, peak: 0.25, type: 'square', filter: { type: 'lowpass', f: 900 } });
    if (reason === 'taken') tone({ t: 0.12, f: 150, f2: 110, d: 0.1, peak: 0.18, type: 'square', filter: { type: 'lowpass', f: 700 } });
  },
  // POOF: whoosh + feathers + moose bellow
  poof() {
    noise({ type: 'lowpass', f: 3000, f2: 200, a: 0.005, d: 0.6, peak: 0.7, q: 0.5 });
    noise({ type: 'bandpass', f: 900, f2: 300, a: 0.003, d: 0.25, peak: 0.6, q: 1 });
    tone({ f: 120, f2: 40, a: 0.005, d: 0.4, peak: 0.6, type: 'sine' });
    tone({ t: 0.35, type: 'sawtooth', f: 140, f2: 85, a: 0.06, d: 0.7, peak: 0.18, filter: { type: 'lowpass', f: 700 }, q: 6, vib: 4, vibRate: 9 });
  },
  // wolf howl for an elimination
  howl() {
    tone({ type: 'sine', f: 330, f2: 620, a: 0.5, d: 0.6, peak: 0.18, vib: 8, vibRate: 5 });
    tone({ t: 1.0, type: 'sine', f: 620, f2: 420, a: 0.05, d: 0.9, peak: 0.15, vib: 10, vibRate: 5 });
    tone({ type: 'triangle', f: 660, f2: 1240, a: 0.5, d: 0.6, peak: 0.04, vib: 8, vibRate: 5 });
  },
  // marshmallow sizzle + rising chime — extra life
  extraLife() {
    noise({ type: 'highpass', f: 4000, d: 0.5, peak: 0.12, a: 0.05 });
    [72, 76, 79, 84].forEach((n, i) => tone({ t: 0.1 + i * 0.09, f: NOTE(n), d: 0.3, peak: 0.14, type: 'triangle' }));
  },
  // axe chop — Leader's Pick
  chop() { noise({ f: 500, q: 1.5, d: 0.12, peak: 0.6 }); tone({ f: 160, f2: 60, d: 0.18, peak: 0.45 }); noise({ t: 0.05, f: 3500, q: 2, d: 0.05, peak: 0.2 }); },
  // canyon echo — Echo Trail
  echo() { for (let i = 0; i < 4; i++) tone({ t: i * 0.22, f: NOTE(81), f2: NOTE(76), d: 0.16, peak: 0.16 * Math.pow(0.55, i), type: 'triangle' }); },
  // log drum for countdowns
  drum(hi = false) { tone({ f: hi ? 220 : 140, f2: hi ? 160 : 90, d: 0.18, peak: 0.5 }); noise({ f: 600, q: 2, d: 0.05, peak: 0.25 }); },
  newCategory() { noise({ f: 2400, f2: 900, q: 1, d: 0.25, peak: 0.12, a: 0.05 }); tone({ t: 0.05, f: NOTE(74), d: 0.25, peak: 0.1, type: 'triangle' }); tone({ t: 0.13, f: NOTE(79), d: 0.3, peak: 0.1, type: 'triangle' }); },
  chat() { this.rustle(); },
  join() { tone({ f: NOTE(72), d: 0.12, peak: 0.1, type: 'triangle' }); tone({ t: 0.09, f: NOTE(79), d: 0.15, peak: 0.1, type: 'triangle' }); },
  // campfire song strum + loon call — victory
  win() {
    const chord = (notes, t) => notes.forEach((n, i) => pluck(NOTE(n), t + i * 0.025, 0.26, 0.6));
    chord([55, 59, 62, 67, 71], 0); chord([60, 64, 67, 72], 0.45); chord([62, 66, 69, 74], 0.9); chord([55, 59, 62, 67, 71, 79], 1.35);
    tone({ t: 1.9, f: NOTE(76), f2: NOTE(83), a: 0.15, d: 0.6, peak: 0.1, vib: 6, vibRate: 6 });
    tone({ t: 2.6, f: NOTE(83), f2: NOTE(79), a: 0.05, d: 0.8, peak: 0.08, vib: 6, vibRate: 6 });
  },
  lose() { [67, 64, 60, 55].forEach((n, i) => pluck(NOTE(n), i * 0.18, 0.25, 0.4)); },
};

// ---------------------------------------------------------------- ambience
let ambTimer = null;
function startAmbient() {
  if (!ctx || ambTimer) return;
  const loop = () => {
    if (!prefs.ambient || prefs.muted) { ambTimer = null; return; }
    // crickets
    if (Math.random() < 0.7) {
      const f = 4200 + Math.random() * 600;
      const t = Math.random() * 0.4;
      for (let i = 0; i < 3; i++) tone({ t: t + i * 0.035, f, d: 0.02, peak: 0.05, bus: ambBus });
    }
    // fire pops
    if (Math.random() < 0.6) noise({ t: Math.random() * 0.5, f: 1500 + Math.random() * 3500, q: 5, d: 0.012, peak: 0.12 + Math.random() * 0.12, bus: ambBus });
    // low crackle bed
    noise({ type: 'lowpass', f: 400, d: 0.6, a: 0.2, peak: 0.03, bus: ambBus });
    // rare owl
    if (Math.random() < 0.015) {
      tone({ f: 380, f2: 350, a: 0.05, d: 0.3, peak: 0.08, bus: ambBus, vib: 4 });
      tone({ t: 0.45, f: 370, f2: 330, a: 0.05, d: 0.45, peak: 0.07, bus: ambBus, vib: 4 });
    }
    ambTimer = setTimeout(loop, 450 + Math.random() * 300);
  };
  ambTimer = setTimeout(loop, 300);
}

export const audio = {
  prefs,
  setVolume(v) { prefs.volume = v; savePrefs(); if (master && !prefs.muted) master.gain.value = v; },
  setMuted(m) { prefs.muted = m; savePrefs(); if (master) master.gain.value = m ? 0 : prefs.volume; if (!m && prefs.ambient) { ensure(); startAmbient(); } },
  setAmbient(on) { prefs.ambient = on; savePrefs(); if (on) { ensure(); startAmbient(); } },
  unlock: ensure,
};
