/* Sonido de botón bonito (estilo Apple): reproduce sfx/click.wav, un "tock"
   corto y limpio incluido en la app (sin internet). Solo suena en los botones
   que hacen algo importante (analizar, guardar, confirmar…). Se apaga en Ajustes. */

let activos = true;
let ctx = null;
let buf = null;
let cargando = null;
let bufCheck = null;
let cargandoCheck = null;
let bufLic = null;
let cargandoLic = null;
let bufFuego = null;
let cargandoFuego = null;

export function setSonidos(v) { activos = v !== false; if (activos) { cargarSonido(); cargarCheck(); cargarLicuar(); cargarFuego(); } }
export function sonidosActivos() { return activos; }

function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Descarga y decodifica el clic una sola vez (queda listo antes del primer toque). */
function cargarSonido() {
  if (buf) return Promise.resolve(buf);
  if (!cargando) {
    cargando = fetch('./sfx/click.wav')
      .then(r => (r && r.ok ? r.arrayBuffer() : Promise.reject(new Error('sin archivo'))))
      .then(ab => new Promise((res, rej) => {
        const c = audioCtx();
        if (!c) rej(new Error('sin audio'));
        else c.decodeAudioData(ab, res, rej);
      }))
      .then(b => { buf = b; return b; })
      .catch(() => null);
  }
  return cargando;
}

/** Descarga y decodifica el "check" (confirmación al agregar ingredientes). */
function cargarCheck() {
  if (bufCheck) return Promise.resolve(bufCheck);
  if (!cargandoCheck) {
    cargandoCheck = fetch('./sfx/check.wav')
      .then(r => (r && r.ok ? r.arrayBuffer() : Promise.reject(new Error('sin archivo'))))
      .then(ab => new Promise((res, rej) => {
        const c = audioCtx();
        if (!c) rej(new Error('sin audio'));
        else c.decodeAudioData(ab, res, rej);
      }))
      .then(b => { bufCheck = b; return b; })
      .catch(() => null);
  }
  return cargandoCheck;
}

/** Descarga y decodifica el ruido de la licuadora (~1 s). */
function cargarLicuar() {
  if (bufLic) return Promise.resolve(bufLic);
  if (!cargandoLic) {
    cargandoLic = fetch('./sfx/licuar.wav')
      .then(r => (r && r.ok ? r.arrayBuffer() : Promise.reject(new Error('sin archivo'))))
      .then(ab => new Promise((res, rej) => {
        const c = audioCtx();
        if (!c) rej(new Error('sin audio'));
        else c.decodeAudioData(ab, res, rej);
      }))
      .then(b => { bufLic = b; return b; })
      .catch(() => null);
  }
  return cargandoLic;
}

/** Descarga y decodifica el chisporroteo de fuego (~1 s) — al encender la racha. */
function cargarFuego() {
  if (bufFuego) return Promise.resolve(bufFuego);
  if (!cargandoFuego) {
    cargandoFuego = fetch('./sfx/fuego.wav')
      .then(r => (r && r.ok ? r.arrayBuffer() : Promise.reject(new Error('sin archivo'))))
      .then(ab => new Promise((res, rej) => {
        const c = audioCtx();
        if (!c) rej(new Error('sin audio'));
        else c.decodeAudioData(ab, res, rej);
      }))
      .then(b => { bufFuego = b; return b; })
      .catch(() => null);
  }
  return cargandoFuego;
}

function tocar(buffer, gain) {
  try {
    const c = audioCtx();
    if (!c || !buffer) return;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(g); g.connect(c.destination);
    src.start();
  } catch (e) { /* silencio: el sonido jamás debe romper la app */ }
}

/** Suena el "check" (dos notas ascendentes) — usado al agregar al batido. */
export function check() {
  if (!activos) return;
  try {
    const c = audioCtx();
    if (!c || !bufCheck) { cargarCheck(); return; }
    tocar(bufCheck, 0.65);
  } catch (e) { /* silencio */ }
}

/** Suena la licuadora (~1 s) — al pulsar ¡Licuar!. */
export function licuar() {
  if (!activos) return;
  try {
    const c = audioCtx();
    if (!c || !bufLic) { cargarLicuar(); return; }
    tocar(bufLic, 0.9);
  } catch (e) { /* silencio */ }
}

/** Suena el fuego (~1 s) — cuando la racha de gimnasio se enciende o crece. */
export function fuego() {
  if (!activos) return;
  try {
    const c = audioCtx();
    if (!c || !bufFuego) { cargarFuego(); return; }
    tocar(bufFuego, 0.9);
  } catch (e) { /* silencio */ }
}

/** Suena el clic (si está encendido y el archivo ya cargó). */
export function clic() {
  if (!activos) return;
  try {
    const c = audioCtx();
    if (!c || !buf) { cargarSonido(); return; }
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = 0.6;
    src.connect(g); g.connect(c.destination);
    src.start();
  } catch (e) { /* silencio: el sonido jamás debe romper la app */ }
}

/* Solo los botones que HACEN algo: analizar, guardar, eliminar, confirmar,
   respaldos, cerrar sesión… Los de navegación, filtros y pestañas no suenan. */
const IMPORTANTE = [
  '#t-go', '#f-go', '#ai-retry',
  '#ed-save', '#ed-re', '#ed-base', '#ed-fav', '#ed-del',
  '#pk-ok', '#ci-ok', '#gy-save',
  '#s-key-save', '#s-key-test', '#s-water-save',
  '#s-install', '#s-backup', '#s-restore', '#s-csv1', '#s-csv2', '#s-csvall', '#s-clear',
  '#p-save', '#m-save', '#w-add', '#we-ok', '#we-del',
  '#au-go', '#rg-go',
  '[data-ok]', '[data-ac]', '[data-ac-skip]'
].join(', ');

/** Escucha los toques: el clic suena solo si se PRESIONA un botón importante y
    se levanta el dedo encima sin haberlo deslizado (los swipes no suenan). */
export function initSonidos() {
  cargarSonido();
  cargarCheck();
  cargarLicuar();
  cargarFuego();
  let presion = null; // { el, x, y, id } del último botón importante pulsado
  document.addEventListener('pointerdown', e => {
    presion = null;
    if (!activos || !e.target || !e.target.closest) return;
    const el = e.target.closest(IMPORTANTE);
    if (!el || el.disabled) return;
    presion = { el, x: e.clientX, y: e.clientY, id: e.pointerId };
  }, { capture: true, passive: true });
  document.addEventListener('pointerup', e => {
    const p = presion; presion = null;
    if (!p || !activos || e.pointerId !== p.id) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12) return; // deslizar ≠ tocar
    const el2 = e.target && e.target.closest ? e.target.closest(IMPORTANTE) : null;
    if (el2 !== p.el) return; // soltó en otro lado
    clic();
  }, { capture: true, passive: true });
  document.addEventListener('pointercancel', () => { presion = null; }, { capture: true, passive: true });
  document.addEventListener('pointerout', e => {
    if (presion && e.target === presion.el && e.relatedTarget === null) presion = null;
  }, { capture: true, passive: true });
}
