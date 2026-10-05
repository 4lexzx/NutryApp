/* Persistencia local 100% en el celular: IndexedDB (sin servidores). */

const DB_NAME = 'nutri-gym';
const DB_VER = 1;

let _db = null;

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
      if (!db.objectStoreNames.contains('meals')) {
        const s = db.createObjectStore('meals', { keyPath: 'id' });
        s.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('weights')) {
        const s = db.createObjectStore('weights', { keyPath: 'id' });
        s.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('favorites')) db.createObjectStore('favorites', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('water')) db.createObjectStore('water', { keyPath: 'date' });
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('La base de datos está bloqueada por otra pestaña.'));
  });
}

function tx(stores, mode) {
  return open().then(db => db.transaction(stores, mode));
}
function wrap(req) {
  return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
}
function done(t) {
  return new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('abortada')); });
}

export const DB = {
  open,

  /* ---- clave/valor (perfil, ajustes) ---- */
  async kvGet(key, fallback = null) {
    const t = await tx(['kv'], 'readonly');
    const r = await wrap(t.objectStore('kv').get(key));
    return r ? r : fallback;
  },
  async kvSet(obj) {
    const t = await tx(['kv'], 'readwrite');
    t.objectStore('kv').put(Object.assign({ k: 'x' }, obj));
    return done(t);
  },
  async kvAll() {
    const t = await tx(['kv'], 'readonly');
    return wrap(t.objectStore('kv').getAll());
  },
  async kvDel(key) {
    const t = await tx(['kv'], 'readwrite');
    t.objectStore('kv').delete(key);
    return done(t);
  },

  /* ---- genérico por almacén ---- */
  async all(store) {
    const t = await tx([store], 'readonly');
    return wrap(t.objectStore(store).getAll());
  },
  async get(store, id) {
    const t = await tx([store], 'readonly');
    return wrap(t.objectStore(store).get(id));
  },
  async put(store, obj) {
    const t = await tx([store], 'readwrite');
    const req = t.objectStore(store).put(obj);
    const id = await wrap(req);
    await done(t);
    return obj.id ?? id;
  },
  async add(store, obj) {
    const t = await tx([store], 'readwrite');
    const req = t.objectStore(store).add(obj);
    const id = await wrap(req);
    await done(t);
    return id;
  },
  async del(store, id) {
    const t = await tx([store], 'readwrite');
    t.objectStore(store).delete(id);
    return done(t);
  },
  async byDate(store, date) {
    const t = await tx([store], 'readonly');
    return wrap(t.objectStore(store).index('date').getAll(date));
  },
  async count(store) {
    const t = await tx([store], 'readonly');
    return wrap(t.objectStore(store).count());
  },
  async clear(store) {
    const t = await tx([store], 'readwrite');
    t.objectStore(store).clear();
    return done(t);
  },
  async clearAll() {
    const stores = ['kv', 'meals', 'weights', 'favorites', 'water'];
    const t = await tx(stores, 'readwrite');
    stores.forEach(s => t.objectStore(s).clear());
    return done(t);
  },

  /* ---- respaldo / restauración ---- */
  async exportAll() {
    const [kv, meals, weights, favorites, water] = await Promise.all([
      DB.kvAll(), DB.all('meals'), DB.all('weights'), DB.all('favorites'), DB.all('water')
    ]);
    return { app: 'nutri-gym', version: DB_VER, exportedAt: new Date().toISOString(), kv, meals, weights, favorites, water };
  },
  async importAll(data, { replace = true } = {}) {
    if (!data || data.app !== 'nutri-gym') throw new Error('El archivo no parece un respaldo de Nutri Gym.');
    if (replace) await DB.clearAll();
    const stores = ['meals', 'weights', 'favorites', 'water'];
    for (const s of stores) {
      const rows = Array.isArray(data[s]) ? data[s] : [];
      for (const row of rows) await DB.put(s, row);
    }
    const kvs = Array.isArray(data.kv) ? data.kv : [];
    for (const row of kvs) await DB.kvSet(row);
    return true;
  }
};

/* ---------- Ajustes (con valores por defecto) ---------- */
export const DEFAULT_SETTINGS = {
  k: 'settings',
  apiKey: '',
  model: 'gemini-3.8-flash',
  theme: 'dark',
  waterGoal: 8,
  disclaimerSeen: false
};

export async function getSettings() {
  const s = await DB.kvGet('settings');
  const merged = Object.assign({}, DEFAULT_SETTINGS, s || {});
  // migración: gemini-2.5-flash ya no está disponible para cuentas nuevas
  if (merged.model === 'gemini-2.5-flash') {
    merged.model = 'gemini-3.8-flash';
    await DB.kvSet(merged);
  }
  return merged;
}
export async function saveSettings(patch) {
  const cur = await getSettings();
  const next = Object.assign({}, cur, patch, { k: 'settings' });
  await DB.kvSet(next);
  return next;
}

export async function getProfile() {
  const p = await DB.kvGet('profile');
  return p || null;
}
export async function saveProfile(p) {
  await DB.kvSet(Object.assign({ k: 'profile' }, p));
  return p;
}

export async function getPrompt() {
  const p = await DB.kvGet('aiPrompt');
  return p && p.value ? p.value : null;
}
export async function savePrompt(value) {
  await DB.kvSet({ k: 'aiPrompt', value });
}
