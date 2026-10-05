/* Exportación a CSV (Excel) y respaldo/restauración por archivo. */

import { DB, getSettings, getProfile, getPrompt } from './db.js';
import { toCSV, downloadFile, todayISO, esc } from './util.js';
import { computeTotals, itemMacros } from './nutrition.js';

export async function exportMealsCSV() {
  const meals = (await DB.all('meals')).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.createdAt || 0) - (b.createdAt || 0));
  const rows = [['Fecha', 'Comida', 'Plato', 'Ingrediente', 'Gramos', 'kcal', 'Proteina_g', 'Carbohidratos_g', 'Grasas_g', 'Fibra_g', 'Origen']];
  meals.forEach(m => {
    (m.items || []).forEach(it => {
      const mm = itemMacros(it);
      rows.push([m.date, m.type, m.name, it.nombre, it.gramos,
        (mm.k).toFixed(1), (mm.p).toFixed(1), (mm.c).toFixed(1), (mm.f).toFixed(1), (mm.fi || 0).toFixed(1), m.source || '']);
    });
    const t = computeTotals(m.items);
    rows.push([m.date, m.type, m.name + ' (TOTAL)', '', t.grams, t.kcal, t.protein, t.carbs, t.fat, t.fiber, m.source || '']);
  });
  if (rows.length === 1) rows.push(['(sin comidas registradas)', '', '', '', '', '', '', '', '', '', '']);
  downloadFile(`nutri-comidas-${todayISO()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
  return meals.length;
}

export async function exportWeightsCSV() {
  const w = (await DB.all('weights')).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const rows = [['Fecha', 'Peso_kg', 'Notas']];
  w.forEach(x => rows.push([x.date, x.kg, x.note || '']));
  if (rows.length === 1) rows.push(['(sin registros)', '', '']);
  downloadFile(`nutri-pesos-${todayISO()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
  return w.length;
}

export async function exportBackup() {
  const data = await DB.exportAll();
  data.settings = await getSettings();
  data.profileData = await getProfile();
  downloadFile(`nutri-respaldo-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json');
}

export async function importBackup(file) {
  const txt = await file.text ? await file.text() : await readText(file);
  let data;
  try { data = JSON.parse(txt); } catch (e) { throw new Error('El archivo no es un JSON válido.'); }
  const meals = Array.isArray(data.meals) ? data.meals.length : 0;
  const weights = Array.isArray(data.weights) ? data.weights.length : 0;
  await DB.importAll(data, { replace: true });
  return { meals, weights };
}

function readText(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });
}

export async function backupSummary() {
  const [m, w, f] = await Promise.all([DB.count('meals'), DB.count('weights'), DB.count('favorites')]);
  const s = await getSettings();
  return { meals: m, weights: w, favorites: f, hasKey: !!(s && s.apiKey) };
}

export function dataHelpHTML() {
  return `
    <p class="small muted">Tus datos viven <b>solo en este celular</b> (base de datos del navegador). Si borras
    los datos del navegador, cambias de celular o actualizas el sistema, <b>podrías perder todo</b>.</p>
    <ul class="small muted" style="padding-left:18px">
      <li><b>Respaldo .json</b>: guarda TODO (perfil, comidas, pesos, favoritos, ajustes). Se restaura en otro dispositivo.</li>
      <li><b>CSV</b>: sirve para abrir en Excel/Google Sheets y analizar.</li>
    </ul>
    <p class="small muted">Haz un respaldo al menos <b>una vez por semana</b>.</p>`;
}
