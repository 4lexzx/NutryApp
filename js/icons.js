/* Iconos vectoriales (SVG inline) — un solo lenguaje visual: 24×24, trazo 1.8, extremos redondeados. */

const P = {
  calendar: '<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>',
  calendarDays: '<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  plusCircle: '<circle cx="12" cy="12" r="9"/><path d="M12 8.5v7M8.5 12h7"/>',
  minus: '<path d="M5 12h14"/>',
  barChart: '<path d="M6 20v-6M12 20V6M18 20v-9M3 20h18"/>',
  chartLine: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 15l4-5 3 3 5-7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  userCheck: '<circle cx="10" cy="8" r="4"/><path d="M3 20.5a7.5 7.5 0 0 1 13.5-4.6"/><path d="M16.5 19l2 2 4-4"/>',
  sliders: '<path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  camera: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.6-2.4h6.8L17 7h3a2 2 0 0 1 2 2z"/><circle cx="12" cy="13.5" r="3.6"/>',
  image: '<rect x="3" y="3.5" width="18" height="17" rx="2.5"/><circle cx="8.7" cy="9.2" r="1.7"/><path d="M21 15.5l-4.5-4.5L6 21"/>',
  pencil: '<path d="M12.5 20.5H21"/><path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7.6 18.4 3 19.5l1.1-4.6z"/>',
  star: '<path d="M12 2.8l2.9 5.9 6.5 1-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.7l6.5-1z"/>',
  sparkles: '<path d="M12 3l1.7 4.6L18.3 9.3 13.7 11 12 15.6 10.3 11 5.7 9.3l4.6-1.7z"/><path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8zM5.5 15.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"/>',
  droplet: '<path d="M12 2.7l5.6 5.6a8 8 0 1 1-11.2 0z"/>',
  alert: '<path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4.5M12 17.2h.01"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8.3 12.3l2.6 2.6 4.8-5.4"/>',
  check: '<path d="M20 6.5L9.2 17.3 4 12.1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.8h.01"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.8-.9 1.4v.3M12 17.2h.01"/>',
  lock: '<rect x="3.5" y="10.5" width="17" height="11" rx="2.5"/><path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5"/>',
  key: '<circle cx="7.5" cy="15.5" r="3.8"/><path d="M10.3 12.7L20 3M16.6 6.4l2.8 2.8M13.4 9.6l2.4 2.4"/>',
  eye: '<path d="M1.8 12S5.5 5.5 12 5.5 22.2 12 22.2 12 18.5 18.5 12 18.5 1.8 12 1.8 12z"/><circle cx="12" cy="12" r="3.2"/>',
  eyeOff: '<path d="M9.9 5.7A9.7 9.7 0 0 1 12 5.5c6.5 0 10.2 6.5 10.2 6.5a17.6 17.6 0 0 1-3 3.8M6.4 7.4A17.4 17.4 0 0 0 1.8 12S5.5 18.5 12 18.5a9.9 9.9 0 0 0 4.3-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"/>',
  logout: '<path d="M9.5 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4.5"/><path d="M16 16.5l5-4.5-5-4.5M21 12H9"/>',
  download: '<path d="M21 15.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3.5"/><path d="M7.5 10.5L12 15l4.5-4.5M12 15V3"/>',
  upload: '<path d="M21 15.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3.5"/><path d="M7.5 7.5L12 3l4.5 4.5M12 3v12"/>',
  trash: '<path d="M3.5 6h17M9 6V4.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4.5V6"/><path d="M18.5 6l-.9 13.6a2 2 0 0 1-2 1.9H8.4a2 2 0 0 1-2-1.9L5.5 6"/><path d="M10 10.5v6M14 10.5v6"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2"/>',
  dumbbell: '<path d="M3 9v6M6.5 6.5v11M17.5 6.5v11M21 9v6M6.5 12h11"/>',
  scale: '<path d="M12 3.5v17"/><path d="M4 8h16"/><path d="M6.5 8 4 14.5a4.5 4.5 0 0 0 5 0zM17.5 8 15 14.5a4.5 4.5 0 0 0 5 0z"/>',
  calculator: '<rect x="4.5" y="2.5" width="15" height="19" rx="2.5"/><path d="M8 6.5h8M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01"/>',
  trending: '<path d="M22 6.5l-8 8-4-4-6.5 6.5"/><path d="M16 6.5h6v6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6.8V12l3.4 2"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  chevronLeft: '<path d="M14.5 18.5 7.5 12l7-6.5"/>',
  chevronRight: '<path d="M9.5 18.5 16.5 12l-7-6.5"/>',
  chevronDown: '<path d="M6 9.5l6 6 6-6"/>',
  arrowRight: '<path d="M4 12h15M13.5 6.5 20 12l-6.5 5.5"/>',
  arrowLeft: '<path d="M20 12H5M10.5 6.5 4 12l6.5 5.5"/>',
  refresh: '<path d="M20.5 4.5V9H16"/><path d="M3.7 14.5A8.5 8.5 0 0 0 19.6 9.6M20.5 9a8.5 8.5 0 0 0-15.9-1.3L3.5 10"/><path d="M3.5 19.5V15H8"/>',
  wifiOff: '<path d="M2 3l19 19"/><path d="M5 12.5a11 11 0 0 1 4-2.4M2 8.8A16 16 0 0 1 7 6M22 8.8a16 16 0 0 0-9.5-3.2"/><path d="M8.5 16a5.5 5.5 0 0 1 6.4-1"/><path d="M12 20h.01"/>',
  bot: '<rect x="4" y="7.5" width="16" height="12" rx="3.5"/><path d="M12 3.5v4M9 12.5h.01M15 12.5h.01M9.5 16h5"/>',
  shield: '<path d="M12 21.5s7.5-3.7 7.5-9.5V5.4L12 2.5 4.5 5.4V12c0 5.8 7.5 9.5 7.5 9.5z"/>',
  file: '<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 2.5V8h5.5"/><path d="M8.5 13h7M8.5 16.5h5"/>',
  flame: '<path d="M12 2.5c.6 3 3.4 4.2 3.4 7.7a3.4 3.4 0 0 1-6.8 0c0-1.2.5-2.1 1.2-2.9 0 1 .6 1.8 1.6 1.8S13 6.7 12 2.5z"/><path d="M12 21.5a6.6 6.6 0 0 0 6.6-6.6c0-3-1.7-5-3.4-7.4"/>',
  zap: '<path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12l1-8z"/>',
  leaf: '<path d="M4 20c0-9 6-15 16-15 0 10-5.5 15-11 15-2.4 0-5-.6-5-.6z"/><path d="M4 20c3-5 7-8 11-9.5"/>',
  wheat: '<path d="M12 21V9"/><path d="M12 12c-2.2 0-3.5-1.3-3.5-3.5C10.7 8.5 12 9.8 12 12zM12 12c2.2 0 3.5-1.3 3.5-3.5C13.3 8.5 12 9.8 12 12z"/><path d="M12 7c-2.2 0-3.5-1.3-3.5-3.5C10.7 3.5 12 4.8 12 7zM12 7c2.2 0 3.5-1.3 3.5-3.5C13.3 3.5 12 4.8 12 7z"/><path d="M12 17c-2.2 0-3.5-1.3-3.5-3.5C10.7 13.5 12 14.8 12 17zM12 17c2.2 0 3.5-1.3 3.5-3.5C13.3 13.5 12 14.8 12 17z"/>',
  utensils: '<path d="M6 2.5v6a2.2 2.2 0 0 0 2.2 2.2h.1V21.5"/><path d="M4 2.5v4.2M8.3 2.5v4.2"/><path d="M17.8 2.5c-1.6 1.7-2.3 3.8-2.3 6.1 0 2 .9 3.1 2.3 3.1v9.8"/>',
  sunrise: '<path d="M12 2.5v3.2M4.6 6.6l1.5 1.5M19.4 6.6l-1.5 1.5"/><path d="M7 13.5a5 5 0 0 1 10 0"/><path d="M2.5 19.5h19M6.5 16.5l-1.5 1.5M17.5 16.5l1.5 1.5"/>',
  apple: '<path d="M12 7.4c-1.5-1.8-4-2.2-5.6-.9C4.2 8.2 4.4 12 6 15c1.3 2.4 2.9 4 4.3 4 .7 0 1-.3 1.7-.3s1 .3 1.7.3c1.4 0 3-1.6 4.3-4 1.6-3 1.8-6.8-.4-8.5-1.6-1.3-4.1-.9-5.6.9z"/><path d="M12 7.4c0-1.9 1.3-3.4 3.4-3.9"/>',
  smartphone: '<rect x="6" y="2.5" width="12" height="19" rx="2.8"/><path d="M11 18.5h2"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4l-8.5 8.5"/><path d="M18 14v4.5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2H10"/>',
  more: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
  list: '<path d="M8.5 6h12M8.5 12h12M8.5 18h12M3.6 6h.01M3.6 12h.01M3.6 18h.01"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17.5H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
  note: '<path d="M20 12.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7"/><path d="M17.5 2.6l3.9 3.9L14 14H10.1v-3.9z"/>',
  heart: '<path d="M12 20.3l-1.3-1.2C5.7 14.6 3 12.1 3 8.9 3 6.4 5 4.4 7.5 4.4c1.5 0 2.9.7 3.7 1.8l.8 1 .8-1c.8-1.1 2.2-1.8 3.7-1.8C19 4.4 21 6.4 21 8.9c0 3.2-2.7 5.7-7.7 10.2z"/>',
  flag: '<path d="M4.5 21.5V4"/><path d="M4.5 4.5h11l-1.6 4 1.6 4h-11"/>',
  cup: '<path d="M4 7h13v7a5.5 5.5 0 0 1-11 0z"/><path d="M17 8.5h2.2a2.3 2.3 0 0 1 0 4.6H17"/><path d="M3 21.5h15"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.6M9.5 2.5h5"/>'
};

export function icon(name, cls = '') {
  const body = P[name];
  if (!body) return '';
  return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

export const ICONS = P;

/* Iconos de tipo de comida (antes emojis) */
export const MEAL_ICON = {
  desayuno: 'sunrise',
  almuerzo: 'utensils',
  cena: 'moon',
  snack: 'apple'
};
