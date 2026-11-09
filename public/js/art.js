// Mivimoose Party — all SVG art is generated here (no image assets needed).
// One flat "sticker" style: soft fills, a single dark outline on silhouettes, gentle highlights.

let uid = 0;
const nid = (p) => `${p}${++uid}`;
const OL = '#24170e'; // shared outline colour

// ---------------------------------------------------------------- mascots
const ANIMALS = {
  fox:     { fur: '#ee8236', fur2: '#cc6420', muzzle: '#fff4e6', ear: 'pointy', earIn: '#3a2a22', nose: '#2b1d16' },
  raccoon: { fur: '#a1a1ab', fur2: '#7a7a84', muzzle: '#f3f2f0', ear: 'round', earIn: '#4c4c55', nose: '#1f1f24', mask: true },
  beaver:  { fur: '#93613a', fur2: '#734a2a', muzzle: '#d2a678', ear: 'smallround', earIn: '#5b3a22', nose: '#2b1a10', teeth: true },
  bunny:   { fur: '#ece5d9', fur2: '#d2c7b5', muzzle: '#fffaf2', ear: 'long', earIn: '#f2b8c2', nose: '#e07a8f' },
  frog:    { fur: '#72c650', fur2: '#53a136', muzzle: '#cff3ab', ear: 'frog', earIn: '#72c650', nose: '#2f5d1f', frog: true },
  owl:     { fur: '#b8834f', fur2: '#916035', muzzle: '#f6e6c8', ear: 'tufts', earIn: '#6e4422', nose: '#e7a636', owl: true },
  bear:    { fur: '#46322a', fur2: '#33241d', muzzle: '#cfa97f', ear: 'round', earIn: '#77543f', nose: '#120c09' },
  otter:   { fur: '#82593b', fur2: '#65442d', muzzle: '#ead4b8', ear: 'smallround', earIn: '#4b3020', nose: '#1d120c', whiskers: true },
  skunk:   { fur: '#2e2a34', fur2: '#1f1c24', muzzle: '#46414e', ear: 'smallround', earIn: '#5d5866', nose: '#f0a0b4', stripe: true },
  wolf:    { fur: '#97a0ac', fur2: '#76808c', muzzle: '#f0f2f4', ear: 'pointy', earIn: '#4a515c', nose: '#1b1e22' },
  lynx:    { fur: '#d0ad78', fur2: '#ae8b55', muzzle: '#f7ecd9', ear: 'pointy', earIn: '#5a4326', nose: '#c46b5a', tufts: true, spots: true },
  moose:   { fur: '#835534', fur2: '#653f23', muzzle: '#b08156', ear: 'moose', earIn: '#5e3a20', nose: '#2a1a0f', antlers: true },
};

const stroke = `stroke="${OL}" stroke-width="2.2" stroke-linejoin="round"`;

function ears(a) {
  switch (a.ear) {
    case 'pointy':
      return `<path d="M24 47 L20 13 L46 33 Z" fill="${a.fur2}" ${stroke}/><path d="M76 47 L80 13 L54 33 Z" fill="${a.fur2}" ${stroke}/>
        <path d="M27 40 L25 20 L40 32 Z" fill="${a.earIn}"/><path d="M73 40 L75 20 L60 32 Z" fill="${a.earIn}"/>
        ${a.tufts ? `<path d="M20 13 L18 3 M80 13 L82 3" stroke="${OL}" stroke-width="2.6" stroke-linecap="round"/>` : ''}`;
    case 'round':
      return `<circle cx="27" cy="35" r="11" fill="${a.fur2}" ${stroke}/><circle cx="73" cy="35" r="11" fill="${a.fur2}" ${stroke}/>
        <circle cx="27" cy="35" r="5.5" fill="${a.earIn}"/><circle cx="73" cy="35" r="5.5" fill="${a.earIn}"/>`;
    case 'smallround':
      return `<circle cx="29" cy="38" r="7.5" fill="${a.fur2}" ${stroke}/><circle cx="71" cy="38" r="7.5" fill="${a.fur2}" ${stroke}/>
        <circle cx="29" cy="38" r="3.6" fill="${a.earIn}"/><circle cx="71" cy="38" r="3.6" fill="${a.earIn}"/>`;
    case 'long':
      return `<g transform="rotate(-12 38 30)"><ellipse cx="38" cy="18" rx="8" ry="22" fill="${a.fur2}" ${stroke}/><ellipse cx="38" cy="20" rx="4" ry="16" fill="${a.earIn}"/></g>
        <g transform="rotate(12 62 30)"><ellipse cx="62" cy="18" rx="8" ry="22" fill="${a.fur2}" ${stroke}/><ellipse cx="62" cy="20" rx="4" ry="16" fill="${a.earIn}"/></g>`;
    case 'tufts':
      return `<path d="M26 41 L23 20 L41 32 Z" fill="${a.fur2}" ${stroke}/><path d="M74 41 L77 20 L59 32 Z" fill="${a.fur2}" ${stroke}/>`;
    case 'moose':
      return `<ellipse cx="24" cy="46" rx="10" ry="5" transform="rotate(-25 24 46)" fill="${a.fur2}" ${stroke}/><ellipse cx="76" cy="46" rx="10" ry="5" transform="rotate(25 76 46)" fill="${a.fur2}" ${stroke}/>`;
    case 'frog':
      return `<circle cx="35" cy="36" r="12" fill="${a.fur}" ${stroke}/><circle cx="65" cy="36" r="12" fill="${a.fur}" ${stroke}/>`;
    default: return '';
  }
}

