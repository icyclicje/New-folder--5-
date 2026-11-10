// Mivimoose Party — the campsite game view.
import { $, $$, esc, toast, modal, tierVar, bannerStyle } from './ui.js';
import { sfx } from './sfx.js';
import { mascotSVG, mooseSVG, stumpSVG } from './art.js';
import { icon } from './icons.js';

const TIER_ICON = { kindling: icon('log'), trailhead: icon('boot'), backcountry: icon('tent'), deepwoods: icon('pine'), golden: icon('antler') };
const LIFE = icon('life');
const LOST = icon('ember');
const TIER_NAME = { kindling: 'Kindling', trailhead: 'Trailhead', backcountry: 'Backcountry', deepwoods: 'Deep Woods', golden: 'Golden Antler' };
const REJECT_TEXT = {
  taken: (e) => `🚫 "${e.answer}" was already hiked by ${e.by || 'someone'}!`,
  unknown: () => '🌫️ Not on the trail map.',
  'too-common': (e) => `🪵 "${e.answer}" is Kindling — too easy for the Deep Woods!`,
  'judge-error': () => '📡 The ranger could not check that one — try another.',
};
// [icon, colour] confetti sets
const PARTICLES = [['leaf', '#e9a23b'], ['maple', '#ef6a2e'], ['leaf', '#9fd97f'], ['maple', '#d9482f'], ['sparkles', '#ffd36a'], ['feather', '#efe3c8'], ['acorn', '#c48a52']];
const GOLDEN_FX = [['sparkles', '#ffe58a'], ['star', '#ffcf4a'], ['antler', '#ffd66e'], ['sparkles', '#fff3c4']];
const DEEP_FX = [['pine', '#9fd97f'], ['leaf', '#4fd3c6'], ['sparkles', '#b9a2ff']];

export class GameView {
  constructor(app) {
    this.app = app;
    this.mounted = false;
    this.seatEls = new Map();
    this.layoutKey = '';
    this.timer = { pid: null, end: 0, total: 1, paused: false, hidden: false, start: 0, turnId: 0 };
    this.lastSec = null;
    this.raf = null;
    this.typingSent = 0;
    this.typingTimer = null;
    this.lastHintAt = 0;
    this.mooseAt = { x: 50, y: 40 };
    this.overlayKey = '';
    this.reveal = null;
    this.genInfo = null;
    this.bound = false;
    $('#moose-inner').innerHTML = mooseSVG();
  }

  get me() { return this.app.me?.id; }
  get state() { return this.app.room; }

  // ------------------------------------------------------------ lifecycle
  mount() {
    this.mounted = true;
    if (!this.bound) this.bind();
    this.loop();
    setTimeout(() => $('#answer-input').focus(), 50);
  }

  unmount() {
    this.mounted = false;
    cancelAnimationFrame(this.raf);
    this.seatEls.clear();
    $('#seats').innerHTML = '';
    this.layoutKey = '';
    this.hideOverlay();
  }

