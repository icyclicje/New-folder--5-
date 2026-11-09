// Mivimoose Party — one consistent duotone line-icon set (24×24, round caps), injected as an SVG sprite.
// Every emoji the UI (or the server) prints is swapped for its icon by a small DOM observer, so icons
// look the same on every platform instead of depending on the OS emoji font.

// duotone fill: the soft "tint" inside a shape (CSS can turn it solid with --duo: 1)
const D = 'style="fill:currentColor;fill-opacity:var(--duo,.2)"';
const S = 'fill="currentColor" stroke="none"';

const ICONS = {
  fire: `<path ${D} d="M12 21.5c3.6 0 6-2.6 6-6.1 0-2.6-1.3-4.3-2.6-5.6-.2 1.5-.9 2.5-1.9 3 .4-3.5-1.2-6.6-3.7-9.3.1 3-1.4 4.6-2.9 6.3C5.6 11.3 6 13.2 6 15.4c0 3.5 2.4 6.1 6 6.1Z"/><path d="M12 21.5c-1.6 0-2.7-1.2-2.7-2.8 0-1.6 1.1-2.6 2.2-3.8.2 1 .7 1.6 1.4 1.8.5-.5.8-1.2.9-2 1 1 1.4 2.2 1.4 3.4 0 2-1.4 3.4-3.2 3.4Z"/>`,
  moose: `<path ${D} d="M9.2 10.4h5.6l.7 5.3c.3 2.6-1.4 5.3-3.5 5.3s-3.8-2.7-3.5-5.3Z"/><path d="M10.7 18.4v.01M13.3 18.4v.01"/><path ${D} d="M9.2 10.4C6.4 10.3 4 8.5 3.4 5.5c.9.5 1.6.6 2.3.3-.4-1-.4-2-.1-2.9.8.9 1.6 1.4 2.5 1.6.1-.9.4-1.6.9-2.3.6 1.9 1 4.8.2 8.2Z"/><path ${D} d="M14.8 10.4c2.8-.1 5.2-1.9 5.8-4.9-.9.5-1.6.6-2.3.3.4-1 .4-2 .1-2.9-.8.9-1.6 1.4-2.5 1.6-.1-.9-.4-1.6-.9-2.3-.6 1.9-1 4.8-.2 8.2Z"/><path d="m9 11.4-2.6 1.4M15 11.4l2.6 1.4"/>`,
  antler: `<path ${D} d="M7 21.5c.2-3.9 1.4-6.9 3.8-9.1-1.4-1.7-1.9-3.9-1.4-6.4 1 1.1 1.9 1.8 3 2-.1-1.6.4-3.2 1.4-4.5.6 1.6 1.5 2.8 2.7 3.4.4-1 1.1-1.8 2.1-2.4.2 1.6-.1 3.3-1 4.8 1 0 1.9-.4 2.7-1.1-.6 2.7-2.6 4.8-5.5 5.4-2.4.5-4.5 2.4-5.2 7.9Z"/>`,
  boot: `<path ${D} d="M6.5 3.5h5.2v6.3l4.9 2.3c2 .9 3.4 2.1 3.4 3.9v1.5H4.5V5.5c0-1.1.9-2 2-2Z"/><path d="M4.5 17.5v2.2c0 .4.4.8.8.8h14.4c.4 0 .8-.4.8-.8v-2.2M8 7h3.7M8 10h3.7M13.2 12.6l1.3-1.3"/>`,
  tent: `<path ${D} d="M3 19.5 12 5l9 14.5Z"/><path d="m12 5 1.6-2.5M12 5l-1.6-2.5M12 10.5v9M9 19.5l3-5 3 5M2 19.5h20"/>`,
  pine: `<path ${D} d="M12 2.5 7.5 8.6h2.6L6 14.2h3.2L5 19.5h14l-4.2-5.3H18l-4.1-5.6h2.6Z"/><path d="M12 19.5v2.5"/>`,
  log: `<path ${D} d="M15.5 7.2H7.2C5.2 7.2 3.6 9.4 3.6 12.1S5.2 17 7.2 17h8.3"/><ellipse ${D} cx="15.5" cy="12.1" rx="4.4" ry="4.9"/><ellipse cx="15.5" cy="12.1" rx="2" ry="2.3"/><path d="M7.5 10.6h3.4M8.5 13.6h2.6M9.6 7.2 11 4.2"/>`,
  swords: `<path ${D} d="M3.5 3.5h3l9 9-3 3-9-9Z"/><path ${D} d="M20.5 3.5h-3l-9 9 3 3 9-9Z"/><path d="m16.8 11.2-5.6 5.6M7.2 11.2l5.6 5.6M15.2 15.2l4 4M8.8 15.2l-4 4M20.3 20.3v.01M3.7 20.3v.01"/>`,
  book: `<path ${D} d="M5 4.5C5 3.7 5.7 3 6.5 3H19v15H6.5C5.7 18 5 18.7 5 19.5Z"/><path d="M5 19.5C5 20.3 5.7 21 6.5 21H19v-3M9 7h6M9 10h4"/>`,
  trophy: `<path ${D} d="M7 3.5h10v5.2c0 2.8-2.2 5.1-5 5.1s-5-2.3-5-5.1Z"/><path d="M7 5.5H4.2c0 2.6 1.3 4.3 3.3 4.6M17 5.5h2.8c0 2.6-1.3 4.3-3.3 4.6M12 13.8v3.4M8.5 20.5h7M9.5 20.5c0-1.9 1.1-3.3 2.5-3.3s2.5 1.4 2.5 3.3"/>`,
  compass: `<circle ${D} cx="12" cy="12" r="9"/><path ${S} d="m15.6 8.4-2.3 4.9-4.9 2.3 2.3-4.9Z" style="fill-opacity:.9"/><path d="M12 3v1.6M12 19.4V21M3 12h1.6M19.4 12H21"/>`,
  radio: `<rect ${D} x="3" y="8" width="18" height="12.5" rx="2.5"/><path d="M6.5 8 16.5 3.5"/><circle cx="8.6" cy="14.2" r="2.6"/><path d="M14 12.4h3.5M14 15.8h3.5"/>`,
  map: `<path ${D} d="M3.5 6.2 9 4l6 2.2L20.5 4v13.8L15 20l-6-2.2-5.5 2.2Z"/><path d="M9 4v13.8M15 6.2V20"/>`,
  paw: `<path ${D} d="M12 12.5c-2.6 0-5.2 2.9-5.2 5.1 0 1.5 1.1 2.4 2.6 2.4 1 0 1.6-.5 2.6-.5s1.6.5 2.6.5c1.5 0 2.6-.9 2.6-2.4 0-2.2-2.6-5.1-5.2-5.1Z"/><g ${S}><ellipse cx="5.6" cy="11" rx="1.8" ry="2.2"/><ellipse cx="9.3" cy="6.6" rx="1.9" ry="2.4"/><ellipse cx="14.7" cy="6.6" rx="1.9" ry="2.4"/><ellipse cx="18.4" cy="11" rx="1.8" ry="2.2"/></g>`,
  axe: `<path d="M5 20.5 15 7"/><path ${D} d="M12.6 5.4 16.4 2c2.8 1.6 4.4 4.4 4.1 7.6l-4.6-.7Z"/>`,
  lock: `<rect ${D} x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7M12 14.5v2.2"/>`,
  rain: `<path ${D} d="M7.5 15.5a4 4 0 0 1-.6-7.9 5.5 5.5 0 0 1 10.6 1.4 3.3 3.3 0 0 1-.4 6.5Z"/><path d="m8.5 18.5-1 2M12.5 18.5l-1 2M16.5 18.5l-1 2"/>`,
  pencil: `<path ${D} d="M15.6 4.4a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/><path d="m13.8 6.2 4 4"/>`,
  ban: `<circle ${D} cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>`,
  signal: `<path d="M5 12.6a10.4 10.4 0 0 1 3.4-2.4M12.4 8.6a10.4 10.4 0 0 1 6.6 4M8.4 15.8a5.2 5.2 0 0 1 6.2-.6M12 19.2v.01M3.5 3.5l17 17"/>`,
  eye: `<path ${D} d="M2.5 12S5.8 5.5 12 5.5 21.5 12 21.5 12 18.2 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>`,
  megaphone: `<path ${D} d="M4 9.5h3.5L16 5v14l-8.5-4.5H4Z"/><path d="M7.5 14.5 9 20h2.5l-1-5M19 9.5a3.5 3.5 0 0 1 0 5"/>`,
  medal: `<path d="m8 2.5 2.5 6.2M16 2.5l-2.5 6.2"/><circle ${D} cx="12" cy="14.5" r="6"/><path ${S} d="m12 11.6 1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3Z"/>`,
  check: `<path d="m5 12.5 4.5 4.5L19 7.5"/>`,
  x: `<path d="M6 6l12 12M18 6 6 18"/>`,
  ghost: `<path ${D} d="M5 20.5V11a7 7 0 0 1 14 0v9.5l-2.3-1.6-2.4 1.6-2.3-1.6-2.3 1.6-2.4-1.6Z"/><path d="M9.5 10.5v1.2M14.5 10.5v1.2"/>`,
  marshmallow: `<g transform="rotate(35 12 12)"><path d="M12 1.5v21"/><rect ${D} x="8" y="4" width="8" height="4.6" rx="1.9"/><rect ${D} x="8" y="9.7" width="8" height="4.6" rx="1.9"/><rect ${D} x="8" y="15.4" width="8" height="4.6" rx="1.9"/></g>`,
  burst: `<path ${D} d="m12 2.5 1.9 5.1 5.3-2.1-2.4 5.1 4.7 2.9-5.4 1.1.9 5.4-4.2-3.5-3.5 4.3-.8-5.5-5.4-.4 4.1-3.6-3.1-4.5 5.4 1.1Z"/>`,
  dice: `<rect ${D} x="4" y="4" width="16" height="16" rx="3.5"/><g ${S}><circle cx="8.5" cy="8.5" r="1.3"/><circle cx="15.5" cy="15.5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="15.5" cy="8.5" r="1.3"/><circle cx="8.5" cy="15.5" r="1.3"/></g>`,
  canoe: `<path ${D} d="M2.5 14h19c-1.6 3.4-5 5.2-9.5 5.2S4.1 17.4 2.5 14Z"/><path d="M2.5 14c3 .9 6.2 1.3 9.5 1.3s6.5-.4 9.5-1.3M17.8 2.8 14 11.6"/><path ${D} d="M14 11.6c-.9-.2-1.8.4-2.1 1.3l-.4 1.2 2.6.3.4-1.2c.3-.8 0-1.4-.5-1.6Z"/>`,
  signpost: `<path d="M12 21.5V3"/><path ${D} d="M5 5h12l2.5 2.5L17 10H5Z"/><path ${D} d="M19 12H7l-2.5 2.5L7 17h12Z"/>`,
  hand: `<path ${D} d="M8 13V5.6a1.5 1.5 0 0 1 3 0V11m0-.5V4.1a1.5 1.5 0 0 1 3 0v6.4m0 0V5.6a1.5 1.5 0 0 1 3 0v8.2c0 4-2.6 6.7-6 6.7-2.2 0-3.6-1-4.9-2.9l-2.5-3.9A1.5 1.5 0 0 1 7.1 12Z"/>`,
  crown: `<path ${D} d="M4 17.5 3 7.5l5 4 4-6.5 4 6.5 5-4-1 10Z"/><path d="M4.5 20.5h15"/>`,
  backpack: `<path ${D} d="M6 9.5a6 6 0 0 1 12 0V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19Z"/><path d="M9.5 3.8V3h5v.8M9 13.5h6v4H9Z"/>`,
  copy: `<rect ${D} x="8.5" y="8.5" width="12" height="12" rx="2.2"/><path d="M15.5 8.5V5.7c0-1.2-1-2.2-2.2-2.2H5.7c-1.2 0-2.2 1-2.2 2.2v7.6c0 1.2 1 2.2 2.2 2.2h2.8"/>`,
  link: `<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`,
  volume: `<path ${D} d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>`,
  mute: `<path ${D} d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>`,
  night: `<path ${D} d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/><path d="M17 3v3.2M15.4 4.6h3.2"/>`,
  equal: `<circle ${D} cx="12" cy="12" r="8.5"/><path d="M8.5 10h7M8.5 14h7"/>`,
  swap: `<path d="M4 12h16M7.5 8.5 4 12l3.5 3.5M16.5 8.5 20 12l-3.5 3.5"/>`,
  download: `<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15"/>`,
  upload: `<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4.5 19.5h15"/>`,
  trash: `<path d="M4.5 6.5h15M9.5 6.5v-2h5v2"/><path ${D} d="m6.5 6.5.9 13c.1.6.5 1 1.1 1h7c.6 0 1-.4 1.1-1l.9-13Z"/><path d="M10 10.5v6M14 10.5v6"/>`,
  save: `<path ${D} d="M5 3.5h11l3.5 3.5v12a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5Z"/><path d="M8 3.5v5h7v-5M8 20.5v-6h8v6"/>`,
  fog: `<path d="M3.5 8.5h11M7 12.5h13.5M3.5 16.5h10M17.5 16.5h3"/>`,
  leaf: `<path ${D} d="M5 19C5 10 10 4.5 20 4.5c0 10-5.5 15-15 14.5Z"/><path d="M5 19 13.5 10.5"/>`,
  maple: `<path ${D} d="m12 2.5 1.6 3.6 2.4-1-.6 4.2 3.6-1.8-.9 2.4 3.4 1.2-3.2 2.6.8 1.6-4.4-.4.6 3.1-3.3-1.6-3.3 1.6.6-3.1-4.4.4.8-1.6L2 11.1l3.4-1.2-.9-2.4 3.6 1.8-.6-4.2 2.4 1Z"/><path d="M12 15.5v6"/>`,
  feather: `<path ${D} d="M20 4c-7.5 0-13 4.6-13 13.2 6.6 0 13-4.6 13-13.2Z"/><path d="M4 20 15 9M9.5 14.5h4.4M12.2 11.8h3.6"/>`,
  sparkles: `<path ${D} d="M10 3.5c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6Z"/><path ${D} d="M18 14c.3 1.8 1.2 2.7 3 3-1.8.3-2.7 1.2-3 3-.3-1.8-1.2-2.7-3-3 1.8-.3 2.7-1.2 3-3Z"/>`,
  star: `<path ${D} d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8Z"/>`,
  wind: `<path d="M3.5 9h10.5a2.5 2.5 0 1 0-2.5-2.5M3.5 13h14a2.5 2.5 0 1 1-2.5 2.5M3.5 17h6"/>`,
  acorn: `<path ${D} d="M6.5 10.5h11V12c0 4.5-2.8 8-5.5 8.5-2.7-.5-5.5-4-5.5-8.5Z"/><path ${D} d="M5 10.5c0-2.8 3-5 7-5s7 2.2 7 5Z"/><path d="M12 5.5V3"/>`,
  flashlight: `<path ${D} d="M8.5 3.5h7L14 9.5V20a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 10 20V9.5Z"/><path d="M10 9.5h4M12 13v2"/>`,
  globe: `<circle ${D} cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.4 3.6 5.2 3.6 8.5s-1.1 6.1-3.6 8.5c-2.5-2.4-3.6-5.2-3.6-8.5S9.5 5.9 12 3.5Z"/>`,
  warning: `<path ${D} d="M10.3 4.5a2 2 0 0 1 3.4 0l7.4 13a2 2 0 0 1-1.7 3H4.6a2 2 0 0 1-1.7-3Z"/><path d="M12 9.5V14M12 17.2v.01"/>`,
  bolt: `<path ${D} d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6Z"/>`,
  gear: `<circle ${D} cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>`,
  repeat: `<path d="M4.5 11V9.5a3 3 0 0 1 3-3h12M16.5 3.5l3 3-3 3M19.5 13v1.5a3 3 0 0 1-3 3h-12M7.5 20.5l-3-3 3-3"/>`,
  fox: `<path ${D} d="m4 3.5 4.6 4.2h6.8L20 3.5l-.4 8.3c-.5 4.5-3.8 8.2-7.6 8.7-3.8-.5-7.1-4.2-7.6-8.7Z"/><path d="M8.6 13.4v.01M15.4 13.4v.01M12 17.4l-1.2-1.1h2.4Z"/>`,
  wolf: `<path ${D} d="M5 2.5 8.8 8h6.4L19 2.5l.5 9.3c0 4.4-3.4 8.2-7.5 8.7-4.1-.5-7.5-4.3-7.5-8.7Z"/><path d="M8.8 12.6 10.4 13.4M15.2 12.6l-1.6.8M12 17.6l-1.3-1.2h2.6Z"/>`,
  hat: `<path ${D} d="M7.5 4.5h9v11h-9Z"/><path d="M3.5 16c2.2 1.3 5 2 8.5 2s6.3-.7 8.5-2M7.5 12.5h9"/>`,
  flag: `<path d="M5 21V3.5"/><path ${D} d="M5 4h12.5L15 8l2.5 4H5"/>`,
  gift: `<rect ${D} x="4" y="9.5" width="16" height="11" rx="1.5"/><path d="M3.5 6.5h17v3h-17ZM12 6.5v14M12 6.5c-1-2.5-4.5-3.5-4.5-1 0 1.4 2.3 1 4.5 1Zm0 0c1-2.5 4.5-3.5 4.5-1 0 1.4-2.3 1-4.5 1Z"/>`,
  question: `<circle ${D} cx="12" cy="12" r="8.5"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 16.8v.01"/>`,
  volcano: `<path ${D} d="M2.5 20.5 8 11h8l5.5 9.5Z"/><path d="M9.5 11c.5 1.8 1.4 2.5 2.5 2.5s2-.7 2.5-2.5M12 8V5.5M9 7.5 7.8 5.5M15 7.5l1.2-2"/>`,
  seedling: `<path d="M12 20.5V11"/><path ${D} d="M12 11C12 7 9.5 4.5 5 4.5c0 4 2.7 6.5 7 6.5ZM12 13.5c0-3.5 2.5-6 6.5-6 0 3.6-2.6 6-6.5 6Z"/>`,
  chevron: `<path d="m9 5 7 7-7 7"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  minus: `<path d="M5 12h14"/>`,
  enter: `<path d="M19.5 5v6.5a3 3 0 0 1-3 3H5M9 10.5l-4 4 4 4"/>`,
  user: `<circle ${D} cx="12" cy="8" r="4"/><path ${D} d="M4.5 20.5c.7-3.9 3.7-6 7.5-6s6.8 2.1 7.5 6Z"/>`,
  send: `<path ${D} d="M3.5 11.2 20.5 4l-7.2 17-2.4-7.4Z"/><path d="m10.9 13.6 4.3-4.3"/>`,
  dot: `<circle ${S} cx="12" cy="12" r="4"/>`,
  // two-tone flame for lives (gradient lives in the sprite <defs>)
  life: `<path fill="url(#ig-flame)" stroke="none" d="M12 22c3.9 0 6.5-2.8 6.5-6.6 0-2.8-1.4-4.7-2.8-6.1-.2 1.6-1 2.7-2 3.2.4-3.8-1.3-7.1-4-10 .1 3.2-1.5 5-3.1 6.8C5.1 11.1 5.5 13.1 5.5 15.4 5.5 19.2 8.1 22 12 22Z"/><path fill="#fff3c2" stroke="none" d="M12 22c-1.7 0-2.9-1.3-2.9-3 0-1.7 1.2-2.8 2.4-4.1.2 1.1.8 1.7 1.5 1.9.5-.6.9-1.3 1-2.2 1.1 1.1 1.5 2.4 1.5 3.7 0 2.2-1.5 3.7-3.5 3.7Z"/>`,
  ember: `<path d="M12 21.5c3.6 0 6-2.6 6-6.1 0-2.6-1.3-4.3-2.6-5.6-.2 1.5-.9 2.5-1.9 3 .4-3.5-1.2-6.6-3.7-9.3.1 3-1.4 4.6-2.9 6.3C5.6 11.3 6 13.2 6 15.4c0 3.5 2.4 6.1 6 6.1Z" stroke-dasharray="2.2 2.6"/>`,
};

// emoji → icon. Variation selectors (U+FE0F) are ignored when matching.
const EMOJI_RAW = {
  '🔥': 'fire', '🦌': 'antler', '🥾': 'boot', '⛺': 'tent', '🏕': 'tent', '🌲': 'pine', '🪵': 'log', '⚔': 'swords',
  '📒': 'book', '🏆': 'trophy', '🧭': 'compass', '📻': 'radio', '🗺': 'map', '🐾': 'paw', '🪓': 'axe', '🔒': 'lock',
  '🌧': 'rain', '✏': 'pencil', '✍': 'pencil', '🚫': 'ban', '📡': 'signal', '👀': 'eye', '📣': 'megaphone',
  '🏅': 'medal', '🎖': 'medal', '🥇': 'medal', '🥈': 'medal', '🥉': 'medal', '✔': 'check', '✅': 'check', '✖': 'x',
  '👻': 'ghost', '🍡': 'marshmallow', '💥': 'burst', '🎲': 'dice', '🛶': 'canoe', '🪧': 'signpost', '✋': 'hand',
  '👑': 'crown', '🎒': 'backpack', '📋': 'copy', '🔗': 'link', '🔊': 'volume', '🔇': 'mute', '🤫': 'mute', '🦗': 'night',
  '🤝': 'equal', '↔': 'swap', '⬇': 'download', '⬆': 'upload', '🗑': 'trash', '💾': 'save', '🌫': 'fog',
  '🍂': 'leaf', '🍃': 'leaf', '🌿': 'leaf', '🍁': 'maple', '🪶': 'feather', '✨': 'sparkles', '🌟': 'star', '⭐': 'star',
  '💨': 'wind', '🌰': 'acorn', '🥜': 'acorn', '🔦': 'flashlight', '🌐': 'globe', '⚠': 'warning', '💪': 'bolt',
  '⚙': 'gear', '🔁': 'repeat', '🦊': 'fox', '🐺': 'wolf', '🎩': 'hat', '🏳': 'flag', '🎁': 'gift', '❓': 'question',
  '🌋': 'volcano', '🌱': 'seedling',
};
const EMOJI = Object.fromEntries(Object.entries(EMOJI_RAW).map(([k, v]) => [k.replace(/️/g, ''), v]));
const MEDAL_TONE = { '🥇': 'gold', '🥈': 'silver', '🥉': 'bronze' };

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const KEYS = Object.keys(EMOJI).sort((a, b) => b.length - a.length).map(escRe).join('|');
const RE = new RegExp(`(${KEYS})\\uFE0F?`, 'gu');
const RE_TEST = new RegExp(`(${KEYS})`, 'u');

/** Inline icon markup for templates. */
export function icon(name, cls = '') {
  return `<svg class="ic ic-${name}${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
}

