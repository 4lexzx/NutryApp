/* Gráficos ligeros en canvas (sin librerías externas). */

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name);
  return (v && v.trim()) || fallback;
}

function setup(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(rect.width, 240);
  const hgt = Math.max(rect.height, 160);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(hgt * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, hgt);
  return { ctx, w, h: hgt };
}

function niceMax(v) {
  if (v <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / pow;
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];
  const step = steps.find(s => f <= s + 1e-9) || 10;
  return step * pow;
}

/** Gráfico de líneas con puntos (ej. evolución de peso). */
export function lineChart(canvas, { values, labels = [], color = '#22c55e', unit = '', goal = null }) {
  const { ctx, w, h } = setup(canvas);
  const txt = cssVar('--txt-3', '#6f81a1');
  const line = cssVar('--line', '#26344f');

  const pad = { l: 40, r: 12, t: 12, b: 24 };
  const pts = values.filter(v => isFinite(v));
  if (pts.length < 1) {
    ctx.fillStyle = txt; ctx.font = '13px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('Sin datos todavía', w / 2, h / 2);
    return;
  }

  let min = Math.min(...pts), max = Math.max(...pts);
  if (goal != null && isFinite(goal)) { min = Math.min(min, goal); max = Math.max(max, goal); }
  const span = (max - min) || 1;
  min = min - span * 0.15; max = max + span * 0.15;
  if (min < 0 && Math.min(...pts) >= 0) min = 0;

  const X = i => pad.l + (values.length === 1 ? (w - pad.l - pad.r) / 2 : (i * (w - pad.l - pad.r)) / (values.length - 1));
  const Y = v => pad.t + (max - v) * (h - pad.t - pad.b) / (max - min);

  // rejilla + eje Y
  ctx.strokeStyle = line; ctx.fillStyle = txt; ctx.lineWidth = 1;
  ctx.font = '11px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let i = 0; i <= 3; i++) {
    const v = min + (max - min) * i / 3;
    const y = Y(v);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.fillText((Math.round(v * 10) / 10) + unit, pad.l - 6, y);
  }

  // línea de meta
  if (goal != null && isFinite(goal)) {
    ctx.save();
    ctx.strokeStyle = cssVar('--warn', '#f59e0b'); ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pad.l, Y(goal)); ctx.lineTo(w - pad.r, Y(goal)); ctx.stroke();
    ctx.restore();
  }

  // área + línea
  if (values.length > 1) {
    const grad = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
    grad.addColorStop(0, hexA(color, .30)); grad.addColorStop(1, hexA(color, 0));
    ctx.beginPath();
    values.forEach((v, i) => { if (!isFinite(v)) return; i === 0 ? ctx.moveTo(X(i), Y(v)) : ctx.lineTo(X(i), Y(v)); });
    const lastIdx = values.length - 1;
    ctx.lineTo(X(lastIdx), h - pad.b); ctx.lineTo(X(0), h - pad.b); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    values.forEach((v, i) => { if (!isFinite(v)) return; i === 0 ? ctx.moveTo(X(i), Y(v)) : ctx.lineTo(X(i), Y(v)); });
    ctx.stroke();
  }

  // puntos + etiquetas X
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  values.forEach((v, i) => {
    if (!isFinite(v)) return;
    ctx.beginPath(); ctx.fillStyle = color; ctx.arc(X(i), Y(v), 3.4, 0, Math.PI * 2); ctx.fill();
    if (labels[i] && (values.length <= 8 || i % Math.ceil(values.length / 6) === 0 || i === values.length - 1)) {
      ctx.fillStyle = txt; ctx.fillText(labels[i], X(i), h - pad.b + 7);
    }
  });
}

/** Barras con línea de meta y promedio. */
export function barChart(canvas, { values, labels = [], color = '#38bdf8', unit = '', goal = null, avg = null }) {
  const { ctx, w, h } = setup(canvas);
  const txt = cssVar('--txt-3', '#6f81a1');
  const line = cssVar('--line', '#26344f');
  const pad = { l: 44, r: 10, t: 12, b: 24 };

  const pts = values.map(v => (isFinite(v) ? v : 0));
  if (!pts.length || pts.every(v => v === 0)) {
    ctx.fillStyle = txt; ctx.font = '13px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('Sin datos en este período', w / 2, h / 2);
    return;
  }
  const max = niceMax(Math.max(...pts, goal || 0, 1) * 1.05);

  const n = values.length;
  const slot = (w - pad.l - pad.r) / n;
  const bw = Math.max(2, Math.min(slot * 0.68, 34));
  const Y = v => pad.t + (1 - v / max) * (h - pad.t - pad.b);

  ctx.strokeStyle = line; ctx.fillStyle = txt; ctx.lineWidth = 1;
  ctx.font = '10.5px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let i = 0; i <= 3; i++) {
    const v = max * i / 3, y = Y(v);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.fillText(Math.round(v) + unit, pad.l - 5, y);
  }

  pts.forEach((v, i) => {
    const x = pad.l + slot * i + (slot - bw) / 2;
    const y = Y(v);
    const grad = ctx.createLinearGradient(0, y, 0, Y(0));
    grad.addColorStop(0, hexA(color, .95)); grad.addColorStop(1, hexA(color, .45));
    ctx.fillStyle = v > 0 ? grad : hexA(color, .18);
    const bh = Math.max(v > 0 ? 2 : 1, Y(0) - y);
    roundRect(ctx, x, y, bw, bh, Math.min(4, bw / 2));
    ctx.fill();
  });

  if (goal != null && isFinite(goal)) {
    ctx.save(); ctx.strokeStyle = cssVar('--warn', '#f59e0b'); ctx.setLineDash([6, 4]); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(pad.l, Y(goal)); ctx.lineTo(w - pad.r, Y(goal)); ctx.stroke(); ctx.restore();
  }
  if (avg != null && isFinite(avg)) {
    ctx.save(); ctx.strokeStyle = cssVar('--brand', '#22c55e'); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(pad.l, Y(avg)); ctx.lineTo(w - pad.r, Y(avg)); ctx.stroke(); ctx.restore();
  }

  ctx.fillStyle = txt; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const every = Math.max(1, Math.ceil(n / 7));
  labels.forEach((lb, i) => {
    if (i % every === 0 || i === n - 1) ctx.fillText(lb, pad.l + slot * i + slot / 2, h - pad.b + 7);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, 0);
  ctx.arcTo(x, y + h, x, y, 0);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function hexA(hex, a) {
  const c = hex.replace('#', '');
  const full = c.length === 3 ? c.split('').map(x => x + x).join('') : c;
  const r = parseInt(full.slice(0, 2), 16), g = parseInt(full.slice(2, 4), 16), b = parseInt(full.slice(4, 6), 16);
  if (!isFinite(r)) return `rgba(34,197,94,${a})`;
  return `rgba(${r},${g},${b},${a})`;
}
