/* Recordatorios de comidas: piden permiso y avisan a la hora elegida mientras
   la app está viva (abierta o en segundo plano). Funciona en Android e iPhone
   (PWA instalada en la pantalla de inicio, iOS 16.4+). Sin servidores: todo
   se programa y dispara desde el propio celular. */

import { getSettings, saveSettings, getProfile, DB } from './db.js';
import { todayISO, toast, num } from './util.js';
import { calcTargets } from './nutrition.js';

/** Horarios de comida disponibles (se pueden combinar a gusto). */
export const RECORDS_DEF = [
  { id: 'desayuno', h: '08:00', l: 'Desayuno' },
  { id: 'almuerzo', h: '13:00', l: 'Almuerzo' },
  { id: 'cena', h: '20:00', l: 'Cena' }
];

const VENTANA_MIN = 15;   // margen: si la app se abrió a los pocos minutos, igual avisa

/** Hora elegida para un recordatorio (la del ajuste, o la del horario por defecto). */
export function horaDe(s, id) {
  const def = RECORDS_DEF.find(r => r.id === id);
  const h = s && s.rem && s.rem.hours && s.rem.hours[id];
  return /^\d{2}:\d{2}$/.test(h || '') ? h : (def ? def.h : '08:00');
}

/** ¿Está la hora actual dentro de la ventana [horario, horario + margen]? */
export function enVentana(hhmm, horario, ventanaMin = VENTANA_MIN) {
  const min = t => {
    const p = String(t || '').split(':');
    const h = Number(p[0]), m = Number(p[1]);
    return isFinite(h) && isFinite(m) ? h * 60 + m : NaN;
  };
  const a = min(hhmm), b = min(horario);
  if (!isFinite(a) || !isFinite(b)) return false;
  const d = a - b;
  return d >= 0 && d <= ventanaMin;
}

/** Muestra la notificación (Service Worker si es posible; si no, en página). */
export async function notificar(titulo, cuerpo) {
  const opts = {
    body: cuerpo,
    icon: './icons/icon-512-v2.png',    // icono grande a color (el logo completo)
    badge: './icons/notif-badge.png',   // silueta blanca: en la barra se ve el logo, no un cuadrado
    tag: 'nutri-rem',
    renotify: true
  };
  try {
    const reg = navigator.serviceWorker ? await navigator.serviceWorker.getRegistration() : null;
    if (reg && reg.showNotification) await reg.showNotification(titulo, opts);
    else if ('Notification' in window && Notification.permission === 'granted') new Notification(titulo, opts);
    else throw new Error('sin notificaciones');
    return true;
  } catch (e) {
    toast(cuerpo, 'ok');       // respaldo visible dentro de la app
    return false;
  }
}

/** Pide permiso de notificaciones (null si el navegador no lo soporta). */
export async function pedirPermiso() {
  if (!('Notification' in window)) return null;
  try {
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    const r = await Notification.requestPermission();
    return r;
  } catch (e) { return null; }
}

const yaAviso = new Set();   // 'id:fecha' ya avisado en esta sesión

/** Texto del aviso con lo que llevas hoy de kcal y proteína (vs tus metas). */
export async function cuerpoMacros() {
  try {
    const p = await getProfile();
    const t = calcTargets(p);
    const meta = (p && p.targets && p.targets.kcal) ? Number(p.targets.kcal) : t.kcal;
    const meals = await DB.all('meals');
    let k = 0, pr = 0;
    for (const m of meals) {
      if (m.date !== todayISO()) continue;
      const tt = m.totals || {};
      k += Number(tt.kcal) || 0;
      pr += Number(tt.protein) || 0;
    }
    const falta = Math.max(0, Math.round(meta - k));
    const base = `Hoy llevas ${num(k)} de ${num(meta)} kcal y ${num(pr)} de ${num(t.protein)} g de proteína.`;
    return falta > 0 ? `${base} Te quedan ${num(falta)} kcal.` : `${base} ¡Metas cumplidas!`;
  } catch (e) {
    return 'Registra lo que comiste para llevar el conteo del día.';
  }
}

async function tick() {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const s = await getSettings();
    const rem = s.rem || {};
    if (!rem.on) return;
    const ids = Array.isArray(rem.ids) ? rem.ids : [];
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const fecha = todayISO();
    for (const r of RECORDS_DEF) {
      if (ids.indexOf(r.id) < 0) continue;
      if (!enVentana(hhmm, horaDe(s, r.id))) continue;
      const key = r.id + ':' + fecha;
      if (yaAviso.has(key)) continue;
      yaAviso.add(key);
      const cuerpo = await cuerpoMacros();
      notificar('NutriGym', `¿Ya anotaste ${r.l.toLowerCase()}? ${cuerpo}`);
    }
  } catch (e) { /* un recordatorio jamás debe romper la app */ }
}

let timer = null;

/** Arranca el programador (idempotente; se llama al iniciar la app). */
export function initRecordatorios() {
  if (timer) return;
  tick();
  timer = setInterval(tick, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
}

/** Guarda la configuración de recordatorios desde Ajustes. */
export async function guardarRecordatorio(id, activo) {
  const s = await getSettings();
  const rem = s.rem && typeof s.rem === 'object' ? Object.assign({}, s.rem) : {};
  const ids = Array.isArray(rem.ids) ? rem.ids.slice() : RECORDS_DEF.map(r => r.id);
  const i = ids.indexOf(id);
  if (activo && i < 0) ids.push(id);
  if (!activo && i >= 0) ids.splice(i, 1);
  rem.ids = ids;
  rem.on = rem.on === true;      // los chips no encienden solos: eso es del botón
  await saveSettings({ rem });
  return rem;
}

/** Guarda la hora elegida para un recordatorio (formato "HH:MM"). */
export async function guardarHoraRecordatorio(id, hhmm) {
  if (!/^\d{2}:\d{2}$/.test(hhmm || '')) return null;
  const s = await getSettings();
  const rem = s.rem && typeof s.rem === 'object' ? Object.assign({}, s.rem) : {};
  const hours = rem.hours && typeof rem.hours === 'object' ? Object.assign({}, rem.hours) : {};
  hours[id] = hhmm;
  rem.hours = hours;
  rem.on = rem.on === true;
  await saveSettings({ rem });
  return rem;
}

/** Enciende/apaga los recordatorios (requiere permiso concedido). */
export async function encenderRecordatorios(on) {
  const s = await getSettings();
  const rem = s.rem && typeof s.rem === 'object' ? Object.assign({}, s.rem) : {};
  if (!Array.isArray(rem.ids)) rem.ids = RECORDS_DEF.map(r => r.id);
  rem.on = !!on;
  await saveSettings({ rem });
  return rem;
}
