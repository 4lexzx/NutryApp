/* Acceso local (candado de pantalla): usuarios en IndexedDB, sesión en localStorage.
   No hay servidor: nada sale de este dispositivo. */

import { DB } from './db.js';

const SESSION_KEY = 'ng.session';
const SESSION_DAYS = 30;
const DEFAULT_USER = { user: 'alexsu', pass: '123456' };

const subtle = typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null;

function toHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* SHA-256 con sal aleatoria; si el navegador no expone crypto.subtle
   (contexto no seguro), cae a una función de dispersión local. */
async function hash(password, salt) {
  const material = salt + '|' + password;
  if (subtle) {
    const data = new TextEncoder().encode(material);
    return toHex(await subtle.digest('SHA-256', data));
  }
  let h = 2166136261;
  for (let i = 0; i < material.length; i++) {
    h ^= material.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 'fallback' + (h >>> 0).toString(16);
}

function newSalt() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const b = crypto.getRandomValues(new Uint8Array(12));
    return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function getUsers() {
  const row = await DB.kvGet('users');
  return (row && Array.isArray(row.list)) ? row.list : [];
}

async function saveUsers(list) {
  await DB.kvSet({ k: 'users', list });
}

/* Crea el usuario inicial la primera vez que se abre la app. */
export async function seedUsers() {
  const list = await getUsers();
  if (list.length) return list;
  const salt = newSalt();
  const h0 = await hash(DEFAULT_USER.pass, salt);
  const next = [{ u: DEFAULT_USER.user, s: salt, h: h0 }];
  await saveUsers(next);
  return next;
}

/* Crea un usuario nuevo en ESTE dispositivo (sin servidor, sin internet). */
export async function createUser(username, password) {
  const u = String(username || '').trim().toLowerCase();
  const p = String(password || '');
  if (!/^[a-z0-9._-]{3,20}$/.test(u)) {
    return { ok: false, msg: 'El usuario debe tener de 3 a 20 caracteres: solo minúsculas, números, punto, guion o guion bajo. Sin espacios ni ñ.' };
  }
  if (p.length < 4) return { ok: false, msg: 'La contraseña debe tener al menos 4 caracteres.' };
  const list = await seedUsers();
  if (list.some(x => x.u === u)) return { ok: false, msg: 'Ese usuario ya existe en este dispositivo.' };
  const s = newSalt();
  list.push({ u, s, h: await hash(p, s) });
  await saveUsers(list);
  return { ok: true, user: u };
}

/* Borra un usuario de ESTE dispositivo (se usa si la cuenta ya existe en la
   nube con otra contraseña y no queremos crear una cuenta duplicada). */
export async function removeUser(username) {
  const list = await getUsers();
  const u = String(username || '').trim().toLowerCase();
  const next = list.filter(x => x.u !== u);
  if (next.length === list.length) return { ok: false, msg: 'Usuario no encontrado.' };
  if (!next.length) return { ok: false, msg: 'No se puede borrar el último usuario.' };
  await saveUsers(next);
  return { ok: true };
}

/* Ajusta la contraseña local a la que se acaba de validar en la nube (el
   candado y la cuenta quedan con la misma). Si no existía, se crea. */
export async function setLocalPassword(username, password) {
  const u = String(username || '').trim().toLowerCase();
  const p = String(password || '');
  const list = await seedUsers();
  const i = list.findIndex(x => x.u === u);
  const s = newSalt();
  const h = await hash(p, s);
  if (i >= 0) list[i] = { u, s, h };
  else list.push({ u, s, h });
  await saveUsers(list);
  return { ok: true, user: u };
}

export async function verify(username, password) {
  const list = await seedUsers();
  const u = String(username || '').trim().toLowerCase();
  const row = list.find(x => x.u === u);
  if (!row) return { ok: false, msg: 'Usuario o contraseña incorrectos.' };
  const h = await hash(String(password || ''), row.s);
  if (h !== row.h) return { ok: false, msg: 'Usuario o contraseña incorrectos.' };
  return { ok: true, user: row.u };
}

export async function changePassword(username, oldPass, newPass) {
  const list = await getUsers();
  const u = String(username || '').trim().toLowerCase();
  const i = list.findIndex(x => x.u === u);
  if (i < 0) return { ok: false, msg: 'Usuario no encontrado.' };
  const h = await hash(String(oldPass || ''), list[i].s);
  if (h !== list[i].h) return { ok: false, msg: 'La contraseña actual no coincide.' };
  const s = newSalt();
  list[i] = { u, s, h: await hash(String(newPass || ''), s) };
  await saveUsers(list);
  return { ok: true };
}

/* ---------- Sesión ---------- */
function store() {
  try {
    localStorage.setItem('ng.test', '1');
    localStorage.removeItem('ng.test');
    return localStorage;
  } catch (e) { return null; }
}

let memSession = null;

export function session() {
  try {
    const s = store();
    const raw = s ? s.getItem(SESSION_KEY) : memSession;
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.u) return null;
    if (obj.exp && obj.exp < Date.now()) { clearSession(); return null; }
    return obj;
  } catch (e) { return null; }
}

export function setSession(user) {
  const obj = { u: user, exp: Date.now() + SESSION_DAYS * 86400000 };
  const raw = JSON.stringify(obj);
  try {
    const s = store();
    if (s) s.setItem(SESSION_KEY, raw); else memSession = raw;
  } catch (e) { memSession = raw; }
  return obj;
}

export function clearSession() {
  try { const s = store(); if (s) s.removeItem(SESSION_KEY); } catch (e) { /* sin memoria */ }
  memSession = null;
}

export function currentUser() { const s = session(); return s ? s.u : null; }
export function isAuthed() { return !!session(); }
