// Mivimoose Party — app controller: connection, profile, screens, lobby.
import { $, $$, esc, toast, modal, store, copyText, bannerStyle, closeAllModals } from './ui.js';
import { sfx, audio } from './sfx.js';
import { mascotSVG, mooseSVG, campfireSVG, forestSVG, starsSVG, emblemSVG, markSVG, installTextures } from './art.js';
import { installIcons, icon } from './icons.js';
import { GameView } from './game.js';
import { openTradingPost, openLeaderboard, openHowTo, openResults } from './menus.js';
import { openFieldGuide, packForRoom } from './editor.js';

export const app = {
  socket: null,
  me: null, // public profile
  token: store.get('mivi-token', ''),
  catalog: null,
  status: null,
  room: null, // latest snapshot
  screen: 'home',
  game: null,
  sfx,
};
window.__mivi = app; // handy for debugging in the console

// ---------------------------------------------------------------- boot
function decorate() {
  installTextures();
  installIcons();
  $('#bg').innerHTML = forestSVG();
  $('#stars').innerHTML = starsSVG();
  $('#brand-mark').innerHTML = markSVG();
  $('#hero-emblem').innerHTML = emblemSVG();
  $('#hero-moose').innerHTML = mooseSVG();
  const ff = $('#fireflies');
  for (let i = 0; i < 18; i++) {
    const f = document.createElement('div');
    f.className = 'firefly';
    const r = () => `${Math.round(Math.random() * 160 - 80)}px`;
    f.style.cssText = `left:${Math.random() * 100}%;top:${40 + Math.random() * 60}%;--x1:${r()};--y1:${r()};--x2:${r()};--y2:${r()};--x3:${r()};--y3:${r()};--dur:${10 + Math.random() * 12}s;--blink:${2 + Math.random() * 3}s;animation-delay:${-Math.random() * 10}s,${-Math.random() * 3}s`;
    ff.appendChild(f);
  }
  $('#campfire').innerHTML = campfireSVG();
}

async function loadCatalog() {
  const [cat, st] = await Promise.all([fetch('/api/catalog').then((r) => r.json()), fetch('/api/status').then((r) => r.json()).catch(() => null)]);
  app.catalog = cat;
  app.status = st;
  renderStatus();
}

function renderStatus() {
  const st = app.status;
  if (!st) return;
  const k = st.krillion;
  const map = k.prompts
    ? `🗺️ Trail map: <b>${k.prompts.toLocaleString()}</b> Krillion prompts from <b>${k.days}</b> dailies${k.crawling ? ' <span class="muted">(still unrolling…)</span>' : ''}`
    : `🗺️ Unrolling the Krillion trail map${k.crawling ? '…' : ' — not reachable right now, using Campfire Classics.'}`;
  $('#trail-status').innerHTML = `${map}<br>🏕️ Campfire Classics: <b>${st.campfire}</b> categories<br>${st.ai.enabled ? `🧭 AI Ranger: <b>on</b> (${esc(st.ai.model)}) — instant custom categories` : '🧭 AI Ranger: off — using the word-association trail (set ANTHROPIC_API_KEY)'}<br>🔥 ${st.online} camper${st.online === 1 ? '' : 's'} online · ${st.rooms} campsite${st.rooms === 1 ? '' : 's'}`;
}

function connect() {
  const socket = io({ transports: ['websocket', 'polling'] });
  app.socket = socket;
  socket.on('connect', () => hello());
  socket.on('disconnect', () => toast('📡 Lost the radio signal — reconnecting…', 'err'));
  socket.on('state', (s) => onState(s));
  socket.on('ev', (ev) => app.game?.handleEvent(ev));
  socket.on('typing', (d) => app.game?.onTyping(d));
  socket.on('genprogress', (d) => app.game?.onGenProgress(d));
  socket.on('hint', (d) => app.game?.onHint(d));
  socket.on('chat', (m) => addChat(m, true));
  socket.on('chat:history', (list) => { $('#chat-list').innerHTML = ''; list.forEach((m) => addChat(m, false)); });
  socket.on('profile', (p) => { app.me = p; renderProfile(); });
  socket.on('kicked', () => { app.room = null; sessionStorage.removeItem('mivi-room'); show('home'); toast('🌲 The ranger escorted you out of that campsite.', 'err'); });
}

