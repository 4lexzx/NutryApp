/* Sonido de botón bonito (estilo Apple): reproduce sfx/click.wav, un "tock"
   corto y limpio incluido en la app (sin internet). Solo suena en los botones
   que hacen algo importante (analizar, guardar, confirmar…). Se apaga en Ajustes. */

let activos = true;
let ctx = null;
let buf = null;
let cargando = null;

export function setSonidos(v) { activos = v !== false; if (activos) cargarSonido(); }
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

/** Suena el clic (si está encendido y el archivo ya cargó). */
export function clic() {
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
  '#pk-ok', '#ci-ok',
  '#s-key-save', '#s-key-test', '#s-water-save',
  '#s-install', '#s-backup', '#s-restore', '#s-csv1', '#s-csv2', '#s-csvall', '#s-clear',
  '#p-save', '#m-save', '#w-add', '#we-ok', '#we-del',
  '#au-go', '#rg-go',
  '[data-ok]', '[data-ac]', '[data-ac-skip]'
].join(', ');

/** Escucha los toques y suena solo en los botones importantes (si está encendido). */
export function initSonidos() {
  cargarSonido();
  document.addEventListener('pointerdown', e => {
    if (!activos || !e.target || !e.target.closest) return;
    const el = e.target.closest(IMPORTANTE);
    if (!el || el.disabled) return;
    clic();
  }, { capture: true, passive: true });
}
