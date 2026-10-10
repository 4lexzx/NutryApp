/* Capa de nube (Supabase): cuenta + sincronización de IndexedDB.
   - En producción la app vive EN LA NUBE: entrar exige internet y valida
     el usuario/contraseña contra la cuenta (ver entrarConNube).
   - CON sesión: cada cambio local se encola y se sube solo; al abrir
     se bajan los cambios hechos en otros dispositivos.
   - Conflictos: gana lo último en llegar (last-write-wins).
   - La cola de pendientes vive en kv['syncq'] y NUNCA se sube. */

import { DB, conAplicacionNube } from './db.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, nubeConfigurada, nubeAutomaticaOk } from './config.js';
import { toast, todayISO, toISODate } from './util.js';
import { currentUser } from './auth.js';
import { calcTargets } from './nutrition.js';
import { cargarGym, calcRacha } from './views/gym.js';

const SES = 'ng.nube';        // localStorage: sesión Supabase
const COLA = 'syncq';         // kv: pendientes por subir {clave: op}
const ULT = 'cloudUlt';       // kv: corte de la última bajada (fecha del servidor)
const KV_NO_SUBIR = new Set([COLA, ULT, 'users']);
const TIENDAS = ['meals', 'weights', 'favorites', 'water', 'platos'];

/* Credenciales derivadas del candado local: el usuario nunca las ve y sus
   datos quedan en una cuenta de nube con su mismo usuario/contraseña. */
export function emailNubeDe(u) { return String(u || '').trim().toLowerCase() + '@nutrigym.app'; }
function passNubeDe(p) {
  const s = String(p || '');
  return s.length >= 6 ? s : s + '0'.repeat(6 - s.length);   // Supabase exige mínimo 6
}

/* Entrar a la cuenta (producción): valida usuario/contraseña CONTRA la nube.
   No crea cuentas ni acepta el candado local: la cuenta manda. */
export async function entrarConNube(usuario, pass) {
  if (!nubeConfigurada()) throw new Error('La nube no está configurada en esta app.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Sin internet. La app vive en tu cuenta: necesita conexión para entrar.');
  }
  const email = emailNubeDe(usuario);
  const passN = passNubeDe(pass);
  let d;
  try {
    d = await postAuth('/auth/v1/token?grant_type=password', { email, password: passN });
  } catch (e) {
    const m = String(e && e.message ? e.message : e);
    if (/Invalid login credentials|user_already_exists|not confirmed|Bad Request/i.test(m)) {
      throw new Error('Usuario o contraseña no coinciden con tu cuenta en la nube. Usa el mismo usuario y la MISMA contraseña que en tu otro dispositivo.');
    }
    throw new Error('No pude conectar con la nube. Revisa tu internet e inténtalo de nuevo.');
  }
  guardaTokens(d, email);
  return email;
}

/* ¿Ese usuario ya está registrado en la nube? Mira la tabla de la BD
   (usuarios_registrados). Devuelve {ok, existe, usuario, email}. Si la
   migración v2.4 no está aplicada, avisa sin bloquear. */
export async function usuarioYaRegistrado(usuario) {
  const nom = String(usuario || '').trim().toLowerCase();
  if (!nom) return { ok: false, existe: false };
  if (!nubeConfigurada()) return { ok: false, existe: false };
  const tk = await tokenAnonima().catch(() => null);
  if (!tk) return { ok: false, existe: false };
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/usuario_existe', {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: nom })
    });
    if (r.status === 404) return { ok: false, existe: false };   // sin la migración v2.4
    if (!r.ok) return { ok: false, existe: false };
    const d = await r.json();
    const fila = (Array.isArray(d) ? d[0] : null) || null;
    return { ok: true, existe: !!fila, usuario: fila ? fila.usuario : '', email: fila ? fila.email : '' };
  } catch (e) {
    return { ok: false, existe: false };
  }
}

/* Token anónimo (anon key) para las llamadas públicas como usuario_existe. */
async function tokenAnonima() {
  const s = sesion();
  if (s && s.access_token) return s.access_token;
  return SUPABASE_ANON_KEY;
}

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

