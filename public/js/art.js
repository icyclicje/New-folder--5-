// Mivimoose Party — all SVG art is generated here (no image assets needed).

let uid = 0;
const nid = (p) => `${p}${++uid}`;

// ---------------------------------------------------------------- mascots
const ANIMALS = {
  fox:     { fur: '#e8792b', fur2: '#c85f1c', muzzle: '#fff4e6', ear: 'pointy', earIn: '#3a2a22', nose: '#2b1d16' },
  raccoon: { fur: '#9a9aa3', fur2: '#76767f', muzzle: '#f1f0ee', ear: 'round', earIn: '#4c4c55', nose: '#1f1f24', mask: true },
  beaver:  { fur: '#8a5a35', fur2: '#6e4628', muzzle: '#c99a6e', ear: 'smallround', earIn: '#5b3a22', nose: '#2b1a10', teeth: true },
  bunny:   { fur: '#e9e2d6', fur2: '#cfc4b2', muzzle: '#fffaf2', ear: 'long', earIn: '#f2b8c2', nose: '#e07a8f' },
  frog:    { fur: '#6cc04a', fur2: '#4e9a33', muzzle: '#c9f0a4', ear: 'frog', earIn: '#6cc04a', nose: '#2f5d1f', frog: true },
  owl:     { fur: '#b07b4a', fur2: '#8b5b31', muzzle: '#f4e3c3', ear: 'tufts', earIn: '#6e4422', nose: '#e7a636', owl: true },
  bear:    { fur: '#3b2a22', fur2: '#2a1d17', muzzle: '#c8a27a', ear: 'round', earIn: '#6b4a37', nose: '#120c09' },
  otter:   { fur: '#7a5236', fur2: '#5f3f29', muzzle: '#e6cfb2', ear: 'smallround', earIn: '#4b3020', nose: '#1d120c', whiskers: true },
  skunk:   { fur: '#26232b', fur2: '#18161c', muzzle: '#3a3640', ear: 'smallround', earIn: '#55505e', nose: '#f0a0b4', stripe: true },
  wolf:    { fur: '#8e97a3', fur2: '#6f7884', muzzle: '#eef0f2', ear: 'pointy', earIn: '#4a515c', nose: '#1b1e22' },
  lynx:    { fur: '#c9a571', fur2: '#a9864f', muzzle: '#f6ead6', ear: 'pointy', earIn: '#5a4326', nose: '#c46b5a', tufts: true, spots: true },
  moose:   { fur: '#7b4f2e', fur2: '#5e3a20', muzzle: '#a6774f', ear: 'moose', earIn: '#5e3a20', nose: '#2a1a0f', antlers: true },
};

function ears(a) {
  switch (a.ear) {
    case 'pointy':
      return `<path d="M24 46 L20 12 L46 32 Z" fill="${a.fur2}"/><path d="M76 46 L80 12 L54 32 Z" fill="${a.fur2}"/>
        <path d="M27 40 L25 19 L41 32 Z" fill="${a.earIn}"/><path d="M73 40 L75 19 L59 32 Z" fill="${a.earIn}"/>
        ${a.tufts ? '<path d="M20 12 L18 2 M80 12 L82 2" stroke="#2a2018" stroke-width="2.5" stroke-linecap="round"/>' : ''}`;
    case 'round':
      return `<circle cx="27" cy="34" r="11" fill="${a.fur2}"/><circle cx="73" cy="34" r="11" fill="${a.fur2}"/>
        <circle cx="27" cy="34" r="6" fill="${a.earIn}"/><circle cx="73" cy="34" r="6" fill="${a.earIn}"/>`;
    case 'smallround':
      return `<circle cx="29" cy="37" r="7.5" fill="${a.fur2}"/><circle cx="71" cy="37" r="7.5" fill="${a.fur2}"/>
        <circle cx="29" cy="37" r="4" fill="${a.earIn}"/><circle cx="71" cy="37" r="4" fill="${a.earIn}"/>`;
    case 'long':
      return `<g transform="rotate(-12 38 30)"><ellipse cx="38" cy="18" rx="8" ry="22" fill="${a.fur2}"/><ellipse cx="38" cy="19" rx="4.5" ry="17" fill="${a.earIn}"/></g>
        <g transform="rotate(12 62 30)"><ellipse cx="62" cy="18" rx="8" ry="22" fill="${a.fur2}"/><ellipse cx="62" cy="19" rx="4.5" ry="17" fill="${a.earIn}"/></g>`;
    case 'tufts':
      return `<path d="M26 40 L24 20 L40 32 Z" fill="${a.fur2}"/><path d="M74 40 L76 20 L60 32 Z" fill="${a.fur2}"/>`;
    case 'moose':
      return `<ellipse cx="25" cy="44" rx="10" ry="5" transform="rotate(-25 25 44)" fill="${a.fur2}"/><ellipse cx="75" cy="44" rx="10" ry="5" transform="rotate(25 75 44)" fill="${a.fur2}"/>`;
    default: return '';
  }
}

