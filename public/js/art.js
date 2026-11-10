// Mivimoose Party — all art is generated here as SVG (no image assets).
// Style: storybook gouache. Soft gradients lit from the upper left, a warm campfire rim light from the
// lower right, tinted (never black) outlines, eyes with irises and two catch-lights.

let uid = 0;
const nid = (p) => `${p}${++uid}`;
const f1 = (n) => +n.toFixed(2);

// ---------------------------------------------------------------- colour helpers
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
const lite = (c, t = 0.3) => mix(c, '#fff6ea', t);
const deep = (c, t = 0.4) => mix(c, '#1c0d14', t);
const RIM = '#ffb36b'; // campfire rim light
const lin = (id, a, b, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const rad = (id, stops, cx = '40%', cy = '32%', r = '72%') => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a < 1 ? ` stop-opacity="${a}"` : ''}/>`).join('')}</radialGradient>`;
const mirror = (svg) => `${svg}<g transform="matrix(-1 0 0 1 100 0)">${svg}</g>`;

// ---------------------------------------------------------------- mascots
const ANIMALS = {
  fox:     { fur: '#ec7a31', fur2: '#c75b21', muzzle: '#fff4e4', ear: 'pointy', earIn: '#fde6d2', earTip: '#3b2420', nose: '#2b1d16', iris: '#c97a1f', head: 'fluffy', face: 'fox' },
  raccoon: { fur: '#9d9daa', fur2: '#74747f', muzzle: '#f4f2ee', ear: 'round', earIn: '#ecebe6', nose: '#1f1f24', iris: '#5a4330', head: 'fluffy', face: 'raccoon' },
  beaver:  { fur: '#96613b', fur2: '#704426', muzzle: '#ddb184', ear: 'small', earIn: '#5b3a22', nose: '#2b1a10', iris: '#4a2a14', head: 'round', face: 'beaver' },
  bunny:   { fur: '#f0e8dc', fur2: '#d5c8b4', muzzle: '#fffbf4', ear: 'long', earIn: '#f6b8c4', nose: '#e57890', iris: '#6a4632', head: 'oval', face: 'bunny' },
  frog:    { fur: '#79c856', fur2: '#4e9934', muzzle: '#d8f3b8', ear: 'frog', nose: '#2f5d1f', iris: '#d4a22a', head: 'frog', face: 'frog' },
  owl:     { fur: '#b8834e', fur2: '#8a5a30', muzzle: '#f6e6c6', ear: 'tufts', earIn: '#6e4422', nose: '#eaa437', iris: '#f2a32c', head: 'round', face: 'owl' },
  bear:    { fur: '#5d4132', fur2: '#3f2b21', muzzle: '#d6b088', ear: 'round', earIn: '#8f6650', nose: '#160e0b', iris: '#3a2416', head: 'round', face: 'bear' },
  otter:   { fur: '#8a5f3f', fur2: '#64432c', muzzle: '#eedabe', ear: 'small', earIn: '#4b3020', nose: '#1d120c', iris: '#3a2416', head: 'round', face: 'otter' },
  skunk:   { fur: '#37323f', fur2: '#25222c', muzzle: '#5a5463', ear: 'small', earIn: '#6d6777', nose: '#f19db2', iris: '#4a3a4a', head: 'round', face: 'skunk' },
  wolf:    { fur: '#9ba4b1', fur2: '#717b89', muzzle: '#f3f4f6', ear: 'pointy', earIn: '#eceef1', earTip: '#4a515c', nose: '#1b1e22', iris: '#5fa6d2', head: 'fluffy', face: 'wolf' },
  lynx:    { fur: '#d5b07a', fur2: '#ab8751', muzzle: '#faf0de', ear: 'pointy', earIn: '#f5e5ca', earTip: '#2a2018', tufts: true, nose: '#c86c5b', iris: '#98b43c', head: 'ruff', face: 'lynx' },
  moose:   { fur: '#8a5937', fur2: '#653f23', muzzle: '#c08e60', ear: 'moose', earIn: '#d4a47c', nose: '#2a1a0f', iris: '#3a2416', head: 'round', face: 'moose', antlers: true },
};

const HEADS = {
  round: 'M50 27a31 31 0 1 1 0 62a31 31 0 1 1 0-62Z',
  oval: 'M50 28a28.5 31 0 1 1 0 62a28.5 31 0 1 1 0-62Z',
  frog: 'M50 37a35 26 0 1 1 0 52a35 26 0 1 1 0-52Z',
  fluffy: 'M50 27C67.5 27 81 40.5 81 57L87 63L80.5 65L85 71.5L77 71.6C72 82.5 62 89 50 89C38 89 28 82.5 23 71.6L15 71.5L19.5 65L13 63L19 57C19 40.5 32.5 27 50 27Z',
  ruff: 'M50 27C67.5 27 81 40.5 81 56L89.5 63.5L81.5 65.5L88.5 73L78 72.6C73 83 62 89.5 50 89.5C38 89.5 27 83 22 72.6L11.5 73L18.5 65.5L10.5 63.5L19 56C19 40.5 32.5 27 50 27Z',
};

function eye(x, y, r, gid) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${gid})"/>`
    + `<circle cx="${f1(x + r * 0.33)}" cy="${f1(y - r * 0.36)}" r="${f1(r * 0.38)}" fill="#fff"/>`
    + `<circle cx="${f1(x - r * 0.38)}" cy="${f1(y + r * 0.4)}" r="${f1(r * 0.17)}" fill="#fff" opacity=".75"/>`;
}
const eyes = (g, y = 55, gap = 11.5, r = 4.6) => eye(50 - gap, y, r, g) + eye(50 + gap, y, r, g);
function nose(x, y, w, h, c) {
  return `<path d="M${f1(x - w)} ${f1(y - h * 0.45)}Q${x} ${f1(y - h * 0.9)} ${f1(x + w)} ${f1(y - h * 0.45)}Q${f1(x + w * 0.6)} ${f1(y + h * 0.6)} ${x} ${f1(y + h * 0.62)}Q${f1(x - w * 0.6)} ${f1(y + h * 0.6)} ${f1(x - w)} ${f1(y - h * 0.45)}Z" fill="${c}"/>`
    + `<ellipse cx="${f1(x - w * 0.28)}" cy="${f1(y - h * 0.33)}" rx="${f1(w * 0.34)}" ry="${f1(h * 0.17)}" fill="#fff" opacity=".38"/>`;
}
const mouth = (x, y, c, w = 5.5) => `<path d="M${x} ${y - 3.6}V${y}M${x - w} ${y - 0.4}Q${f1(x - w / 2)} ${y + 3.4} ${x} ${y}Q${f1(x + w / 2)} ${y + 3.4} ${x + w} ${y - 0.4}" stroke="${c}" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
const blush = (g, y = 66.5, x = 30.5, rx = 5.4) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${f1(rx * 0.66)}" fill="url(#${g})"/><ellipse cx="${100 - x}" cy="${y}" rx="${rx}" ry="${f1(rx * 0.66)}" fill="url(#${g})"/>`;
const brows = (c, y = 46.5) => `<path d="M33.5 ${y}q5-3.2 10-1.2M66.5 ${y}q-5-3.2-10-1.2" stroke="${c}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".55"/>`;

function ears(a, ids) {
  const ol = `stroke="${deep(a.fur2, 0.5)}" stroke-width="2" stroke-linejoin="round"`;
  switch (a.ear) {
    case 'pointy': {
      const tip = a.earTip ? `<path d="M22.3 12.5C24.8 14.1 27.4 16 29.6 17.9C26.6 18.6 24 19.3 21.5 20.4C21.4 17.7 21.7 15 22.3 12.5Z" fill="${a.earTip}"/>` : '';
      const tuft = a.tufts ? `<path d="M22.4 13.5C21.6 9.5 21 6.5 19.6 2.5" stroke="${a.earTip}" stroke-width="2.6" stroke-linecap="round" fill="none"/>` : '';
      return mirror(`<path d="M22 50C19 38 19 24 22.4 12.5C31 18 39 25 45.5 33Z" fill="url(#${ids.ear})" ${ol}/><path d="M26 43.5C24.3 35.5 24.3 27 25.7 20.5C31 24 35.6 28.4 39.6 33.4Z" fill="${a.earIn}" opacity=".9"/>${tip}${tuft}`);
    }
    case 'round':
      return mirror(`<circle cx="27" cy="35" r="11.5" fill="url(#${ids.ear})" ${ol}/><circle cx="27.6" cy="35.6" r="6.2" fill="${a.earIn}"/>`);
    case 'small':
      return mirror(`<circle cx="28.5" cy="38" r="8" fill="url(#${ids.ear})" ${ol}/><circle cx="29" cy="38.5" r="4" fill="${a.earIn}"/>`);
    case 'long':
      return `<g transform="rotate(-11 39 32)"><path d="M39 45C31 42 29.5 22 32 9C34 0 44 0 46 9C48.5 22 47 42 39 45Z" fill="url(#${ids.ear})" ${ol}/><path d="M39 40C35 37 34.3 22 35.8 12C37 6 41 6 42.2 12C43.7 22 43 37 39 40Z" fill="${a.earIn}"/></g>`
        + `<g transform="rotate(11 61 32)"><path d="M61 45C53 42 51.5 22 54 9C56 0 66 0 68 9C70.5 22 69 42 61 45Z" fill="url(#${ids.ear})" ${ol}/><path d="M61 40C57 37 56.3 22 57.8 12C59 6 63 6 64.2 12C65.7 22 65 37 61 40Z" fill="${a.earIn}"/></g>`;
    case 'tufts':
      return mirror(`<path d="M24.5 45C22.5 36 21 28 20.5 18.5C28 22 36 27 42.5 33.5Z" fill="url(#${ids.ear})" ${ol}/><path d="M25 37.5 23.6 25M29 35.5 27 24.5" stroke="${deep(a.fur2, 0.3)}" stroke-width="1.2" stroke-linecap="round" opacity=".6"/>`);
    case 'moose':
      return mirror(`<path d="M27 49C21 47.5 14 43 10 37.5C17 36 24.5 38.5 31 44Z" fill="url(#${ids.ear})" ${ol}/><path d="M25 46.3C20.6 45 16.6 42.3 14 39.5C18.6 39.3 23 41 27 44Z" fill="${a.earIn}"/>`);
    case 'frog':
      return mirror(`<circle cx="34.5" cy="39.5" r="12.5" fill="url(#${ids.head})" ${ol}/>`);
    default: return '';
  }
}