export async function crearCuenta(email, pass, usuario) {
  if (!nubeConfigurada()) throw new Error('La nube todavía no está configurada en la app.');
  const d = await postAuth('/auth/v1/signup', { email, password: pass });
  // registra el nombre de usuario en la tabla de usuarios (unicidad global)
  if (usuario) await registrarUsuarioLocal(email, usuario).catch(() => {});
  if (d && d.access_token) {
    guardaTokens(d, email);
    await primerSincronizado();
    return { confirmada: true };
  }
  return { confirmada: false };
}

/* Sube tu nombre de usuario a la tabla usuarios_registrados (unicidad). */
async function registrarUsuarioLocal(email, usuario) {
  const nom = String(usuario || '').trim().toLowerCase();
  if (!nom) return false;
  const me = uidSesion();
  if (!me) return false;
  await rest('/usuarios_registrados?on_conflict=user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: [{ user_id: me, usuario: nom, email: String(email || '').toLowerCase(), actualizado: new Date().toISOString() }]
  });
  return true;
}

async function primerSincronizado() {
  const nubeN = await contarNube().catch(() => null);
  const vacia = !nubeN || !nubeN.total;
  const baj = await bajar(true).catch(() => 0);
  await empujar().catch(() => {});
  const r = await subirTodo();
  await subirPerfilSocial().catch(() => {});
  if (vacia) {
    toast(`Nube conectada. Subí tus datos: ${r.subidas} registro${r.subidas === 1 ? '' : 's'}.`, 'ok');
  } else {
    toast(`Nube conectada como ${emailSesion()}.`, 'ok');
    if (baj) toast(`Bajé ${baj} cambio${baj === 1 ? '' : 's'} de tu otra nube.`, 'ok');
  }
  avisarUI(null, { inicial: true, bajadas: baj });
  return r;
}

export async function conectar(email, pass) {
  if (!nubeConfigurada()) throw new Error('La nube todavía no está configurada en la app.');
  const d = await postAuth('/auth/v1/token?grant_type=password', { email, password: pass });
  guardaTokens(d, email);
  await primerSincronizado();
  return emailSesion();
}

/* Conexión automática: con el mismo usuario/contraseña del candado local se
    entra en la nube (sin tocar nada). Si la cuenta no existe, se crea. */

export async function conectarAutomatica(usuario, passLocal) {
  if (!nubeConfigurada() || !nubeAutomaticaOk()) return false;
  const email = emailNubeDe(usuario);
  const pass = passNubeDe(passLocal);
  // La sesión NO se acepta sin validar la contraseña: si es de otra cuenta,
  // se cierra y se vuelve a entrar bien (así nunca quedan cuentas distintas
  // con el mismo usuario).
  if (haySesion() && (emailSesion() || '').toLowerCase() !== email) {
    try { desconectar(); } catch (e) { /* seguimos */ }
  }
  try {
    const d = await postAuth('/auth/v1/token?grant_type=password', { email, password: pass });
    guardaTokens(d, email);
  } catch (e) {
    let creado = false;
    try {
      const s = await postAuth('/auth/v1/signup', { email, password: pass });
      if (s && s.access_token) { guardaTokens(s, email); creado = true; }
    } catch (e2) {
      // la cuenta ya existe en la nube con OTRA contraseña: no seguir en silencio
      if (/already|registrad|existe/i.test(String(e2 && e2.message))) return 'existe';
    }
    if (!creado && !haySesion()) {
      try {
        const d2 = await postAuth('/auth/v1/token?grant_type=password', { email, password: pass });
        guardaTokens(d2, email);
      } catch (e3) { return false; }
    }
  }
  if (!haySesion()) return false;   // pidió confirmar el correo: seguimos en local
  try { await primerSincronizado(); } catch (e) { /* sin red u otro fallo: seguimos */ }
  return true;
}

export async function desconectar() {
  const s = sesion();
  if (s && s.access_token && SUPABASE_URL) {
    fetch(SUPABASE_URL + '/auth/v1/logout', {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + s.access_token }
    }).catch(() => {});
  }
  guardaSesion(null);   // solo a mano desde Ajustes: la nube nunca se cae sola
  _uid = '';
}

/* Refresco de la sesión: UNA sola petición a la vez. Si dos llamadas usan el
   mismo refresh_token en paralelo, el servidor rechaza a la segunda y eso
   borraba la sesión entera (la app se quedaba 'solo local' sin motivo). */
