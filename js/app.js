/* Punto de entrada: router, tema, instalación PWA y service worker. */

import { getSettings, DB } from './db.js';
import { toast } from './util.js';
import { initSonidos, setSonidos } from './sound.js';
import { initRecordatorios } from './notif.js';
import { seedUsers, isAuthed, clearSession } from './auth.js';
import { iniciarSelects } from './selects.js';
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
import * as social from './views/social.js';
import * as amigo from './views/amigo.js';

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

const NAV_OF = { hoy: 'hoy', registrar: 'registrar', nuevo: 'registrar', editar: 'registrar', historial: 'historial', social: 'social', amigo: 'social', perfil: 'perfil', ajustes: 'ajustes', ia: 'ajustes', gym: 'hoy', batido: 'registrar' };

/* Refresco de la vista ACTUAL sin spinner y sin borrar la pantalla.
   Se usa cuando la nube baja datos o al volver de segundo plano: si no,
   route() entero ponía el loading y se veía un parpadeo (sobre todo la
   tarjeta de Gym, que tiene la llama y las lámparas animadas). */
async function refrescarEnSilencio() {
  const { path, query } = parseHash();
  const name = path[0] || 'hoy';
  const root = view();
  if (!isAuthed()) return;
  // solo pantallas de lectura; nunca formularios ni editores en curso
  if (['ajustes', 'registrar', 'nuevo', 'editar', 'ia'].indexOf(name) >= 0) return;
  const a = document.activeElement;
  if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
  const y = window.scrollY;
  try {
    switch (name) {
      case 'hoy': await today.render(root, path.slice(1)); break;
      case 'historial': await history.render(root, path.slice(1), query); break;
      case 'gym': await gym.render(root, path.slice(1), query); break;
      // social/amigo se refrescan solos (sin spinner) por su propio evento
      default: return;
    }
    window.scrollTo(0, y);
  } catch (e) { /* nada */ }
}

async function route(opts = {}) {
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
  if (opts.scroll !== false) window.scrollTo(0, 0);

  try {
    switch (name) {
      case 'hoy': await today.render(root, path.slice(1)); break;
      case 'registrar': await log.renderStart(root, path.slice(1), query); break;
      case 'nuevo': await log.renderNew(root, path.slice(1), query); break;
      case 'editar': await log.renderEdit(root, path.slice(1), query); break;
      case 'historial': await history.render(root, path.slice(1), query); break;
      case 'perfil': await profile.render(root, path.slice(1), query); break;
      case 'social': await social.render(root); break;
      case 'amigo': await amigo.render(root, path.slice(1)); break;
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
      // updateViaCache:'none': el navegador siempre mira sw.js a la red
      // (sin él, la PWA instalada se quedaba vieja y había que reinstalarla).
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
      navigator.serviceWorker.__nutriReg = reg;
      vigilar(reg);
      const buscar = () => { if (navigator.onLine) reg.update().catch(() => {}); };
      setTimeout(buscar, 3000);                       // al abrir
      setInterval(buscar, 15 * 60 * 1000);            // cada 15 min
      document.addEventListener('visibilitychange', () => { if (!document.hidden) buscar(); });
    } catch (e) { console.warn('SW no registrado:', e); }
  };
  if (document.readyState === 'complete') registrar();
  else window.addEventListener('load', registrar, { once: true });

  // Si hay una versión nueva esperando y el usuario NO está escribiendo ni
  // con una hoja abierta, la aplicamos sola al volver a la app: así la PWA
  // instalada se pone al día sin desinstalar nada.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    try {
      const reg = navigator.serviceWorker.__nutriReg;
      if (reg && reg.waiting && !enFormulario()) reg.waiting.postMessage('skipWaiting');
    } catch (e) { /* nada */ }
  });
}