  bind() {
    this.bound = true;
    const input = $('#answer-input');
    input.addEventListener('input', () => { this.sendTyping(); if (!input.value.trim()) this.setHint(null); });
    $('#answer-form').addEventListener('submit', (e) => { e.preventDefault(); this.submit(); });
    $$('.sidebar .tab').forEach((t) => t.addEventListener('click', () => {
      sfx.click();
      $$('.sidebar .tab').forEach((x) => x.classList.toggle('active', x === t));
      $$('.sidebar .tab-body').forEach((b) => b.classList.toggle('active', b.id === 'tab-' + t.dataset.tab));
    }));
    $('#sidebar-toggle').addEventListener('click', () => { sfx.click(); $('#sidebar').classList.remove('open'); });
    $('#hud').addEventListener('click', (e) => { if (e.target.closest('[data-radio]')) { sfx.click(); $('#sidebar').classList.toggle('open'); } });
    // type anywhere → goes into the answer box
    document.addEventListener('keydown', (e) => {
      if (!this.mounted || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if ($('#modal-root').children.length) return;
      if (e.key.length === 1 || e.key === 'Backspace') this.focusAnswer();
    });
  }

  focusAnswer() {
    const inp = $('#answer-input');
    if (document.activeElement !== inp) inp.focus({ preventScroll: true });
    const n = inp.value.length;
    try { if (inp.selectionStart === 0 && inp.selectionEnd === 0 && n) inp.setSelectionRange(n, n); } catch { /* ignore */ }
  }

  /** Live autocorrect / ranger preview under the answer box (holder only). */
  onHint(h) {
    if (!this.isMyTurn()) return this.setHint(null);
    const cur = $('#answer-input').value.trim().toLowerCase();
    if (!h || h.status === 'none' || (h.text && h.text.trim().toLowerCase() !== cur)) return this.setHint(null);
    this.setHint(h);
  }

  setHint(h) {
    const el = $('#answer-hint');
    if (!el) return;
    if (!h) { el.className = 'answer-hint'; el.innerHTML = ''; return; }
    const txt = {
      match: () => `✓ <b>${esc(h.answer)}</b>`,
      fuzzy: () => `✨ Autocorrect → <b>${esc(h.answer)}</b>`,
      verified: () => `🧭 Ranger verified <b>${esc(h.answer)}</b>`,
      checking: () => '🧭 Ranger checking…',
      taken: () => `🚫 <b>${esc(h.answer)}</b> already hiked${h.by ? ' by ' + esc(h.by) : ''}`,
      banned: () => `🪵 <b>${esc(h.answer)}</b> is ${TIER_NAME[h.tier] || 'too common'} — banned here`,
    }[h.status];
    if (!txt) return this.setHint(null);
    el.className = 'answer-hint show ' + h.status;
    el.innerHTML = txt();
  }

  isMyTurn() {
    const g = this.state?.game;
    return !!g && (g.stage === 'turn' || g.stage === 'judging') && g.turn?.pid === this.me;
  }

  sendTyping(force = false) {
    if (!this.isMyTurn()) return;
    const now = performance.now();
    clearTimeout(this.typingTimer);
    const emit = () => { this.typingSent = performance.now(); this.app.socket.emit('typing', { text: $('#answer-input').value }); };
    if (force || now - this.typingSent > 60) emit();
    else this.typingTimer = setTimeout(emit, 60);
  }

  submit() {
    const input = $('#answer-input');
    const text = input.value.trim();
    if (!text) return;
    const g = this.state?.game;
    if (!this.isMyTurn()) {
      if (performance.now() - this.lastHintAt > 1500) {
        this.lastHintAt = performance.now();
        toast(g?.stage === 'turn' ? '✋ Hold your answer — the moose isn\'t at your stump yet!' : '✋ Not your turn yet — keep it ready!');
      }
      input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake');
      return;
    }
    if (g.stage === 'judging') return;
    this.lastSubmitted = text;
    this.app.socket.emit('submit', { text });
  }

  // ------------------------------------------------------------ state render
  update(s) {
    if (!this.mounted || !s.game) {
      if (s.phase === 'ended' && !s.game) return;
    }
    const g = s.game;
    if (!g) return;
    this.renderSeats(s);
    this.renderSign(g);
    this.renderHud(s);
    this.renderMe(s);
    this.renderLog(g);
    this.renderOverlay(s);
    // timer resync
    if (g.turn) {
      const t = this.timer;
      const remainLocal = t.end - performance.now();
      if (t.turnId !== g.turn.id || Math.abs(remainLocal - g.turn.remainingMs) > 350 || t.paused !== g.turn.paused) {
        this.setTimer(g.turn.pid, g.turn.id, g.turn.remainingMs, g.turn.totalMs, g.turn.hidden, g.turn.paused, t.turnId !== g.turn.id);
      }
      if (g.stage === 'turn' || g.stage === 'judging') this.moveMooseTo(g.turn.pid);
    }
    if (g.stage === 'intro' || g.stage === 'picking' || g.stage === 'generating') this.moveMooseHome();
    const bar = $('#answer-bar');
    const mine = this.isMyTurn();
    bar.classList.toggle('myturn', mine);
    bar.classList.toggle('wait', !mine);
    const meP = s.players.find((p) => p.id === this.me);
    bar.classList.toggle('spectating', !meP || meP.spectator || (!meP.alive && g.stage !== 'over'));
    const narrow = innerWidth < 520;
    $('#answer-input').placeholder = !meP || meP.spectator ? (narrow ? '👀 Watching — join next game' : '👀 Watching from the treeline — you\'ll join next game')
      : !meP.alive ? (narrow ? '👻 Out — cheer them on!' : '👻 Out of the woods — cheer from the ghost log!')
      : mine ? (narrow ? '🔥 Your turn — type & Enter!' : '🔥 YOUR TURN — type an answer and hit Enter!')
      : (narrow ? 'Pre-type your answer…' : 'Pre-type your answer… the moose is coming');
  }

  layout(s) {
    const g = s.game;
    const order = g.order;
    const N = order.length;
    const myIdx = Math.max(0, order.indexOf(this.me));
    const pos = new Map();
    order.forEach((pid, i) => {
      const a = Math.PI / 2 + ((i - myIdx) * 2 * Math.PI) / N;
      const narrow = innerWidth < 820;
      pos.set(pid, { x: 50 + (narrow ? 37 : 40) * Math.cos(a), y: 52 + (narrow ? 29 : 30) * Math.sin(a) });
    });
    return pos;
  }

  renderSeats(s) {
    const g = s.game;
    const cat = this.app.catalog;
    const key = g.order.join(',') + '|' + this.me + '|' + (innerWidth < 820);
    const seats = $('#seats');
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      seats.innerHTML = '';
      this.seatEls.clear();
      this.positions = this.layout(s);
      for (const pid of g.order) {
        const el = document.createElement('div');
        el.className = 'seat' + (pid === this.me ? ' mine' : '');
        el.dataset.pid = pid;
        el.innerHTML = `<div class="bubble last hidden"></div><div class="bubble typing hidden"></div>
          <div class="stump"><svg class="ring hidden" viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="44"/><circle class="fg" cx="50" cy="50" r="44" pathLength="100" stroke-dasharray="100" stroke-dashoffset="0"/></svg>
          <span class="crown hidden">${icon('crown')}</span><span class="ghost">${icon('ghost')}</span><span class="mascot-slot"></span>${stumpSVG()}</div>
          <div class="plate"></div><div class="lives"></div><div class="meter"><i></i></div><div class="wrongs"></div>`;
        const p = this.positions.get(pid);
        el.style.left = p.x + '%';
        el.style.top = p.y + '%';
        seats.appendChild(el);
        this.seatEls.set(pid, el);
      }
    }
    const byId = new Map(s.players.map((p) => [p.id, p]));
    for (const pid of g.order) {
      const p = byId.get(pid);
      const el = this.seatEls.get(pid);
      if (!p || !el) continue;
      const slot = el.querySelector('.mascot-slot');
      const look = p.equipped.mascot + '/' + p.equipped.hat;
      if (slot.dataset.look !== look) { slot.dataset.look = look; slot.innerHTML = mascotSVG(p.equipped.mascot, p.equipped.hat); }
      el.classList.toggle('dead', !p.alive);
      el.classList.toggle('off', !p.connected || p.left);
      el.classList.toggle('active', !!g.turn && g.turn.pid === pid && (g.stage === 'turn' || g.stage === 'judging'));
      const plate = el.querySelector('.plate');
      const bs = bannerStyle(p.equipped.banner, cat);
      plate.className = `plate ${bs.cls} ${pid === this.me ? 'me' : ''}`;
      plate.setAttribute('style', bs.style);
      plate.textContent = `${p.isBot ? '🐾 ' : ''}${p.name}${p.left ? ' (left)' : !p.connected ? ' 📡' : ''}`;
      plate.title = `${p.name} · ${p.score} pts`;
      // lives
      let lives = '';
      for (let i = 0; i < p.maxLives; i++) lives += `<span class="life ${i < p.lives ? '' : 'lost'}">${i < p.lives ? LIFE : LOST}</span>`;
      el.querySelector('.lives').innerHTML = p.alive ? lives : `<small>#${p.placement ?? '–'}</small>`;
      // meter
      const meter = el.querySelector('.meter');
      const goal = s.settings.extraLifeGoal;
      meter.classList.toggle('hidden', !s.settings.extraLives || !p.alive);
      meter.classList.toggle('max', p.lives >= p.maxLives);
      meter.querySelector('i').style.width = Math.min(100, (p.meter / goal) * 100) + '%';
      meter.title = p.lives >= p.maxLives ? 'Max lives!' : `Marshmallow: ${p.meter}/${goal}`;
      // last answer bubble
      const last = el.querySelector('.bubble.last');
      const typingVisible = !el.querySelector('.bubble.typing').classList.contains('hidden');
      if (p.lastAnswer && !typingVisible) {
        last.classList.remove('hidden');
        last.style.setProperty('--tc', tierVar(p.lastAnswer.tier));
        last.innerHTML = `${TIER_ICON[p.lastAnswer.tier] || ''}${esc(p.lastAnswer.text)}`;
      } else last.classList.add('hidden');
      // wrong guesses
      const isTurn = g.turn?.pid === pid && (g.stage === 'turn' || g.stage === 'judging');
      el.querySelector('.wrongs').innerHTML = isTurn ? (p.wrong || []).map((w) => `<span class="${w.reason === 'taken' ? 'taken' : w.reason === 'too-common' ? 'toocommon' : ''}">${esc(w.text)}</span>`).join('') : '';
      // crown for leader's pick
      // the crown marks the leader; when campers take turns carving, an axe marks whoever carves next
      const crown = el.querySelector('.crown');
      const badge = g.nextPicker ? 'axe' : 'crown';
      if (crown.dataset.badge !== badge) { crown.dataset.badge = badge; crown.innerHTML = icon(badge); crown.title = badge === 'axe' ? 'Carves the next trail sign' : 'In the lead'; }
      crown.classList.toggle('hidden', !(((g.nextPicker || g.leaderId) === pid) && p.alive));
      if (!isTurn) this.hideTyping(pid);
    }
  }

