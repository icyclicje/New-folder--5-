// Small DOM helpers shared by every client module.
import { sfx } from './sfx.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; }, 3200);
  setTimeout(() => el.remove(), 3700);
}

let modalStack = [];
/** Open a parchment modal. Returns { el, body, close }. */
export function modal({ title, html = '', wide = false, onClose } = {}) {
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `<div class="modal panel ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h2>${esc(title)}</h2><button class="modal-close" aria-label="Close">✕</button></div>
    <div class="modal-body">${html}</div></div>`;
  $('#modal-root').appendChild(back);
  const close = () => {
    back.remove();
    modalStack = modalStack.filter((m) => m !== api);
    onClose?.();
  };
  back.addEventListener('pointerdown', (e) => { if (e.target === back) { sfx.click(); close(); } });
  back.querySelector('.modal-close').addEventListener('click', () => { sfx.click(); close(); });
  const api = { el: back, body: back.querySelector('.modal-body'), close };
  modalStack.push(api);
  return api;
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalStack.length) modalStack[modalStack.length - 1].close();
});
export const closeAllModals = () => [...modalStack].forEach((m) => m.close());

export function tierVar(tier) { return `var(--t-${tier || 'kindling'})`; }

export function bannerStyle(bannerId, catalog) {
  const b = catalog?.cosmetics?.banner?.find((x) => x.id === bannerId);
  if (!b) return { cls: '', style: '' };
  if (['aurora', 'starry', 'gold'].includes(b.color)) return { cls: 'banner-' + b.color, style: '' };
  return { cls: isLight(b.color) ? 'banner-light' : '', style: `--banner:${b.color}` };
}

/** Is a #rrggbb colour light enough to need dark text on it? */
export function isLight(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 165;
}

export function fmtMs(ms) {
  const s = Math.ceil(ms / 1000);
  return s <= 0 ? '0' : String(s);
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
  return Promise.resolve(fallbackCopy(text));
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* ignore */ }
  ta.remove();
  return ok;
}

export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } },
};