/* ---------- Volver de segundo plano (cámara, galería u otra app) ---------- */
function setupResume() {
  let ocultoEn = 0;
  const RUTAS_REFRESH = ['hoy', 'registrar', 'historial', 'social', 'amigo'];   // las demás tienen formularios
  const refrescar = () => {
    if (!window.__nutriListo) return;
    try { log.alVolverDeFoto(); } catch (e) { /* nada */ }
    if (document.querySelector('input[type="file"]')) return;   // selector de archivo aún abierto
    if (document.querySelector('.sheet-back, .cam-back')) return;   // hoja o cámara abierta
    const ruta = parseHash().path[0] || 'hoy';
    if (RUTAS_REFRESH.indexOf(ruta) === -1) return;             // no pisar lo que estaba escribiendo
    // refresco silencioso: sin spinner ni borrar la pantalla (evita el parpadeo)
    refrescarEnSilencio();
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
    // La nube se reconecta sola y siempre: si falta la sesión (o el token
    // dejó de servir) vuelve a entrar con la cuenta guardada en el
    // dispositivo. No hace falta ningún paso manual.
    const syncSiHay = () => {
      if (c.haySesion() && navigator.onLine) c.sincronizarInicial().catch(() => {});
    };
    const reconectar = () => {
      Promise.resolve(c.reconectar())
        .then(ok => { if (ok) syncSiHay(); })
        .catch(() => {});
    };
    reconectar();
    window.addEventListener('online', reconectar);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reconectar(); });
    // al volver a la pestaña o cada 10 min, bajamos lo que otros dispositivos hayan subido
    setInterval(syncSiHay, 10 * 60 * 1000);
    if (c.haySesion()) {
      // primera vez con sesión en esta visita: subida/bajada COMPLETA a la BD
      setTimeout(() => {
        c.sincronizarInicial().catch(() => {}).then(() => {
          import('./views/social.js').then(m => m.actualizarBadgeNav()).catch(() => {});
        });
      }, 2500);
    }
  }).catch(() => {});
}

/* La nube es OBLIGATORIA y va sola: entrar a la app es entrar a tu cuenta.
   Si este dispositivo quedó sin sesión y sin la cuenta guardada (navegador
   que borró los tokens, por ejemplo), hay que escribir el candado UNA vez
   para poder conectar; a partir de ahí la nube entra sola cada vez que se
   abre la app y nunca se cierra. Solo con internet y en producción. */
async function exigirCuentaNube() {
  try {
    if (!navigator.onLine) return;                       // sin internet no se pide nada
    const h = location.hostname;
    if (!h || h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '[::1]') return;
    if (!isAuthed()) return;
    const c = await import('./cloud.js');
    if (typeof c.listoParaAuto !== 'function') return;
    if (c.listoParaAuto()) return;                       // cuenta guardada: se reconecta sola
    if (c.haySesion()) return;                           // la sesión sigue viva
    clearSession();
    toast('Conectando tu nube: escribe tu usuario y contraseña una sola vez. Después se conecta sola cada vez que abras la app y ya no se cierra nunca.', 'warn');
  } catch (e) { /* nada */ }
}

/* La nube avisa a la UI: badge de Ajustes + refresco de la pantalla actual
   cuando llegan datos de otros dispositivos. */
function prepararNubeUI() {
  window.__nutriNubeAct = (err, info) => {
    try { if (typeof window.__nutriNubeBadge === 'function') window.__nutriNubeBadge(); } catch (e) { /* nada */ }
    // la nube acaba de (re)conectar: si Ajustes la muestra "desconectada",
    // se repinta sola para que nunca se quede un estado viejo
    if (info && info.conectada) {
      const badge = document.getElementById('nb-badge');
      const ruta0 = parseHash().path[0] || 'hoy';
      const a = document.activeElement;
      const escribiendo = a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable);
      if (badge && /desconectada/i.test(badge.textContent || '') && ruta0 === 'ajustes' && !escribiendo) {
        route({ scroll: false }).catch(() => {});
      }
      return;
    }
    if (err || !info || !(info.bajadas > 0)) return;
    if (document.querySelector('.sheet-back, .cam-back')) return;   // hoja o cámara abierta
    const ruta = parseHash().path[0] || 'hoy';
    // social/amigo se refrescan solos (sin spinner) para no parpadear
    if (ruta === 'social' || ruta === 'amigo') {
      document.dispatchEvent(new CustomEvent('nutri-nube-actualizada'));
      return;
    }
    // refresco silencioso: sin spinner ni borrar la pantalla (evita el parpadeo
    // de la tarjeta de Gym y demás al sincronizar en segundo plano)
    refrescarEnSilencio();
  };
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
  iniciarSelects();
  prepararNubeUI();
  setupNube();
  await exigirCuentaNube();

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
