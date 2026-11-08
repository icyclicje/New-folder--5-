// Trading Post, Lodge Leaderboard, How to Play, and the end-of-game podium.
import { $, $$, esc, modal, toast, tierVar } from './ui.js';
import { sfx } from './sfx.js';
import { mascotSVG } from './art.js';
import { app } from './main.js';

function reqText(req) {
  if (!req) return 'Free';
  if (req.wins != null) return `🔒 ${req.wins} win${req.wins === 1 ? '' : 's'}`;
  if (req.goldens != null) return `🔒 ${req.goldens} Golden Antlers`;
  if (req.rating != null) return `🔒 ${req.rating} rating`;
  return '🔒';
}

export function openTradingPost() {
  const p = app.me;
  if (!p) return;
  const cos = app.catalog.cosmetics;
  let shelf = 'mascot';
  const m = modal({ title: '🛶 The Trading Post', wide: true });
  const unlocked = () => new Set(app.me.unlocked);
  const render = () => {
    const me = app.me;
    const eq = me.equipped;
    const un = unlocked();
    const items = cos[shelf].map((it) => {
      const key = shelf + ':' + it.id;
      const isUn = un.has(key);
      const sel = eq[shelf] === it.id;
      let art = '';
      if (shelf === 'mascot') art = mascotSVG(it.id, eq.hat);
      else if (shelf === 'hat') art = mascotSVG(eq.mascot, it.id);
      else {
        const special = ['aurora', 'starry', 'gold'].includes(it.color);
        art = `<div class="swatch ${special ? 'banner-' + it.color : ''}" style="${special ? '' : `background:${it.color}`}"></div>`;
      }
      return `<button class="item ${sel ? 'sel' : ''} ${isUn ? '' : 'locked'}" data-id="${it.id}" ${isUn ? '' : 'title="Keep winning to unlock!"'}>${art}<span>${esc(it.name)}</span><span class="lock">${isUn ? (sel ? '✔ Equipped' : 'Equip') : reqText(it.req)}</span></button>`;
    }).join('');
    m.body.innerHTML = `
      <div class="tp-top">
        <div class="tp-preview">${mascotSVG(eq.mascot, eq.hat)}<div class="plate ${['aurora', 'starry', 'gold'].includes(cos.banner.find((b) => b.id === eq.banner)?.color) ? 'banner-' + cos.banner.find((b) => b.id === eq.banner).color : ''}" style="--banner:${cos.banner.find((b) => b.id === eq.banner)?.color}">${esc(me.name)}</div></div>
        <div>
          <h3>${me.rankIcon} ${esc(me.rank)}</h3>
          <div class="tp-stats">
            <div class="stat"><b>${me.rating}</b><span>Rating (peak ${me.peakRating})</span></div>
            <div class="stat"><b>${me.wins}</b><span>Wins</span></div>
            <div class="stat"><b>${me.games}</b><span>Campfires</span></div>
            <div class="stat"><b>${me.rankedWins}/${me.rankedGames}</b><span>Ranked W/G</span></div>
            <div class="stat"><b>${me.goldens}</b><span>Golden Antlers</span></div>
            <div class="stat"><b>${me.answers}</b><span>Answers hiked</span></div>
            <div class="stat"><b>${me.bestScore}</b><span>Best score</span></div>
          </div>
        </div>
      </div>
      <div class="shelf-tabs seg">
        <button class="${shelf === 'mascot' ? 'sel' : ''}" data-shelf="mascot">🦊 Critters</button>
        <button class="${shelf === 'hat' ? 'sel' : ''}" data-shelf="hat">🎩 Hats</button>
        <button class="${shelf === 'banner' ? 'sel' : ''}" data-shelf="banner">🏳️ Name Banners</button>
      </div>
      <p class="muted" style="margin:0 0 10px">Win campfires (with 2+ human campers) to unlock more gear. Golden Antler finds unlock the rarest antlers.</p>
      <div class="shelf">${items}</div>`;
    $$('[data-shelf]', m.body).forEach((b) => b.addEventListener('click', () => { sfx.click(); shelf = b.dataset.shelf; render(); }));
    $$('.item', m.body).forEach((b) => b.addEventListener('click', async () => {
      if (b.classList.contains('locked')) { sfx.reject(); toast('🔒 Keep winning campfires to unlock that!', 'err'); return; }
      sfx.click();
      await app.updateProfile({ equipped: { ...app.me.equipped, [shelf]: b.dataset.id } });
      render();
    }));
  };
  render();
}

export async function openLeaderboard() {
  const m = modal({ title: '🏆 Lodge Leaderboard', html: '<p class="muted">Counting antlers…</p>' });
  try {
    const list = await fetch('/api/leaderboard').then((r) => r.json());
    if (!list.length) { m.body.innerHTML = '<p class="muted">No ranked campers yet — take a Quick Trek to claim the top log!</p>'; return; }
    m.body.innerHTML = `<p class="muted">Ranked rating from Quick Treks. Everyone starts at 1000.</p><ol class="lb">${list.map((p, i) => `
      <li><span class="place">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>${mascotSVG(p.equipped?.mascot, p.equipped?.hat)}<span><b>${esc(p.name)}</b><br><small class="muted">${p.rankIcon} ${esc(p.rank)} · ${p.wins} wins · ${p.rankedGames} ranked</small></span><span class="rt">${p.rating}</span></li>`).join('')}</ol>`;
  } catch { m.body.innerHTML = '<p class="muted">The lodge is closed (network error).</p>'; }
}

