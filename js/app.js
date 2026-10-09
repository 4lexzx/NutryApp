/* Punto de entrada: router, tema, instalación PWA y service worker. */

import { getSettings, DB } from './db.js';
import { toast } from './util.js';
import { initSonidos, setSonidos } from './sound.js';
import { initRecordatorios } from './notif.js';
import { seedUsers, isAuthed } from './auth.js';
import { icon } from './icons.js';
import * as today from './views/today.js';
import * as log from './views/log.js';
import * as history from './views/history.js';
import * as profile from './views/profile.js';
import * as settings from './views/settings.js';
import * as ia from './views/ia.js';
import * as login from './views/login.js';
import * as gym from './views/gym.js';
import * as batido from './views/batido.js';

const view = () => document.getElementById('view');

function parseHash() {
  let h = location.hash.replace(/^#\/?/, '');
  if (!h) return { path: [], query: {} };
  const [p, qs] = h.split('?');
  const path = p.split('/').filter(Boolean);
  const query = {};
  if (qs) qs.split('&').forEach(pair => {
    const [k, v] = pair.split('=');
    if (k) query[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });
  return { path, query };
}

const NAV_OF = { hoy: 'hoy', registrar: 'registrar', nuevo: 'registrar', editar: 'registrar', historial: 'historial', perfil: 'perfil', ajustes: 'ajustes', ia: 'ajustes', gym: 'hoy', batido: 'registrar' };

async function route() {
  const { path, query } = parseHash();
  const name = path[0] || 'hoy';
  const root = view();

  await seedUsers();
  if (!isAuthed()) {
    document.body.classList.add('locked');
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.remove('active'));
    if (root.querySelector('#auth-form')) return;
    root.innerHTML = '';
    window.scrollTo(0, 0);
    await login.render(root, () => {
      document.body.classList.remove('locked');
      if (!location.hash) location.hash = '#/hoy';
      route();
    });
    return;
  }
  document.body.classList.remove('locked');

  document.querySelectorAll('[data-nav]').forEach(a => {
    a.classList.toggle('active', a.dataset.nav === (NAV_OF[name] || 'hoy'));
  });

  root.innerHTML = `<div class="loading-block"><div class="spinner"></div><div class="small">Cargando…</div></div>`;
  window.scrollTo(0, 0);

  try {
    switch (name) {
      case 'hoy': await today.render(root, path.slice(1)); break;
      case 'registrar': await log.renderStart(root, path.slice(1), query); break;
      case 'nuevo': await log.renderNew(root, path.slice(1), query); break;
      case 'editar': await log.renderEdit(root, path.slice(1), query); break;
      case 'historial': await history.render(root, path.slice(1), query); break;
      case 'perfil': await profile.render(root, path.slice(1), query); break;
      case 'ajustes': await settings.render(root, path.slice(1), query); break;
      case 'ia': await ia.render(root, path.slice(1), query); break;
      case 'gym': await gym.render(root, path.slice(1), query); break;
      case 'batido': await batido.render(root, path.slice(1), query); break;
      default:
        location.hash = '#/hoy';
    }
  } catch (e) {
    console.error('Error de vista:', e);
    root.innerHTML = `
      <div class="card">
        <div class="card-title"><h3>Ups, algo salió mal</h3></div>
        <div class="note danger">${String(e && e.message ? e.message : e)}</div>
        <button class="btn btn-primary btn-block" id="retry" type="button">Reintentar</button>
        <a class="btn btn-ghost btn-block" href="#/hoy">Ir a Hoy</a>
      </div>`;
    const r = root.querySelector('#retry');
    if (r) r.onclick = () => route();
  }
}

/* ---------- Tema ---------- */
async function applyTheme() {
  const s = await getSettings();
  const theme = s.theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#000000' : '#f2f2f7');
  const btn = document.getElementById('btn-theme');
  if (btn) {
    btn.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
    btn.setAttribute('aria-label', theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
    btn.setAttribute('title', btn.getAttribute('aria-label'));
  }
  return theme;
}

/* ---------- Instalación (beforeinstallprompt) ---------- */
function setupInstall() {
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    window.__nutriInstall = { canInstall: true, prompt: () => e.prompt(), userChoice: e.userChoice };
    const b = document.getElementById('btn-install');
    if (b) b.classList.remove('hidden');
  });
  window.addEventListener('appinstalled', () => {
    window.__nutriInstall = null;
    const b = document.getElementById('btn-install');
    if (b) b.classList.add('hidden');
    toast('Nutri Gym instalada en tu dispositivo.', 'ok');
  });
  const b = document.getElementById('btn-install');
  if (b) b.onclick = async () => {
    const ip = window.__nutriInstall;
    if (ip && ip.prompt) {
      ip.prompt();
      await ip.userChoice;
      window.__nutriInstall = null;
      b.classList.add('hidden');
    } else {
      location.hash = '#/ajustes';
    }
  };
}

/* ---------- Conexión ---------- */
function setupNetwork() {
  const banner = document.getElementById('offline-banner');
  const upd = () => {
    const off = !navigator.onLine;
    if (banner) banner.classList.toggle('hidden', !off);
    if (!off && window.__wasOffline) toast('De nuevo en línea.', 'ok');
    window.__wasOffline = off;
  };
  window.addEventListener('online', upd);
  window.addEventListener('offline', upd);
  upd();
}

