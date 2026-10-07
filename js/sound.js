/* Sonido de botón suave (estilo Apple): un "tick" corto, nítido y bajito,
   sintetizado en el momento (sin archivos de audio). Solo suena en los botones
   que hacen algo importante (analizar, guardar, confirmar…). Se apaga en Ajustes. */

let activos = true;
let ctx = null;

export function setSonidos(v) { activos = v !== false; }
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

/** Tick corto y limpio: ráfaga de 30 ms filtrada (~3.6 kHz) + tono suave de 1.4 kHz.
    Sin barrido grave: eso era lo que sonaba "barato". */
export function clic() {
  try {
    const c = audioCtx();
    if (!c) return;
    const t = c.currentTime;

    // 1) el "clic" nítido: ruido muy corto con envolvente rápida
    const dur = 0.03;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3600;
    bp.Q.value = 0.8;
    const g = c.createGain();
    g.gain.value = 0.05;
    src.connect(bp); bp.connect(g); g.connect(c.destination);
    src.start(t);

    // 2) el "cuerpo": tonito limpio que da calor sin sonar a juguete
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 1400;
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0.03, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(g2); g2.connect(c.destination);
    osc.start(t); osc.stop(t + 0.06);
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
  document.addEventListener('pointerdown', e => {
    if (!activos || !e.target || !e.target.closest) return;
    const el = e.target.closest(IMPORTANTE);
    if (!el || el.disabled) return;
    clic();
  }, { capture: true, passive: true });
}