function hello() {
  const name = $('#name-input').value.trim() || store.get('mivi-name', '');
  app.socket.emit('hello', { token: app.token, name }, (res) => {
    if (!res?.ok) return;
    app.token = res.token;
    store.set('mivi-token', res.token);
    app.me = res.profile;
    renderProfile();
    // rejoin after refresh / reconnect, or follow an invite link
    const pathCode = (location.pathname.match(/^\/(?:r|join)\/([A-Za-z]{4})$/) || [])[1];
    const code = pathCode || sessionStorage.getItem('mivi-room');
    if (code) joinRoom(code.toUpperCase(), !!pathCode);
  });
}

// ---------------------------------------------------------------- profile
export function renderProfile() {
  const p = app.me;
  if (!p) return;
  const eq = p.equipped;
  $('#home-avatar').innerHTML = mascotSVG(eq.mascot, eq.hat);
  if (document.activeElement !== $('#name-input')) $('#name-input').value = p.name;
  $('#home-rank').innerHTML = `${p.rankIcon} <b>${esc(p.rank)}</b> · ${p.rating} rating · ${p.wins} win${p.wins === 1 ? '' : 's'} · ${p.goldens} 🦌`;
  $('#btn-profile-chip').innerHTML = `${mascotSVG(eq.mascot, eq.hat)}<span>${esc(p.name)} · ${p.rating}</span>`;
}

export function updateProfile(patch) {
  return new Promise((resolve) => {
    app.socket.emit('profile:update', patch, (res) => {
      if (res?.ok) { app.me = res.profile; renderProfile(); }
      resolve(res);
    });
  });
}

let nameTimer = null;
function onNameInput() {
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => {
    const name = $('#name-input').value.trim();
    if (!name || name === app.me?.name) return;
    store.set('mivi-name', name);
    updateProfile({ name });
  }, 500);
}

