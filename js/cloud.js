/* Capa de nube (Supabase): cuenta + sincronización de IndexedDB.
   - SIN nube la app funciona exactamente igual que antes (modo local).
   - CON sesión: cada cambio local se encola y se sube solo; al abrir
     se bajan los cambios hechos en otros dispositivos.
   - Conflictos: gana lo último en llegar (last-write-wins).
   - La cola de pendientes vive en kv['syncq'] y NUNCA se sube. */

import { DB, conAplicacionNube } from './db.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, nubeConfigurada } from './config.js';
import { toast } from './util.js';

const SES = 'ng.nube';        // localStorage: sesión Supabase
const COLA = 'syncq';         // kv: pendientes por subir {clave: op}
const ULT = 'cloudUlt';       // kv: corte de la última bajada (fecha del servidor)
const KV_NO_SUBIR = new Set([COLA, ULT, 'users']);
const TIENDAS = ['meals', 'weights', 'favorites', 'water', 'platos'];

/* ---------------- sesión ---------------- */
function sesion() {
  try { return JSON.parse(localStorage.getItem(SES) || 'null'); } catch (e) { return null; }
}
function guardaSesion(s) {
  try {
    if (s) localStorage.setItem(SES, JSON.stringify(s));
    else localStorage.removeItem(SES);
  } catch (e) { /* sin localStorage no hay nube */ }
}
export function haySesion() { return !!sesion(); }
export function emailSesion() { const s = sesion(); return s ? (s.email || '') : ''; }

let _uid = '';
function uidSesion() {
  if (_uid) return _uid;
  const s = sesion();
  if (!s || !s.access_token) return '';
  try {
    const p = s.access_token.split('.')[1] || '';
    const b64 = p.replace(/-/g, '+').replace(/_/g, '/');
    _uid = JSON.parse(atob(b64)).sub || '';
  } catch (e) { _uid = ''; }
  return _uid;
}

async function postAuth(patho, body) {
  const r = await fetch(SUPABASE_URL + patho, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const t = await r.text();
  let d = {};
  try { d = JSON.parse(t); } catch (e) { /* html de error */ }
  if (!r.ok) throw new Error(d.error_description || d.error_description || d.msg || d.error || ('Error ' + r.status));
  return d;
}
function guardaTokens(d, email) {
  guardaSesion({
    email: (d.user && d.user.email) || email || '',
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: Date.now() + (Number(d.expires_in) || 3600) * 1000
  });
  _uid = '';
}

export async function crearCuenta(email, pass) {
  if (!nubeConfigurada()) throw new Error('La nube todavía no está configurada en la app.');
  const d = await postAuth('/auth/v1/signup', { email, password: pass });
  if (d && d.access_token) {
    guardaTokens(d, email);
    await primerSincronizado();
    return { confirmada: true };
  }
  return { confirmada: false };
}

async function primerSincronizado() {
  const nubeN = await contarNube().catch(() => null);
  if (nubeN === null || nubeN.total === 0) {
    const r = await subirTodo();
    toast(`Nube conectada. Subí tus datos: ${r.subidas} registro${r.subidas === 1 ? '' : 's'}.`, 'ok');
  } else {
    const b = await sincronizar({ silencioso: true });
    toast(`Nube conectada como ${emailSesion()}.`, 'ok');
    if (b && b.ok && b.bajadas) toast(`Bajé ${b.bajadas} cambio${b.bajadas === 1 ? '' : 's'} de tu otra nube.`, 'ok');
  }
}

export async function conectar(email, pass) {
  if (!nubeConfigurada()) throw new Error('La nube todavía no está configurada en la app.');
  const d = await postAuth('/auth/v1/token?grant_type=password', { email, password: pass });
  guardaTokens(d, email);
  await primerSincronizado();
  return emailSesion();
}

export async function desconectar() {
  const s = sesion();
  if (s && s.access_token && SUPABASE_URL) {
    fetch(SUPABASE_URL + '/auth/v1/logout', {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + s.access_token }
    }).catch(() => {});
  }
  guardaSesion(null);
  _uid = '';
}