  renderSign(g) {
    const c = g.category;
    const mode = this.app.catalog.modes[this.state.settings.mode];
    if (!c) { $('#cat-prompt').textContent = g.stage === 'intro' ? 'Gathering firewood…' : '…'; $('#cat-src').textContent = ''; $('#tier-chips').innerHTML = ''; return; }
    if (this.signId !== c.id || $('#cat-prompt').textContent !== c.prompt) {
      this.signId = c.id;
      $('#cat-prompt').textContent = c.prompt;
      const sign = $('#trail-sign');
      sign.classList.remove('swing'); void sign.offsetWidth; sign.classList.add('swing');
    }
    $('#cat-src').innerHTML = `${esc(c.sourceLabel || c.source)}${c.total ? ` · <b class="count-tick">${c.total.toLocaleString()}</b> answers across 5 tiers` : ''}${c.complete === false ? ' · <span class="scouting"><span class="spin">🧭</span> ranger still scouting deeper…</span>' : ''}`;
    const minIdx = ['kindling', 'trailhead', 'backcountry', 'deepwoods', 'golden'].indexOf(g.minTier || mode.minTier || 'kindling');
    $('#tier-chips').innerHTML = ['kindling', 'trailhead', 'backcountry', 'deepwoods', 'golden'].map((t, i) =>
      `<span class="tier-chip ${i < minIdx ? 'banned' : ''}" style="--tc:${tierVar(t)}" title="${TIER_NAME[t]}">${TIER_ICON[t]} ${TIER_NAME[t]} <span class="n">${(c.counts?.[t] ?? 0).toLocaleString()}</span></span>`).join('');
  }