function face(a) {
  if (a.frog) {
    return `<circle cx="36" cy="36" r="11" fill="${a.fur}"/><circle cx="64" cy="36" r="11" fill="${a.fur}"/>
      <circle cx="36" cy="35" r="7.5" fill="#fff"/><circle cx="64" cy="35" r="7.5" fill="#fff"/>
      <circle cx="37" cy="36" r="4" fill="#1b1b1b"/><circle cx="63" cy="36" r="4" fill="#1b1b1b"/>
      <circle cx="38.5" cy="34.5" r="1.4" fill="#fff"/><circle cx="64.5" cy="34.5" r="1.4" fill="#fff"/>
      <ellipse cx="50" cy="70" rx="20" ry="10" fill="${a.muzzle}"/>
      <path d="M34 68 Q50 80 66 68" stroke="#2f5d1f" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <circle cx="30" cy="66" r="4" fill="#ff8fa3" opacity=".45"/><circle cx="70" cy="66" r="4" fill="#ff8fa3" opacity=".45"/>`;
  }
  if (a.owl) {
    return `<path d="M50 44 C40 32 22 38 24 56 C26 72 44 80 50 74 C56 80 74 72 76 56 C78 38 60 32 50 44 Z" fill="${a.muzzle}"/>
      <circle cx="39" cy="55" r="9" fill="#fff"/><circle cx="61" cy="55" r="9" fill="#fff"/>
      <circle cx="39" cy="55" r="5.5" fill="#1b130c"/><circle cx="61" cy="55" r="5.5" fill="#1b130c"/>
      <circle cx="41" cy="53" r="1.8" fill="#fff"/><circle cx="63" cy="53" r="1.8" fill="#fff"/>
      <path d="M46 62 L54 62 L50 71 Z" fill="${a.nose}"/>`;
  }
  let s = '';
  if (a.stripe) s += `<path d="M46 28 Q50 26 54 28 L53 52 Q50 54 47 52 Z" fill="#f4f4f4"/>`;
  if (a.spots) s += `<circle cx="34" cy="44" r="1.6" fill="#7a5a30"/><circle cx="66" cy="44" r="1.6" fill="#7a5a30"/><circle cx="30" cy="52" r="1.3" fill="#7a5a30"/><circle cx="70" cy="52" r="1.3" fill="#7a5a30"/>`;
  if (a.mask) s += `<path d="M24 52 Q34 44 46 52 Q50 55 54 52 Q66 44 76 52 Q72 62 60 60 Q50 57 40 60 Q28 62 24 52 Z" fill="#2c2c33"/>`;
  s += `<ellipse cx="50" cy="69" rx="${a.antlers ? 17 : 14}" ry="${a.antlers ? 12 : 10}" fill="${a.muzzle}"/>`;
  s += `<circle cx="39" cy="55" r="4" fill="#1b130c"/><circle cx="61" cy="55" r="4" fill="#1b130c"/>
        <circle cx="40.3" cy="53.6" r="1.4" fill="#fff"/><circle cx="62.3" cy="53.6" r="1.4" fill="#fff"/>`;
  s += `<ellipse cx="50" cy="64" rx="${a.antlers ? 6 : 4.5}" ry="3.2" fill="${a.nose}"/>`;
  s += `<path d="M44 71 Q47 74 50 71 Q53 74 56 71" stroke="#2b1d16" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
  if (a.teeth) s += `<rect x="46" y="72" width="3.6" height="6" rx="1" fill="#fff" stroke="#c9b9a0" stroke-width=".6"/><rect x="50.4" y="72" width="3.6" height="6" rx="1" fill="#fff" stroke="#c9b9a0" stroke-width=".6"/>`;
  if (a.whiskers) s += `<path d="M36 68 L22 65 M36 71 L22 72 M64 68 L78 65 M64 71 L78 72" stroke="#3a281b" stroke-width="1" stroke-linecap="round"/>`;
  s += `<circle cx="30" cy="64" r="4.5" fill="#ff8fa3" opacity=".35"/><circle cx="70" cy="64" r="4.5" fill="#ff8fa3" opacity=".35"/>`;
  return s;
}

function antlers(color = '#d9c39a', stroke = '#a88d5c') {
  return `<g fill="${color}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round">
    <path d="M34 34 C28 26 20 24 14 16 L18 14 L20 20 L22 12 L26 13 L25 21 L30 16 L33 18 L30 25 C33 27 36 29 38 31 Z"/>
    <path d="M66 34 C72 26 80 24 86 16 L82 14 L80 20 L78 12 L74 13 L75 21 L70 16 L67 18 L70 25 C67 27 64 29 62 31 Z"/></g>`;
}

// ---------------------------------------------------------------- hats
function hat(id) {
  switch (id) {
    case 'beanie': return `<g><path d="M24 40 C24 18 76 18 76 40 Z" fill="#c8402f"/><rect x="22" y="36" width="56" height="9" rx="4.5" fill="#a32f22"/>
      <path d="M30 37v7M36 37v7M42 37v7M48 37v7M54 37v7M60 37v7M66 37v7M72 37v7" stroke="#8a271c" stroke-width="1.2"/><circle cx="50" cy="18" r="6" fill="#f3efe6"/></g>`;
    case 'bandana': return `<g><path d="M22 42 Q50 30 78 42 L76 48 Q50 38 24 48 Z" fill="#d33a2c"/><circle cx="34" cy="42" r="1.4" fill="#fff"/><circle cx="46" cy="39" r="1.4" fill="#fff"/><circle cx="58" cy="39" r="1.4" fill="#fff"/><circle cx="68" cy="42" r="1.4" fill="#fff"/>
      <path d="M76 44 L86 38 L84 48 Z M76 46 L88 50 L80 54 Z" fill="#b52d21"/></g>`;
    case 'ranger': return `<g><ellipse cx="50" cy="38" rx="38" ry="7" fill="#9b7a45"/><path d="M30 37 C30 16 40 12 50 22 C60 12 70 16 70 37 Z" fill="#b8945a"/>
      <path d="M44 16 L50 24 L56 16" stroke="#8b6b3a" stroke-width="1.5" fill="none"/><rect x="30" y="31" width="40" height="5" fill="#5b3d1e"/></g>`;
    case 'flowers': return `<g>${[[26, 38, '#f7c1d9'], [36, 30, '#fff3a6'], [50, 27, '#c9b6f2'], [64, 30, '#ffd3a1'], [74, 38, '#f7c1d9']].map(([x, y, c]) =>
      `<g transform="translate(${x} ${y})"><circle r="3.4" cy="-3.4" fill="${c}"/><circle r="3.4" cx="3.4" fill="${c}"/><circle r="3.4" cy="3.4" fill="${c}"/><circle r="3.4" cx="-3.4" fill="${c}"/><circle r="2.2" fill="#f2b632"/></g>`).join('')}
      <path d="M22 41 Q50 22 78 41" stroke="#5c9a3c" stroke-width="2" fill="none"/></g>`;
    case 'headlamp': return `<g><path d="M21 44 Q50 32 79 44" stroke="#2e2e33" stroke-width="5" fill="none"/><rect x="41" y="30" width="18" height="12" rx="4" fill="#3d3d44"/>
      <circle cx="50" cy="36" r="4.5" fill="#fff6b0"/><circle cx="50" cy="36" r="9" fill="#fff6b0" opacity=".25"/></g>`;
    case 'coonskin': return `<g><path d="M24 42 C22 18 78 18 76 42 Z" fill="#8a6a4a"/><path d="M24 42 Q50 36 76 42 L76 46 Q50 40 24 46 Z" fill="#6e5236"/>
      <path d="M74 40 Q90 46 88 72" stroke="#8a6a4a" stroke-width="8" fill="none" stroke-linecap="round"/>
      <path d="M85 52 l6 2 M86 60 l6 1 M86 68 l5 0" stroke="#3a2a1c" stroke-width="3" stroke-linecap="round"/></g>`;
    case 'lumberjack': {
      const p = nid('plaid');
      return `<g><defs><pattern id="${p}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#c22f2f"/><rect width="4" height="8" fill="#1d1d1d" opacity=".55"/><rect width="8" height="4" fill="#1d1d1d" opacity=".55"/></pattern></defs>
      <path d="M25 42 C25 20 75 20 75 42 Z" fill="url(#${p})"/><path d="M24 40 L18 56 L28 54 Z M76 40 L82 56 L72 54 Z" fill="url(#${p})"/><rect x="40" y="38" width="30" height="5" rx="2" fill="#2a2a2a"/></g>`;
    }
    case 'bucket': return `<g><path d="M18 42 Q50 30 82 42 L76 46 Q50 38 24 46 Z" fill="#7e8a5a"/><path d="M28 41 C30 22 70 22 72 41 Z" fill="#94a06c"/><rect x="29" y="35" width="42" height="4" fill="#5d6640"/>
      <path d="M66 30 l6 -4 l2 6 Z" fill="#e8592b"/><circle cx="69" cy="31" r="1" fill="#fff"/></g>`;
    case 'antlers': return `<g>${antlers('#c9a777', '#8f6f42')}<path d="M24 42 Q50 30 76 42" stroke="#7a3b2e" stroke-width="4" fill="none"/></g>`;
    case 'pinecrown': return `<g><path d="M24 42 Q50 32 76 42" stroke="#4a6b2e" stroke-width="5" fill="none"/>${[30, 40, 50, 60, 70].map((x, i) =>
      `<g transform="translate(${x} ${i === 2 ? 26 : i % 2 ? 30 : 35})"><ellipse rx="4.5" ry="7" fill="#8b5a2b"/><path d="M-4 -3 h8 M-4 1 h8 M-3 5 h6" stroke="#5e3a17" stroke-width="1.1"/></g>`).join('')}</g>`;
    case 'goldantlers': {
      const g = nid('gold');
      return `<g><defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2a8"/><stop offset=".5" stop-color="#ffcc3d"/><stop offset="1" stop-color="#d99a15"/></linearGradient></defs>
      ${antlers(`url(#${g})`, '#b07a0e')}<path d="M24 42 Q50 30 76 42" stroke="#d99a15" stroke-width="4" fill="none"/>
      <path d="M50 14 l2 5 5 0 -4 3 2 5 -5 -3 -5 3 2 -5 -4 -3 5 0 Z" fill="#fff6c8" class="sparkle"/></g>`;
    }
    default: return '';
  }
}

/** A forest mascot head (with optional hat) as an SVG string. */
export function mascotSVG(id = 'fox', hatId = 'none', cls = '') {
  const a = ANIMALS[id] || ANIMALS.fox;
  return `<svg class="mascot ${cls}" viewBox="0 0 100 100" aria-hidden="true">
    <ellipse cx="50" cy="94" rx="26" ry="4" fill="#000" opacity=".25"/>
    ${a.antlers ? antlers() : ''}
    ${ears(a)}
    <circle cx="50" cy="58" r="31" fill="${a.fur}"/>
    <path d="M22 66 Q50 96 78 66 Q76 88 50 89 Q24 88 22 66 Z" fill="${a.fur2}" opacity=".35"/>
    ${face(a)}
    ${hat(hatId)}
  </svg>`;
}

// ---------------------------------------------------------------- moose
/** The Mivimoose — round, inflatable. Body group scales via CSS var --puff. */
export function mooseSVG() {
  const g = nid('mbody');
  return `<svg class="moose-svg" viewBox="0 0 160 150" aria-hidden="true">
    <defs>
      <radialGradient id="${g}" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="var(--moose-hi, #b07a4a)"/><stop offset="1" stop-color="var(--moose-lo, #6d4426)"/></radialGradient>
    </defs>
    <ellipse class="m-shadow" cx="80" cy="142" rx="44" ry="6" fill="#000" opacity=".3"/>
    <g class="m-legs" fill="#4a2c17">
      <rect class="leg l1" x="50" y="108" width="9" height="30" rx="4"/><rect class="leg l2" x="66" y="110" width="9" height="28" rx="4"/>
      <rect class="leg l3" x="88" y="110" width="9" height="28" rx="4"/><rect class="leg l4" x="104" y="108" width="9" height="30" rx="4"/>
      <rect x="49" y="134" width="11" height="6" rx="2" fill="#2a180c"/><rect x="65" y="134" width="11" height="6" rx="2" fill="#2a180c"/>
      <rect x="87" y="134" width="11" height="6" rx="2" fill="#2a180c"/><rect x="103" y="134" width="11" height="6" rx="2" fill="#2a180c"/>
    </g>
    <g class="m-body">
      <ellipse cx="82" cy="92" rx="46" ry="36" fill="url(#${g})"/>
      <ellipse cx="82" cy="104" rx="30" ry="16" fill="#d8b48a" opacity=".55"/>
      <path class="m-stretch" d="M52 80 q6 -6 12 0 M92 70 q6 -6 12 0 M70 112 q6 -5 12 0" stroke="#fff" stroke-opacity=".0" stroke-width="2" fill="none"/>
      <circle cx="126" cy="80" r="6" fill="#5a3519"/>
    </g>
    <g class="m-head">
      <g fill="#e8d3a8" stroke="#a88d5c" stroke-width="1.4" stroke-linejoin="round">
        <path d="M44 40 C36 30 22 30 12 18 L17 15 L20 22 L22 10 L28 11 L27 21 L33 13 L38 16 L34 26 C40 29 44 32 48 36 Z"/>
        <path d="M66 36 C72 28 84 26 92 14 L88 11 L84 18 L84 6 L78 7 L78 17 L72 10 L68 13 L71 23 C67 27 64 30 61 33 Z"/>
      </g>
      <ellipse cx="38" cy="46" rx="9" ry="5" transform="rotate(-30 38 46)" fill="#5e3a20"/>
      <ellipse cx="70" cy="44" rx="9" ry="5" transform="rotate(30 70 44)" fill="#5e3a20"/>
      <ellipse cx="54" cy="58" rx="22" ry="20" fill="#8a5a33"/>
      <ellipse cx="50" cy="76" rx="18" ry="13" fill="#a6774f"/>
      <ellipse cx="44" cy="76" rx="3" ry="2.4" fill="#2a1a0f"/><ellipse cx="56" cy="76" rx="3" ry="2.4" fill="#2a1a0f"/>
      <g class="m-eyes"><circle cx="45" cy="56" r="4" fill="#1b0f08"/><circle cx="63" cy="56" r="4" fill="#1b0f08"/>
        <circle cx="46.4" cy="54.6" r="1.4" fill="#fff"/><circle cx="64.4" cy="54.6" r="1.4" fill="#fff"/></g>
      <path class="m-mouth" d="M44 84 Q50 88 56 84" stroke="#3a2212" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M50 88 q-3 6 0 10 q3 -4 0 -10" fill="#6d4426"/>
      <circle cx="36" cy="66" r="4" fill="#ff8fa3" opacity=".4"/><circle cx="70" cy="64" r="4" fill="#ff8fa3" opacity=".4"/>
      <g class="m-sweat"><path d="M74 46 q4 6 0 9 q-4 -3 0 -9" fill="#9fd6ff"/></g>
    </g>
  </svg>`;
}

// ---------------------------------------------------------------- campfire
export function campfireSVG() {
  return `<svg class="campfire-svg" viewBox="0 0 120 110" aria-hidden="true">
    <ellipse cx="60" cy="98" rx="48" ry="9" fill="#000" opacity=".35"/>
    <g fill="#8a8a8a">${[[18, 92], [30, 98], [46, 101], [62, 102], [78, 101], [92, 97], [102, 91]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="8" ry="5" fill="#77746e"/>`).join('')}</g>
    <g class="logs"><rect x="22" y="80" width="76" height="11" rx="5.5" fill="#6b4226" transform="rotate(14 60 85)"/>
      <rect x="22" y="80" width="76" height="11" rx="5.5" fill="#7d4f2d" transform="rotate(-14 60 85)"/>
      <circle cx="26" cy="77" r="5" fill="#c99a62"/><circle cx="94" cy="77" r="5" fill="#c99a62"/></g>
    <g class="flames">
      <path class="f1" d="M60 84 C34 80 36 56 48 44 C48 56 54 58 56 50 C56 36 62 26 70 16 C68 34 86 44 82 62 C80 76 72 84 60 84 Z" fill="#ff7a1a"/>
      <path class="f2" d="M60 84 C44 82 44 66 52 58 C52 66 58 68 60 60 C62 52 64 46 70 40 C70 54 78 60 76 70 C74 80 68 84 60 84 Z" fill="#ffb323"/>
      <path class="f3" d="M60 84 C52 84 50 76 54 70 C56 74 60 74 60 68 C62 64 64 62 66 60 C68 68 70 72 68 78 C66 82 64 84 60 84 Z" fill="#fff1a8"/>
    </g>
    <g class="embers"><circle cx="50" cy="40" r="1.5" fill="#ffcc66"/><circle cx="68" cy="30" r="1.2" fill="#ffaa44"/><circle cx="58" cy="20" r="1" fill="#ffdd88"/></g>
  </svg>`;
}

/** Tree stump seat */
export function stumpSVG() {
  return `<svg class="stump-svg" viewBox="0 0 100 50" aria-hidden="true">
    <path d="M10 18 L10 38 Q50 54 90 38 L90 18 Z" fill="#6e4528"/>
    <path d="M18 22 L18 40 M34 26 L34 44 M66 26 L66 44 M82 22 L82 40" stroke="#5a371f" stroke-width="2"/>
    <ellipse cx="50" cy="18" rx="40" ry="11" fill="#c99a62"/>
    <ellipse cx="50" cy="18" rx="28" ry="7.5" fill="none" stroke="#a87b48" stroke-width="1.5"/>
    <ellipse cx="50" cy="18" rx="16" ry="4.5" fill="none" stroke="#a87b48" stroke-width="1.5"/>
    <ellipse cx="50" cy="18" rx="5" ry="1.6" fill="#a87b48"/>
  </svg>`;
}

// ---------------------------------------------------------------- scenery
function pineRow(count, yBase, hMin, hMax, color, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = (i / count) * 1600 + rnd() * 40 - 20;
    const h = hMin + rnd() * (hMax - hMin);
    const w = h * 0.42;
    const y = yBase + rnd() * 20;
    out += `<path d="M${x} ${y - h} L${x - w * 0.5} ${y - h * 0.55} L${x - w * 0.25} ${y - h * 0.55} L${x - w * 0.75} ${y - h * 0.2} L${x - w * 0.35} ${y - h * 0.2} L${x - w} ${y} L${x + w} ${y} L${x + w * 0.35} ${y - h * 0.2} L${x + w * 0.75} ${y - h * 0.2} L${x + w * 0.25} ${y - h * 0.55} L${x + w * 0.5} ${y - h * 0.55} Z" fill="${color}"/>`;
  }
  return out;
}

/** Full-screen night forest backdrop. */
export function forestSVG() {
  let stars = '';
  let s = 7;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 90; i++) stars += `<circle class="star" style="animation-delay:${(rnd() * 4).toFixed(2)}s" cx="${(rnd() * 1600).toFixed(0)}" cy="${(rnd() * 420).toFixed(0)}" r="${(rnd() * 1.6 + 0.4).toFixed(1)}" fill="#fff"/>`;
  return `<svg class="forest-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1a2e"/><stop offset=".55" stop-color="#16324a"/><stop offset="1" stop-color="#23463f"/></linearGradient>
      <radialGradient id="moonglow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fffbe6" stop-opacity=".55"/><stop offset="1" stop-color="#fffbe6" stop-opacity="0"/></radialGradient>
      <radialGradient id="aurora" cx="50%" cy="0%" r="80%"><stop offset="0" stop-color="#5dffb0" stop-opacity=".18"/><stop offset="1" stop-color="#5dffb0" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="1600" height="900" fill="url(#sky)"/>
    <rect width="1600" height="500" fill="url(#aurora)" class="aurora"/>
    ${stars}
    <circle cx="1290" cy="150" r="120" fill="url(#moonglow)"/>
    <circle cx="1290" cy="150" r="48" fill="#fff8dc"/><circle cx="1275" cy="140" r="8" fill="#ece3c0"/><circle cx="1305" cy="165" r="5" fill="#ece3c0"/>
    <path d="M0 560 Q200 420 420 520 T860 500 T1300 470 T1600 520 L1600 900 L0 900 Z" fill="#1d3a3a"/>
    <g opacity=".95">${pineRow(34, 640, 160, 260, '#173230', 3)}</g>
    <g>${pineRow(26, 760, 220, 340, '#122824', 11)}</g>
    <path d="M0 820 Q400 760 800 800 T1600 790 L1600 900 L0 900 Z" fill="#0f211d"/>
    <g>${pineRow(14, 930, 320, 460, '#0a1a17', 29)}</g>
  </svg>`;
}

export const MASCOT_IDS = Object.keys(ANIMALS);