let refrescando = null;
function refrescarSesion(s) {
  if (!refrescando) {
    refrescando = (async () => {
      // otra pestaña (o este mismo refresco) pudo renovar la sesión mientras tanto
      const vigente = () => {
        const a = sesion();
        if (a && a.access_token && a.expires_at && Date.now() < a.expires_at - 60 * 1000) return a;
        return null;
      };
      if (vigente()) return vigente().access_token;
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
        const a = vigente();
        if (a) return a.access_token;    // ya la había renovado otra pestaña
        throw e;
      }
    })();
    const limpiar = () => { refrescando = null; };
    refrescando.then(limpiar, limpiar);
  }
  return refrescando;
}

/* La nube NUNCA se desconecta sola: si el refresco falla (red caída, tope de
   la nube o token caducado) la sesión se queda guardada y se reintenta sola
   con esperas crecientes. No hace falta ningún paso manual. */
let tReintento = null;
let esperaReintento = 5000;
let pendiente = false;          // true = hay un fallo de nube por reintentar
function programaReintento() {
  pendiente = true;
  if (tReintento) return;
  const ms = esperaReintento;
  esperaReintento = Math.min(ms * 2, 5 * 60 * 1000);
  tReintento = setTimeout(() => {
    tReintento = null;
    if (haySesion() && typeof navigator !== 'undefined' && navigator.onLine) {
      sincronizar({ silencioso: true }).catch(() => {});
    }
  }, ms);
}
function reintentoOk() {
  pendiente = false;
  if (tReintento) { clearTimeout(tReintento); tReintento = null; }
  esperaReintento = 5000;
}

/* Deja la sesión otra vez válida sin tocar nada del usuario. */
export async function reconectar() {
  if (!haySesion()) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  const s = sesion();
  const vencida = s.expires_at && Date.now() > s.expires_at - 4 * 60 * 1000;
  if (!vencida && !pendiente) { reintentoOk(); return true; }   // la sesión está bien
  try {
    await refrescarSesion(s);
    reintentoOk();
    return true;
  } catch (e) {
    programaReintento();
    return false;
  }
}

async function token({ forzar = false } = {}) {
  const s = sesion();
  if (!s) return null;
  const vencida = s.expires_at && Date.now() > s.expires_at - 4 * 60 * 1000;
  if (!vencida && !forzar) { reintentoOk(); return s.access_token; }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return s.access_token;   // sin red: seguimos con la guardada
  try {
    const tk = await refrescarSesion(s);
    reintentoOk();
    return tk;
  } catch (e) {
    // la sesión NUNCA se borra: los cambios siguen encolados y se reintenta sola
    programaReintento();
    throw new Error('La nube no responde ahora. Tus datos siguen guardados aquí y se suben solos cuando vuelva.');
  }
}