  renderHud(s) {
    const g = s.game;
    const cat = this.app.catalog;
    const mode = cat.modes[s.settings.mode];
    const lim = s.settings.roundLimit;
    let html = `<span class="pill">${mode.icon} ${esc(mode.name)} · Round <b>${g.round}</b>${lim && !g.duel ? ` of ${lim}` : ''}</span>`;
    if (s.settings.gimmick !== 'none') {
      const gm = cat.gimmicks[s.settings.gimmick];
      const n = g.specialIn;
      const every = s.settings.specialEvery;
      const label = every === 0 ? '<b>every turn</b>' : every === 1 ? '<b>every round</b>' : n === 0 ? 'now!' : `in <b>${n}</b> round${n === 1 ? '' : 's'}`;
      html += `<span class="pill">${gm.icon} ${esc(gm.name)} ${label}${g.echoFrom && s.settings.gimmick === 'echotrail' ? ` · echo: “${esc(g.echoFrom)}”` : ''}</span>`;
    }
    if (g.ranked) html += '<span class="pill">🏅 <b>Ranked</b></span>';
    if (g.duel) html += `<span class="pill duel-pill">⚔️ One-bank duel · <b>${g.remaining ?? '?'}</b> answers left${g.category?.complete === false ? ' (+ still scouting)' : ''} — clear it and it's a tie</span>`;
    else html += `<span class="pill">🗺️ <b>${g.used}</b> answers hiked${g.trailLeft != null ? ` · new trail in <b>${g.trailLeft}</b>` : ''}</span>`;
    html += '<button class="pill hud-radio" data-radio>📻 Radio & Trail Log</button>';
    // the host can call it a night (not in ranked games, which play to the last camper)
    if (s.hostId === this.me && !g.ranked && !s.quick && g.stage !== 'over') html += '<button class="pill hud-end" data-endgame title="End the game now — standings by lives, then points">🌙 End game</button>';
    $('#hud').innerHTML = html;
    $('#hud [data-endgame]')?.addEventListener('click', () => this.confirmEnd());
    // the same option in the sidebar, which no overlay covers (intro, a long Leader's Pick)
    const canEnd = s.hostId === this.me && !g.ranked && !s.quick && g.stage !== 'over';
    $('#sidebar-foot').classList.toggle('hidden', !canEnd);
    const eb = $('#btn-endgame');
    if (eb && !eb.dataset.bound) { eb.dataset.bound = '1'; eb.addEventListener('click', () => this.confirmEnd()); }
  }

  confirmEnd() {
    sfx.click();
    const m = modal({ title: 'End the game?', html: `<p class="muted" style="margin-top:0">Everyone still standing is ranked by lives, then points. Campers dead level on both share the win.</p>
      <div class="fg-row" style="justify-content:flex-end"><button class="btn btn-ghost" data-keep>Keep playing</button><button class="btn btn-fire" data-end>🌙 End game</button></div>` });
    m.body.querySelector('[data-keep]').addEventListener('click', () => { sfx.click(); m.close(); });
    m.body.querySelector('[data-end]').addEventListener('click', () => {
      sfx.click();
      this.app.socket.emit('room:end', {}, (res) => { if (res && !res.ok && res.error) toast(res.error, 'err'); });
      m.close();
    });
  }

  renderMe(s) {
    const p = s.players.find((x) => x.id === this.me);
    const el = $('#me-status');
    if (!p) { el.innerHTML = ''; return; }
    let lives = '';
    for (let i = 0; i < p.maxLives; i++) lives += `<span class="life ${i < p.lives ? '' : 'lost'}">${i < p.lives ? LIFE : LOST}</span>`;
    const goal = s.settings.extraLifeGoal;
    const meter = s.settings.extraLives && p.alive
      ? `<div class="me-meter">🍡 ${p.lives >= p.maxLives ? 'Max lives!' : `${p.meter}/${goal}`}<div class="meter ${p.lives >= p.maxLives ? 'max' : ''}"><i style="width:${Math.min(100, (p.meter / goal) * 100)}%"></i></div></div>` : '';
    el.innerHTML = `${mascotSVG(p.equipped.mascot, p.equipped.hat)}<div><div class="me-lives">${p.spectator ? '👀' : p.alive ? lives : '👻'}</div>${meter}<div class="me-meter">${p.score} pts</div></div>`;
  }

  renderLog(g) {
    const ol = $('#trail-log');
    const items = g.log.slice().reverse().map((l) =>
      `<li style="--tc:${tierVar(l.tier)}"><span>${TIER_ICON[l.tier]} <b>${esc(l.text)}</b><small>${esc(l.name)} · ${TIER_NAME[l.tier]}</small></span><b class="pts">+${l.pts}</b></li>`);
    let html = '';
    if (g.category) html += `<li class="log-head">🪧 ${esc(g.category.prompt)}</li>`;
    html += items.join('') || '<li class="muted" style="border:0;background:none">No answers on this trail yet.</li>';
    if (this.reveal && this.reveal.prompt !== g.category?.prompt) {
      html += `<li class="log-head">🔦 Left on the last trail (${esc(this.reveal.prompt)})</li>` + this.reveal.items.map((r) =>
        `<li class="reveal" style="--tc:${tierVar(r.tier)}"><span>${TIER_ICON[r.tier]} ${esc(r.text)}${r.note ? `<small>${esc(r.note)}</small>` : ''}</span><small>${TIER_NAME[r.tier]}</small></li>`).join('');
    }
    ol.innerHTML = html;
  }