function iconEl(name, extra) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', `ic ic-${name}${extra ? ' ' + extra : ''}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

const SKIP = 'svg,option,select,textarea,script,style,title,[data-noicon]';

function swapText(t) {
  const s = t.data;
  if (!s || !RE_TEST.test(s)) return;
  const parent = t.parentElement;
  if (!parent || parent.closest(SKIP)) return;
  const frag = document.createDocumentFragment();
  let last = 0;
  RE.lastIndex = 0;
  for (const m of s.matchAll(RE)) {
    if (m.index > last) frag.append(s.slice(last, m.index));
    frag.append(iconEl(EMOJI[m[1]], MEDAL_TONE[m[1]] ? 'tone-' + MEDAL_TONE[m[1]] : ''));
    last = m.index + m[0].length;
  }
  if (last < s.length) frag.append(s.slice(last));
  t.replaceWith(frag);
}

/** Replace mapped emoji under `root` with icons. */
export function iconize(root = document.body) {
  if (!root) return;
  if (root.nodeType === 3) { swapText(root); return; }
  if (root.nodeType !== 1 && root.nodeType !== 11) return;
  if (root.nodeType === 1 && root.closest(SKIP)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (RE_TEST.test(n.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const found = [];
  while (walker.nextNode()) found.push(walker.currentNode);
  found.forEach(swapText);
}

let observer = null;
/** Inject the sprite and keep every future DOM change iconized. Call once at boot. */
export function installIcons() {
  if (document.getElementById('icon-sprite')) return;
  const defs = Object.entries(ICONS).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join('');
  document.body.insertAdjacentHTML('afterbegin', `<svg id="icon-sprite" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true"><defs><linearGradient id="ig-flame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ef4b1f"/><stop offset=".55" stop-color="#ff8a2c"/><stop offset="1" stop-color="#ffc04a"/></linearGradient>${defs}</defs></svg>`);
  iconize(document.body);
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') swapText(r.target);
      else for (const n of r.addedNodes) iconize(n);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

export const ICON_NAMES = Object.keys(ICONS);
