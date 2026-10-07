/* Sonidos táctiles suaves (estilo Apple): un clic corto y bajito, sintetizado
   en el momento (sin archivos de audio). Se pueden apagar en Ajustes. */

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

/** Clic elegante: ráfaga de ruido filtrada (~2.3 kHz) + golpecito grave muy leve. */
export function clic() {
  try {
    const c = audioCtx();
    if (!c) return;
    const t = c.currentTime;

    // ráfaga suave (el "clic" nítido)
    const dur = 0.05;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2300;
    bp.Q.value = 0.9;
    const g = c.createGain();
    g.gain.value = 0.045;
    src.connect(bp); bp.connect(g); g.connect(c.destination);
    src.start(t);

    // golpecito grave muy leve (el "cuerpo" del botón)
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(330, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.05);
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0.03, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(g2); g2.connect(c.destination);
    osc.start(t); osc.stop(t + 0.07);
  } catch (e) { /* silencio: el sonido jamás debe romper la app */ }
}

/** Suena en cada toque sobre botones/chips de la app (si está encendido). */
export function initSonidos() {
  document.addEventListener('pointerdown', e => {
    if (!activos || !e.target || !e.target.closest) return;
    const el = e.target.closest('button, .chip, .list-item, .glass, [data-tb], [data-nav]');
    if (!el || el.disabled) return;
    clic();
  }, { capture: true, passive: true });
}