// ---------------------------------------------------------------- screens
export function show(name) {
  if (app.screen === name) return;
  app.screen = name;
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
  const chat = $('#chat');
  if (name === 'lobby') $('#lobby-chat-dock').appendChild(chat);
  else if (name === 'game') $('#game-chat-dock').appendChild(chat);
  if (name === 'home') { refreshPublicRooms(); history.replaceState(null, '', '/'); }
  if (name === 'game') app.game.mount();
  else app.game?.unmount();
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- rooms
function joinRoom(code, fromLink = false) {
  app.socket.emit('room:join', { code }, (res) => {
    if (!res?.ok) {
      sessionStorage.removeItem('mivi-room');
      if (fromLink || app.screen === 'home') toast(res?.error || 'Could not find that campsite.', 'err');
      if (app.screen !== 'home') show('home');
      return;
    }
    enteredRoom(res.code);
  });
}

function enteredRoom(code) {
  sessionStorage.setItem('mivi-room', code);
  history.replaceState(null, '', '/r/' + code);
  sfx.join();
}

function leaveRoom() {
  app.socket.emit('room:leave', {}, () => {});
  app.room = null;
  sessionStorage.removeItem('mivi-room');
  closeAllModals();
  show('home');
}

function onState(s) {
  const prevPhase = app.room?.phase;
  app.room = s;
  if (s.phase === 'lobby') {
    if (app.screen !== 'lobby') show('lobby');
    renderLobby();
  } else {
    if (app.screen !== 'game') show('game');
    app.game.update(s);
    if (prevPhase === 'lobby' && s.phase === 'playing') closeAllModals();
  }
}

async function refreshPublicRooms() {
  try {
    const [rooms, st] = await Promise.all([fetch('/api/rooms').then((r) => r.json()), fetch('/api/status').then((r) => r.json())]);
    app.status = st;
    renderStatus();
    const ul = $('#public-rooms');
    if (!rooms.length) { ul.innerHTML = '<li class="muted">No open campfires right now — pitch one, or take a Quick Trek!</li>'; return; }
    ul.innerHTML = rooms.map((r) => `<li class="room-row"><span><b>${esc(r.name)}</b><br><small>${esc(r.mode)}${r.gimmick ? ' + ' + esc(r.gimmick) : ''} · ${r.players}/${r.maxPlayers} · ${r.phase === 'lobby' ? 'gathering' : 'in progress'}</small></span><button class="btn btn-small btn-moss" data-join="${esc(r.code)}">Join</button></li>`).join('');
    $$('[data-join]', ul).forEach((b) => b.addEventListener('click', () => { sfx.click(); joinRoom(b.dataset.join); }));
  } catch { /* offline */ }
}

// ---------------------------------------------------------------- chat
function addChat(m, live) {
  const li = document.createElement('li');
  if (m.kind === 'chat') {
    li.innerHTML = `<span class="who" style="color:${chatColor(m)}">${esc(m.name)}:</span> ${esc(m.text)}`;
    if (live && m.pid !== app.me?.id) sfx.chat();
  } else {
    li.className = m.kind === 'game' ? 'game' : 'sys';
    li.textContent = m.text;
  }
  const list = $('#chat-list');
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  list.appendChild(li);
  while (list.children.length > 120) list.firstChild.remove();
  if (atBottom || !live) list.scrollTop = list.scrollHeight;
}
function chatColor(m) {
  const b = app.catalog?.cosmetics?.banner?.find((x) => x.id === m.banner);
  if (!b) return 'var(--amber)';
  if (b.color === 'gold') return 'var(--gold)';
  if (!b.color.startsWith('#')) return '#9fd8ff';
  // lift dark banner colours so names stay readable on the dark radio
  return `color-mix(in srgb, ${b.color} 62%, #ffffff)`;
}

// ---------------------------------------------------------------- lobby
function renderLobby() {
  const s = app.room;
  const cat = app.catalog;
  if (!s || !cat) return;
  const isHost = s.hostId === app.me?.id;
  $('#lobby-name').textContent = s.name;
  $('#lobby-kind').textContent = s.quick ? '🏅 Ranked Quick Trek' : s.settings.isPublic ? 'Public campsite' : 'Private campsite';
  $('#lobby-kind').classList.toggle('ranked', s.quick);
  $('#lobby-code').textContent = s.code;
  const seated = s.players.filter((p) => !p.spectator && !p.left);
  $('#lobby-count').textContent = `(${seated.length}/${s.settings.maxPlayers})`;

  // mini campfire preview
  const mini = $('#mini-camp');
  const N = s.settings.maxPlayers;
  let html = `<div class="mini-fire">${campfireSVG()}</div>`;
  for (let i = 0; i < N; i++) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / N;
    const x = 50 + 40 * Math.cos(a), y = 50 + 34 * Math.sin(a);
    const p = seated.find((q) => q.seat === i);
    html += p ? `<div class="mini-seat" style="left:${x}%;top:${y}%">${mascotSVG(p.equipped.mascot, p.equipped.hat)}</div>` : `<div class="mini-seat empty" style="left:${x}%;top:${y}%"></div>`;
  }
  mini.innerHTML = html;

  // players
  $('#lobby-player-list').innerHTML = s.players.filter((p) => !p.left).sort((a, b) => (a.spectator - b.spectator) || a.seat - b.seat).map((p) => {
    const host = p.id === s.hostId ? '👑' : '';
    const sub = p.isBot ? `Critter bot · ${cat.botLevels[p.botLevel] || ''}` : `${p.rank || ''} · ${p.rating}${p.spectator ? ' · watching' : ''}${p.connected ? '' : ' · 📡 reconnecting'}`;
    const kick = isHost && !s.quick && p.id !== app.me?.id ? `<button class="kick" data-kick="${esc(p.id)}" title="Send home">✖</button>` : '<span></span>';
    return `<li class="player-row ${p.id === app.me?.id ? 'me' : ''} ${p.connected ? '' : 'off'}">${mascotSVG(p.equipped.mascot, p.equipped.hat)}<div><div class="pname">${host} ${esc(p.name)} ${p.isBot ? '🐾' : ''}</div><div class="psub">${esc(sub)}</div></div>${kick}</li>`;
  }).join('');
  $$('[data-kick]').forEach((b) => b.addEventListener('click', () => { sfx.click(); app.socket.emit('room:kick', { pid: b.dataset.kick }); }));

  $('#bot-row').classList.toggle('hidden', s.quick || !isHost);
  renderSettings(isHost);

  // footer
  const start = $('#btn-start');
  start.classList.toggle('hidden', s.quick || !isHost);
  start.disabled = seated.length < 2;
  let status = '';
  if (s.quick) {
    const cap = s.settings.maxPlayers;
    status = s.autoStartMs != null
      ? `${cap === 2 ? '⚔️ Duel begins' : '🔥 Fire lights'} in ${Math.ceil(s.autoStartMs / 1000)}s… (${seated.length}/${cap} campers)`
      : cap === 2 ? '⚔️ Waiting for a challenger to hike in… (1/2)' : `🥾 Waiting for more campers to hike in… (${seated.length}/${cap} — need 2)`;
  } else if (!isHost) {
    status = '⛺ Waiting for the camp counselor to light the fire…';
  } else if (seated.length < 2) {
    status = '🪵 Need at least 2 campers — share the code or invite a critter bot.';
  } else status = `🔥 ${seated.length} campers ready.`;
  $('#lobby-status').textContent = status;
  if (s.quick && s.autoStartMs != null) scheduleLobbyTick();
}