function eyes(y = 55, gap = 11, r = 4.2) {
  return `<circle cx="${50 - gap}" cy="${y}" r="${r}" fill="#1b130c"/><circle cx="${50 + gap}" cy="${y}" r="${r}" fill="#1b130c"/>
    <circle cx="${50 - gap + 1.4}" cy="${y - 1.5}" r="1.5" fill="#fff"/><circle cx="${50 + gap + 1.4}" cy="${y - 1.5}" r="1.5" fill="#fff"/>`;
}

function face(a) {
  if (a.frog) {
    return `<circle cx="35" cy="35" r="7.5" fill="#fff"/><circle cx="65" cy="35" r="7.5" fill="#fff"/>
      <circle cx="36" cy="36" r="4" fill="#1b1b1b"/><circle cx="64" cy="36" r="4" fill="#1b1b1b"/>
      <circle cx="37.4" cy="34.4" r="1.4" fill="#fff"/><circle cx="65.4" cy="34.4" r="1.4" fill="#fff"/>
      <ellipse cx="50" cy="70" rx="20" ry="10" fill="${a.muzzle}"/>
      <path d="M35 68 Q50 79 65 68" stroke="#2f5d1f" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <circle cx="30" cy="64" r="4" fill="#ff8fa3" opacity=".45"/><circle cx="70" cy="64" r="4" fill="#ff8fa3" opacity=".45"/>`;
  }
  if (a.owl) {
    return `<path d="M50 44 C40 32 22 38 24 56 C26 72 44 80 50 74 C56 80 74 72 76 56 C78 38 60 32 50 44 Z" fill="${a.muzzle}"/>
      <circle cx="39" cy="55" r="9" fill="#fff"/><circle cx="61" cy="55" r="9" fill="#fff"/>
      <circle cx="39" cy="55" r="5.4" fill="#1b130c"/><circle cx="61" cy="55" r="5.4" fill="#1b130c"/>
      <circle cx="41" cy="53" r="1.8" fill="#fff"/><circle cx="63" cy="53" r="1.8" fill="#fff"/>
      <path d="M46 62 L54 62 L50 71 Z" fill="${a.nose}"/>`;
  }
  let s = '';
  if (a.stripe) s += `<path d="M46 29 Q50 27 54 29 L53 52 Q50 54 47 52 Z" fill="#f4f4f4"/>`;
  if (a.spots) s += `<circle cx="34" cy="44" r="1.6" fill="#7a5a30"/><circle cx="66" cy="44" r="1.6" fill="#7a5a30"/><circle cx="30" cy="52" r="1.3" fill="#7a5a30"/><circle cx="70" cy="52" r="1.3" fill="#7a5a30"/>`;
  if (a.mask) s += `<path d="M24 52 Q34 44 46 52 Q50 55 54 52 Q66 44 76 52 Q72 62 60 60 Q50 57 40 60 Q28 62 24 52 Z" fill="#2c2c33"/>`;
  s += `<ellipse cx="50" cy="69" rx="${a.antlers ? 17 : 14}" ry="${a.antlers ? 12 : 10}" fill="${a.muzzle}"/>`;
  s += eyes();
  s += `<ellipse cx="50" cy="64" rx="${a.antlers ? 6 : 4.6}" ry="3.3" fill="${a.nose}"/>`;
  s += `<path d="M44 71 Q47 74 50 71 Q53 74 56 71" stroke="#2b1d16" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
  if (a.teeth) s += `<rect x="46" y="72" width="3.6" height="6" rx="1" fill="#fff" stroke="#c9b9a0" stroke-width=".6"/><rect x="50.4" y="72" width="3.6" height="6" rx="1" fill="#fff" stroke="#c9b9a0" stroke-width=".6"/>`;
  if (a.whiskers) s += `<path d="M36 68 L22 65 M36 71 L22 72 M64 68 L78 65 M64 71 L78 72" stroke="#3a281b" stroke-width="1" stroke-linecap="round"/>`;
  s += `<circle cx="30" cy="64" r="4.5" fill="#ff8fa3" opacity=".35"/><circle cx="70" cy="64" r="4.5" fill="#ff8fa3" opacity=".35"/>`;
  return s;
}

/** Palmate moose antler, local coords: base at (0,0), growing up and to the right. */
const ANTLER = 'M0 2 C3 -4 7 -8 11 -10 C12 -16 12 -22 15 -27 C17 -23 18 -20 20 -19 C21 -25 23 -29 27 -31 C28 -26 28 -23 30 -21 C32 -25 35 -27 39 -28 C38 -23 37 -19 35 -16 C33 -12 28 -9 22 -8 C16 -7 10 -3 6 4 Z';
function antlerPair(lx, ly, rx, ry, s = 1, fill = '#efdfb9', line = OL) {
  const a = (x, y, flip) => `<path d="${ANTLER}" transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})" fill="${fill}" stroke="${line}" stroke-width="${2 / s}" stroke-linejoin="round"/>`;
  return a(lx, ly, true) + a(rx, ry, false);
}

