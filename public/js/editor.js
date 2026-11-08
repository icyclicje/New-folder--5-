// 📒 My Field Guide — custom question packs.
//  • Generate any category on the fly (AI ranger or word-association fallback)
//  • Type a TOPIC and generate a full question bank
//  • Browse every Krillion daily (and Campfire Classics) and add them by reference
//  • Hand-write categories with your own five tiers
import { $, $$, esc, modal, toast, store, tierVar } from './ui.js';
import { sfx } from './sfx.js';
import { app } from './main.js';

const TIERS = ['kindling', 'trailhead', 'backcountry', 'deepwoods'];
const TIER_LABEL = { kindling: '🪵 Kindling (10)', trailhead: '🥾 Trailhead (30)', backcountry: '🏕️ Backcountry (60)', deepwoods: '🌲 Deep Woods (85)', golden: '🦌 Golden Antler (100)' };

const loadPacks = () => store.get('mivi-packs', []);
const savePacks = (p) => store.set('mivi-packs', p);
const newId = () => Math.random().toString(36).slice(2, 9);

function catSize(c) {
  if (c.ref) return c.total || 0;
  return TIERS.reduce((n, t) => n + (c.tiers?.[t]?.length || 0), 0) + (c.golden?.answer ? 1 : 0);
}

export function packForRoom(pack) {
  return new Promise((resolve) => {
    app.socket.emit('room:pack', { pack: { name: pack.name, categories: pack.categories } }, (res) => {
      if (res?.ok) toast(`📒 “${pack.name}” is now the campsite's question bank (${res.count} categories).`, 'good');
      else toast(res?.error || 'Could not hand out that field guide.', 'err');
      resolve(res);
    });
  });
}