let lobbyTick = null;
function scheduleLobbyTick() {
  clearTimeout(lobbyTick);
  lobbyTick = setTimeout(() => {
    if (app.screen !== 'lobby' || !app.room || app.room.autoStartMs == null) return;
    app.room.autoStartMs = Math.max(0, app.room.autoStartMs - 1000);
    renderLobby();
  }, 1000);
}

function sendSettings(patch) {
  sfx.click();
  app.socket.emit('room:settings', { settings: patch });
}

function stepper(key, val, min, max, step, suffix, disabled, labels) {
  const map = labels && typeof labels === 'object' ? labels : labels ? { 0: labels } : {};
  const shown = map[Number(val)] ?? `${val}${suffix}`;
  return `<span class="stepper"><button data-step="${key}" data-d="${-step}" data-min="${min}" data-max="${max}" ${disabled ? 'disabled' : ''} aria-label="less">−</button><b>${shown}</b><button data-step="${key}" data-d="${step}" data-min="${min}" data-max="${max}" ${disabled ? 'disabled' : ''} aria-label="more">+</button></span>`;
}
function toggle(key, on, disabled) { return `<button class="toggle ${on ? 'on' : ''}" data-toggle="${key}" ${disabled ? 'disabled' : ''} aria-pressed="${on}"></button>`; }

