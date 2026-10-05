/* Punto de entrada: router, tema, instalación PWA y service worker. */

import { getSettings, DB } from './db.js';
import { toast } from './util.js';
import * as today from './views/today.js';
import * as log from './views/log.js';
import * as history from './views/history.js';
import * as profile from './views/profile.js';
import * as settings from './views/settings.js';
import * as ia from './views/ia.js';

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

const NAV_OF = { hoy: 'hoy', registrar: 'registrar', nuevo: 'registrar', editar: 'registrar', historial: 'historial', perfil: 'perfil', ajustes: 'ajustes', ia: 'ajustes' };

async function route() {
  const { path, query } = parseHash();
  const name = path[0] || 'hoy';
  const root = view();

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
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b1220' : '#f2f5fa');
  const btn = document.getElementById('btn-theme');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
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
    toast('¡Nutri Gym instalada! 🎉', 'ok');
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
function setupSW() {
  if (!('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(location.protocol)) return;
  const register = async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (nw) nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Nueva versión lista. Se actualizará al recargar.', 'ok');
          }
        });
      });
    } catch (e) { console.warn('SW no registrado:', e); }
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

/* ---------- Init ---------- */
async function init() {
  await DB.open();
  await applyTheme();
  setupInstall();
  setupNetwork();
  setupSW();

  document.getElementById('btn-theme').onclick = async () => {
    const cur = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    const { saveSettings } = await import('./db.js');
    await saveSettings({ theme: next });
    applyTheme();
    toast(next === 'dark' ? 'Tema oscuro 🌙' : 'Tema claro ☀️', 'ok');
  };

  window.addEventListener('hashchange', route);
  if (!location.hash) location.hash = '#/hoy';
  await route();
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