export function openFieldGuide({ forRoom = false } = {}) {
  let packs = loadPacks();
  if (!packs.length) { packs = [{ id: newId(), name: 'My First Field Guide', categories: [] }]; savePacks(packs); }
  let selId = store.get('mivi-pack-sel', packs[0].id);
  if (!packs.find((p) => p.id === selId)) selId = packs[0].id;
  let tab = 'generate';
  let editing = null; // index of category being edited
  let genPreview = null;
  let bank = null; // { reqId, pending: [], topic, live }
  let kFilter = { q: '', source: 'krillion', list: null };
  const isHost = () => app.room && app.room.hostId === app.me?.id && !app.room.quick && app.room.phase === 'lobby';
  const m = modal({ title: '📒 My Field Guide', wide: true, onClose: () => cleanup() });
  const sel = () => packs.find((p) => p.id === selId);
  const persist = () => { savePacks(packs); store.set('mivi-pack-sel', selId); };

  // live socket listeners for this modal
  const onGenProgress = (d) => { if (d.reqId === genReq) { const el = $('#gen-progress', m.body); if (el) el.textContent = `🧭 Scouting… ${d.total} answers found (${d.counts.kindling}/${d.counts.trailhead}/${d.counts.backcountry}/${d.counts.deepwoods}/${d.counts.golden})`; } };
  let roomPushTimer = null;
  const pushToRoom = () => { clearTimeout(roomPushTimer); roomPushTimer = setTimeout(() => { if (isHost() && bank?.live) packForRoom(sel()); }, 900); };
  const onPlan = (d) => { if (!bank || d.reqId !== bank.reqId) return; bank.pending = d.prompts.slice(); renderCats(); };
  const onCat = (d) => {
    if (!bank || d.reqId !== bank.reqId) return;
    const def = d.def;
    bank.pending = bank.pending.filter((p) => p !== def.prompt);
    if (def.error) { toast(`🌧️ Skipped “${def.prompt}”: ${def.error}`, 'err'); renderCats(); return; }
    const pack = packs.find((p) => p.id === bank.packId);
    if (!pack) return;
    pack.categories.push(def.ref ? { ref: def.ref, prompt: def.prompt, total: def.total, source: def.source } : { prompt: def.prompt, golden: def.golden, tiers: def.tiers, generated: true });
    persist();
    sfx.accept('trailhead');
    renderCats();
    renderPacks();
    if (bank.live) pushToRoom();
  };
  const onDone = (d) => { if (!bank || d.reqId !== bank.reqId) return; toast(`🌲 Topic bank “${d.topic}” ready — ${d.count} categories!`, 'good'); sfx.golden(); bank = null; render(); };
  const onErr = (d) => { if (!bank || d.reqId !== bank.reqId) return; toast(`🌧️ ${d.error}`, 'err'); bank = null; render(); };
  let genReq = null;
  app.socket.on('gen:progress', onGenProgress);
  app.socket.on('bank:plan', onPlan);
  app.socket.on('bank:category', onCat);
  app.socket.on('bank:done', onDone);
  app.socket.on('bank:error', onErr);
  function cleanup() {
    app.socket.off('gen:progress', onGenProgress);
    app.socket.off('bank:plan', onPlan);
    app.socket.off('bank:category', onCat);
    app.socket.off('bank:done', onDone);
    app.socket.off('bank:error', onErr);
  }

  function render() {
    const pack = sel();
    m.body.innerHTML = `
      <div class="fg">
        <div class="fg-packs" id="fg-packs"></div>
        <div>
          <div class="fg-row">
            <input id="fg-name" value="${esc(pack.name)}" maxlength="40" aria-label="Field guide name">
            ${forRoom && isHost() ? '<button class="btn btn-fire" id="fg-use">🔥 Use in my campsite</button>' : ''}
          </div>
          <ul class="fg-cats" id="fg-cats"></ul>
          <div class="fg-tabs seg">
            <button data-tab="generate" class="${tab === 'generate' ? 'sel' : ''}">🧭 Generate a category</button>
            <button data-tab="topic" class="${tab === 'topic' ? 'sel' : ''}">🌲 Topic → whole bank</button>
            <button data-tab="archive" class="${tab === 'archive' ? 'sel' : ''}">🗺️ Krillion archive</button>
            <button data-tab="hand" class="${tab === 'hand' ? 'sel' : ''}">✍️ Handmade</button>
          </div>
          <div class="fg-pane" id="fg-pane"></div>
        </div>
      </div>`;
    $('#fg-name', m.body).addEventListener('input', (e) => { pack.name = e.target.value.trim() || 'Untitled guide'; persist(); renderPacks(); });
    $('#fg-use', m.body)?.addEventListener('click', async () => {
      sfx.click();
      if (!pack.categories.length) return toast('Add some categories first!', 'err');
      const res = await packForRoom(pack);
      if (res?.ok) m.close();
    });
    $$('[data-tab]', m.body).forEach((b) => b.addEventListener('click', () => { sfx.click(); tab = b.dataset.tab; editing = null; render(); }));
    renderPacks();
    renderCats();
    renderPane();
  }

  function renderPacks() {
    const el = $('#fg-packs', m.body);
    if (!el) return;
    el.innerHTML = `<h4>Your guides</h4>${packs.map((p) => `<button class="fg-pack ${p.id === selId ? 'sel' : ''}" data-pack="${p.id}">${esc(p.name)}<small>${p.categories.length} categories</small></button>`).join('')}
      <button class="btn btn-small btn-moss" id="fg-new">＋ New guide</button>
      <button class="btn btn-small btn-wood" id="fg-export">⬇️ Export JSON</button>
      <label class="btn btn-small btn-wood">⬆️ Import JSON<input type="file" id="fg-import" accept="application/json,.json" hidden></label>
      <button class="btn btn-small btn-danger" id="fg-delete">🗑️ Delete guide</button>`;
    $$('[data-pack]', el).forEach((b) => b.addEventListener('click', () => { sfx.click(); selId = b.dataset.pack; editing = null; persist(); render(); }));
    $('#fg-new', el).addEventListener('click', () => { sfx.click(); const p = { id: newId(), name: 'New Field Guide', categories: [] }; packs.push(p); selId = p.id; persist(); render(); });
    $('#fg-delete', el).addEventListener('click', () => {
      if (!confirm(`Burn “${sel().name}” in the campfire? This can't be undone.`)) return;
      packs = packs.filter((p) => p.id !== selId);
      if (!packs.length) packs = [{ id: newId(), name: 'My Field Guide', categories: [] }];
      selId = packs[0].id; persist(); render();
    });
    $('#fg-export', el).addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(sel(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (sel().name || 'field-guide').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $('#fg-import', el).addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!Array.isArray(data.categories)) throw new Error('No categories');
        const p = { id: newId(), name: String(data.name || 'Imported guide').slice(0, 40), categories: data.categories.slice(0, 60) };
        packs.push(p); selId = p.id; persist(); render();
        toast(`📒 Imported ${p.categories.length} categories.`, 'good');
      } catch { toast('That file is not a Mivimoose field guide.', 'err'); }
    });
  }

  function renderCats() {
    const ul = $('#fg-cats', m.body);
    if (!ul) return;
    const pack = sel();
    const items = pack.categories.map((c, i) => `<li><span><b>${esc(c.prompt)}</b><br><small>${c.ref ? (c.source === 'campfire' ? '🏕️ Campfire Classic' : c.source === 'ai' ? '🧭 Generated' : '🗺️ Krillion') : c.generated ? '🧭 Generated' : '✍️ Handmade'} · ${catSize(c).toLocaleString()} answers</small></span>
      <span><button class="btn btn-small btn-wood" data-edit="${i}" title="Edit">✏️</button> <button class="btn btn-small btn-danger" data-del="${i}" title="Remove">✖</button></span></li>`);
    const pending = (bank?.packId === pack.id ? bank.pending : []).map((p) => `<li class="pending"><span>🧭 ${esc(p)}<br><small>scouting answers…</small></span><span class="compass" style="font-size:1.2rem">🧭</span></li>`);
    ul.innerHTML = items.concat(pending).join('') || '<li class="muted">This guide is empty — add categories below.</li>';
    $$('[data-del]', ul).forEach((b) => b.addEventListener('click', () => { sfx.click(); pack.categories.splice(+b.dataset.del, 1); persist(); renderCats(); renderPacks(); }));
    $$('[data-edit]', ul).forEach((b) => b.addEventListener('click', async () => {
      sfx.click();
      const i = +b.dataset.edit;
      let c = pack.categories[i];
      if (c.ref) {
        try {
          const def = await fetch('/api/category/' + encodeURIComponent(c.ref)).then((r) => r.json());
          if (catSize(def) > 3000 && !confirm(`This category has ${catSize(def)} answers. Copy all of them into your guide for editing?`)) return;
          c = { prompt: def.prompt, golden: def.golden, tiers: def.tiers };
        } catch { return toast('Could not load that trail.', 'err'); }
      }
      editing = i;
      tab = 'hand';
      render();
      fillHand(c);
    }));
  }

  function previewHtml(def) {
    const g = def.golden?.answer ? `<div style="--tc:${tierVar('golden')}"><b>${TIER_LABEL.golden}:</b> ${esc(def.golden.answer)}${def.golden.note ? ` — <i>${esc(def.golden.note)}</i>` : ''}</div>` : '';
    return `<div class="preview-tiers">${g}${TIERS.map((t) => `<div style="--tc:${tierVar(t)}"><b>${TIER_LABEL[t]} · ${def.tiers?.[t]?.length || 0}:</b> ${esc((def.tiers?.[t] || []).slice(0, 40).join(', '))}${(def.tiers?.[t]?.length || 0) > 40 ? '…' : ''}</div>`).join('')}</div>`;
  }

  function renderPane() {
    const pane = $('#fg-pane', m.body);
    const pack = sel();
    const ai = app.status?.ai?.enabled;
    if (tab === 'generate') {
      pane.innerHTML = `<p class="muted" style="margin-top:0">Type <b>any</b> category and the ${ai ? 'AI ranger generates a fair, five-tier answer board in seconds' : 'ranger builds a word-association board (add an ANTHROPIC_API_KEY on the server for full AI generation)'}.</p>
        <form class="fg-row" id="gen-form"><input id="gen-input" maxlength="90" placeholder="e.g. Name a Pixar character" autocomplete="off"><button class="btn btn-fire" type="submit">Generate 🧭</button></form>
        <div class="progress-line" id="gen-progress"></div><div id="gen-out"></div>`;
      if (genPreview) showPreview(genPreview);
      $('#gen-form', pane).addEventListener('submit', (e) => {
        e.preventDefault();
        const prompt = $('#gen-input', pane).value.trim();
        if (prompt.length < 3) return;
        sfx.click();
        genReq = newId();
        $('#gen-progress', pane).textContent = '🧭 The ranger is heading out…';
        $('#gen-out', pane).innerHTML = '';
        const t0 = performance.now();
        app.socket.emit('gen:category', { prompt, reqId: genReq }, (res) => {
          if (!res?.ok) { $('#gen-progress', m.body) && ($('#gen-progress', m.body).textContent = ''); return toast(res?.error || 'The ranger came back empty-handed.', 'err'); }
          genPreview = res.def;
          const el = $('#gen-progress', m.body);
          if (el) el.textContent = `✅ ${catSize(res.def)} answers in ${((performance.now() - t0) / 1000).toFixed(1)}s (${res.how === 'cache' ? 'from the ranger\'s notebook' : res.how === 'known' ? 'matched an existing trail' : res.how === 'assoc' ? 'word-association trail' : 'AI ranger'})`;
          sfx.accept('backcountry');
          showPreview(res.def);
        });
      });
    } else if (tab === 'topic') {
      pane.innerHTML = `<p class="muted" style="margin-top:0">Give the ranger a <b>topic</b> and get a whole question bank — every category with its own five-tier answer board. ${ai ? 'Categories stream in as they finish.' : 'Without an AI key, the ranger assembles the bank from every matching Krillion daily and Campfire Classic.'}</p>
        <form class="fg-row" id="topic-form"><input id="topic-input" maxlength="80" placeholder="e.g. Harry Potter, the 1990s, dinosaurs, Japan…" autocomplete="off">
          <span class="stepper"><button type="button" id="tc-minus">−</button><b id="tc-count">8</b><button type="button" id="tc-plus">+</button></span>
          <button class="btn btn-fire" type="submit" ${bank ? 'disabled' : ''}>Build bank 🌲</button></form>
        ${forRoom && isHost() ? '<label class="fg-row" style="margin-top:8px"><input type="checkbox" id="topic-live" checked style="width:auto"> Send to my campsite as categories arrive (start playing after the first 3!)</label>' : ''}
        <div class="progress-line">${bank ? `🧭 Building “${esc(bank.topic)}”… ${bank.pending.length} categories still being scouted.` : ''}</div>`;
      let count = 8;
      const setC = (v) => { count = Math.max(3, Math.min(20, v)); $('#tc-count', pane).textContent = count; };
      $('#tc-minus', pane).addEventListener('click', () => { sfx.click(); setC(count - 1); });
      $('#tc-plus', pane).addEventListener('click', () => { sfx.click(); setC(count + 1); });
      $('#topic-form', pane).addEventListener('submit', (e) => {
        e.preventDefault();
        const topic = $('#topic-input', pane).value.trim();
        if (topic.length < 2 || bank) return;
        sfx.chop();
        const reqId = newId();
        // put the bank into a fresh guide named after the topic (unless the current one is empty)
        if (pack.categories.length) {
          const p = { id: newId(), name: `${topic} Field Guide`.slice(0, 40), categories: [] };
          packs.push(p); selId = p.id;
        } else pack.name = `${topic} Field Guide`.slice(0, 40);
        persist();
        bank = { reqId, packId: selId, pending: [], topic, live: !!$('#topic-live', pane)?.checked };
        app.socket.emit('gen:bank', { topic, count, reqId }, (res) => {
          if (!res?.ok) { toast(res?.error || 'The ranger could not plan that topic.', 'err'); bank = null; render(); }
        });
        render();
      });
    } else if (tab === 'archive') {
      pane.innerHTML = `<div class="fg-row"><input id="k-q" placeholder="Search every Krillion daily…" value="${esc(kFilter.q)}" autocomplete="off">
        <span class="seg"><button data-ks="krillion" class="${kFilter.source === 'krillion' ? 'sel' : ''}">🗺️ Krillion</button><button data-ks="campfire" class="${kFilter.source === 'campfire' ? 'sel' : ''}">🏕️ Campfire</button><button data-ks="ai" class="${kFilter.source === 'ai' ? 'sel' : ''}">🧭 Generated</button></span>
        <button class="btn btn-small btn-moss" id="k-rand">＋ 10 random</button></div>
        <ul class="k-list" id="k-list"><li class="muted">Unrolling the map…</li></ul>`;
      const load = async () => {
        if (!kFilter.list || kFilter.list.source !== kFilter.source) {
          kFilter.list = { source: kFilter.source, items: await fetch('/api/prompts?source=' + kFilter.source).then((r) => r.json()).catch(() => []) };
        }
        const q = kFilter.q.toLowerCase();
        const items = kFilter.list.items.filter((x) => !q || x.prompt.toLowerCase().includes(q)).slice(0, 300);
        const have = new Set(sel().categories.filter((c) => c.ref).map((c) => c.ref));
        $('#k-list', pane).innerHTML = items.map((x) => `<li><span>${esc(x.prompt)}<br><small>${x.date ? x.date + ' · ' : ''}${x.total.toLocaleString()} answers</small></span>${have.has(x.id) ? '<small>✔ added</small>' : `<button class="btn btn-small btn-moss" data-add="${esc(x.id)}">＋</button>`}</li>`).join('') || '<li class="muted">No trails match.</li>';
        $$('[data-add]', pane).forEach((b) => b.addEventListener('click', () => {
          sfx.click();
          const x = kFilter.list.items.find((i) => i.id === b.dataset.add);
          sel().categories.push({ ref: x.id, prompt: x.prompt, total: x.total, source: x.source });
          persist(); renderCats(); renderPacks(); load();
        }));
      };
      let qt = null;
      $('#k-q', pane).addEventListener('input', (e) => { kFilter.q = e.target.value; clearTimeout(qt); qt = setTimeout(load, 150); });
      $$('[data-ks]', pane).forEach((b) => b.addEventListener('click', () => { sfx.click(); kFilter.source = b.dataset.ks; renderPane(); }));
      $('#k-rand', pane).addEventListener('click', () => {
        sfx.click();
        const pool = (kFilter.list?.items || []).filter((x) => x.total >= 25 && !sel().categories.some((c) => c.ref === x.id));
        for (let i = 0; i < 10 && pool.length; i++) {
          const x = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
          sel().categories.push({ ref: x.id, prompt: x.prompt, total: x.total, source: x.source });
        }
        persist(); renderCats(); renderPacks(); load();
      });
      load();
    } else if (tab === 'hand') {
      pane.innerHTML = `<p class="muted" style="margin-top:0">${editing != null ? '✏️ Editing a category.' : 'Write your own category.'} One answer per line. Add aliases with a pipe: <code>Mountain lion|cougar|puma</code>.</p>
        <label class="field"><span>Category prompt</span><input id="h-prompt" maxlength="120" placeholder="Name a ..."></label>
        <div class="fg-row"><label class="field" style="flex:1"><span>${TIER_LABEL.golden}</span><input id="h-golden" placeholder="The one legendary answer"></label>
          <label class="field" style="flex:2"><span>Golden fun fact (optional)</span><input id="h-note" maxlength="200"></label></div>
        <div class="tier-edit">${TIERS.map((t) => `<label><span style="--tc:${tierVar(t)}">${TIER_LABEL[t]}</span><textarea id="h-${t}" spellcheck="false"></textarea></label>`).join('')}</div>
        <div class="fg-row" style="margin-top:10px"><button class="btn btn-fire" id="h-save">${editing != null ? '💾 Save changes' : '＋ Add to guide'}</button>${editing != null ? '<button class="btn btn-ghost" id="h-cancel">Cancel</button>' : ''}</div>`;
      $('#h-save', pane).addEventListener('click', () => {
        const prompt = $('#h-prompt', pane).value.trim();
        if (!prompt) return toast('Give the category a prompt.', 'err');
        const tiers = {};
        for (const t of TIERS) tiers[t] = $(`#h-${t}`, pane).value.split('\n').map((x) => x.trim()).filter(Boolean);
        const golden = $('#h-golden', pane).value.trim() ? { answer: $('#h-golden', pane).value.trim(), note: $('#h-note', pane).value.trim() } : null;
        const total = TIERS.reduce((n, t) => n + tiers[t].length, 0) + (golden ? 1 : 0);
        if (total < 5) return toast('Add at least 5 answers so the moose has somewhere to run.', 'err');
        const cat = { prompt, golden, tiers };
        if (editing != null) sel().categories[editing] = cat; else sel().categories.push(cat);
        editing = null;
        persist();
        sfx.accept('deepwoods');
        toast('✍️ Category saved to your field guide.', 'good');
        render();
      });
      $('#h-cancel', pane)?.addEventListener('click', () => { editing = null; render(); });
    }
  }

  function fillHand(c) {
    const pane = $('#fg-pane', m.body);
    $('#h-prompt', pane).value = c.prompt || '';
    $('#h-golden', pane).value = c.golden?.answer || '';
    $('#h-note', pane).value = c.golden?.note || '';
    for (const t of TIERS) $(`#h-${t}`, pane).value = (c.tiers?.[t] || []).join('\n');
  }

  function showPreview(def) {
    const out = $('#gen-out', m.body);
    if (!out) return;
    out.innerHTML = `<h4 style="margin-top:10px">🪧 ${esc(def.prompt)}</h4>${previewHtml(def)}
      <div class="fg-row" style="margin-top:8px"><button class="btn btn-fire" id="gp-add">＋ Add to guide</button><button class="btn btn-wood" id="gp-edit">✏️ Tweak first</button></div>`;
    $('#gp-add', out).addEventListener('click', () => {
      sfx.click();
      sel().categories.push({ prompt: def.prompt, golden: def.golden, tiers: def.tiers, generated: !!def.generated });
      genPreview = null; persist(); render();
      toast('🧭 Added to your field guide!', 'good');
    });
    $('#gp-edit', out).addEventListener('click', () => { sfx.click(); tab = 'hand'; editing = null; genPreview = null; render(); fillHand(def); });
  }

  render();
}