function renderSettings(isHost) {
  const s = app.room.settings;
  const cat = app.catalog;
  const dis = !isHost || app.room.quick;
  const modes = Object.entries(cat.modes).map(([id, m]) => `<button class="mode-card ${s.mode === id ? 'sel' : ''}" data-mode="${id}" ${dis ? 'disabled' : ''} title="${esc(m.desc)}"><span class="mi">${m.icon}</span><b>${esc(m.name)}</b></button>`).join('');
  const gimmicks = Object.entries(cat.gimmicks).map(([id, g]) => `<button class="${s.gimmick === id ? 'sel' : ''}" data-gimmick="${id}" ${dis ? 'disabled' : ''}>${g.icon} ${esc(g.name)}</button>`).join('');
  const sources = Object.entries(cat.sources).map(([id, g]) => `<button class="${s.source === id ? 'sel' : ''}" data-source="${id}" ${dis ? 'disabled' : ''} title="${esc(g.desc)}">${esc(g.name)}</button>`).join('');
  const pack = app.room.customPack;
  const ai = app.status?.ai?.enabled;
  const rg = cat.ranges || { pickSec: [15, 90, 5], genTrailMax: [0, 40, 2], trailMax: [0, 40, 2] };
  $('#lobby-settings').innerHTML = `
    <h3 class="panel-title">🗺️ Trail rules ${app.room.quick ? '<span>ranked rules are fixed</span>' : isHost ? '' : '<span>set by the counselor</span>'}</h3>
    <div class="settings-grid">
      <div class="set-group"><h4>Game mode</h4><div class="mode-cards">${modes}</div><p class="set-desc">${esc(cat.modes[s.mode].desc)}</p></div>
      ${s.mode === 'duel' ? `<div class="set-group duel-box"><h4>⚔️ Duel trail</h4>
        <p class="set-desc" style="margin:0 0 8px">One question bank for the whole duel. Type any category (it's scouted on the fly) or leave it random. Hike the entire bank and it's a tie!</p>
        <form class="fg-row" id="duel-form"><input id="duel-trail" maxlength="90" placeholder="Random Krillion daily — or type e.g. Name a dinosaur" value="${esc(s.duelTrail || '')}" ${dis ? 'disabled' : ''}>
        ${dis ? '' : '<button class="btn btn-small btn-fire" type="submit">Set</button><button class="btn btn-small btn-ghost" type="button" id="duel-random">🎲 Random</button>'}</form>
        <div class="pack-line">${s.duelTrail ? `Dueling on: <b>${esc(s.duelTrail)}</b>` : '🎲 A random Krillion daily (small enough to finish)'}</div></div>` : ''}
      <div class="set-group" ${s.mode === 'duel' ? 'style="display:none"' : ''}><h4>Gimmick</h4><div class="seg">${gimmicks}</div>
        <div class="set-desc">${esc(cat.gimmicks[s.gimmick].desc)}</div>
        ${s.gimmick !== 'none' ? `<div class="set-row"><label>Special round every<small>${s.specialEvery === 0 ? 'every answer starts a special round for the next camper' : s.specialEvery === 1 ? 'every new trail is a special round' : 'poofs between special rounds'}</small></label>${stepper('specialEvery', s.specialEvery, 0, 6, 1, ' rounds', dis, { 0: 'Every turn', 1: 'Every round' })}</div>` : ''}
      </div>
      <div class="set-group"><h4>Question bank</h4><div class="seg">${sources}</div>
        <div class="set-desc">${esc(cat.sources[s.source].desc)}</div>
        ${s.source === 'custom' ? `<div class="pack-line">${pack ? `📒 <b>${esc(pack.name)}</b> · ${pack.count} categories` : '⚠️ No field guide chosen yet.'}
          ${!dis ? '<button class="btn btn-small btn-moss" id="btn-pick-pack">Choose / build field guide</button>' : ''}</div>` : ''}
      </div>
      <div class="set-group"><h4>Campfire rules</h4>
        <div class="set-row"><label>Campers around the fire<small>2–8 seats</small></label>${stepper('maxPlayers', s.maxPlayers, 2, 8, 1, '', dis)}</div>
        <div class="set-row"><label>Starting lives</label>${stepper('lives', s.lives, 1, 5, 1, ' 🔥', dis || s.mode === 'lonewolf')}</div>
        <div class="set-row"><label>${s.mode === 'mystery' ? 'Average hidden fuse' : s.mode === 'wildfire' ? 'Starting fuse' : 'Fuse per turn'}</label>${stepper('fuseSec', s.fuseSec, 5, 40, 1, 's', dis)}</div>
        <div class="set-row"><label>Extra lives<small>nicher answers roast the marshmallow faster — max one over your start</small></label>${toggle('extraLives', s.extraLives, dis || s.mode === 'lonewolf')}</div>
        ${s.extraLives ? `<div class="set-row"><label>Points per extra life</label>${stepper('extraLifeGoal', s.extraLifeGoal, 150, 1500, 50, ' pts', dis)}</div>` : ''}
        <div class="set-row"><label>Autocorrect<small>Strong fixes typos, sound-alikes, doubled letters & surnames</small></label><span class="seg">${['off', 'gentle', 'strong'].map((v) => `<button class="${s.typoTolerance === v ? 'sel' : ''}" data-typo="${v}" ${dis ? 'disabled' : ''}>${v === 'off' ? 'Off' : v === 'gentle' ? 'Gentle' : '💪 Strong'}</button>`).join('')}</span></div>
        <div class="set-row"><label>Ranger judge<small>live-checks answers missing from generated lists (Wikidata${ai ? ' + AI' : ''}) — a nicher find can steal the Golden Antler</small></label>${toggle('aiJudge', s.aiJudge, dis)}</div>
        ${!app.room.quick ? `<div class="set-row"><label>Public campfire<small>list on the trailhead board</small></label>${toggle('isPublic', s.isPublic, dis)}</div>` : ''}
      </div>
      <details class="set-group more-rules" ${app.moreRulesOpen ? 'open' : ''}><summary><h4>⚙️ More campsite rules</h4></summary>
        ${s.gimmick === 'leaderpick' ? `<div class="set-row"><label>Leader's Pick time<small>seconds to carve a custom category</small></label>${stepper('pickSec', s.pickSec, rg.pickSec[0], rg.pickSec[1], rg.pickSec[2], 's', dis)}</div>` : ''}
        <div class="set-row"><label>Custom-trail length<small>Leader's Pick, Echo and generated categories move on after this many answers</small></label>${stepper('genTrailMax', s.genTrailMax, rg.genTrailMax[0], rg.genTrailMax[1], rg.genTrailMax[2], '', dis, '∞')}</div>
        <div class="set-row"><label>Every-trail length<small>move on from ANY category after this many answers</small></label>${stepper('trailMax', s.trailMax, rg.trailMax[0], rg.trailMax[1], rg.trailMax[2], '', dis, '∞')}</div>
        <div class="set-row"><label>Easiest tier that counts<small>Auto follows the game mode</small></label><span class="seg">${[['auto', 'Auto'], ['kindling', '🪵 All'], ['trailhead', '🥾 No Kindling'], ['backcountry', '🏕️ Backcountry+']].map(([v, l]) => `<button class="${s.tierFloor === v ? 'sel' : ''}" data-floor="${v}" ${dis ? 'disabled' : ''}>${l}</button>`).join('')}</span></div>
        <div class="set-row"><label>Moose path<small>where the moose runs after a good answer</small></label><span class="seg">${[['clockwise', '🔁 Clockwise'], ['random', '🎲 Random']].map(([v, l]) => `<button class="${s.moosePath === v ? 'sel' : ''}" data-path="${v}" ${dis ? 'disabled' : ''}>${l}</button>`).join('')}</span></div>
        <div class="set-row"><label>Golden Antler heals<small>finding the Golden Antler restores a lost life</small></label>${toggle('goldenLife', s.goldenLife, dis)}</div>
        <div class="set-row"><label>Live autocorrect preview<small>the holder sees ✓ / ✨ / 🧭 as they type</small></label>${toggle('liveHints', s.liveHints, dis)}</div>
        <div class="set-row"><label>Show live typing<small>off = others only see •••</small></label>${toggle('showTyping', s.showTyping, dis)}</div>
        <div class="set-row"><label>Reveal leftovers<small>show unfound answers (and the Golden Antler) after a poof</small></label>${toggle('revealLeftovers', s.revealLeftovers, dis)}</div>
      </details>
    </div>`;
  $('.more-rules', $('#lobby-settings'))?.addEventListener('toggle', (e) => { app.moreRulesOpen = e.target.open; });
  if (dis) return;
  const root = $('#lobby-settings');
  $$('[data-mode]', root).forEach((b) => b.addEventListener('click', () => sendSettings({ mode: b.dataset.mode })));
  $$('[data-gimmick]', root).forEach((b) => b.addEventListener('click', () => sendSettings({ gimmick: b.dataset.gimmick })));
  $$('[data-source]', root).forEach((b) => b.addEventListener('click', () => {
    sendSettings({ source: b.dataset.source });
    if (b.dataset.source === 'custom' && !app.room.customPack) openFieldGuide({ forRoom: true });
  }));
  $$('[data-step]', root).forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.step;
    const v = Math.max(+b.dataset.min, Math.min(+b.dataset.max, Number(s[k]) + Number(b.dataset.d)));
    sendSettings({ [k]: v });
  }));
  $$('[data-typo]', root).forEach((b) => b.addEventListener('click', () => sendSettings({ typoTolerance: b.dataset.typo })));
  $$('[data-floor]', root).forEach((b) => b.addEventListener('click', () => sendSettings({ tierFloor: b.dataset.floor })));
  $$('[data-path]', root).forEach((b) => b.addEventListener('click', () => sendSettings({ moosePath: b.dataset.path })));
  $$('[data-toggle]', root).forEach((b) => b.addEventListener('click', () => sendSettings({ [b.dataset.toggle]: !s[b.dataset.toggle] })));
  $('#btn-pick-pack', root)?.addEventListener('click', () => { sfx.click(); openFieldGuide({ forRoom: true }); });
  const duelForm = $('#duel-form', root);
  if (duelForm) {
    duelForm.addEventListener('submit', (e) => { e.preventDefault(); sendSettings({ duelTrail: $('#duel-trail', root).value.trim() }); toast('⚔️ Duel trail set!', 'good'); });
    $('#duel-random', root).addEventListener('click', () => sendSettings({ duelTrail: '' }));
  }
}

// ---------------------------------------------------------------- wire up
function bind() {
  document.addEventListener('submit', (e) => e.preventDefault(), true);
  $('#name-input').addEventListener('input', onNameInput);
  $('#btn-quick').addEventListener('click', () => {
    sfx.click();
    app.socket.emit('room:quick', {}, (res) => { if (!res?.ok) return toast(res?.error || 'No trail found.', 'err'); enteredRoom(res.code); });
  });
  $('#btn-duel').addEventListener('click', () => {
    sfx.chop();
    app.socket.emit('room:quickduel', {}, (res) => { if (!res?.ok) return toast(res?.error || 'No challenger found.', 'err'); enteredRoom(res.code); });
  });
  $('#btn-create').addEventListener('click', () => {
    sfx.click();
    const last = store.get('mivi-last-settings', {});
    app.socket.emit('room:create', { settings: { ...last, isPublic: false } }, (res) => { if (!res?.ok) return toast(res?.error || 'Could not pitch a tent.', 'err'); enteredRoom(res.code); });
  });
  const doJoin = () => {
    const code = $('#join-code').value.trim().toUpperCase();
    if (code.length < 4) return toast('Trail codes are 4 letters.', 'err');
    sfx.click();
    joinRoom(code, true);
  };
  $('#btn-join').addEventListener('click', doJoin);
  $('#join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
  $('#join-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });

  $('#btn-trading-post').addEventListener('click', () => { sfx.click(); openTradingPost(); });
  $('#home-avatar').addEventListener('click', () => { sfx.click(); openTradingPost(); });
  $('#btn-profile-chip').addEventListener('click', () => { sfx.click(); openTradingPost(); });
  $('#btn-leaderboard').addEventListener('click', () => { sfx.click(); openLeaderboard(); });
  $('#btn-howto').addEventListener('click', () => { sfx.click(); openHowTo(); });
  $('#btn-guide').addEventListener('click', () => { sfx.click(); openFieldGuide({ forRoom: false }); });
  $('#brand-home').addEventListener('click', () => {
    sfx.click();
    if (app.room && !confirm('Leave this campsite and hike back to the trailhead?')) return;
    if (app.room) leaveRoom(); else show('home');
  });

  $('#btn-leave-lobby').addEventListener('click', () => { sfx.click(); leaveRoom(); });
  $('#btn-copy-code').addEventListener('click', () => { sfx.click(); copyText(app.room.code).then(() => toast('📋 Trail code copied!', 'good')); });
  $('#btn-copy-link').addEventListener('click', () => { sfx.click(); copyText(`${location.origin}/r/${app.room.code}`).then(() => toast('🔗 Invite link copied — send it to your campers!', 'good')); });
  $('#btn-start').addEventListener('click', () => {
    sfx.click();
    store.set('mivi-last-settings', app.room.settings);
    app.socket.emit('room:start', {}, (res) => { if (!res?.ok) toast(res?.error || 'The fire would not light.', 'err'); });
  });
  $$('[data-bot]').forEach((b) => b.addEventListener('click', () => {
    sfx.click();
    const action = b.dataset.bot === 'remove' ? 'remove' : 'add';
    app.socket.emit('room:bot', { action, level: b.dataset.bot }, (res) => { if (res && !res.ok && res.error) toast(res.error, 'err'); });
  }));

  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('#chat-input');
    const text = inp.value.trim();
    if (!text) return;
    app.socket.emit('chat', { text });
    inp.value = '';
  });

  const syncAudioBtns = () => {
    $('#btn-mute').innerHTML = icon(audio.prefs.muted ? 'mute' : 'volume');
    $('#btn-ambient').style.opacity = audio.prefs.ambient ? '1' : '.45';
  };
  $('#btn-mute').addEventListener('click', () => { audio.setMuted(!audio.prefs.muted); syncAudioBtns(); sfx.click(); });
  $('#btn-ambient').addEventListener('click', () => { audio.setAmbient(!audio.prefs.ambient); syncAudioBtns(); sfx.click(); toast(audio.prefs.ambient ? '🦗 Crickets and crackling fire on.' : '🤫 Ambience off.'); });
  syncAudioBtns();

  // twig-snap on every button hover/click for maximum camp vibes
  document.addEventListener('pointerover', (e) => { if (e.target.closest?.('.btn, .mode-card, .seg button, .item, .tab')) sfx.hover(); });
}

app.renderProfile = renderProfile;
app.updateProfile = updateProfile;
app.show = show;
app.toast = toast;
app.openResults = openResults;
app.packForRoom = packForRoom;
app.renderLobby = renderLobby;

(async function boot() {
  decorate();
  app.game = new GameView(app);
  bind();
  await loadCatalog().catch(() => toast('Could not reach the ranger station.', 'err'));
  connect();
  refreshPublicRooms();
  setInterval(() => { if (app.screen === 'home') refreshPublicRooms(); }, 8000);
})();