/* ---------- Service worker (modo sin conexión) ---------- */
/* Evita recargar mientras el usuario está escribiendo o con una hoja abierta. */
function enFormulario() {
  if (document.querySelector('.sheet-back, .ov-back')) return true;
  const h = location.hash || '';
  if (/^#\/(nuevo|editar|gym)/.test(h)) return true;
  if (/^#\/registrar/.test(h)) {
    const el = document.querySelector('#view input[type="text"], #view textarea, #view input[type="search"]');
    if (el && el.value && el.value.trim()) return true;
  }
  return false;
}

function setupSW() {
  if (!('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(location.protocol)) return;

  const habiaControlador = !!navigator.serviceWorker.controller;
  let primeraVez = true;
  let recargando = false;

  // ¿Hay una versión nueva esperando? Señal global para el botón de Ajustes.
  window.__nutriAct = false;
  const aplicarAct = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.waiting) reg.waiting.postMessage('skipWaiting');
      else location.reload();
    } catch (e) { location.reload(); }
  };
  window.__nutriAplicarAct = aplicarAct;

  const marcarActualizacion = () => {
    if (window.__nutriAct) return;
    window.__nutriAct = true;
    document.dispatchEvent(new CustomEvent('nutri-actualizacion'));
    if (sessionStorage.getItem('ng.updOculta') === '1') return;
    if (document.querySelector('.upd-bar')) return;
    const bar = document.createElement('div');
    bar.className = 'upd-bar';
    bar.setAttribute('role', 'status');
    bar.innerHTML = '<span>' + icon('refresh') + ' Nueva versión lista</span>' +
      '<button type="button" class="upd-go">Actualizar</button>' +
      '<button type="button" class="upd-later" aria-label="Cerrar aviso">&times;</button>';
    bar.querySelector('.upd-go').onclick = () => {
      bar.querySelector('.upd-go').disabled = true;
      aplicarAct();
    };
    bar.querySelector('.upd-later').onclick = () => {
      sessionStorage.setItem('ng.updOculta', '1');
      bar.remove();
    };
    document.body.appendChild(bar);
  };
  window.__nutriMarcarAct = marcarActualizacion;

  // Cuando una versión nueva toma el control, recargamos para verla.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (primeraVez) { primeraVez = false; if (!habiaControlador) return; }
    if (recargando) return;
    if (enFormulario()) {
      toast('Nueva versión lista. Se aplicará al cerrar y volver a abrir la app.', 'ok');
      return;
    }
    recargando = true;
    location.reload();
  });

  const vigilar = reg => {
    if (reg.waiting && navigator.serviceWorker.controller) marcarActualizacion();
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) marcarActualizacion();
      });
    });
  };

  const registrar = async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      vigilar(reg);
      const buscar = () => { if (navigator.onLine) reg.update().catch(() => {}); };
      setTimeout(buscar, 3000);                       // al abrir
      setInterval(buscar, 15 * 60 * 1000);            // cada 15 min
      document.addEventListener('visibilitychange', () => { if (!document.hidden) buscar(); });
    } catch (e) { console.warn('SW no registrado:', e); }
  };
  if (document.readyState === 'complete') registrar();
  else window.addEventListener('load', registrar, { once: true });
}

/* ---------- Volver de segundo plano (cámara, galería u otra app) ---------- */
function setupResume() {
  let ocultoEn = 0;
  const RUTAS_REFRESH = ['hoy', 'registrar', 'historial'];   // las demás tienen formularios
  const refrescar = () => {
    if (!window.__nutriListo) return;
    try { log.alVolverDeFoto(); } catch (e) { /* nada */ }
    if (document.querySelector('input[type="file"]')) return;   // selector de archivo aún abierto
    if (document.querySelector('.sheet-back, .cam-back')) return;   // hoja o cámara abierta
    const ruta = parseHash().path[0] || 'hoy';
    if (RUTAS_REFRESH.indexOf(ruta) === -1) return;             // no pisar lo que estaba escribiendo
    const y = window.scrollY;
    route().then(() => window.scrollTo(0, y)).catch(() => {});
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { ocultoEn = Date.now(); return; }
    const vuelta = ocultoEn ? Date.now() - ocultoEn : 0;
    ocultoEn = 0;
    if (vuelta >= 1200) refrescar();
  });
  window.addEventListener('pageshow', e => { if (e.persisted) refrescar(); });
}

/* ---------- Nube (Supabase, opcional) ---------- */
function setupNube() {
  import('./cloud.js').then(c => {
    if (c.haySesion()) {
      // primera vez con sesión en esta visita: subida/bajada COMPLETA a la BD
      setTimeout(() => c.sincronizarInicial().catch(() => {}), 2500);
      setInterval(() => {
        if (c.haySesion() && navigator.onLine) c.sincronizarInicial().catch(() => {});
      }, 10 * 60 * 1000);
    }
  }).catch(() => {});
}

/* ---------- Init ---------- */
async function init() {
  await DB.open();
  await applyTheme();
  initSonidos();
  initRecordatorios();
  getSettings().then(s => setSonidos(s.sounds)).catch(() => {});
  setupInstall();
  setupNetwork();
  setupSW();
  setupResume();
  setupNube();

  document.getElementById('btn-theme').onclick = async () => {
    const cur = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    const { saveSettings } = await import('./db.js');
    await saveSettings({ theme: next });
    applyTheme();
    toast(next === 'dark' ? 'Tema oscuro' : 'Tema claro', 'ok');
  };

  window.addEventListener('hashchange', route);
  if (!location.hash) location.hash = '#/hoy';
  await route();
  window.__nutriListo = true;
}

init().catch(e => {
  console.error(e);
  document.body.innerHTML = `<div style="padding:24px;max-width:520px;margin:0 auto">
    <h2>No se pudo iniciar la app</h2>
    <p>${String(e && e.message ? e.message : e)}</p>
    <p class="small">Si estás en modo incógnito o el navegador bloquea IndexedDB, sal de ese modo e inténtalo de nuevo.</p>
    <button class="btn btn-primary" onclick="location.reload()">Reintentar</button>
  </div>`;
});