/* ---------------- REST (PostgREST) ---------------- */
async function rest(patho, { method = 'GET', body, headers = {} } = {}) {
  const llamada = tk => fetch(SUPABASE_URL + '/rest/v1' + patho, {
    method,
    headers: Object.assign({
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + tk,
      'Content-Type': 'application/json'
    }, headers),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let tk = await token();
  if (!tk) throw new Error('Sin sesión en la nube.');
  let r = await llamada(tk);
  if (r.status === 401) {
    // el access_token venció: refrescamos una vez y volvemos a intentar
    tk = await token({ forzar: true }).catch(() => null);
    if (tk) r = await llamada(tk);
  }
  if (r.status === 401) {
    // la nube no aceptó el token: la sesión se queda guardada (aquí no se
    // desconecta nada) y programamos el reintento para que vuelva sola.
    programaReintento();
    throw new Error('La nube no aceptó la sesión por ahora: se reintenta sola y tus datos siguen guardados en este dispositivo.');
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
export async function encolar(tienda, id, op, data) {
  if (!haySesion()) return false;
  if (tienda === 'kv' && KV_NO_SUBIR.has(id)) return false;
  const q = await leerCola();
  const clave = tienda + ':' + id;
  q[clave] = op === 'del'
    ? { tienda, id, op: 'del', ts: Date.now() }
    : { tienda, id, op: 'put', data, ts: Date.now() };
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
      coleccion: f.tienda,
      clave: String(f.id),
      contenido: f.op === 'del' ? null : f.data,
      eliminado: f.op === 'del'
    }));
    await rest('/registros?on_conflict=user_id,coleccion,clave', {
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
      if (!f || !f.coleccion) continue;
      const clave = f.coleccion + ':' + f.clave;
      const q = await leerCola();
      if (q[clave]) continue;                    // cambio local pendiente: manda lo local
      const id = idLocal(f.coleccion, f.clave);
      if (f.eliminado || f.contenido == null) {
        const ya = await DB.get(f.coleccion, id).catch(() => null);
        if (ya) { await DB.del(f.coleccion, id); n++; }
      } else if (f.coleccion === 'kv') {
        const nuevo = Object.assign({}, f.contenido, { k: f.clave });
        if (f.clave === 'settings') {
          const loc = await DB.kvGet('settings');
          // la nube manda, salvo que la fila vieja ni siquiera traiga la clave
          if (loc && loc.apiKey && !Object.prototype.hasOwnProperty.call(f.contenido, 'apiKey')) {
            nuevo.apiKey = loc.apiKey;
          }
        }
        const loc = await DB.kvGet(f.clave).catch(() => null);
        if (JSON.stringify(loc) !== JSON.stringify(nuevo)) { await DB.kvSet(nuevo); n++; }
      } else {
        const loc = await DB.get(f.coleccion, id).catch(() => null);
        if (JSON.stringify(loc) !== JSON.stringify(f.contenido)) { await DB.put(f.coleccion, f.contenido); n++; }
      }
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
  const base = '/registros?select=*&user_id=eq.' + me + '&order=actualizado.asc&limit=5000';
  const [vivas, muertas] = await Promise.all([
    rest(base + '&eliminado=eq.false' + desde),
    rest(base + '&eliminado=eq.true&limit=1000' + desde)
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
  if (haySesion()) sincronizarInicial().catch(() => {});
});

export async function sincronizar({ silencioso = false } = {}) {
  if (sincronizando || !haySesion()) return { ok: false, nada: true };
  sincronizando = true;
  try {
    const subidas = await empujar();
    const bajadas = await bajar(false);
    await subirPerfilSocial().catch(() => {});
    if (!silencioso && (subidas || bajadas)) {
      const partes = [];
      if (subidas) partes.push(subidas + ' subidas');
      if (bajadas) partes.push(bajadas + ' bajadas');
      toast('Nube al día: ' + partes.join(' · ') + '.', 'ok');
    }
    avisarUI(null, { subidas, bajadas });
    return { ok: true, subidas, bajadas };
  } catch (e) {
    console.error('sync nube:', e);
    if (!silencioso && navigator.onLine) toast('Nube: ' + (e && e.message ? e.message : e), 'warn');
    avisarUI(e);
    programaReintento();          // reintento sola, sin pedirle nada al usuario
    return { ok: false, error: e };
  } finally {
    sincronizando = false;
  }
}

function avisarUI(err, info) {
  try {
    if (typeof window.__nutriNubeAct === 'function') window.__nutriNubeAct(err || null, info || null);
  } catch (e) { /* nada */ }
}

/* Sincronización COMPLETA al abrir la app con sesión: baja todo, sube la cola
   y garantiza que TODO lo local esté en la base de datos (sin toasts).
   Si algo falla, no se marca y se reintenta en el próximo evento online. */
let inicialHecha = false;
export async function sincronizarInicial() {
  if (!haySesion()) return { ok: false, nada: true };
  if (inicialHecha) return sincronizar({ silencioso: true });
  if (sincronizando) return { ok: false, ocupado: true };
  sincronizando = true;
  try {
    const baj = await bajar(true);
    await empujar();
    await subirTodo();
    await subirPerfilSocial();
    inicialHecha = true;
    avisarUI(null, { inicial: true, bajadas: baj });
    return { ok: true };
  } catch (e) {
    console.error('sync nube inicial:', e);
    avisarUI(e);
    programaReintento();
    return { ok: false, error: e };
  } finally {
    sincronizando = false;
  }
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
  const r = await rest('/registros?select=coleccion&eliminado=eq.false&limit=10000');
  const filas = r.d || [];
  const c = { meals: 0, weights: 0, favorites: 0, water: 0, platos: 0, kv: 0 };
  for (const f of filas) if (c[f.coleccion] !== undefined) c[f.coleccion]++;
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
      filas.push({ tienda: t, fila_id: String(id), data: r });
    }
  }
  const kvs = await DB.kvAll();
  for (const r of kvs) {
    if (KV_NO_SUBIR.has(r.k)) continue;
    filas.push({ tienda: 'kv', fila_id: String(r.k), data: r });
  }
  const me = uidSesion();
  if (!me) throw new Error('Sin sesión en la nube.');
  for (let i = 0; i < filas.length; i += 40) {
    const lote = filas.slice(i, i + 40).map(f => ({
      user_id: me, coleccion: f.tienda, clave: f.fila_id, contenido: f.data, eliminado: false
    }));
    await rest('/registros?on_conflict=user_id,coleccion,clave', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: lote
    });
  }
  const despues = await contarNube().catch(() => null);
  await DB.kvSet({ k: ULT, v: corteSeguro(null) });
  avisarUI(null, { subidas: filas.length });
  return { antes, despues, subidas: filas.length };
}
export async function subidasEnNube() {
  const c = await contarNube();
  return c;
}
export async function bajarTodo() {
  const n = await bajar(true);
  avisarUI(null, { bajadas: n });
  return n;
}

/* ---------------- perfil social + amigos ---------------- */
export function uidNube() { return uidSesion(); }

function isoHoy() { return todayISO(); }

/* Racha de comidas: días seguidos con al menos un registro (si hoy aún no
   comiste, se mide hasta ayer para no cortar la racha a media jornada). */
function rachaComidas(meals) {
  const fechas = new Set(meals.map(m => m && m.date).filter(Boolean));
  const d = new Date();
  if (!fechas.has(todayISO())) d.setDate(d.getDate() - 1);
  let r = 0;
  for (; ;) {
    const k = toISODate(d);
    if (!fechas.has(k)) break;
    r++;
    d.setDate(d.getDate() - 1);
  }
  return r;
}

/* Resumen del día que ven tus amigos: kcal de hoy, meta y racha + flags. */
async function calcularPerfilSocial() {
  const prof = (await DB.kvGet('profile')) || {};
  let meta = (prof.targets && prof.targets.kcal) ? Number(prof.targets.kcal) : 0;
  if (!meta && prof.weight && prof.height && prof.age) meta = calcTargets(prof).kcal || 0;
  const meals = await DB.all('meals').catch(() => []);
  const hoy = isoHoy();
  let kcal = 0;
  for (const m of meals) {
    if (m && m.date === hoy) kcal += Number((m.totals && m.totals.kcal) || 0);
  }
  kcal = Math.round(kcal);
  const pub = k => prof[k] !== false;      // por defecto todo público
  return {
    usuario: currentUser() || '',
    foto: prof.foto || null,
    bio: prof.bio || '',
    meta_kcal: Math.round(meta) || 0,
    kcal_hoy: kcal,
    cumplio: !!(meta && kcal >= meta),
    racha: rachaComidas(meals),
    pub_perfil: pub('pub_perfil'),
    pub_comidas: pub('pub_comidas'),
    pub_historial: pub('pub_historial'),
    pub_agua: pub('pub_agua'),
    pub_gym: pub('pub_gym'),
    actualizado: new Date().toISOString()
  };
}

/* Lo que tus amigos pueden ver de ti (secciones según tus flags de privacidad). */
async function calcularCompartido() {
  const prof = (await DB.kvGet('profile')) || {};
  let meta = (prof.targets && prof.targets.kcal) ? Number(prof.targets.kcal) : 0;
  if (!meta && prof.weight && prof.height && prof.age) meta = calcTargets(prof).kcal || 0;
  const meals = await DB.all('meals').catch(() => []);
  const hoy = isoHoy();

  // metas diarias del usuario (kcal + macros) — mismo patrón que Hoy
  const tgt = calcTargets(prof);
  const metaK = (prof.targets && prof.targets.kcal) ? Number(prof.targets.kcal) : (tgt.kcal || 0);
  const metaP = (prof.targets && prof.targets.protein) ? Number(prof.targets.protein) : (tgt.protein || 0);
  const metaC = (prof.targets && prof.targets.carbs) ? Number(prof.targets.carbs) : (tgt.carbs || 0);
  const metaF = (prof.targets && prof.targets.fat) ? Number(prof.targets.fat) : (tgt.fat || 0);

  let kcal = 0, p = 0, c = 0, f = 0, fi = 0;
  const comidas = [];
  const porFecha = {};
  for (const m of meals) {
    if (!m || !m.date) continue;
    const k = Math.round(Number((m.totals && m.totals.kcal) || 0));
    const mp = Math.round(Number((m.totals && m.totals.protein) || 0));
    const mc = Math.round(Number((m.totals && m.totals.carbs) || 0));
    const mf = Math.round(Number((m.totals && m.totals.fat) || 0));
    const mfi = Math.round(Number((m.totals && m.totals.fiber) || 0));
    porFecha[m.date] = porFecha[m.date] || { k: 0, p: 0, c: 0, f: 0, fi: 0, n: 0 };
    porFecha[m.date].k += k;
    porFecha[m.date].p += mp;
    porFecha[m.date].c += mc;
    porFecha[m.date].f += mf;
    porFecha[m.date].fi += mfi;
    porFecha[m.date].n++;
    if (m.date === hoy) {
      kcal += k; p += mp; c += mc; f += mf; fi += mfi;
      comidas.push({
        t: m.type || '',
        n: String(m.name || '').slice(0, 80),
        k,
        p: mp, c: mc, f: mf,
        h: m.createdAt ? new Date(m.createdAt).toTimeString().slice(0, 5) : ''
      });
    }
  }
  comidas.sort((a, b) => String(a.h).localeCompare(String(b.h)));

  const historial = [];
  const d = new Date(hoy + 'T12:00:00');
  for (let i = 0; i < 14; i++) {
    const f = toISODate(d);
    const e = porFecha[f];
    historial.push({ f, k: e ? Math.round(e.k) : 0, p: e ? Math.round(e.p) : 0, c: e ? Math.round(e.c) : 0, f: e ? Math.round(e.f) : 0, n: e ? e.n : 0 });
    d.setDate(d.getDate() - 1);
  }

  const kvs = await DB.kvAll().catch(() => []);
  const set = (await DB.kvGet('settings')) || {};
  const aguaMeta = Number(set.waterGoal) || 8;
  let aguaHoy = 0;
  const fechasAgua = new Set();
  for (const r of kvs) {
    if (!r || !r.k || r.k.slice(0, 6) !== 'water:') continue;
    const gl = Number(r.glasses) || 0;
    if (gl > 0) fechasAgua.add(r.k.slice(6));
    if (r.k.slice(6) === hoy) aguaHoy = gl;
  }
  let rachaAgua = 0;
  {
    const dd = new Date();
    if (!fechasAgua.has(toISODate(dd))) dd.setDate(dd.getDate() - 1);
    for (; ;) {
      if (!fechasAgua.has(toISODate(dd))) break;
      rachaAgua++;
      dd.setDate(dd.getDate() - 1);
    }
  }

  let gymRacha = 0, gymHoy = false, gymPlan = '';
  try {
    const gy = await cargarGym();
    const r = calcRacha(gy.regs, gy.plan, hoy);
    gymRacha = r.dias;
    gymPlan = String(gy.plan || '');
    const hoyReg = gy.regs[hoy];
    gymHoy = !!(hoyReg && hoyReg.ido);
  } catch (e) { /* sin gym */ }

  let peso = 0;
  try {
    const pesos = (await DB.all('weights')).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (pesos.length) peso = Number(pesos[pesos.length - 1].kg) || 0;
  } catch (e) { /* sin pesos */ }

  return {
    comidas,
    historial,
    agua: { v: aguaHoy, meta: aguaMeta, r: rachaAgua },
    gym: { ido: gymHoy, r: gymRacha, dias: gymPlan },
    kcal: Math.round(kcal),
    meta: Math.round(metaK) || 0,
    // macros de hoy + metas diarias (lo que ven tus amigos)
    macros: { k: Math.round(kcal), p: Math.round(p), c: Math.round(c), f: Math.round(f), fi: Math.round(fi) },
    metas: { kcal: Math.round(metaK) || 0, protein: Math.round(metaP) || 0, carbs: Math.round(metaC) || 0, fat: Math.round(metaF) || 0 },
    cumplio: !!(metaK && kcal >= metaK),
    racha: rachaComidas(meals),
    peso
  };
}

/* Sube tu ficha social y lo que compartís (la llama la sincronización). */
export async function subirPerfilSocial() {
  if (!haySesion()) return false;
  const me = uidSesion();
  if (!me) return false;
  const datos = await calcularPerfilSocial();
  if (!datos.usuario) return false;
  await rest('/perfiles?on_conflict=user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: [Object.assign({ user_id: me }, datos)]
  });
  // deja tu usuario en la tabla de la nube (unicidad global + comprobación)
  await registrarUsuarioLocal(emailSesion(), datos.usuario).catch(() => {});
  try {
    const contenido = await calcularCompartido();
    await rest('/compartido?on_conflict=user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: [{ user_id: me, contenido, actualizado: new Date().toISOString() }]
    });
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    if (/404|not.?found|compartido/i.test(msg)) {
      let avisado = false;
      try { avisado = localStorage.getItem('ng.mig23') === '1'; } catch (ev) { /* sin storage */ }
      if (!avisado) {
        try { localStorage.setItem('ng.mig23', '1'); } catch (ev) { /* nada */ }
        toast('Falta aplicar la migración v2.3 en Supabase (migracion_v2_3_social.sql).', 'warn');
      }
    }
  }
  return true;
}

