/* Utilidades generales: fechas, formato, DOM, toasts, modal, archivos. */

export const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
export const MESES_CORTO = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
export const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
export const DIAS_CORTO = ['dom','lun','mar','mié','jue','vie','sáb'];
export const TIPOS_COMIDA = ['desayuno', 'almuerzo', 'cena', 'snack'];
import { icon } from './icons.js';

export const ICONO_TIPO = { desayuno: 'sunrise', almuerzo: 'utensils', cena: 'moon', snack: 'apple' };

/* ============ Sugerencia de comida: hora + lo que ya comiste hoy ============ */
/**
 * Sugiere a qué comida pertenece lo que vas a registrar.
 *  h      : hora en decimal (13.5 = 1:30 p. m.)
 *  hechos : tipos ya registrados ese día (['desayuno', ...])
 *  tam    : 'plato' (comida completa), 'pequeno' (cosita) o '' (aún no sabemos)
 *
 * Reglas:
 *  - Manda la hora: a la 1 p. m. es almuerzo aunque no hayas desayunado.
 *  - Nunca repite una comida ya hecha: si ya desayunaste y aún es franja de
 *    desayuno, lo que sigue es un snack (merienda), no otro desayuno.
 *  - Los snacks son cosas pequeñas: café/fruta no es plato (salvo el desayuno:
 *    un yogur a las 8 sí es desayuno).
 *  - 16:00–18:59 es merienda: si ya almorzaste es snack; si no, aún manda el almuerzo.
 *  - La cena manda desde las 19:00 en adelante (a las 5 p. m. NO es cena).
 */
export function elegirTipo(h, hechos, tam = '') {
  const tiene = t => Array.isArray(hechos) && hechos.includes(t);
  if (h >= 19) return (!tiene('cena') && tam !== 'pequeno') ? 'cena' : 'snack';
  const ventana = h < 11 ? 'desayuno' : h < 16 ? 'almuerzo' : 'merienda';
  if (ventana === 'merienda') {
    if (!tiene('almuerzo') && tam !== 'pequeno') return 'almuerzo';
    return 'snack';
  }
  if (tiene(ventana)) return 'snack';
  if (tam === 'pequeno' && ventana !== 'desayuno') return 'snack';
  return ventana;
}

/** Comidas principales cuya hora ya pasó y todavía no registraste (para avisar). */
export function faltanPorHora(h, hechos) {
  const tiene = t => Array.isArray(hechos) && hechos.includes(t);
  const f = [];
  if (h >= 11 && !tiene('desayuno')) f.push('desayuno');
  if (h >= 16 && !tiene('almuerzo')) f.push('almuerzo');
  if (h >= 19 && !tiene('cena')) f.push('cena');
  return f;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function num(v, dec = 0) {
  const n = Number(v);
  if (!isFinite(n)) return '0';
  return n.toLocaleString('es-PE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
export function round(v, dec = 0) {
  const f = Math.pow(10, dec);
  return Math.round((Number(v) || 0) * f) / f;
}
export function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

export function toISODate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function todayISO() { return toISODate(new Date()); }
export function fromISODate(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function addDays(iso, n) {
  const d = fromISODate(iso); d.setDate(d.getDate() + n); return toISODate(d);
}
export function diffDays(a, b) {
  return Math.round((fromISODate(a) - fromISODate(b)) / 86400000);
}
export function startOfWeek(iso) {
  const d = fromISODate(iso);
  const dow = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}
export function startOfMonth(iso) {
  const d = fromISODate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}
export function endOfMonth(iso) {
  const d = fromISODate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
export function fmtLongDate(iso) {
  const d = fromISODate(iso);
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}
export function fmtShortDate(iso) {
  const d = fromISODate(iso);
  return `${DIAS_CORTO[d.getDay()]} ${d.getDate()} ${MESES_CORTO[d.getMonth()]}`;
}
export function dayLabel(iso) {
  if (iso === todayISO()) return 'Hoy';
  if (iso === addDays(todayISO(), -1)) return 'Ayer';
  if (iso === addDays(todayISO(), 1)) return 'Mañana';
  return fmtShortDate(iso);
}
export function relDayTitle(iso) {
  const t = todayISO();
  if (iso === t) return 'Hoy';
  if (iso === addDays(t, -1)) return 'Ayer';
  if (iso === addDays(t, 1)) return 'Mañana';
  return fmtLongDate(iso);
}

/* ---------- Toast ---------- */
let toastTimer = null;
export function toast(msg, type = '') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  const ico = type === 'ok' ? icon('checkCircle') : (type === 'err' || type === 'warn') ? icon('alert') : icon('info');
  el.innerHTML = `<span>${ico}</span><span>${esc(msg)}</span>`;
  root.appendChild(el);
  clearTimeout(toastTimer);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, type === 'err' ? 5200 : 3200);
  while (root.children.length > 3) root.firstChild.remove();
}

/* ---------- Modal (bottom sheet) ---------- */
export function openSheet(html, opts = {}) {
  const root = document.getElementById('modal-root');
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  root.appendChild(back);
  const sheet = back.querySelector('.sheet');
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', e => { if (e.target === back && !opts.sticky) close(); });
  return { close, sheet, root: back };
}

export function confirmSheet({ title, msg, okText = 'Confirmar', danger = false }) {
  return new Promise(resolve => {
    const s = openSheet(`
      <h2>${esc(title)}</h2>
      <p class="muted small">${msg}</p>
      <div class="col" style="margin-top:14px">
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-block" data-ok>${esc(okText)}</button>
        <button class="btn btn-ghost btn-block" data-no>Cancelar</button>
      </div>`);
    s.root.querySelector('[data-ok]').onclick = () => { s.close(); resolve(true); };
    s.root.querySelector('[data-no]').onclick = () => { s.close(); resolve(false); };
  });
}

/* ---------- DOM ---------- */
export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

/* ---------- Archivos ---------- */
export function downloadFile(filename, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export function pickFile(accept) {
  return new Promise(resolve => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept;
    i.onchange = () => resolve(i.files && i.files[0] ? i.files[0] : null);
    document.body.appendChild(i); i.click(); i.remove();
  });
}
export function readFileText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result); r.onerror = rej;
    r.readAsText(file);
  });
}

/* ---------- Imágenes ---------- */
export function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result); r.onerror = rej;
    r.readAsDataURL(file);
  });
}
export function resizeImage(dataUrl, maxW = 1280, quality = 0.82) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: hgt } = img;
      if (w > maxW) { hgt = Math.round(hgt * maxW / w); w = maxW; }
      const c = document.createElement('canvas');
      c.width = w; c.height = hgt;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, w, hgt);
      let out = c.toDataURL('image/jpeg', quality);
      if (out.length > 900000 && quality > 0.5) out = c.toDataURL('image/jpeg', 0.6);
      resolve(out);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
export function b64FromDataURL(d) {
  const i = d.indexOf(',');
  return d.slice(i + 1);
}

/* ---------- CSV ---------- */
export function csvCell(v) {
  const s = String(v ?? '');
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCSV(rows) {
  return '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}

/* ---------- Var ---------- */
export function uid() { return Date.now() + Math.floor(Math.random() * 100000); }
export function debounce(fn, ms = 250) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