async function token() {
  const s = sesion();
  if (!s) return null;
  if (s.expires_at && Date.now() > s.expires_at - 4 * 60 * 1000) {
    if (!navigator.onLine) return s.access_token;   // sin red: seguimos con el guardado
    try {
      const d = await postAuth('/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token });
      guardaSesion({
        email: s.email,
        access_token: d.access_token,
        refresh_token: d.refresh_token || s.refresh_token,
        expires_at: Date.now() + (Number(d.expires_in) || 3600) * 1000
      });
      return sesion().access_token;
    } catch (e) {
      guardaSesion(null);
      _uid = '';
      throw new Error('Tu sesión de la nube venció: vuelve a conectar en Ajustes → Nube.');
    }
  }
  return s.access_token;
}

/* ---------------- REST (PostgREST) ---------------- */
async function rest(patho, { method = 'GET', body, headers = {} } = {}) {
  const tk = await token();
  if (!tk) throw new Error('Sin sesión en la nube.');
  const r = await fetch(SUPABASE_URL + '/rest/v1' + patho, {
    method,
    headers: Object.assign({
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + tk,
      'Content-Type': 'application/json'
    }, headers),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (r.status === 401) {
    guardaSesion(null);
    _uid = '';
    throw new Error('Sesión expirada: vuelve a conectar la nube en Ajustes.');
  }
  const t = await r.text();
  if (!r.ok) throw new Error('Nube (' + r.status + '): ' + t.slice(0, 220));
  let d = null;
  try { d = t ? JSON.parse(t) : null; } catch (e) { d = null; }
  return { d, fecha: r.headers.get('Date') };
}

/* ---------------- cola de pendientes ---------------- */
async function leerCola() {
  const c = await DB.kvGet(COLA);
  return (c && typeof c.q === 'object' && c.q) || {};
}
async function escribirCola(q) {
  if (Object.keys(q).length) await DB.kvSet({ k: COLA, q });
  else await DB.kvDel(COLA);
}
function limpiarDato(tienda, obj) {
  if (tienda === 'kv' && obj && obj.k === 'settings') {
    const c = Object.assign({}, obj);
    delete c.apiKey;              // la clave de Gemini NUNCA viaja a la nube
    return c;
  }
  return obj;
}
export async function encolar(tienda, id, op, data) {
  if (!haySesion()) return false;
  if (tienda === 'kv' && KV_NO_SUBIR.has(id)) return false;
  const q = await leerCola();
  const clave = tienda + ':' + id;
  q[clave] = op === 'del'
    ? { tienda, id, op: 'del', ts: Date.now() }
    : { tienda, id, op: 'put', data: limpiarDato(tienda, data), ts: Date.now() };
  await escribirCola(q);
  programarSinc();
  return true;
}
export async function pendientes() { return Object.keys(await leerCola()).length; }

/* ---------------- subir (push) ---------------- */
async function empujar() {
  const q = await leerCola();
  const filas = Object.values(q);
  if (!filas.length) return 0;
  const me = uidSesion();
  if (!me) throw new Error('Sesión de la nube inválida: vuelve a conectar.');
  for (let i = 0; i < filas.length; i += 40) {
    const lote = filas.slice(i, i + 40).map(f => ({
      user_id: me,
      tienda: f.tienda,
      fila_id: String(f.id),
      data: f.op === 'del' ? null : f.data,
      borrado: f.op === 'del'
    }));
    await rest('/nutri_rows?on_conflict=user_id,tienda,fila_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: lote
    });
  }
  const q2 = await leerCola();      // solo quitamos las que no cambiaron mientras subíamos
  for (const f of filas) {
    const clave = f.tienda + ':' + f.id;
    if (q2[clave] && q2[clave].ts === f.ts) delete q2[clave];
  }
  await escribirCola(q2);
  return filas.length;
}

/* ---------------- bajar (pull) ---------------- */
function idLocal(tienda, filaId) {
  if (tienda === 'meals' || tienda === 'weights' || tienda === 'favorites') {
    const n = Number(filaId);
    return isFinite(n) ? n : filaId;
  }
  return filaId;
}
async function aplicar(filas) {
  let n = 0;
  await conAplicacionNube(async () => {
    for (const f of filas) {
      if (!f || !f.tienda) continue;
      const clave = f.tienda + ':' + f.fila_id;
      const q = await leerCola();
      if (q[clave]) continue;                    // cambio local pendiente: manda lo local
      const id = idLocal(f.tienda, f.fila_id);
      if (f.borrado || f.data == null) {
        await DB.del(f.tienda, id);
      } else if (f.tienda === 'kv') {
        await DB.kvSet(Object.assign({}, f.data, { k: f.fila_id }));
      } else {
        await DB.put(f.tienda, f.data);
      }
      n++;
    }
  });
  return n;
}
function corteSeguro(headerFecha) {
  let t = headerFecha ? Date.parse(headerFecha) : Date.now();
  if (!isFinite(t)) t = Date.now();
  t -= 120000;                                   // 2 min de margen (aplicar es idempotente)
  return new Date(t).toISOString();
}
async function bajar(completo = false) {
  const ult = completo ? null : await DB.kvGet(ULT);
  const me = uidSesion();
  if (!me) throw new Error('Sesión de la nube inválida: vuelve a conectar.');
  const desde = (ult && ult.v) ? '&actualizado=gt.' + encodeURIComponent(ult.v) : '';
  const base = '/nutri_rows?select=*&user_id=eq.' + me + '&order=actualizado.asc&limit=5000';
  const [vivas, muertas] = await Promise.all([
    rest(base + '&borrado=eq.false' + desde),
    rest(base + '&borrado=eq.true&limit=1000' + desde)
  ]);
  const n = await aplicar([...(vivas.d || []), ...(muertas.d || [])]);
  await DB.kvSet({ k: ULT, v: corteSeguro(vivas.fecha || muertas.fecha) });
  return n;
}

/* ---------------- sincronizar (push + pull) ---------------- */
let sincronizando = false;
let tSinc = null;
function programarSinc(ms = 1500) {
  if (tSinc) clearTimeout(tSinc);
  tSinc = setTimeout(() => { sincronizar({ silencioso: true }).catch(() => {}); }, ms);
}
window.addEventListener('online', () => {
  if (haySesion()) sincronizar({ silencioso: true }).catch(() => {});
});

export async function sincronizar({ silencioso = false } = {}) {
  if (sincronizando || !haySesion()) return { ok: false, nada: true };
  sincronizando = true;
  try {
    const subidas = await empujar();
    const bajadas = await bajar(false);
    if (!silencioso && (subidas || bajadas)) {
      const partes = [];
      if (subidas) partes.push(subidas + ' subidas');
      if (bajadas) partes.push(bajadas + ' bajadas');
      toast('Nube al día: ' + partes.join(' · ') + '.', 'ok');
    }
    avisarUI();
    return { ok: true, subidas, bajadas };
  } catch (e) {
    console.error('sync nube:', e);
    if (!silencioso && navigator.onLine) toast('Nube: ' + (e && e.message ? e.message : e), 'warn');
    avisarUI(e);
    return { ok: false, error: e };
  } finally {
    sincronizando = false;
  }
}

function avisarUI(err) {
  try {
    if (typeof window.__nutriNubeAct === 'function') window.__nutriNubeAct(err || null);
  } catch (e) { /* nada */ }
}

/* ---------------- migración: subir todo / contar ---------------- */
function claveFila(t, r) {
  if (t === 'kv') return r.k;
  if (t === 'water') return r.date;
  if (t === 'platos') return r.clave;
  return r.id;
}
export async function contarLocal() {
  const c = { meals: 0, weights: 0, favorites: 0, water: 0, platos: 0, kv: 0 };
  for (const t of TIENDAS) c[t] = await DB.count(t).catch(() => 0);
  const kvs = await DB.kvAll().catch(() => []);
  c.kv = kvs.filter(r => !KV_NO_SUBIR.has(r.k)).length;
  return c;
}
async function contarNube() {
  const r = await rest('/nutri_rows?select=tienda&borrado=eq.false&limit=10000');
  const filas = r.d || [];
  const c = { meals: 0, weights: 0, favorites: 0, water: 0, platos: 0, kv: 0 };
  for (const f of filas) if (c[f.tienda] !== undefined) c[f.tienda]++;
  c.total = filas.length;
  return c;
}
export async function subirTodo() {
  const antes = await contarLocal();
  const filas = [];
  for (const t of TIENDAS) {
    const rows = await DB.all(t);
    for (const r of rows) {
      const id = claveFila(t, r);
      if (id === undefined || id === null) continue;
      filas.push({ tienda: t, fila_id: String(id), data: limpiarDato(t, r) });
    }
  }
  const kvs = await DB.kvAll();
  for (const r of kvs) {
    if (KV_NO_SUBIR.has(r.k)) continue;
    filas.push({ tienda: 'kv', fila_id: String(r.k), data: limpiarDato('kv', r) });
  }
  const me = uidSesion();
  if (!me) throw new Error('Sin sesión en la nube.');
  for (let i = 0; i < filas.length; i += 40) {
    const lote = filas.slice(i, i + 40).map(f => ({
      user_id: me, tienda: f.tienda, fila_id: f.fila_id, data: f.data, borrado: false
    }));
    await rest('/nutri_rows?on_conflict=user_id,tienda,fila_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: lote
    });
  }
  const despues = await contarNube().catch(() => null);
  await DB.kvSet({ k: ULT, v: corteSeguro(null) });
  avisarUI();
  return { antes, despues, subidas: filas.length };
}
export async function subidasEnNube() {
  const c = await contarNube();
  return c;
}
export async function bajarTodo() {
  const n = await bajar(true);
  avisarUI();
  return n;
}