function face(a, ids) {
  const ink = deep(a.fur2, 0.62);
  const E = ids.eye, B = ids.blush, M = ids.muz;
  switch (a.face) {
    case 'fox':
      return `<path d="M19.5 60C27 57.5 37 60 44 64.5L50 67L56 64.5C63 60 73 57.5 80.5 60C79 76 66 88.5 50 88.5C34 88.5 21 76 19.5 60Z" fill="url(#${M})"/>`
        + `<path d="M42 31.5Q50 29 58 31.5Q55 38 50 40Q45 38 42 31.5Z" fill="${lite(a.fur, 0.25)}" opacity=".5"/>`
        + eyes(E, 55.5, 11.5, 4.7) + brows(ink, 47) + nose(50, 66.5, 4.3, 3.7, a.nose) + mouth(50, 72.5, ink) + blush(B, 68, 29);
    case 'wolf':
      return `<path d="M50 28C40 28 33 34 30.5 44C38 41 45 44 50 50.5C55 44 62 41 69.5 44C67 34 60 28 50 28Z" fill="${deep(a.fur, 0.18)}" opacity=".55"/>`
        + `<path d="M21 61C28 59 38 61 44.5 65.5L50 68L55.5 65.5C62 61 72 59 79 61C77.5 76.5 65.5 88.5 50 88.5C34.5 88.5 22.5 76.5 21 61Z" fill="url(#${M})"/>`
        + eyes(E, 55, 11.8, 4.5) + `<path d="M32.5 50.5q6-3.4 11.5-.6M67.5 50.5q-6-3.4-11.5-.6" stroke="${ink}" stroke-width="1.7" fill="none" stroke-linecap="round" opacity=".6"/>`
        + nose(50, 66.5, 4.8, 3.8, a.nose) + mouth(50, 72.5, ink) + blush(B, 68, 29.5, 4.8);
    case 'lynx':
      return `<path d="M20 61C27 59 37 61 44 65L50 67.5L56 65C63 61 73 59 80 61C78.5 77 66 89 50 89C34 89 21.5 77 20 61Z" fill="url(#${M})"/>`
        + `<path d="M45 32.5q1.2 6 0 10.5M50 31v11M55 32.5q-1.2 6 0 10.5" stroke="${deep(a.fur2, 0.3)}" stroke-width="1.5" stroke-linecap="round" fill="none" opacity=".55"/>`
        + `<g fill="${deep(a.fur2, 0.25)}" opacity=".55"><circle cx="30" cy="48" r="1.6"/><circle cx="26.5" cy="54" r="1.3"/><circle cx="70" cy="48" r="1.6"/><circle cx="73.5" cy="54" r="1.3"/><circle cx="33" cy="42" r="1.1"/><circle cx="67" cy="42" r="1.1"/></g>`
        + eyes(E, 55, 11.5, 4.7) + nose(50, 66.5, 4.1, 3.4, a.nose) + mouth(50, 72.3, ink)
        + `<path d="M36 70.5 23 68.5M36 73.5 23 75M64 70.5 77 68.5M64 73.5 77 75" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".7"/>` + blush(B, 68.5, 30, 4.6);
    case 'raccoon':
      return `<path d="M47 31Q50 29.2 53 31L52.4 51H47.6Z" fill="${deep(a.fur, 0.35)}" opacity=".6"/>`
        + `<path d="M26 45.5C32 41 40 41 45 45M74 45.5C68 41 60 41 55 45" stroke="#f4f3ef" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
        + `<path d="M20.5 54C28 45 40 46 47 52L50 54L53 52C60 46 72 45 79.5 54C76 63.5 66 64.5 58 60.5C55 59 52.5 58.2 50 59.2C47.5 58.2 45 59 42 60.5C34 64.5 24 63.5 20.5 54Z" fill="#2a2932"/>`
        + `<ellipse cx="50" cy="71" rx="13" ry="10" fill="url(#${M})"/>`
        + eyes(E, 54.5, 11.5, 4.6) + nose(50, 66.5, 4.3, 3.5, a.nose) + mouth(50, 73, '#3a3942', 5) + blush(B, 68.5, 30, 4.4);
    case 'beaver':
      return `<ellipse cx="50" cy="70.5" rx="15.5" ry="11.5" fill="url(#${M})"/>`
        + eyes(E, 54, 12, 4.5) + brows(ink, 46) + nose(50, 64.8, 5.6, 4, a.nose)
        + `<path d="M44.5 70.5Q47.2 72.6 50 70.6Q52.8 72.6 55.5 70.5" stroke="${ink}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
        + `<g stroke="#c8b49a" stroke-width=".7"><rect x="46" y="71.4" width="3.8" height="7" rx="1.3" fill="#fffdf6"/><rect x="50.2" y="71.4" width="3.8" height="7" rx="1.3" fill="#fffdf6"/></g>` + blush(B, 66.5, 30);
    case 'bunny':
      return `<circle cx="45.2" cy="70" r="7" fill="url(#${M})"/><circle cx="54.8" cy="70" r="7" fill="url(#${M})"/>`
        + eyes(E, 57, 11.5, 4.4) + nose(50, 66.2, 3, 2.5, a.nose)
        + `<path d="M50 68.4v3M47 73.6q3 2 6 0" stroke="${deep(a.nose, 0.3)}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`
        + `<g fill="${deep(a.fur2, 0.2)}" opacity=".6"><circle cx="42" cy="69" r=".8"/><circle cx="43" cy="72" r=".8"/><circle cx="58" cy="69" r=".8"/><circle cx="57" cy="72" r=".8"/></g>` + blush(B, 66, 29.5);
    case 'frog':
      return `<ellipse cx="50" cy="77" rx="25" ry="10" fill="url(#${M})" opacity=".85"/>`
        + `<circle cx="34.5" cy="38.5" r="8.4" fill="#fffef6"/><circle cx="65.5" cy="38.5" r="8.4" fill="#fffef6"/>`
        + eye(35.2, 39.5, 5, E) + eye(64.8, 39.5, 5, E)
        + `<path d="M29 69Q50 84 71 69" stroke="${deep(a.fur2, 0.45)}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
        + `<circle cx="46.5" cy="61" r="1.1" fill="${deep(a.fur2, 0.5)}"/><circle cx="53.5" cy="61" r="1.1" fill="${deep(a.fur2, 0.5)}"/>` + blush(B, 66.5, 25.5, 5);
    case 'owl':
      return `<path d="M50 45C42 35 22 36 22 55C22 71 40 80 50 74C60 80 78 71 78 55C78 36 58 35 50 45Z" fill="url(#${M})"/>`
        + `<path d="M43 36.5l3 2.8 3-2.8M51 36.5l3 2.8 3-2.8" stroke="${deep(a.fur2, 0.3)}" stroke-width="1.3" fill="none" stroke-linecap="round" opacity=".6"/>`
        + `<circle cx="38.5" cy="56" r="10" fill="#fffaf0"/><circle cx="61.5" cy="56" r="10" fill="#fffaf0"/>`
        + eye(38.5, 56, 6.4, E) + eye(61.5, 56, 6.4, E)
        + `<path d="M45.5 62.5Q50 60.2 54.5 62.5L50 71.5Z" fill="url(#${ids.nose})"/>`
        + `<path d="M38 84q3 3 6 0q3 3 6 0q3 3 6 0" stroke="${deep(a.fur2, 0.25)}" stroke-width="1.3" fill="none" opacity=".5"/>`;
    case 'bear':
      return `<ellipse cx="50" cy="70" rx="14.5" ry="11.2" fill="url(#${M})"/>`
        + eyes(E, 54, 12, 4.4) + brows(lite(a.fur, 0.35), 45.5) + nose(50, 65.2, 5.4, 4.2, a.nose) + mouth(50, 72.6, ink) + blush(B, 66, 30.5, 5);
    case 'otter':
      return `<circle cx="44.4" cy="70.5" r="8.4" fill="url(#${M})"/><circle cx="55.6" cy="70.5" r="8.4" fill="url(#${M})"/>`
        + eyes(E, 55, 12, 4.5) + nose(50, 65.2, 4.8, 3.7, a.nose)
        + `<path d="M50 68v3.4M46.5 74.5q3.5 2.6 7 0" stroke="${ink}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`
        + `<g fill="${deep(a.muzzle, 0.45)}"><circle cx="40.5" cy="69" r=".8"/><circle cx="42.5" cy="72.5" r=".8"/><circle cx="59.5" cy="69" r=".8"/><circle cx="57.5" cy="72.5" r=".8"/></g>`
        + `<path d="M38 70.5 23 67.5M38 73.5 23 75M62 70.5 77 67.5M62 73.5 77 75" stroke="${deep(a.fur2, 0.4)}" stroke-width=".9" stroke-linecap="round" opacity=".75"/>` + blush(B, 67, 29.5, 4.6);
    case 'skunk':
      return `<path d="M45 28.4Q50 26.4 55 28.4L53.6 54Q50 56 46.4 54Z" fill="url(#${ids.stripe})"/>`
        + `<ellipse cx="50" cy="70.5" rx="12.5" ry="9.5" fill="url(#${M})"/>`
        + eyes(E, 55.5, 11.8, 4.6) + nose(50, 66, 4, 3.3, a.nose) + mouth(50, 72.6, '#1a171f') + blush(B, 67.5, 30, 5);
    case 'moose':
      return `<path d="M45.4 84C43.8 90 44.4 95.6 47.2 98.2C48.8 99.6 51.2 99.6 52.8 98.2C55.6 95.6 56.2 90 54.6 84Z" fill="${a.fur2}" stroke="${deep(a.fur2, 0.5)}" stroke-width="1.8" stroke-linejoin="round"/>`
        + `<path d="M37 60C37 55 42.5 53 50 53C57.5 53 63 55 63 60L65.6 70.5C68.6 81 61.2 88.5 50 88.5C38.8 88.5 31.4 81 34.4 70.5Z" fill="url(#${M})" stroke="${deep(a.fur2, 0.45)}" stroke-width="1.2" stroke-opacity=".5"/>`
        + `<ellipse cx="44" cy="61.5" rx="7" ry="3" fill="#fff" opacity=".18"/><ellipse cx="50" cy="72" rx="11" ry="6" fill="#fff" opacity=".1"/>`
        + `<path d="M40.6 78.4C40 74.6 42.6 72.8 44.6 74.6C46.2 76.2 45.4 80.4 43 80.8C41.8 81 40.8 80 40.6 78.4Z" fill="${a.nose}"/><path d="M59.4 78.4C60 74.6 57.4 72.8 55.4 74.6C53.8 76.2 54.6 80.4 57 80.8C58.2 81 59.2 80 59.4 78.4Z" fill="${a.nose}"/>`
        + `<path d="M44 83.4Q50 86.4 56 83.4" stroke="${ink}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
        + eye(38, 48.5, 4.3, E) + eye(62, 48.5, 4.3, E) + blush(B, 58, 27, 4.6);
    default: return '';
  }
}

/** Palmate moose antler, local coords: base at (0,0), growing up and to the right. */
const ANTLER = 'M0 0C3 -3 7 -5 11 -6C10 -10 10 -13 11.5 -16C12.8 -13.5 14 -11.5 15.5 -10.5C15 -17 16.5 -23 20 -27C21 -24 22 -22.5 23.5 -22C24.5 -26.5 27 -30 30.5 -31.5C30.8 -28 31 -26 31.5 -24.5C33.5 -28 36.5 -30 40 -30C39 -27 38.5 -25 38 -23.5C41 -25 44 -25.5 47 -24.5C45 -21.5 43.5 -19.5 41.5 -18.5C44 -18 46.5 -16.5 48 -14.5C44 -11 37 -9 30 -8.5C21 -7.5 12 -4 6 3Z';
function antlerPair(lx, ly, rx, ry, s = 1, fill = null, line = '#7d6240', tilt = 0) {
  let defs = '';
  if (!fill) { const g = nid('ant'); defs = `<defs>${lin(g, '#fbf0d6', '#cfb383')}</defs>`; fill = `url(#${g})`; }
  const one = (x, y, flip) => `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s}) rotate(${-tilt})"><path d="${ANTLER}" fill="${fill}" stroke="${line}" stroke-width="${f1(2 / s)}" stroke-linejoin="round"/><path d="M14 -10.5C22 -14 31 -15.5 41 -15" stroke="#fff" stroke-opacity=".45" stroke-width="${f1(1.4 / s)}" fill="none" stroke-linecap="round"/></g>`;
  return defs + one(lx, ly, true) + one(rx, ry, false);
}

/** One antler at (x, y); flip = grows to the left. */
function antler(x, y, flip, s, gradId, line, tilt = 0) {
  return `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s}) rotate(${-tilt})"><path d="${ANTLER}" fill="url(#${gradId})" stroke="${line}" stroke-width="${f1(2.1 / s)}" stroke-linejoin="round"/>`
    + '<path d="M16 -11C22 -10 30 -10.6 38 -12.6C33 -9.6 26 -8.8 19 -8.4Z" fill="#7a5a34" opacity=".18"/>'
    + `<path d="M14 -10.5C22 -14 31 -15.5 41 -15" stroke="#fff" stroke-opacity=".5" stroke-width="${f1(1.4 / s)}" fill="none" stroke-linecap="round"/></g>`;
}

// ---------------------------------------------------------------- hats
function hat(id) {
  const g = (a, b, x2 = 0, y2 = 1) => { const k = nid('h'); return [k, lin(k, a, b, x2, y2)]; };
  const ol = (c) => `stroke="${deep(c, 0.55)}" stroke-width="2" stroke-linejoin="round"`;
  switch (id) {
    case 'beanie': {
      const [a, A] = g('#e85a4b', '#a8322a'); const [b, Bd] = g('#b8392d', '#86271e');
      return `<g><defs>${A}${Bd}</defs><path d="M24 40C24 16.5 76 16.5 76 40Z" fill="url(#${a})" ${ol('#c0392b')}/>
        <path d="M33 37C34 27 38 22 44 20M43 37V22M57 37V22M67 37C66 27 62 22 56 20" stroke="#7d2219" stroke-width="1.2" fill="none" opacity=".5"/>
        <path d="M31 30C35 23 42 20.5 48 20" stroke="#fff" stroke-opacity=".3" stroke-width="2.4" fill="none" stroke-linecap="round"/>
        <rect x="22" y="35.5" width="56" height="10" rx="5" fill="url(#${b})" ${ol('#a83426')}/>
        <path d="M28 37v7M33 37v7M38 37v7M43 37v7M48 37v7M53 37v7M58 37v7M63 37v7M68 37v7M73 37v7" stroke="#6e1d15" stroke-width="1.1" opacity=".55"/>
        <circle cx="50" cy="16" r="7" fill="#f7f1e4" ${ol('#cfc4b0')}/><circle cx="47.8" cy="13.8" r="2.4" fill="#fff"/></g>`;
    }
    case 'bandana': {
      const [a, A] = g('#e04a3a', '#a92a1f');
      return `<g><defs>${A}</defs><path d="M21.5 42Q50 29 78.5 42L76.5 49Q50 38 23.5 49Z" fill="url(#${a})" ${ol('#c33a2c')}/>
        <g fill="#fff" opacity=".9"><circle cx="31" cy="42.5" r="1.3"/><circle cx="41" cy="38.6" r="1.3"/><circle cx="50" cy="37.4" r="1.3"/><circle cx="59" cy="38.6" r="1.3"/><circle cx="69" cy="42.5" r="1.3"/></g>
        <path d="M76 44 87.5 37.5 85.5 48.5Z" fill="url(#${a})" ${ol('#c33a2c')}/><path d="M76 46.5 89 50.5 80.5 55Z" fill="#a92a1f" ${ol('#c33a2c')}/></g>`;
    }
    case 'ranger': {
      const [a, A] = g('#d2b077', '#a07c45'); const [b, Bd] = g('#b9955c', '#8a6a3a');
      return `<g><defs>${A}${Bd}</defs><ellipse cx="50" cy="38.5" rx="38" ry="7.5" fill="url(#${b})" ${ol('#a3814a')}/>
        <path d="M30 37C30 16 40 12 50 21C60 12 70 16 70 37Z" fill="url(#${a})" ${ol('#c09c60')}/>
        <path d="M44 16.5 50 23.5 56 16.5" stroke="#8b6b3a" stroke-width="1.5" fill="none"/>
        <path d="M34 30C35 22 38 18 42 17" stroke="#fff" stroke-opacity=".3" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <rect x="30" y="31" width="40" height="5.5" fill="#4a3018"/><path d="M62 31v5.5" stroke="#d9b36a" stroke-width="2"/></g>`;
    }
    case 'flowers':
      return `<g><path d="M21 42Q50 21 79 42" stroke="#4f8a33" stroke-width="2.6" fill="none" stroke-linecap="round"/>
        <path d="M31 34.5q-4-5 1-7q2 4-1 7ZM69 34.5q4-5-1-7q-2 4 1 7Z" fill="#6fae49"/>
        ${[[25.5, 39, '#f7b9d5', '#ec8db8'], [36, 30.5, '#fff2a0', '#f1d25a'], [50, 27, '#cbb6f4', '#a68be6'], [64, 30.5, '#ffd0a0', '#f4a861'], [74.5, 39, '#f7b9d5', '#ec8db8']].map(([x, y, c, c2]) =>
        `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((r) => `<ellipse rx="2.6" ry="3.9" cy="-3.6" transform="rotate(${r})" fill="${c}" stroke="${c2}" stroke-width=".7"/>`).join('')}<circle r="2.2" fill="#f2b632"/><circle r=".8" cx="-.6" cy="-.6" fill="#fff6c8"/></g>`).join('')}</g>`;
    case 'headlamp': {
      const glow = nid('lamp');
      return `<g><defs>${rad(glow, [[0, '#fff8c4', 0.9], [0.4, '#fff1a0', 0.35], [1, '#fff1a0', 0]], '50%', '50%', '50%')}</defs>
        <path d="M20.5 44.5Q50 31.5 79.5 44.5" stroke="#2b2b31" stroke-width="5.5" fill="none" stroke-linecap="round"/>
        <path d="M20.5 44.5Q50 31.5 79.5 44.5" stroke="#4a4a54" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>
        <circle cx="50" cy="35" r="17" fill="url(#${glow})"/>
        <rect x="40.5" y="28.5" width="19" height="13" rx="4.5" fill="#3d3d46" stroke="#1b1b20" stroke-width="2"/>
        <circle cx="50" cy="35" r="4.8" fill="#fff6b0" stroke="#d9c25a" stroke-width="1"/><circle cx="48.6" cy="33.6" r="1.6" fill="#fff"/></g>`;
    }
    case 'coonskin': {
      const [a, A] = g('#9c7a56', '#6d5134');
      return `<g><defs>${A}</defs><path d="M74 40Q90 46 88 72" stroke="${deep('#6d5134', 0.55)}" stroke-width="11.5" fill="none" stroke-linecap="round"/>
        <path d="M74 40Q90 46 88 72" stroke="#94724e" stroke-width="7.5" fill="none" stroke-linecap="round"/>
        <path d="M84.5 51.5l6.5 2M86 59.5l6.4.8M86 67.5h5.6" stroke="#3a2a1c" stroke-width="3.2" stroke-linecap="round"/>
        <path d="M24 42C22 17.5 78 17.5 76 42Z" fill="url(#${a})" ${ol('#8a6a4a')}/>
        <path d="M33 25q4-4 9-5M38 30q4-3 8-3.6M55 22.5q5 1 8 4" stroke="#5a4028" stroke-width="1.2" fill="none" opacity=".55" stroke-linecap="round"/>
        <path d="M24 42Q50 36 76 42L76 46.5Q50 40.5 24 46.5Z" fill="#634a30" ${ol('#6e5236')}/></g>`;
    }
    case 'lumberjack': {
      const p = nid('plaid');
      return `<g><defs><pattern id="${p}" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="#cc3434"/><rect width="4.5" height="9" fill="#1d1d1d" opacity=".45"/><rect width="9" height="4.5" fill="#1d1d1d" opacity=".45"/><path d="M0 7h9M7 0v9" stroke="#f0c040" stroke-width=".5" opacity=".6"/></pattern></defs>
        <path d="M24.5 40 18 57 28.5 55Z M75.5 40 82 57 71.5 55Z" fill="url(#${p})" ${ol('#a52a2a')}/>
        <path d="M25 42C25 19.5 75 19.5 75 42Z" fill="url(#${p})" ${ol('#a52a2a')}/>
        <path d="M30 30C33 24 39 21.5 45 21" stroke="#fff" stroke-opacity=".25" stroke-width="2.4" fill="none" stroke-linecap="round"/>
        <rect x="24" y="38" width="52" height="5.5" rx="2.5" fill="#2a2a2a"/></g>`;
    }
    case 'bucket': {
      const [a, A] = g('#a3ae78', '#76824f'); const [b, Bd] = g('#8a9661', '#646e43');
      return `<g><defs>${A}${Bd}</defs><path d="M17.5 42Q50 29 82.5 42L76.5 47Q50 38.5 23.5 47Z" fill="url(#${b})" ${ol('#7e8a5a')}/>
        <path d="M28 41.5C30 21.5 70 21.5 72 41.5Z" fill="url(#${a})" ${ol('#94a06c')}/>
        <path d="M33 33C34 27 38 24 43 23" stroke="#fff" stroke-opacity=".28" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <rect x="29" y="35" width="42" height="4.2" fill="#56603a"/>
        <path d="M65.5 30.5l6.5-4.3 2 6.4Z" fill="#e8592b" stroke="#a83d1a" stroke-width=".8"/><circle cx="69" cy="31" r="1" fill="#fff"/><path d="M68 32.5q-1 3 1 4" stroke="#bbb" stroke-width=".7" fill="none"/></g>`;
    }
    case 'antlers':
      return `<g>${antlerPair(36, 38.5, 64, 38.5, 0.78, null, '#7d6240', 8)}<path d="M24 42Q50 30 76 42" stroke="#7a3b2e" stroke-width="4.6" fill="none" stroke-linecap="round"/><path d="M27 40.5Q50 30.5 73 40.5" stroke="#b25a46" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".7"/></g>`;
    case 'pinecrown':
      return `<g><path d="M23.5 42Q50 31.5 76.5 42" stroke="#3f5f27" stroke-width="5.4" fill="none" stroke-linecap="round"/>
        <path d="M27 40Q50 31 73 40" stroke="#6f9a45" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8"/>
        ${[30, 40, 50, 60, 70].map((x, i) => `<g transform="translate(${x} ${i === 2 ? 26 : i % 2 ? 30 : 35})"><ellipse rx="4.8" ry="7.4" fill="#8f5c2c" stroke="#4a2a12" stroke-width="1.5"/><path d="M-4 -3.5Q0 -1.5 4 -3.5M-4.5 .5Q0 2.5 4.5 .5M-3.5 4.4Q0 6 3.5 4.4" stroke="#5e3a17" stroke-width="1.1" fill="none"/><ellipse rx="1.6" ry="3" cx="-1.6" cy="-2" fill="#fff" opacity=".18"/></g>`).join('')}</g>`;
    case 'goldantlers': {
      const k = nid('gold');
      return `<g><defs><linearGradient id="${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4b0"/><stop offset=".45" stop-color="#ffcf45"/><stop offset="1" stop-color="#d38f12"/></linearGradient></defs>
        ${antlerPair(36, 38.5, 64, 38.5, 0.8, `url(#${k})`, '#8a5c08', 8)}<path d="M24 42Q50 30 76 42" stroke="#d99a15" stroke-width="4.6" fill="none" stroke-linecap="round"/>
        <path d="M50 10.5c.6 3 1.6 4 4.6 4.6-3 .6-4 1.6-4.6 4.6-.6-3-1.6-4-4.6-4.6 3-.6 4-1.6 4.6-4.6Z" fill="#fff8d0" class="sparkle"/></g>`;
    }
    default: return '';
  }
}

/** A forest mascot head (with optional hat) as an SVG string. */
export function mascotSVG(id = 'fox', hatId = 'none', cls = '') {
  const a = ANIMALS[id] || ANIMALS.fox;
  const ids = { head: nid('hd'), ear: nid('er'), muz: nid('mz'), eye: nid('ey'), blush: nid('bl'), clip: nid('cl'), nose: nid('ns'), stripe: nid('st') };
  const H = HEADS[a.head] || HEADS.round;
  const outline = deep(a.fur2, 0.5);
  const defs = rad(ids.head, [[0, lite(a.fur, 0.3)], [0.55, a.fur], [1, deep(a.fur2, 0.12)]])
    + lin(ids.ear, lite(a.fur2, 0.12), deep(a.fur2, 0.1))
    + lin(ids.muz, lite(a.muzzle, 0.25), mix(a.muzzle, a.fur2, 0.18))
    + rad(ids.eye, [[0, '#0d0806'], [0.56, '#0d0806'], [0.8, deep(a.iris, 0.15)], [1, deep(a.iris, 0.55)]], '50%', '50%', '50%')
    + rad(ids.blush, [[0, '#ff8fa3', 0.6], [1, '#ff8fa3', 0]], '50%', '50%', '50%')
    + lin(ids.nose, lite(a.nose, 0.3), deep(a.nose, 0.2))
    + lin(ids.stripe, '#ffffff', '#dcdce4')
    + `<clipPath id="${ids.clip}"><path d="${H}"/></clipPath>`;
  return `<svg class="mascot ${cls}" viewBox="0 0 100 100" aria-hidden="true"><defs>${defs}</defs>
    <ellipse cx="50" cy="94.5" rx="24" ry="3.6" fill="#000" opacity=".3"/>
    ${a.antlers ? antlerPair(36, 38, 64, 38, 0.8, null, '#7d6240', 8) : ''}
    ${ears(a, ids)}
    <path d="${H}" fill="url(#${ids.head})"/>
    <g clip-path="url(#${ids.clip})"><path d="${H}" fill="${RIM}" opacity=".55"/><path d="${H}" fill="url(#${ids.head})" transform="translate(-2.6 -3.2)"/>
      <ellipse cx="37" cy="38" rx="15" ry="8" fill="#fff" opacity=".13" transform="rotate(-24 37 38)"/></g>
    <path d="${H}" fill="none" stroke="${outline}" stroke-width="2.1" stroke-linejoin="round"/>
    ${face(a, ids)}
    ${hat(hatId)}
  </svg>`;
}

// ---------------------------------------------------------------- moose
/**
 * The Mivimoose — a round, inflatable moose in three-quarter view, facing left.
 * What makes it read as a moose: a long Roman-nosed muzzle ending in an overhanging bulb nose,
 * eyes set high near the antlers, a hairy bell under the chin, a shoulder hump with a mane,
 * broad scoop-shaped palmate antlers, and long legs with pale stockings and split hooves.
 * The body group scales with the CSS var --puff; its colour follows --moose-hi / --moose-lo.
 */
export function mooseSVG() {
  const id = (p) => nid('m' + p);
  const g = id('b'), h = id('h'), sheen = id('s'), leg = id('l'), legFar = id('f'), eg = id('e'), bl = id('c'), bulb = id('n'), ear = id('r'), nk = id('k'), ant = id('a'), antFar = id('d');
  const OL = '#2a160c';
  const legPath = (x, top, bot) => `M${x - 6.8} ${top}C${x - 6.6} ${top + 13} ${x - 4.8} ${bot - 15} ${x - 4.2} ${bot - 4.5}L${x + 4.2} ${bot - 4.5}C${x + 4.8} ${bot - 15} ${x + 6.6} ${top + 13} ${x + 6.8} ${top}Z`;
  const hoof = (x, bot) => `<path d="M${x - 4.4} ${bot - 5}H${x + 4.4}L${x + 5.2} ${bot}Q${x} ${bot + 1.4} ${x - 5.2} ${bot}Z" fill="#1d1009" stroke="${OL}" stroke-width="1.6" stroke-linejoin="round"/><path d="M${x} ${bot - 3.6}V${bot + 0.4}" stroke="#5a3a24" stroke-width="1"/>`;
  const L = (cls, x, top, bot, far) => `<g class="leg ${cls}"><path d="${legPath(x, top, bot)}" fill="url(#${far ? legFar : leg})" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/>${hoof(x, bot)}</g>`;
  const HEAD = 'M70 38C80 38 86.5 45.5 86.5 54.5C86.5 63 82 71 75.5 77C70 82 63 86.5 55 89C51 90.5 47 94 41.5 95.5C36 96.8 31 95 28 92C22.5 91.5 17.5 86 17.5 78C17.5 69 23.5 62.5 32 61.5C40 60.5 46.5 55 50.5 48.5C54.5 42 61 38 70 38Z';
  return `<svg class="moose-svg" viewBox="0 0 160 150" aria-hidden="true">
    <defs>
      <radialGradient id="${g}" cx="34%" cy="28%" r="80%"><stop offset="0" style="stop-color:var(--moose-hi,#9a643b)"/><stop offset="1" style="stop-color:var(--moose-lo,#5a361d)"/></radialGradient>
      <linearGradient id="${h}" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5e3820"/><stop offset=".42" stop-color="#7f5130"/><stop offset=".78" stop-color="#a87650"/><stop offset="1" stop-color="#b98a5e"/></linearGradient>
      ${rad(bulb, [[0, '#e0b285', 0.85], [0.6, '#c49064', 0.35], [1, '#c49064', 0]], '45%', '35%', '55%')}
      ${rad(sheen, [[0, '#fff', 0.5], [1, '#fff', 0]], '50%', '50%', '50%')}
      ${rad(nk, [[0, '#1a0c05', 0.4], [1, '#1a0c05', 0]], '50%', '50%', '50%')}
      <linearGradient id="${leg}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a361d"/><stop offset=".6" stop-color="#432815"/><stop offset=".7" stop-color="#cdb08b"/><stop offset="1" stop-color="#a88b66"/></linearGradient>
      <linearGradient id="${legFar}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3e2413"/><stop offset=".6" stop-color="#2f1b0e"/><stop offset=".7" stop-color="#a38967"/><stop offset="1" stop-color="#836d4e"/></linearGradient>
      ${lin(ear, '#7a4c2c', '#4e2f19')}
      ${lin(ant, '#fbf1d8', '#c9a874')}${lin(antFar, '#e9dbbb', '#b39364')}
      ${rad(eg, [[0, '#0d0806'], [0.55, '#0d0806'], [0.8, '#5a3216'], [1, '#2a170a']], '50%', '50%', '50%')}
      ${rad(bl, [[0, '#ff8fa3', 0.5], [1, '#ff8fa3', 0]], '50%', '50%', '50%')}
    </defs>
    <ellipse class="m-shadow" cx="96" cy="141" rx="48" ry="5.5" fill="#000" opacity=".34"/>
    <g class="m-legs">${L('l2', 81, 96, 137, true)}${L('l4', 128, 96, 137, true)}${L('l1', 66, 98, 140)}${L('l3', 115, 98, 140)}</g>
    <g class="m-body">
      <g class="m-tail"><path d="M139.5 69C145 66 150.5 69.5 149 76C147.6 80.5 142.5 80.5 140 77Z" fill="#4a2c17" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/><path d="M144 70.5q3 1.6 3.4 5" stroke="#7a5034" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".7"/></g>
      <path d="M56 74C56 60 64 50 76 47C82 40 94 38 103 44C126 44 143 60 143 81C143 103 126 117 101 117H84C66 117 54 104 54 89C54 83 54.5 78 56 74Z" fill="url(#${g})" stroke="${OL}" stroke-width="2.4" stroke-linejoin="round"/>
      <ellipse cx="102" cy="104.5" rx="30" ry="10.5" fill="#f0d2a6" opacity=".2"/>
      <path d="M118 66q2.4-1.6 4.6-.6M128 80q2-1.8 4.4-1M112 92q2.6-1.2 4.8.2M124 100q2.4-.8 4.4.8M95 82q2.6-1.4 5-.2M86 98q2.4-1.2 4.6 0" stroke="#2a1608" stroke-width="1.3" fill="none" stroke-linecap="round" opacity=".28"/>
      <g class="m-valve"><rect x="136.5" y="94" width="7" height="5" rx="1.6" fill="#e9d8b4" stroke="${OL}" stroke-width="1.5" transform="rotate(-28 140 96.5)"/><circle cx="143.2" cy="92.6" r="2.1" fill="#d6c19a" stroke="${OL}" stroke-width="1.3"/></g>
      <ellipse cx="80" cy="77" rx="17" ry="22" fill="url(#${nk})"/>
      <path d="M79 49.5q2-5.2 6-6.6M87.5 45.5q2.6-4.6 6.6-5.2M96.5 44.2q3-3.6 7-3.2M105 45.6q3.2-2.6 7-1.8" stroke="#2a1608" stroke-width="2" fill="none" stroke-linecap="round" opacity=".5"/>
      <ellipse cx="97" cy="62" rx="22" ry="9.5" fill="url(#${sheen})" transform="rotate(-14 97 62)"/>
      <circle cx="106" cy="57.5" r="2.2" fill="#fff" opacity=".5"/>
      <path d="M139.5 92C134.5 107.5 121 116 102 117" stroke="${RIM}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".55"/>
      <path class="m-stretch" d="M104 58q6-6 12 0M124 76q5-5.5 10 0M92 109q6-5 12 0" stroke="#fff" stroke-opacity="0" stroke-width="2" fill="none" stroke-linecap="round"/>
    </g>
    <g class="m-head">
      <g class="m-ear m-ear-far"><path d="M80 46C86 39 94 35 102.5 35C99.5 42.5 92.5 48 83.5 50.5Z" fill="url(#${ear})" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M84 46.2C88.2 42 93.2 39.3 98.4 38.7C95.4 42.8 90.6 45.8 85.6 47.6Z" fill="#c99872"/></g>
      ${antler(76, 42, false, 0.94, antFar, '#5f4629', 6)}
      <path d="M59.5 82C56.5 90 55.5 98 57.6 104C59.4 109.4 66.8 109.6 68.4 104.2C70 98 70.6 90 72 82Z" fill="url(#${ear})" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M60.2 88.5C59.2 94.5 59.4 99.5 61 103.6" stroke="#9a6a44" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/>
      <path d="M58.8 106.6l-1.8 3.6M62.4 108.6l-.4 4M66 107.6l1.2 3.6" stroke="${OL}" stroke-width="1.7" stroke-linecap="round"/>
      <path d="${HEAD}" fill="url(#${h})"/>
      <ellipse cx="28.6" cy="76" rx="10.4" ry="13" fill="url(#${bulb})"/>
      <path d="${HEAD}" fill="none" stroke="${OL}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M48 54.5C42.5 61 36 63 30.5 64" stroke="#3a2010" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".35"/>
      <ellipse cx="24.5" cy="68.6" rx="5.2" ry="2.4" fill="#fff" opacity=".3" transform="rotate(-28 24.5 68.6)"/>
      <ellipse cx="68" cy="43.5" rx="9" ry="3.4" fill="#fff" opacity=".13" transform="rotate(-8 68 43.5)"/>
      <ellipse cx="23.2" cy="80" rx="2.6" ry="4.2" fill="#24110a" transform="rotate(16 23.2 80)"/>
      <ellipse cx="32" cy="83.4" rx="2" ry="3.3" fill="#24110a" transform="rotate(6 32 83.4)"/>
      <path class="m-mouth" d="M27.5 90.6C33.5 93 40.5 92.6 47 89.2" stroke="#3a2010" stroke-width="1.9" fill="none" stroke-linecap="round"/>
      <path class="m-mouth-hot" d="M28 91.2q2.6-2.4 5.2 0t5.2 0t5.2 0t4.4-.4" stroke="#3a2010" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M85.5 62C83.5 70 79.5 75 74.5 79" stroke="${RIM}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".3"/>
      <g class="m-eyes">${eye(59.5, 54, 5.6, eg)}${eye(75, 50.5, 4.5, eg)}</g>
      <path class="m-brow" d="M52.2 46.2q6.2-4.6 12.6-1.6M70.2 43.2q4.8-3.4 9.8-1" stroke="#2e1708" stroke-width="1.9" fill="none" stroke-linecap="round"/>
      <path class="m-brow-hot" d="M52.6 44.6q6-1.2 11.4-4.6M70.6 39.8q4.8 1.6 9.4 3.8" stroke="#2e1708" stroke-width="2.1" fill="none" stroke-linecap="round"/>
      <g class="m-blush"><ellipse cx="67" cy="66.5" rx="5.2" ry="3.2" fill="url(#${bl})"/><ellipse cx="82" cy="60" rx="3.4" ry="2.3" fill="url(#${bl})"/></g>
      <g class="m-ear m-ear-near"><path d="M60.5 47C55 40.5 48 35.5 38.5 33.6C41.5 41.8 48 47.6 56.6 51Z" fill="url(#${ear})" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M57.4 47.6C53.6 43 48.8 39.6 43.6 38C46 42.6 50 46 54.6 48.6Z" fill="#d4a47c"/></g>
      ${antler(62.5, 42.5, true, 1, ant, '#6e5434', 6)}
      <g class="m-sweat"><path d="M92 33q4.6 6.6 0 9.6q-4.6-3 0-9.6" fill="#a6dcff" stroke="#3a6b8a" stroke-width="1"/><circle cx="90.8" cy="38.6" r="1" fill="#fff"/></g>
    </g>
  </svg>`;
}

// ---------------------------------------------------------------- campfire
export function campfireSVG() {
  const glow = nid('fg'), coal = nid('fc'), bark = nid('fb'), bark2 = nid('fb'), endg = nid('fe'), o = nid('fo'), m = nid('fm'), c = nid('fk'), st = nid('fs'), stB = nid('fs');
  const back = [[18, 89, 8.5], [33, 86, 8], [50, 84.5, 8.5], [70, 84.5, 8.5], [87, 86, 8], [102, 89, 8.5]];
  const front = [[14, 97, 9], [27, 103, 8.5], [43.5, 106, 9.5], [61, 107, 9.5], [78, 106, 9.5], [93.5, 103, 8.5], [106, 97, 8.5]];
  const stone = ([x, y, r], f) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${f1(r * 0.64)}" fill="url(#${f})" stroke="#241c1c" stroke-width="1.5"/>`;
  const ends = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="5" ry="5.8" fill="url(#${endg})" stroke="#2a160c" stroke-width="1.6"/><ellipse cx="${x}" cy="${y}" rx="3" ry="3.6" fill="none" stroke="#a46f3e" stroke-width=".9"/><circle cx="${x}" cy="${y}" r="1" fill="#a46f3e"/>`;
  return `<svg class="campfire-svg" viewBox="0 0 120 112" aria-hidden="true">
    <defs>
      ${rad(glow, [[0, '#ffae4a', 0.6], [0.5, '#ff7a2a', 0.18], [1, '#ff7a2a', 0]], '50%', '62%', '50%')}
      ${rad(coal, [[0, '#fff1a8'], [0.35, '#ff9a2e'], [0.7, '#e2461c', 0.7], [1, '#e2461c', 0]], '50%', '50%', '50%')}
      ${lin(bark, '#8a5530', '#4a2914')}${lin(bark2, '#76452a', '#3d210f')}
      ${rad(endg, [[0, '#f3c88f'], [1, '#c9915a']], '50%', '50%', '60%')}
      <linearGradient id="${o}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#e2401b"/><stop offset=".6" stop-color="#ff6f22"/><stop offset="1" stop-color="#ff9a3a"/></linearGradient>
      <linearGradient id="${m}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff8a24"/><stop offset="1" stop-color="#ffd24d"/></linearGradient>
      <linearGradient id="${c}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#fffbe6"/></linearGradient>
      ${lin(st, '#d9a785', '#5b5550')}${lin(stB, '#8e7462', '#3e3a38')}
    </defs>
    <ellipse cx="60" cy="68" rx="59" ry="44" fill="url(#${glow})"/>
    <ellipse cx="60" cy="97" rx="48" ry="10" fill="#1c1418" opacity=".55"/>
    ${back.map((s) => stone(s, stB)).join('')}
    <ellipse cx="60" cy="89" rx="26" ry="7" fill="url(#${coal})"/>
    <g class="logs">
      <rect x="22" y="80" width="76" height="12" rx="6" fill="url(#${bark2})" stroke="#2a160c" stroke-width="1.8" transform="rotate(13 60 86)"/>
      <rect x="22" y="80" width="76" height="12" rx="6" fill="url(#${bark})" stroke="#2a160c" stroke-width="1.8" transform="rotate(-13 60 86)"/>
      <path d="M36 84.5 52 81M64 80l16 3.6" stroke="#2f1a0c" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>
      ${ends(24.6, 77.6)}${ends(95.4, 77.6)}
    </g>
    <g class="flames">
      <path class="f1" d="M60 90C37 89 33 66 44 51C45 61 50 63 52 56C53 43 59 32 68 20C67 34 76 40 79 50C80 44 82 41 86 38C88 50 87 62 83 72C79 83 71 90 60 90Z" fill="url(#${o})"/>
      <path class="f2" d="M60 90C46 89 44 75 51 65C52 71 56 72 58 66C60 58 62 52 67 45C68 57 76 63 74 74C73 84 67 90 60 90Z" fill="url(#${m})"/>
      <path class="f3" d="M60 90C52 90 50 82 54 76C56 79 59 79 60 74C62 70 63 68 65 65C67 72 69 77 67 82C66 87 64 90 60 90Z" fill="url(#${c})"/>
    </g>
    <g class="embers"><circle cx="50" cy="44" r="1.5" fill="#ffd27a"/><circle cx="71" cy="33" r="1.2" fill="#ffb04a"/><circle cx="58" cy="24" r="1" fill="#ffe6a0"/><circle cx="66" cy="40" r=".9" fill="#ffd27a"/></g>
    ${front.map((s) => stone(s, st)).join('')}
    <g fill="#fff" opacity=".16">${front.map(([x, y, r]) => `<ellipse cx="${f1(x - r * 0.22)}" cy="${f1(y - r * 0.26)}" rx="${f1(r * 0.42)}" ry="${f1(r * 0.15)}"/>`).join('')}</g>
  </svg>`;
}

/** Tree stump seat */
export function stumpSVG() {
  const side = nid('ss'), top = nid('st'), moss = nid('sm');
  return `<svg class="stump-svg" viewBox="0 0 100 52" aria-hidden="true">
    <defs>
      <linearGradient id="${side}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3f2413"/><stop offset=".3" stop-color="#7c4d2b"/><stop offset=".55" stop-color="#8a5a33"/><stop offset="1" stop-color="#3a2011"/></linearGradient>
      ${rad(top, [[0, '#f4d29f'], [0.55, '#ddb078'], [1, '#b98852']], '50%', '45%', '60%')}
      ${lin(moss, '#8cc25e', '#4c7a31')}
    </defs>
    <ellipse cx="50" cy="45.5" rx="43" ry="6" fill="#000" opacity=".32"/>
    <path d="M12 19 13 37Q14 44 22 44L7.5 48.5 26 46.5Q50 51.5 74 46.5L92.5 48.5 78 44Q86 44 87 37L88 19Z" fill="url(#${side})" stroke="#24130a" stroke-width="2" stroke-linejoin="round"/>
    <path d="M21 25.5 21.6 41.5M30 27.5 30.4 45M41 28.6v17.6M59 28.6v17.6M70 27.5 69.6 45M79 25.5 78.4 41.5" stroke="#2c180b" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>
    <path d="M25 27.5 25.4 36M64.5 29v9M50 29.4v7" stroke="#a87445" stroke-width="1.1" stroke-linecap="round" opacity=".45"/>
    <path d="M12.4 24C14.5 31 20 33.5 24.5 31.5C27 34.5 31.5 34.6 34 31.6L34 27.6Q22 26 12.4 22Z" fill="url(#${moss})" opacity=".92"/>
    <ellipse cx="50" cy="19" rx="38" ry="10.5" fill="url(#${top})" stroke="#24130a" stroke-width="2"/>
    <g fill="none" stroke="#a87845" stroke-width="1.2" opacity=".75"><ellipse cx="50.5" cy="19.2" rx="28" ry="7.4"/><ellipse cx="51" cy="19.4" rx="18" ry="4.6"/><ellipse cx="51.2" cy="19.5" rx="8.5" ry="2.2"/></g>
    <path d="M51 19.5 63 23.5" stroke="#8a5e34" stroke-width="1" stroke-linecap="round" opacity=".6"/>
    <path d="M18 23.5Q50 33.5 82 23.5" stroke="${RIM}" stroke-width="1.6" fill="none" opacity=".45" stroke-linecap="round"/>
    <path d="M14 16.5Q22 10 36 9" stroke="#fff" stroke-width="1.4" fill="none" opacity=".25" stroke-linecap="round"/>
  </svg>`;
}

// ---------------------------------------------------------------- scenery
function rng(seed) { let s = seed; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

/** A stylised layered pine: apex at y-h, base at y. */
function pinePath(x, y, h, w) {
  const T = 4, R = [], Lft = [];
  for (let t = 1; t <= T; t++) {
    const yy = y - h + h * 0.86 * (t / T);
    const ww = w * (0.32 + 0.68 * (t / T));
    R.push([x + ww, yy]);
    Lft.push([x - ww, yy]);
    if (t < T) { R.push([x + ww * 0.42, yy - h * 0.035]); Lft.push([x - ww * 0.42, yy - h * 0.035]); }
  }
  const tw = Math.max(2, w * 0.09), base = y - h * 0.14;
  const pts = [[x, y - h], ...R, [x + tw, base], [x + tw, y], [x - tw, y], [x - tw, base], ...Lft.reverse()];
  return 'M' + pts.map(([a, b]) => `${a.toFixed(0)} ${b.toFixed(0)}`).join('L') + 'Z';
}
function pineRow(count, yBase, hMin, hMax, seed, jitter = 26) {
  const r = rng(seed);
  let d = '';
  for (let i = 0; i < count; i++) {
    const x = (i / count) * 1680 - 40 + r() * 40 - 20;
    const h = hMin + r() * (hMax - hMin);
    d += pinePath(x, yBase + r() * jitter, h, h * (0.3 + r() * 0.08));
  }
  return d;
}
function ridge(points, floor = 900) {
  return `M0 ${floor}L` + points.map(([x, y]) => `${x} ${y}`).join('L') + `L1600 ${floor}Z`;
}
/** Moon-lit facets on the right slope of each peak (moon is to the upper right). */
function facets(points) {
  let d = '';
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i], [xl, yl] = points[i - 1], [xr, yr] = points[i + 1];
    if (y < yl && y < yr) d += `M${x} ${y}L${xr} ${yr}L${(x + (xr - x) * 0.35).toFixed(0)} ${(yr + 18).toFixed(0)}Z`;
  }
  return d;
}

/** Stars live on their own layer so twinkling never repaints the landscape. */
export function starsSVG() {
  const r = rng(7);
  let s = '';
  for (let i = 0; i < 110; i++) {
    const x = (r() * 1600).toFixed(0), y = (r() * 470).toFixed(0), z = r();
    const rr = (z * 1.25 + 0.3).toFixed(2);
    s += `<circle class="${z > 0.55 ? 'star' : ''}" style="animation-delay:${(r() * 5).toFixed(2)}s" cx="${x}" cy="${y}" r="${rr}" fill="${z > 0.85 ? '#ffe9c4' : '#f1ecff'}" opacity="${(0.35 + z * 0.6).toFixed(2)}"/>`;
  }
  for (const [x, y, k] of [[260, 120, 1], [610, 70, 0.8], [980, 150, 0.9], [1470, 90, 1.1], [420, 300, 0.7]]) {
    s += `<path class="star" style="animation-delay:${(x % 5) / 2}s" d="M${x} ${y - 7 * k}C${x + 0.7 * k} ${y - 1.4 * k} ${x + 1.4 * k} ${y - 0.7 * k} ${x + 7 * k} ${y}C${x + 1.4 * k} ${y + 0.7 * k} ${x + 0.7 * k} ${y + 1.4 * k} ${x} ${y + 7 * k}C${x - 0.7 * k} ${y + 1.4 * k} ${x - 1.4 * k} ${y + 0.7 * k} ${x - 7 * k} ${y}C${x - 1.4 * k} ${y - 0.7 * k} ${x - 0.7 * k} ${y - 1.4 * k} ${x} ${y - 7 * k}Z" fill="#fff6dc"/>`;
  }
  return `<svg class="stars-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${s}</svg>`;
}

/** Full-screen night landscape: dusk sky, moon, lit ridges, a moonlit lake and three pine rows. */
export function forestSVG() {
  const far = [[0, 520], [90, 470], [170, 498], [280, 405], [360, 462], [430, 430], [540, 494], [640, 446], [730, 392], [810, 448], [900, 420], [985, 352], [1065, 428], [1150, 392], [1245, 450], [1330, 404], [1420, 460], [1510, 418], [1600, 450]];
  const mid = [[0, 560], [120, 520], [240, 552], [350, 506], [470, 548], [590, 512], [700, 556], [820, 524], [940, 560], [1060, 516], [1180, 552], [1300, 520], [1420, 556], [1520, 528], [1600, 548]];
  const snow = far.filter(([, y], i) => i > 0 && i < far.length - 1 && y < 420).map(([x, y]) => `M${x} ${y}L${x + 15} ${y + 17}L${x + 7} ${y + 13}L${x + 1} ${y + 21}L${x - 6} ${y + 14}L${x - 13} ${y + 17}Z`).join('');
  let ripples = '';
  const r = rng(19);
  for (let i = 0; i < 26; i++) {
    const y = 608 + i * 2.1, w = 130 - i * 4 + r() * 26;
    ripples += `<rect x="${(1440 - w / 2 + (r() - 0.5) * 24).toFixed(0)}" y="${y.toFixed(1)}" width="${w.toFixed(0)}" height="1.1" rx=".5" fill="#f6e7c1" opacity="${(0.36 - i * 0.012).toFixed(3)}"/>`;
  }
  return `<svg class="forest-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="bg-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05061a"/><stop offset=".34" stop-color="#0f1136"/><stop offset=".55" stop-color="#1f1a4a"/><stop offset=".64" stop-color="#3a2352"/><stop offset=".7" stop-color="#5a2c52"/></linearGradient>
      <radialGradient id="bg-moonhalo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffefcf" stop-opacity=".22"/><stop offset=".4" stop-color="#ffe7c2" stop-opacity=".07"/><stop offset="1" stop-color="#ffe7c2" stop-opacity="0"/></radialGradient>
      <radialGradient id="bg-moon" cx="40%" cy="38%" r="65%"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#ead9b4"/></radialGradient>
      <radialGradient id="bg-horizon" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff8a4d" stop-opacity=".2"/><stop offset="1" stop-color="#ff8a4d" stop-opacity="0"/></radialGradient>
      <radialGradient id="bg-milky" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#d9d2ff" stop-opacity=".09"/><stop offset="1" stop-color="#d9d2ff" stop-opacity="0"/></radialGradient>
      <linearGradient id="bg-lake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2150"/><stop offset="1" stop-color="#151335"/></linearGradient>
      <linearGradient id="bg-mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9a9e6" stop-opacity="0"/><stop offset=".5" stop-color="#b9a9e6" stop-opacity=".08"/><stop offset="1" stop-color="#b9a9e6" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="1600" height="900" fill="url(#bg-sky)"/>
    <ellipse cx="760" cy="230" rx="900" ry="120" transform="rotate(-14 760 230)" fill="url(#bg-milky)"/>
    <ellipse cx="760" cy="600" rx="980" ry="240" fill="url(#bg-horizon)"/>
    <circle cx="1440" cy="128" r="240" fill="url(#bg-moonhalo)"/>
    <circle cx="1440" cy="128" r="40" fill="url(#bg-moon)"/>
    <g fill="#d8c69e" opacity=".45"><circle cx="1428" cy="119" r="6"/><circle cx="1453" cy="142" r="4.4"/><circle cx="1450" cy="112" r="2.8"/><circle cx="1431" cy="143" r="2.3"/></g>
    <path d="${ridge(far)}" fill="#2b2656"/>
    <path d="${facets(far)}" fill="#3a3470" opacity=".85"/>
    <path d="${snow}" fill="#d9d1f2" opacity=".5"/>
    <path d="${ridge(mid)}" fill="#1f1c47"/>
    <path d="${facets(mid)}" fill="#2a2660" opacity=".7"/>
    <rect y="596" width="1600" height="70" fill="url(#bg-lake)"/>
    <g>${ripples}</g>
    <rect y="596" width="1600" height="1.4" fill="#f6e7c1" opacity=".12"/>
    <path d="${pineRow(46, 640, 95, 175, 3)}" fill="#18163d"/>
    <rect y="560" width="1600" height="150" fill="url(#bg-mist)"/>
    <path d="M0 760Q260 700 560 728T1100 716T1600 732L1600 900L0 900Z" fill="#121031"/>
    <path d="${pineRow(30, 775, 210, 310, 11)}" fill="#110f2e"/>
    <path d="M0 840Q400 790 800 820T1600 812L1600 900L0 900Z" fill="#0b0a21"/>
    <path d="${pineRow(15, 950, 330, 460, 29, 30)}" fill="#08071a"/>
  </svg>`;
}

// ---------------------------------------------------------------- brand
/** The campsite badge: retro sunset, ridges and pines inside a stitched ring with arched lettering. */
export function emblemSVG() {
  const clip = nid('ec'), sky = nid('es'), sun = nid('eu'), mask = nid('ek'), top = nid('et'), bot = nid('eb');
  const C = 150, cream = '#f1e4c8';
  const arc = (r, sweep) => `M${C - r} ${C}A${r} ${r} 0 0 ${sweep} ${C + r} ${C}`;
  const star = (x, y) => `<path d="M${x} ${y - 6}C${x + .7} ${y - 1.2} ${x + 1.2} ${y - .7} ${x + 6} ${y}C${x + 1.2} ${y + .7} ${x + .7} ${y + 1.2} ${x} ${y + 6}C${x - .7} ${y + 1.2} ${x - 1.2} ${y + .7} ${x - 6} ${y}C${x - 1.2} ${y - .7} ${x - .7} ${y - 1.2} ${x} ${y - 6}Z" fill="${cream}"/>`;
  return `<svg class="emblem-svg" viewBox="0 0 300 300" aria-hidden="true">
    <defs>
      <clipPath id="${clip}"><circle cx="${C}" cy="${C}" r="103"/></clipPath>
      <linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1846"/><stop offset=".35" stop-color="#3b2763"/><stop offset=".62" stop-color="#9a3f66"/><stop offset=".8" stop-color="#e86a45"/><stop offset="1" stop-color="#ffb35a"/></linearGradient>
      <linearGradient id="${sun}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset=".55" stop-color="#ffc355"/><stop offset="1" stop-color="#ff7e3a"/></linearGradient>
      <mask id="${mask}"><rect width="300" height="300" fill="#fff"/><g fill="#000"><rect x="80" y="146" width="140" height="2.4"/><rect x="80" y="154" width="140" height="3.4"/><rect x="80" y="163" width="140" height="4.4"/></g></mask>
      <path id="${top}" d="${arc(118, 1)}"/>
      <path id="${bot}" d="${arc(131, 0)}"/>
    </defs>
    <circle cx="${C}" cy="${C}" r="147" fill="#15143a"/>
    <circle cx="${C}" cy="${C}" r="147" fill="none" stroke="${cream}" stroke-width="3"/>
    <circle cx="${C}" cy="${C}" r="140" fill="none" stroke="${cream}" stroke-opacity=".45" stroke-width="1.2" stroke-dasharray="3 5"/>
    <text font-family="Fraunces, Georgia, serif" font-weight="700" font-size="22" letter-spacing="5" fill="${cream}" text-anchor="middle"><textPath href="#${top}" startOffset="50%">MIVIMOOSE PARTY</textPath></text>
    <text font-family="Manrope, system-ui, sans-serif" font-weight="800" font-size="12.5" letter-spacing="4.2" fill="${cream}" fill-opacity=".85" text-anchor="middle"><textPath href="#${bot}" startOffset="50%">CAMPFIRE WORD GAME · EST. 2026</textPath></text>
    ${star(C - 131, C)}${star(C + 131, C)}
    <circle cx="${C}" cy="${C}" r="107" fill="${cream}"/>
    <g clip-path="url(#${clip})">
      <rect x="40" y="40" width="220" height="220" fill="url(#${sky})"/>
      <g fill="#fff6e0" opacity=".8"><circle cx="96" cy="86" r="1.4"/><circle cx="128" cy="68" r="1"/><circle cx="196" cy="80" r="1.3"/><circle cx="214" cy="110" r=".9"/><circle cx="110" cy="112" r=".9"/><circle cx="170" cy="62" r="1.1"/></g>
      <circle cx="${C}" cy="160" r="46" fill="url(#${sun})" mask="url(#${mask})"/>
      <path d="M40 192L74 160L96 176L116 164L138 180L162 168L186 182L214 156L260 186V260H40Z" fill="#3a2a62"/>
      <path d="M74 160L96 176L82 178ZM214 156L260 186L236 184Z" fill="#4a3878"/>
      <path d="M40 214L80 192L118 206L160 188L204 206L260 196V260H40Z" fill="#251f4c"/>
      <path d="${[56, 70, 84, 214, 228, 242, 254].map((x, i) => pinePath(x, 236, 44 + (i % 3) * 10, 14 + (i % 2) * 3)).join('')}" fill="#131232"/>
      <rect x="40" y="226" width="220" height="40" fill="#131232"/>
    </g>
    <circle cx="${C}" cy="${C}" r="103" fill="none" stroke="#15143a" stroke-width="2"/>
  </svg>`;
}

/** Small brand mark for the top bar and favicon: sunset disc with a moose silhouette. */
export function markSVG() {
  const clip = nid('kc'), sky = nid('ks');
  return `<svg class="mark-svg" viewBox="0 0 40 40" aria-hidden="true">
    <defs><clipPath id="${clip}"><circle cx="20" cy="20" r="16"/></clipPath>
      <linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2763"/><stop offset=".5" stop-color="#c24d5a"/><stop offset=".8" stop-color="#ff8a3d"/><stop offset="1" stop-color="#ffc35a"/></linearGradient></defs>
    <circle cx="20" cy="20" r="19" fill="#15143a" stroke="#f1e4c8" stroke-width="1.6"/>
    <g clip-path="url(#${clip})"><rect x="4" y="4" width="32" height="32" fill="url(#${sky})"/>
      <path transform="translate(20 23) scale(1.32) translate(-20 -23)" d="M17.6 21.2h4.8l.6 5c.3 2.3-1.2 5.2-3 5.2s-3.3-2.9-3-5.2Z M17.6 21.2C15 21.1 12.7 19.4 12.1 16.6c.9.5 1.5.6 2.2.3-.4-1-.4-1.9-.1-2.8.8.9 1.5 1.3 2.4 1.5.1-.8.4-1.5.9-2.2.6 1.8 1 4.6.1 7.8Z M22.4 21.2c2.6-.1 4.9-1.8 5.5-4.6-.9.5-1.5.6-2.2.3.4-1 .4-1.9.1-2.8-.8.9-1.5 1.3-2.4 1.5-.1-.8-.4-1.5-.9-2.2-.6 1.8-1 4.6-.1 7.8Z" fill="#15143a"/>
      <rect x="4" y="33" width="32" height="4" fill="#15143a"/></g>
  </svg>`;
}

// ---------------------------------------------------------------- textures
/** Contour lines (marching squares over a smooth field), for the "trail map" texture. */
function topoSVG(W = 640, H = 420) {
  const N = 4, cs = 8, cols = Math.ceil(W / cs) + 1, rows = Math.ceil(H / cs) + 1;
  const r = rng(41);
  const waves = Array.from({ length: 6 }, () => [r() * 2 * Math.PI / W * 2.2, r() * 2 * Math.PI / H * 2.2, r() * 6.28, r() * 6.28, 0.4 + r()]);
  const field = (x, y) => waves.reduce((s, [fx, fy, px, py, a]) => s + a * Math.sin(x * fx + px) * Math.cos(y * fy + py), 0);
  const v = [];
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const z = field(i * cs, j * cs); v.push(z); lo = Math.min(lo, z); hi = Math.max(hi, z); }
  const at = (i, j) => v[j * cols + i];
  let d = '';
  const levels = 13;
  for (let k = 1; k < levels; k++) {
    const t = lo + ((hi - lo) * k) / levels;
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), e = at(i, j + 1);
      const idx = (a > t ? 8 : 0) | (b > t ? 4 : 0) | (c > t ? 2 : 0) | (e > t ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const x = i * cs, y = j * cs;
      const lerp = (p, q) => (t - p) / (q - p);
      const T = [x + cs * lerp(a, b), y], Rr = [x + cs, y + cs * lerp(b, c)], Bm = [x + cs * lerp(e, c), y + cs], Lf = [x, y + cs * lerp(a, e)];
      const seg = { 1: [Lf, Bm], 2: [Bm, Rr], 3: [Lf, Rr], 4: [T, Rr], 5: [Lf, T, Bm, Rr], 6: [T, Bm], 7: [Lf, T], 8: [Lf, T], 9: [T, Bm], 10: [T, Rr, Lf, Bm], 11: [T, Rr], 12: [Lf, Rr], 13: [Bm, Rr], 14: [Lf, Bm] }[idx];
      for (let s = 0; s < seg.length; s += 2) d += `M${seg[s][0].toFixed(1)} ${seg[s][1].toFixed(1)}L${seg[s + 1][0].toFixed(1)} ${seg[s + 1][1].toFixed(1)}`;
    }
  }
  void N;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><path d="${d}" fill="none" stroke="#e9e2ff" stroke-opacity=".075" stroke-width="1" stroke-linecap="round"/></svg>`;
}
const GRAIN = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .42 -.21"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;

/** Publish the generated textures as CSS custom properties (blob URLs keep the CSS small). */
export function installTextures(root = document.documentElement) {
  const url = (svg) => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  root.style.setProperty('--topo', `url("${url(topoSVG())}")`);
  root.style.setProperty('--grain', `url("${url(GRAIN)}")`);
}

export const MASCOT_IDS = Object.keys(ANIMALS);