export function openHowTo() {
  const c = app.catalog;
  const tiers = c.tiers.map((t) => `<tr style="--tc:${tierVar(t.key)}"><td>${t.icon} ${esc(t.name)}</td><td>${esc(t.blurb)}</td><td>${t.pts}</td></tr>`).join('');
  const modes = Object.values(c.modes).map((m) => `<li><b>${m.icon} ${esc(m.name)}</b> — ${esc(m.desc)}</li>`).join('');
  const gm = Object.entries(c.gimmicks).filter(([k]) => k !== 'none').map(([, g]) => `<li><b>${g.icon} ${esc(g.name)}</b> — ${esc(g.desc)}</li>`).join('');
  modal({ title: '🧭 How to Play', wide: true, html: `<div class="howto">
    <p><b>2–8 campers</b> sit on stumps around the fire. The <b>Mivimoose</b> gallops to whoever's turn it is and starts puffing up. Type an answer that fits the category on the trail sign and hit <b>Enter</b> before it goes <b>POOF</b>! A correct, unrepeated answer sends the moose running to the next camper. If it poofs on you, you lose a life 🔥. Last camper standing wins.</p>
    <ul>
      <li>✏️ <b>Pre-type</b> anytime — your box is always open; Enter only counts on your turn.</li>
      <li>👀 Everyone sees what the active camper is typing, every wrong guess they make (struck out under their stump), and each camper's last answer.</li>
      <li>🚫 No repeats — once an answer is hiked, it's gone for the rest of that category.</li>
      <li>📻 Chat on the Ranger Radio anytime.</li>
    </ul>
    <h3>Rarity tiers</h3>
    <p>Every category has five tiers. The nicher your answer, the more points — and points roast your 🍡 marshmallow toward an <b>extra life</b> (it takes a while, and you can only ever hold one more life than you started with). Each category hides exactly one <b>Golden Antler</b> — the nichest answer on the trail. On generated trails the ranger keeps scouting during play, so the antler can wander deeper, and if <i>you</i> name something even nichier, it becomes yours. Autocorrect is strong by default: typos, sound-alikes, doubled letters and surnames all count.</p>
    <table class="tier-table">${tiers}</table>
    <h3>Game modes</h3><ul>${modes}</ul>
    <h3>Gimmicks</h3><ul>${gm}</ul>
    <h3>Question banks</h3>
    <p><b>Krillion Dailies</b> (default) — every daily Krillion prompt since Dive #1, with thousands of tiered answers each. <b>Campfire Classics</b> — hand-built camping categories. <b>My Field Guide</b> — your own packs: write categories by hand, generate any category on the fly, or type a <b>topic</b> and generate a whole question bank.</p>
    <h3>⚔️ Quick 1v1 Duel</h3>
    <p>Matchmade 1v1 on <b>one question bank</b> for the whole duel. Trade answers until someone poofs — hike the entire bank and it's a tie. Custom duels can use any category you type.</p>
    <h3>Quick Trek</h3>
    <p>Ranked matchmaking into an up-to-8-camper party using Krillion dailies and Campfire Classic rules. Your rating moves with every placement. Wins unlock gear at the 🛶 Trading Post.</p>
  </div>` });
}

let resultsModal = null;
export function openResults(ev) {
  resultsModal?.close();
  const top = ev.results.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const meRes = ev.results.find((r) => r.pid === app.me?.id);
  const podium = order.map((r) => `<div class="step p${r.placement}">${mascotSVG(r.equipped?.mascot, r.equipped?.hat)}<div class="nm">${esc(r.name)}</div><div class="block">${r.placement}</div></div>`).join('');
  const rows = ev.results.map((r) => `<li><b>#${r.placement}</b><span>${esc(r.name)} ${r.isBot ? '🐾' : ''}<br><small class="muted">${r.answers} answers · ${r.goldens} 🦌</small></span><b>${r.score} pts</b>
    <span class="delta ${r.ratingDelta > 0 ? 'up' : r.ratingDelta < 0 ? 'down' : ''}">${r.ratingDelta != null ? `${r.ratingDelta > 0 ? '+' : ''}${r.ratingDelta} → ${r.rating}` : ''}</span></li>`).join('');
  const unlocks = meRes?.unlocks?.length ? `<div class="unlocks">🎁 <b>New at the Trading Post:</b> ${meRes.unlocks.map((u) => esc(u.name)).join(', ')}!</div>` : '';
  const winner = ev.results.find((r) => r.placement === 1);
  const title = ev.tie ? '🤝 A tie — the whole trail was hiked!' : winner ? `🏆 ${winner.name} survives the night!` : '🏕️ The fire burned out';
  resultsModal = modal({ title, html: `
    <div class="podium">${podium}</div>
    ${ev.ranked ? '<p class="muted" style="text-align:center">🏅 Ranked trek — ratings updated.</p>' : ''}
    <ol class="results-list">${rows}</ol>${unlocks}
    <p class="muted" style="text-align:center;margin-top:12px">Back to the campsite in a few seconds…</p>`, onClose: () => { resultsModal = null; } });
  setTimeout(() => resultsModal?.close(), (ev.resultsMs || 15000) - 300);
}