  // ------------------------------------------------------------ overlays
  showOverlay(key, html) {
    const ov = $('#stage-overlay');
    let fresh = false;
    if (this.overlayKey !== key) {
      this.overlayKey = key;
      ov.innerHTML = `<div class="overlay-card panel">${html}</div>`;
      fresh = true;
    }
    ov.classList.add('show');
    return { ov, fresh };
  }
  hideOverlay() { this.overlayKey = ''; const ov = $('#stage-overlay'); ov.classList.remove('show'); ov.innerHTML = ''; }

  renderOverlay(s) {
    const g = s.game;
    const byId = new Map(s.players.map((p) => [p.id, p]));
    if (g.stage === 'intro') {
      this.showOverlay('intro', `<div class="big">🔥 Lighting the campfire…</div><div class="count" id="intro-count">3</div><div class="muted">Pre-type answers anytime — hit Enter when the moose reaches you!</div>`);
      return;
    }
    if (g.stage === 'picking' && g.special) {
      const leader = byId.get(g.special.leaderId);
      if (g.special.leaderId === this.me) {
        const by = this.state.settings.pickBy;
        const { fresh } = this.showOverlay('pick-me-' + (this.pickRound = g.round), `<div class="big">🪓 ${by === 'rotate' ? 'Your turn to carve!' : by === 'random' ? 'The ranger picked you!' : 'You have the most lives!'}</div>
          <p class="muted">Carve the next category onto the trail sign — the ranger scouts answers on the fly.</p>
          <form id="pick-form" class="fg-row"><input id="pick-input" maxlength="90" placeholder="e.g. Name a pizza topping" autocomplete="off"><button class="btn btn-fire" type="submit">Carve it 🪓</button></form>
          <div class="suggest-chips" id="pick-sugg"></div>
          <div class="timer-bar"><i id="pick-timer"></i></div>`);
        if (fresh) {
          const inp = $('#pick-input');
          setTimeout(() => inp.focus(), 50);
          const chips = (list) => {
            $('#pick-sugg').innerHTML = list.map((x) => `<button type="button" data-p="${esc(x)}">${esc(x)}</button>`).join('');
            $$('#pick-sugg [data-p]').forEach((b) => b.addEventListener('click', () => { sfx.chop(); this.app.socket.emit('leader:pick', { text: b.dataset.p }); }));
          };
          chips(g.special.suggestions || []);
          let st = null;
          const send = (text) => { if (text.trim().length >= 3) { sfx.chop(); this.app.socket.emit('leader:pick', { text: text.trim() }); } };
          inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(inp.value); } });
          inp.addEventListener('input', () => {
            this.app.socket.emit('typing', { text: inp.value });
            clearTimeout(st);
            st = setTimeout(() => {
              if (inp.value.trim().length < 2) return chips(g.special?.suggestions || []);
              this.app.socket.emit('suggest', { q: inp.value }, (list) => chips((list || []).map((x) => x.prompt).slice(0, 6)));
            }, 220);
          });
          $('#pick-form').addEventListener('submit', (e) => { e.preventDefault(); send(inp.value); });
        }
        this.pickDeadline = performance.now() + (g.special.remainingMs || 0);
        this.pickTotal = g.special.totalMs || 40000;
      } else {
        this.showOverlay('pick-' + g.special.leaderId, `<div class="big">🪓 ${esc(leader?.name || 'The leader')} is carving the next trail sign…</div>
          <div class="carving" id="carving"><span id="carving-text"></span><span class="caret"></span></div>
          <div class="timer-bar"><i id="pick-timer"></i></div><p class="muted">${{ rotate: "Leader's Pick — everyone takes a turn carving.", random: "Leader's Pick — a random camper carves each time." }[this.state.settings.pickBy] || "Leader's Pick — the camper in the lead names the category!"}</p>`);
        this.pickDeadline = performance.now() + (g.special.remainingMs || 0);
        this.pickTotal = g.special.totalMs || 40000;
      }
      return;
    }
    if (g.stage === 'generating' && g.special) {
      const { ov } = this.showOverlay('gen-' + (g.special.generating || ''), `<div class="compass">🧭</div>
        <div class="big">${g.special.type === 'echotrail' ? `📣 “${esc(g.special.from || '')}” echoes…` : '🌲 Scouting the trail…'}</div>
        <p class="muted" id="gen-prompt">${esc(g.special.generating || '')}</p>
        <div class="gen-count" id="gen-count">0</div><div class="muted">answers found — the round starts the moment there are enough</div>
        <div class="gen-tiers" id="gen-tiers"></div><div class="muted gen-meta" id="gen-meta"></div>`);
      this.onGenProgress(this.genInfo || { count: 0, counts: {} }); // draw the (empty) tier columns right away
      return ov;
    }
    this.hideOverlay();
  }

  onGenProgress(d) {
    this.genInfo = d;
    const c = $('#gen-count');
    if (!c) return;
    c.textContent = (d.count ?? 0).toLocaleString();
    if (d.prompt) $('#gen-prompt').textContent = d.prompt;
    const counts = d.counts || {};
    const max = Math.max(1, ...Object.values(counts));
    // live tier columns: watch the middle tiers fill up
    $('#gen-tiers').innerHTML = ['kindling', 'trailhead', 'backcountry', 'deepwoods', 'golden'].map((t) =>
      `<div class="gen-col" style="--tc:${tierVar(t)}"><i style="height:${Math.max(4, ((counts[t] || 0) / max) * 100)}%"></i><b>${(counts[t] || 0).toLocaleString()}</b><span>${TIER_ICON[t]}</span></div>`).join('');
    const SRC = { ai: '🧭 AI ranger', wikidata: '🌐 Wikidata', wikipedia: '📒 Wikipedia', web: '🌐 web search', approx: '🧭 best guess' };
    const src = (d.sources || []).map((s) => SRC[s] || s).join(' + ');
    const meta = $('#gen-meta');
    if (meta) meta.textContent = `${src ? src + ' · ' : ''}${d.ms ? (d.ms / 1000).toFixed(1) + 's' : ''}`;
  }

  // ------------------------------------------------------------ typing
  onTyping({ pid, text, carving }) {
    if (carving) { const el = $('#carving-text'); if (el) el.textContent = text; return; }
    if (pid === this.me) return;
    const el = this.seatEls.get(pid);
    if (!el) return;
    const b = el.querySelector('.bubble.typing');
    b.classList.remove('hidden', 'judging');
    b.innerHTML = `${esc(text)}<span class="caret"></span>`;
    el.querySelector('.bubble.last').classList.add('hidden');
  }

  hideTyping(pid) {
    const el = this.seatEls.get(pid);
    if (!el) return;
    el.querySelector('.bubble.typing').classList.add('hidden');
  }

  // ------------------------------------------------------------ timer + moose
  setTimer(pid, turnId, remainingMs, totalMs, hidden, paused, isNew) {
    this.timer = { pid, turnId, end: performance.now() + remainingMs, total: totalMs, hidden, paused: !!paused, start: isNew ? performance.now() : this.timer.start, remainingAtPause: remainingMs };
    this.lastSec = null;
  }

  seatPos(pid) { return this.positions?.get(pid); }

  /** The moose stands BESIDE the active stump (inner side), facing its camper — never on top of them. */
  moveMooseTo(pid) {
    const p = this.seatPos(pid);
    if (!p) return;
    const arena = $('#arena');
    const seatEl = this.seatEls.get(pid);
    const aw = arena?.clientWidth || 1000, ah = arena?.clientHeight || 600;
    const seatW = seatEl?.offsetWidth || 100;
    const mooseW = $('#moose')?.offsetWidth || 120;
    const side = Math.abs(p.x - 50) < 3 ? (p.y > 50 ? -1 : 1) : p.x < 50 ? 1 : -1;
    const dx = ((seatW * 0.5 + mooseW * 0.5) / aw) * 100;
    const tx = Math.max(7, Math.min(93, p.x + side * dx));
    const ty = Math.max(30, Math.min(92, p.y + (seatW * 0.42 / ah) * 100));
    this.placeMoose(tx, ty, side > 0 ? 'left' : 'right');
  }

  moveMooseHome() { this.placeMoose(innerWidth < 820 ? 30 : 38, 64, 'right'); } // waits beside the fire

  placeMoose(x, y, face) {
    const m = $('#moose');
    if (Math.abs(x - this.mooseAt.x) < 0.5 && Math.abs(y - this.mooseAt.y) < 0.5) return;
    m.classList.toggle('flip', x > this.mooseAt.x);
    m.classList.add('running');
    clearTimeout(this.runT);
    this.runT = setTimeout(() => {
      m.classList.remove('running');
      if (face) m.classList.toggle('flip', face === 'right'); // turn to face the camper once arrived
    }, 460);
    this.mooseAt = { x, y };
    m.style.left = x + '%';
    m.style.top = y + '%';
  }

  setTimerText(key) {
    if (this.timerKey === key) return;
    this.timerKey = key;
    $('#moose-timer').innerHTML = key === 'paused' ? icon('compass') : esc(key);
  }

  loop() {
    if (!this.mounted) return;
    this.raf = requestAnimationFrame(() => this.loop());
    const g = this.state?.game;
    const m = $('#moose');
    const timerEl = $('#moose-timer');
    if (!g) return;
    // intro countdown
    if (g.stage === 'intro') {
      const c = $('#intro-count');
      if (c) {
        const left = Math.max(0, (this.introEnd || 0) - performance.now());
        const n = Math.ceil(left / 1000);
        if (c.dataset.n !== String(n)) { c.dataset.n = String(n); c.innerHTML = n ? String(n) : icon('fire'); if (n > 0) sfx.drum(n === 1); }
      }
    }
    // leader pick timer bar
    const pt = $('#pick-timer');
    if (pt && this.pickDeadline) pt.style.transform = `scaleX(${Math.max(0, (this.pickDeadline - performance.now()) / this.pickTotal)})`;

    const active = g.turn && (g.stage === 'turn' || g.stage === 'judging');
    if (!active) {
      m.style.setProperty('--puff', '0');
      m.classList.remove('danger', 'critical');
      if (this.mooseTinted) { this.mooseTinted = false; m.style.removeProperty('--moose-hi'); m.style.removeProperty('--moose-lo'); }
      this.setTimerText('');
      for (const el of this.seatEls.values()) el.querySelector('.ring').classList.add('hidden');
      return;
    }
    const t = this.timer;
    const remaining = t.paused ? t.remainingAtPause : Math.max(0, t.end - performance.now());
    let puff;
    if (t.hidden) {
      const el = (performance.now() - t.start) / 1000;
      puff = Math.min(0.9, 0.12 + 0.75 * (1 - Math.exp(-el / 7))) + Math.sin(performance.now() / 180) * 0.04;
      this.setTimerText('?');
      timerEl.classList.remove('hot');
    } else {
      puff = 1 - remaining / t.total;
      const secs = Math.ceil(remaining / 1000);
      this.setTimerText(t.paused ? 'paused' : String(secs));
      timerEl.classList.toggle('hot', remaining < 3000);
      m.classList.toggle('danger', remaining < 3000 && !t.paused);
      m.classList.toggle('critical', remaining < 1200 && !t.paused);
    }
    m.style.setProperty('--puff', puff.toFixed(3));
    // chocolate brown at rest → flushed red when it's about to poof
    const r = Math.round(154 + 101 * puff), gg = Math.round(100 - 8 * puff), b = Math.round(59 + 11 * puff);
    m.style.setProperty('--moose-hi', `rgb(${r},${gg},${b})`);
    m.style.setProperty('--moose-lo', `rgb(${Math.round(90 + 110 * puff)},${Math.round(54 - 14 * puff)},${Math.round(29 + puff)})`);
    this.mooseTinted = true;
    // ring on active seat
    for (const [pid, el] of this.seatEls) {
      const ring = el.querySelector('.ring');
      if (pid !== t.pid || t.hidden) { ring.classList.add('hidden'); continue; }
      ring.classList.remove('hidden');
      ring.classList.toggle('hot', remaining < 3000);
      ring.querySelector('.fg').setAttribute('stroke-dashoffset', String(100 - (remaining / t.total) * 100));
    }
    // ticking
    if (!t.paused) {
      const sec = t.hidden ? Math.floor((performance.now() - t.start) / 1000) : Math.ceil(remaining / 1000);
      if (sec !== this.lastSec) {
        if (this.lastSec !== null) {
          const urgent = !t.hidden && sec <= 3;
          sfx.tick(urgent);
          if (urgent && t.pid === this.me) sfx.heartbeat();
        }
        this.lastSec = sec;
      }
    }
  }

  // ------------------------------------------------------------ events
  arenaPoint(pid) {
    const p = this.seatPos(pid);
    return p ? { x: p.x, y: p.y - 6 } : { x: 50, y: 40 };
  }

  floatText(pid, html, tier) {
    const pt = this.arenaPoint(pid);
    const el = document.createElement('div');
    el.className = 'float-pts';
    el.style.cssText = `left:${pt.x}%;top:${pt.y}%;--tc:${tierVar(tier)}`;
    el.innerHTML = html;
    $('#fx').appendChild(el);
    setTimeout(() => el.remove(), 1700);
  }

  burst(x, y, n = 26, set = PARTICLES) {
    const fx = $('#fx');
    for (let i = 0; i < n; i++) {
      const p = document.createElement('span');
      p.className = 'particle';
      const ang = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * 160;
      p.style.cssText = `left:${x}%;top:${y}%;--dx:${Math.cos(ang) * dist}px;--dy:${Math.sin(ang) * dist - 30}px;--rot:${Math.random() * 720 - 360}deg;--life:${0.8 + Math.random() * 0.7}s`;
      const [name, colour] = set[Math.floor(Math.random() * set.length)];
      p.style.color = colour;
      p.innerHTML = icon(name);
      fx.appendChild(p);
      setTimeout(() => p.remove(), 1600);
    }
  }

  handleEvent(ev) {
    const s = this.state;
    switch (ev.type) {
      case 'gamestart':
        this.introEnd = performance.now() + (ev.introMs || 3000);
        this.reveal = null;
        this.mooseAt = { x: -1, y: -1 };
        this.moveMooseHome();
        sfx.crackle(8, 0.2);
        break;
      case 'category':
        sfx.newCategory();
        this.genInfo = null;
        for (const pid of this.seatEls.keys()) this.hideTyping(pid);
        if (ev.reason === 'leader') toast(`🪓 ${ev.by || 'The leader'} carved: “${ev.category.prompt}”${ev.ms != null ? ` — ready in ${(ev.ms / 1000).toFixed(1)}s` : ''}`, 'good');
        if (ev.reason === 'echo') toast(`📣 “${ev.from}” echoed into: ${ev.category.prompt}`, 'good');
        break;
      case 'turn': {
        const mine = ev.pid === this.me;
        this.setTimer(ev.pid, ev.turnId, ev.remainingMs, ev.totalMs, ev.hidden, false, true);
        this.moveMooseTo(ev.pid);
        this.setHint(null);
        if (mine) {
          sfx.yourTurn();
          const inp = $('#answer-input');
          const chat = $('#chat-input');
          // don't yank focus away from a half-written radio message
          if (!(document.activeElement === chat && chat.value.trim())) this.focusAnswer();
          if (inp.value.trim()) this.sendTyping(true);
        } else sfx.turn();
        break;
      }
      case 'resume':
        this.setTimer(ev.pid, ev.turnId, ev.remainingMs, ev.totalMs, this.timer.hidden, false, false);
        break;
      case 'judging': {
        const el = this.seatEls.get(ev.pid);
        if (el) { const b = el.querySelector('.bubble.typing'); b.classList.remove('hidden'); b.classList.add('judging'); b.textContent = `🧭 Ranger checking “${ev.text}”…`; }
        this.timer.paused = true;
        this.timer.remainingAtPause = Math.max(0, this.timer.end - performance.now());
        break;
      }
      case 'accept': {
        this.hideTyping(ev.pid);
        sfx.accept(ev.tier);
        this.floatText(ev.pid, `+${ev.pts}<small>${TIER_ICON[ev.tier]} ${TIER_NAME[ev.tier]}${ev.fuzzy ? ' (close enough!)' : ''}</small>`, ev.tier);
        const pt = this.arenaPoint(ev.pid);
        if (ev.tier === 'deepwoods' || ev.tier === 'golden') this.burst(pt.x, pt.y, 12, ev.tier === 'golden' ? GOLDEN_FX : DEEP_FX);
        if (ev.tier === 'golden') {
          const who = s?.players.find((p) => p.id === ev.pid);
          const el = document.createElement('div');
          el.className = 'golden-banner';
          el.innerHTML = `<b>🦌 GOLDEN ANTLER! 🦌</b>${esc(who?.name || '')} found <b style="font-size:1.3rem;display:inline">${esc(ev.answer)}</b>${ev.note ? `<i>${esc(ev.note)}</i>` : ''}`;
          $('#fx').appendChild(el);
          setTimeout(() => el.remove(), 4300);
        }
        if (ev.lifeGained) { setTimeout(() => { sfx.extraLife(); this.floatText(ev.pid, '+1 🔥 life!', 'golden'); }, 500); }
        if (ev.pid === this.me) {
          const inp = $('#answer-input');
          // only clear what was submitted — keep anything typed since (pre-typing the next one)
          if (!inp.value.trim() || inp.value.trim().toLowerCase() === String(ev.typed || '').trim().toLowerCase()) inp.value = '';
          this.setHint(null);
          inp.classList.add('good');
          setTimeout(() => inp.classList.remove('good'), 400);
          if (ev.fuzzy) toast(`✨ Autocorrected “${ev.typed}” → ${ev.answer}`, 'good');
          else if (ev.judged) toast(`🧭 The ranger verified “${ev.answer}” — it wasn't even on the map!`, 'good');
        }
        break;
      }
      case 'goldenmoved':
        toast('🦌 The ranger found something nichier — the Golden Antler wandered deeper into the woods…');
        sfx.echo();
        break;
      case 'reject': {
        sfx.reject(ev.reason);
        if (ev.pid === this.me) {
          const inp = $('#answer-input');
          inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake');
          // keep the text so a typo can be fixed with one keystroke
          const fn = REJECT_TEXT[ev.reason];
          if (fn && ev.reason !== 'unknown') toast(fn(ev), 'err');
        }
        break;
      }
      case 'pop': {
        const m = $('#moose');
        m.classList.remove('danger', 'critical');
        m.classList.add('poof');
        sfx.poof();
        const stage = $('#stage');
        stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake');
        const x = this.mooseAt.x, y = this.mooseAt.y - 6;
        this.burst(x, y, 34);
        const pt = document.createElement('div');
        pt.className = 'poof-text';
        pt.style.cssText = `left:${x}%;top:${y}%`;
        pt.textContent = 'POOF!';
        $('#fx').appendChild(pt);
        setTimeout(() => pt.remove(), 1400);
        this.hideTyping(ev.pid);
        if (ev.eliminated) setTimeout(() => sfx.howl(), 650);
        if (ev.pid === this.me) toast(ev.eliminated ? `💥 Your moose popped — you're out! Placed #${ev.placement}.` : `💥 POOF! You lost a life (${ev.lives} left).`, 'err');
        this.reveal = { prompt: ev.prompt, items: ev.reveal || [] };
        setTimeout(() => {
          m.classList.remove('poof');
          this.mooseAt = { x: -1, y: -1 };
          this.moveMooseHome();
          m.classList.add('reform');
          setTimeout(() => m.classList.remove('reform'), 700);
        }, 900);
        if (s?.game) this.renderLog(s.game);
        break;
      }
      case 'forfeit': {
        const who = s?.players.find((p) => p.id === ev.pid);
        if (who) toast(`🎒 ${who.name} hiked home early.`);
        break;
      }
      case 'special':
        if (ev.kind === 'leaderpick') sfx.chop(); else sfx.echo();
        break;
      case 'generating':
        this.genInfo = null;
        break;
      case 'gameover': {
        const won = ev.winnerId === this.me;
        if (won) sfx.win(); else sfx.lose();
        this.app.openResults(ev);
        break;
      }
      case 'lobby':
        break;
      default:
    }
  }
}