function antlers(color = '#efdfb9', line = OL) {
  return antlerPair(36, 36, 64, 36, 0.95, color, line);
}

// ---------------------------------------------------------------- hats
function hat(id) {
  switch (id) {
    case 'beanie': return `<g><path d="M24 40 C24 17 76 17 76 40 Z" fill="#d0473a" ${stroke}/><rect x="22" y="36" width="56" height="9" rx="4.5" fill="#a83426" ${stroke}/>
      <path d="M31 37v7M38 37v7M45 37v7M52 37v7M59 37v7M66 37v7" stroke="#87281c" stroke-width="1.2"/><circle cx="50" cy="17" r="6" fill="#f6f1e6" ${stroke}/></g>`;
    case 'bandana': return `<g><path d="M22 42 Q50 30 78 42 L76 48 Q50 38 24 48 Z" fill="#d33a2c" ${stroke}/><circle cx="34" cy="42" r="1.4" fill="#fff"/><circle cx="46" cy="39" r="1.4" fill="#fff"/><circle cx="58" cy="39" r="1.4" fill="#fff"/><circle cx="68" cy="42" r="1.4" fill="#fff"/>
      <path d="M76 44 L86 38 L84 48 Z M76 46 L88 50 L80 54 Z" fill="#b52d21" ${stroke}/></g>`;
    case 'ranger': return `<g><ellipse cx="50" cy="38" rx="37" ry="7" fill="#a3814a" ${stroke}/><path d="M30 37 C30 16 40 12 50 21 C60 12 70 16 70 37 Z" fill="#c09c60" ${stroke}/>
      <path d="M44 16 L50 23 L56 16" stroke="#8b6b3a" stroke-width="1.5" fill="none"/><rect x="30" y="31" width="40" height="5" fill="#5b3d1e"/></g>`;
    case 'flowers': return `<g><path d="M22 41 Q50 22 78 41" stroke="#5c9a3c" stroke-width="2.4" fill="none"/>${[[26, 38, '#f7c1d9'], [36, 30, '#fff3a6'], [50, 27, '#c9b6f2'], [64, 30, '#ffd3a1'], [74, 38, '#f7c1d9']].map(([x, y, c]) =>
      `<g transform="translate(${x} ${y})"><circle r="3.4" cy="-3.4" fill="${c}"/><circle r="3.4" cx="3.4" fill="${c}"/><circle r="3.4" cy="3.4" fill="${c}"/><circle r="3.4" cx="-3.4" fill="${c}"/><circle r="2.2" fill="#f2b632"/></g>`).join('')}</g>`;
    case 'headlamp': return `<g><path d="M21 44 Q50 32 79 44" stroke="#2e2e33" stroke-width="5" fill="none"/><rect x="41" y="30" width="18" height="12" rx="4" fill="#3d3d44" ${stroke}/>
      <circle cx="50" cy="36" r="4.5" fill="#fff6b0"/><circle cx="50" cy="36" r="10" fill="#fff6b0" opacity=".22"/></g>`;
    case 'coonskin': return `<g><path d="M74 40 Q90 46 88 72" stroke="${OL}" stroke-width="11" fill="none" stroke-linecap="round"/><path d="M74 40 Q90 46 88 72" stroke="#8a6a4a" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M85 52 l6 2 M86 60 l6 1 M86 68 l5 0" stroke="#3a2a1c" stroke-width="3" stroke-linecap="round"/>
      <path d="M24 42 C22 18 78 18 76 42 Z" fill="#8a6a4a" ${stroke}/><path d="M24 42 Q50 36 76 42 L76 46 Q50 40 24 46 Z" fill="#6e5236" ${stroke}/></g>`;
    case 'lumberjack': {
      const p = nid('plaid');
      return `<g><defs><pattern id="${p}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#c22f2f"/><rect width="4" height="8" fill="#1d1d1d" opacity=".5"/><rect width="8" height="4" fill="#1d1d1d" opacity=".5"/></pattern></defs>
      <path d="M24 40 L18 56 L28 54 Z M76 40 L82 56 L72 54 Z" fill="url(#${p})" ${stroke}/><path d="M25 42 C25 20 75 20 75 42 Z" fill="url(#${p})" ${stroke}/><rect x="40" y="38" width="30" height="5" rx="2" fill="#2a2a2a"/></g>`;
    }
    case 'bucket': return `<g><path d="M18 42 Q50 30 82 42 L76 46 Q50 38 24 46 Z" fill="#7e8a5a" ${stroke}/><path d="M28 41 C30 22 70 22 72 41 Z" fill="#94a06c" ${stroke}/><rect x="29" y="35" width="42" height="4" fill="#5d6640"/>
      <path d="M66 30 l6 -4 l2 6 Z" fill="#e8592b"/><circle cx="69" cy="31" r="1" fill="#fff"/></g>`;
    case 'antlers': return `<g>${antlerPair(36, 38, 64, 38, 0.9, '#d4b07c')}<path d="M24 42 Q50 30 76 42" stroke="#7a3b2e" stroke-width="4.5" fill="none" stroke-linecap="round"/></g>`;
    case 'pinecrown': return `<g><path d="M24 42 Q50 32 76 42" stroke="#4a6b2e" stroke-width="5" fill="none" stroke-linecap="round"/>${[30, 40, 50, 60, 70].map((x, i) =>
      `<g transform="translate(${x} ${i === 2 ? 26 : i % 2 ? 30 : 35})"><ellipse rx="4.5" ry="7" fill="#8b5a2b" stroke="${OL}" stroke-width="1.6"/><path d="M-4 -3 h8 M-4 1 h8 M-3 5 h6" stroke="#5e3a17" stroke-width="1.1"/></g>`).join('')}</g>`;
    case 'goldantlers': {
      const g = nid('gold');
      return `<g><defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2a8"/><stop offset=".5" stop-color="#ffcc3d"/><stop offset="1" stop-color="#d99a15"/></linearGradient></defs>
      ${antlerPair(36, 38, 64, 38, 0.95, `url(#${g})`, '#8a5c08')}<path d="M24 42 Q50 30 76 42" stroke="#d99a15" stroke-width="4.5" fill="none" stroke-linecap="round"/>
      <path d="M50 12 l2 5 5 0 -4 3 2 5 -5 -3 -5 3 2 -5 -4 -3 5 0 Z" fill="#fff6c8" class="sparkle"/></g>`;
    }
    default: return '';
  }
}

/** A forest mascot head (with optional hat) as an SVG string. */
export function mascotSVG(id = 'fox', hatId = 'none', cls = '') {
  const a = ANIMALS[id] || ANIMALS.fox;
  const shade = nid('sh');
  return `<svg class="mascot ${cls}" viewBox="0 0 100 100" aria-hidden="true">
    <defs><radialGradient id="${shade}" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".14"/></radialGradient></defs>
    <ellipse cx="50" cy="94" rx="25" ry="4" fill="#000" opacity=".28"/>
    ${a.antlers ? antlers() : ''}
    ${ears(a)}
    <circle cx="50" cy="58" r="31" fill="${a.fur}" ${stroke}/>
    <circle cx="50" cy="58" r="30" fill="url(#${shade})"/>
    ${face(a)}
    ${hat(hatId)}
  </svg>`;
}

// ---------------------------------------------------------------- moose
/** The Mivimoose — round, inflatable, facing left. Body group scales via CSS var --puff. */
export function mooseSVG() {
  const g = nid('mbody');
  const h = nid('mhead');
  const sheen = nid('msheen');
  return `<svg class="moose-svg" viewBox="0 0 160 150" aria-hidden="true">
    <defs>
      <radialGradient id="${g}" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="var(--moose-hi, #b9814f)"/><stop offset="1" stop-color="var(--moose-lo, #6d4426)"/></radialGradient>
      <radialGradient id="${h}" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#a26c41"/><stop offset="1" stop-color="#6f4528"/></radialGradient>
      <radialGradient id="${sheen}" cx="35%" cy="25%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse class="m-shadow" cx="86" cy="142" rx="44" ry="5.5" fill="#000" opacity=".32"/>
    <g class="m-legs" fill="#4f2f19" stroke="${OL}" stroke-width="2.2" stroke-linejoin="round">
      <rect class="leg l1" x="58" y="106" width="11" height="31" rx="5"/><rect class="leg l2" x="75" y="109" width="11" height="28" rx="5"/>
      <rect class="leg l3" x="99" y="109" width="11" height="28" rx="5"/><rect class="leg l4" x="116" y="106" width="11" height="31" rx="5"/>
      <g fill="#2a180c" stroke="none"><rect x="58" y="132" width="11" height="6" rx="2.5"/><rect x="75" y="132" width="11" height="6" rx="2.5"/><rect x="99" y="132" width="11" height="6" rx="2.5"/><rect x="116" y="132" width="11" height="6" rx="2.5"/></g>
    </g>
    <g class="m-body">
      <ellipse cx="140" cy="80" rx="7" ry="6" fill="#5a3519" stroke="${OL}" stroke-width="2.2"/>
      <ellipse cx="92" cy="88" rx="48" ry="38" fill="url(#${g})" stroke="${OL}" stroke-width="2.4"/>
      <ellipse cx="92" cy="88" rx="47" ry="37" fill="url(#${sheen})"/>
      <ellipse cx="92" cy="104" rx="29" ry="14" fill="#f0d3a4" opacity=".45"/>
      <path class="m-stretch" d="M60 76 q6 -6 12 0 M100 64 q6 -6 12 0 M78 114 q6 -5 12 0" stroke="#fff" stroke-opacity=".0" stroke-width="2" fill="none"/>
    </g>
    <g class="m-head">
      ${antlerPair(46, 38, 64, 35, 1.05)}
      <ellipse cx="34" cy="46" rx="11" ry="5.5" transform="rotate(-32 34 46)" fill="#6f4528" stroke="${OL}" stroke-width="2.2"/>
      <ellipse cx="34" cy="46" rx="6" ry="2.6" transform="rotate(-32 34 46)" fill="#c99872"/>
      <ellipse cx="78" cy="44" rx="11" ry="5.5" transform="rotate(30 78 44)" fill="#6f4528" stroke="${OL}" stroke-width="2.2"/>
      <ellipse cx="78" cy="44" rx="6" ry="2.6" transform="rotate(30 78 44)" fill="#c99872"/>
      <path d="M44 88 q-4 9 1 15 q5 -6 3 -15 Z" fill="#6d4426" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/>
      <ellipse cx="57" cy="60" rx="25" ry="22" fill="url(#${h})" stroke="${OL}" stroke-width="2.4"/>
      <ellipse cx="42" cy="77" rx="20" ry="14.5" fill="#c08e60" stroke="${OL}" stroke-width="2.4"/>
      <ellipse cx="38" cy="72" rx="9" ry="4" fill="#fff" opacity=".18"/>
      <ellipse cx="34" cy="76" rx="2.8" ry="2.2" fill="#2a1a0f"/><ellipse cx="46" cy="77" rx="2.8" ry="2.2" fill="#2a1a0f"/>
      <path class="m-mouth" d="M34 84 Q41 89 48 84" stroke="#3a2212" stroke-width="2" fill="none" stroke-linecap="round"/>
      <g class="m-eyes"><circle cx="52" cy="56" r="5" fill="#1b0f08"/><circle cx="69" cy="54" r="5" fill="#1b0f08"/>
        <circle cx="53.8" cy="54.2" r="1.9" fill="#fff"/><circle cx="70.8" cy="52.2" r="1.9" fill="#fff"/></g>
      <path d="M47 48 q5 -3 9 -1 M65 46 q5 -3 9 0" stroke="#3a2212" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <circle cx="62" cy="67" r="4.5" fill="#ff8fa3" opacity=".45"/><circle cx="77" cy="63" r="3.6" fill="#ff8fa3" opacity=".4"/>
      <g class="m-sweat"><path d="M82 42 q4.5 6.5 0 9.5 q-4.5 -3 0 -9.5" fill="#9fd6ff" stroke="#3a6b8a" stroke-width="1"/></g>
    </g>
  </svg>`;
}

// ---------------------------------------------------------------- campfire
export function campfireSVG() {
  const glow = nid('fglow');
  const stones = [[16, 92, 9], [28, 99, 8], [44, 103, 9], [61, 104, 9], [78, 103, 9], [93, 99, 8], [104, 92, 8]];
  return `<svg class="campfire-svg" viewBox="0 0 120 112" aria-hidden="true">
    <defs><radialGradient id="${glow}" cx="50%" cy="60%" r="50%"><stop offset="0" stop-color="#ffb347" stop-opacity=".55"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="60" cy="70" rx="56" ry="40" fill="url(#${glow})"/>
    <ellipse cx="60" cy="100" rx="50" ry="9" fill="#000" opacity=".35"/>
    <g class="logs" stroke="${OL}" stroke-width="2" stroke-linejoin="round">
      <rect x="22" y="80" width="76" height="12" rx="6" fill="#6f4426" transform="rotate(13 60 86)"/>
      <rect x="22" y="80" width="76" height="12" rx="6" fill="#86542f" transform="rotate(-13 60 86)"/>
      <circle cx="25" cy="77.5" r="5.5" fill="#d9ab72"/><circle cx="95" cy="77.5" r="5.5" fill="#d9ab72"/>
    </g>
    <g class="flames">
      <path class="f1" d="M60 88 C38 86 36 64 46 50 C47 60 52 62 54 55 C55 42 61 31 70 20 C69 37 85 47 82 66 C80 80 72 88 60 88 Z" fill="#ff7a1a"/>
      <path class="f2" d="M60 88 C46 86 45 72 52 63 C53 70 58 71 60 64 C62 56 64 50 69 44 C70 57 78 63 76 73 C74 83 68 88 60 88 Z" fill="#ffb323"/>
      <path class="f3" d="M60 88 C52 88 51 80 55 74 C57 78 60 78 61 72 C63 68 64 66 66 64 C68 71 70 76 68 81 C66 86 64 88 60 88 Z" fill="#fff3b8"/>
    </g>
    <g class="embers"><circle cx="50" cy="44" r="1.5" fill="#ffcc66"/><circle cx="70" cy="34" r="1.2" fill="#ffaa44"/><circle cx="58" cy="24" r="1" fill="#ffdd88"/></g>
    <g stroke="${OL}" stroke-width="1.8">${stones.map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.62}" fill="#86837c"/>`).join('')}</g>
    <g fill="#fff" opacity=".18">${stones.map(([x, y, r]) => `<ellipse cx="${x - r * 0.25}" cy="${y - r * 0.22}" rx="${r * 0.45}" ry="${r * 0.18}"/>`).join('')}</g>
  </svg>`;
}

/** Tree stump seat */
export function stumpSVG() {
  return `<svg class="stump-svg" viewBox="0 0 100 52" aria-hidden="true">
    <ellipse cx="50" cy="45" rx="42" ry="6" fill="#000" opacity=".28"/>
    <path d="M12 19 L13 37 Q14 44 22 44 L8 48 L26 46 Q50 51 74 46 L92 48 L78 44 Q86 44 87 37 L88 19 Z" fill="#714629" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M22 24 L22 41 M36 27 L36 46 M64 27 L64 46 M78 24 L78 41" stroke="#5a371f" stroke-width="2" stroke-linecap="round"/>
    <ellipse cx="50" cy="19" rx="38" ry="10.5" fill="#d8aa70" stroke="${OL}" stroke-width="2"/>
    <ellipse cx="50" cy="19" rx="27" ry="7" fill="none" stroke="#b58750" stroke-width="1.4"/>
    <ellipse cx="50" cy="19" rx="15" ry="4" fill="none" stroke="#b58750" stroke-width="1.4"/>
    <ellipse cx="50" cy="19" rx="4.5" ry="1.4" fill="#b58750"/>
  </svg>`;
}

// ---------------------------------------------------------------- scenery
function pineRow(count, yBase, hMin, hMax, color, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = (i / count) * 1640 - 20 + rnd() * 40 - 20;
    const h = hMin + rnd() * (hMax - hMin);
    const w = h * 0.36;
    const y = yBase + rnd() * 24;
    // three soft tiers + trunk
    out += `<path d="M${x} ${y - h} L${x - w * 0.42} ${y - h * 0.6} L${x - w * 0.22} ${y - h * 0.6} L${x - w * 0.7} ${y - h * 0.28} L${x - w * 0.36} ${y - h * 0.28} L${x - w} ${y} L${x + w} ${y} L${x + w * 0.36} ${y - h * 0.28} L${x + w * 0.7} ${y - h * 0.28} L${x + w * 0.22} ${y - h * 0.6} L${x + w * 0.42} ${y - h * 0.6} Z" fill="${color}"/>`;
  }
  return out;
}

/** Full-screen night forest backdrop. */
export function forestSVG() {
  let stars = '';
  let s = 7;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 70; i++) stars += `<circle class="star" style="animation-delay:${(rnd() * 4).toFixed(2)}s" cx="${(rnd() * 1600).toFixed(0)}" cy="${(rnd() * 400).toFixed(0)}" r="${(rnd() * 1.3 + 0.35).toFixed(1)}" fill="#fff"/>`;
  return `<svg class="forest-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#071621"/><stop offset=".5" stop-color="#0f2a36"/><stop offset="1" stop-color="#173a38"/></linearGradient>
      <radialGradient id="moonglow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff6d8" stop-opacity=".38"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></radialGradient>
      <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fc7c0" stop-opacity="0"/><stop offset=".5" stop-color="#9fc7c0" stop-opacity=".07"/><stop offset="1" stop-color="#9fc7c0" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="1600" height="900" fill="url(#sky)"/>
    ${stars}
    <circle cx="1280" cy="150" r="130" fill="url(#moonglow)"/>
    <circle cx="1280" cy="150" r="40" fill="#fbf3d9"/><circle cx="1268" cy="141" r="6.5" fill="#ece2c2"/><circle cx="1294" cy="163" r="4.5" fill="#ece2c2"/>
    <path d="M0 560 Q220 450 440 520 T880 500 T1320 470 T1600 515 L1600 900 L0 900 Z" fill="#183839"/>
    <g>${pineRow(36, 640, 150, 240, '#16302f', 3)}</g>
    <rect y="560" width="1600" height="160" fill="url(#mist)"/>
    <g>${pineRow(26, 770, 220, 330, '#10252a', 11)}</g>
    <path d="M0 825 Q400 770 800 805 T1600 795 L1600 900 L0 900 Z" fill="#0b1c1f"/>
    <g>${pineRow(14, 940, 320, 450, '#081517', 29)}</g>
  </svg>`;
}

export const MASCOT_IDS = Object.keys(ANIMALS);