/* Perfiles visibles: los tuyos y los de tus amigos (lo decide la nube). */
export async function bajarPerfiles() {
  const r = await rest('/perfiles?select=*&limit=5000');
  return r.d || [];
}

/* Lo que tus amigos publicaron (comidas, historial, agua, gym…). */
export async function bajarCompartido() {
  const r = await rest('/compartido?select=*&limit=5000');
  return r.d || [];
}

/* Tus amistades (pendientes en cualquier dirección + aceptadas). */
export async function misAmistades() {
  const me = uidSesion();
  if (!me) return [];
  const r = await rest('/amistades?select=*&or=(uno.eq.' + me + ',dos.eq.' + me + ')&limit=1000');
  return r.d || [];
}

/* Pide amistad por usuario (el otro la acepta desde su Perfil). */
export async function pedirAmistad(usuario) {
  const nom = String(usuario || '').trim().toLowerCase();
  if (!nom) return { ok: false, msg: 'Escribe un usuario.' };
  if (!/^[a-z0-9._-]{3,20}$/.test(nom)) {
    return { ok: false, msg: 'Ese usuario no es válido: solo minúsculas, números, punto o guion (sin espacios ni ñ).' };
  }
  const me = uidSesion();
  if (!me) return { ok: false, msg: 'Sin sesión en la nube.' };
  const r = await rest('/rpc/buscar_usuario', { method: 'POST', body: { q: nom } });
  const p = (r.d || []).find(x => String(x.usuario || '').toLowerCase() === nom) || null;
  if (!p) return { ok: false, msg: 'No hay nadie con ese usuario todavía.' };
  if (p.user_id === me) return { ok: false, msg: 'Ese eres tú.' };
  const ya = await rest('/amistades?select=*,id&or=(and(uno.eq.' + me + ',dos.eq.' + p.user_id +
    '),and(uno.eq.' + p.user_id + ',dos.eq.' + me + '))&limit=1');
  if ((ya.d || []).length) return { ok: false, msg: 'Ya existe una solicitud entre ustedes.' };
  await rest('/amistades', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: { uno: me, dos: p.user_id, estado: 'pendiente', actualizado: new Date().toISOString() }
  });
  return { ok: true, usuario: p.usuario || nom };
}

/* Acepta o rechaza una solicitud (la ve el destino). */
export async function responderAmistad(id, aceptar) {
  if (aceptar) {
    await rest('/amistades?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: { estado: 'aceptada', actualizado: new Date().toISOString() }
    });
  } else {
    await rest('/amistades?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
  }
  return true;
}

/* Cancela una solicitud que tú enviaste (o quita la amistad). */
export async function quitarAmistad(id) {
  await rest('/amistades?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
  return true;
}
