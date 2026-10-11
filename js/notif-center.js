/* Centro de notificaciones: avisos de excesos de macros con recomendación
   de platos de la IA. Se guardan en kv['notifs'] (se sincronizan solos). */

import { DB, getProfile, getSettings } from './db.js';
import { calcTargets, computeTotals, bonusGymKcal } from './nutrition.js';
import { todayISO, esc, num, toast, openSheet } from './util.js';
import { icon } from './icons.js';

const K = 'notifs';

export async function listarNotifs() {
  const r = await DB.kvGet(K, null);
  return (r && Array.isArray(r.items)) ? r.items : [];
}

async function guardar(items) {
  items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const cortos = items.slice(0, 50);
  await DB.kvSet({ k: K, items: cortos });
  return cortos;
}

export async function noLeidas() {
  const items = await listarNotifs();
  return items.filter(i => !i.leida).length;
}

export async function actualizarBadge() {
  const n = await noLeidas();
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (n > 0) {
    badge.style.display = '';
    badge.textContent = String(n);
  } else {
    badge.style.display = 'none';
  }
}

export async function agregarNotif(notif) {
  const items = await listarNotifs();
  const filtrados = items.filter(i => !(i.fecha === notif.fecha && i.macro === notif.macro && i.tipo === 'exceso'));
  filtrados.unshift(Object.assign({ id: Date.now() + Math.floor(Math.random() * 1000), leida: false, ts: Date.now() }, notif));
  await guardar(filtrados);
  await actualizarBadge();
}

export async function marcarTodasLeidas() {
  const items = await listarNotifs();
  items.forEach(i => { i.leida = true; });
  await guardar(items);
  await actualizarBadge();
}

/* ---------- Resumen del día: total vs meta ---------- */
export async function resumenDia(date) {
  const [profile, gym, meals] = await Promise.all([
    getProfile(), DB.kvGet('gym:' + date, null), DB.byDate('meals', date)
  ]);
  if (!profile) return null;
  const targets = calcTargets(profile);
  const baseKcal = profile.targets && profile.targets.kcal ? Number(profile.targets.kcal) : targets.kcal;
  const gymBonus = bonusGymKcal(gym, profile.weight);
  const goal = {
    kcal: baseKcal + gymBonus,
    protein: profile.targets && profile.targets.protein ? Number(profile.targets.protein) : targets.protein,
    carbs: profile.targets && profile.targets.carbs ? Number(profile.targets.carbs) : targets.carbs,
    fat: profile.targets && profile.targets.fat ? Number(profile.targets.fat) : targets.fat
  };
  const total = meals.reduce((acc, m) => {
    const t = computeTotals(m.items);
    acc.kcal += t.kcal; acc.protein += t.protein; acc.carbs += t.carbs; acc.fat += t.fat;
    return acc;
  }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const excedidos = {};
  const faltantes = {};
  ['kcal', 'protein', 'carbs', 'fat'].forEach(k => {
    const d = total[k] - goal[k];
    if (d > 0) excedidos[k] = Math.round(d);
    else if (d < 0) faltantes[k] = Math.round(-d);
  });
  return { total, goal, excedidos, faltantes, profile, gymBonus };
}

/* ---------- Revisar y notificar excesos ---------- */
export async function revisarExcesos(date) {
  const r = await resumenDia(date || todayISO());
  if (!r) return;
  const macrosExcedidos = Object.keys(r.excedidos);
  if (!macrosExcedidos.length) return;
  for (const m of macrosExcedidos) {
    const nombreMacro = { kcal: 'calorías', protein: 'proteína', carbs: 'carbohidratos', fat: 'grasas' }[m];
    const yaExiste = (await listarNotifs()).some(i => i.fecha === (date || todayISO()) && i.macro === m && i.tipo === 'exceso');
    if (yaExiste) continue;
    await agregarNotif({
      fecha: date || todayISO(),
      tipo: 'exceso',
      macro: m,
      titulo: `Pasaste de ${nombreMacro}`,
      cuerpo: `Llevas ${num(r.excedidos[m])} ${m === 'kcal' ? 'kcal' : 'g'} más de tu meta de ${nombreMacro}. Te recomiendo platos que completen lo que falta y sean bajos en ${nombreMacro}.`,
      faltantes: r.faltantes,
      excedidos: r.excedidos,
      platos: null,
      pendiente: true
    });
  }
  pedirRecomendacionesIA(date || todayISO()).catch(() => {});
}

async function pedirRecomendacionesIA(date) {
  const items = await listarNotifs();
  const pendientes = items.filter(i => i.pendiente && i.fecha === date && i.tipo === 'exceso');
  if (!pendientes.length) return;
  const settings = await getSettings();
  if (!settings.apiKey) return;
  const r = await resumenDia(date);
  if (!r) return;
  const { recomendarPlatos } = await import('./ai.js');
  for (const n of pendientes) {
    try {
      const platos = await recomendarPlatos({
        apiKey: settings.apiKey,
        model: settings.model || 'gemini-3.1-flash-lite',
        perfil: r.profile,
        metas: r.goal,
        consumido: r.total,
        excedidos: r.excedidos,
        faltantes: r.faltantes,
        macroExcedido: n.macro
      });
      const todos = await listarNotifs();
      const idx = todos.findIndex(t => t.id === n.id);
      if (idx >= 0) {
        todos[idx].platos = platos;
        todos[idx].pendiente = false;
        await guardar(todos);
      }
    } catch (e) {
      const todos = await listarNotifs();
      const idx = todos.findIndex(t => t.id === n.id);
      if (idx >= 0) {
        todos[idx].pendiente = false;
        todos[idx].errorIA = e.message || 'Error';
        await guardar(todos);
      }
    }
  }
}

/* ---------- Panel de notificaciones (sheet) ---------- */
export async function abrirPanel() {
  const items = await listarNotifs();
  const html = items.length ? items.map(n => `
    <div class="notif-item ${n.leida ? '' : 'nueva'}">
      <div class="notif-head">
        <span class="notif-ico">${icon(n.macro === 'kcal' ? 'flame' : n.macro === 'protein' ? 'dumbbell' : n.macro === 'carbs' ? 'leaf' : 'alert')}</span>
        <div>
          <b>${esc(n.titulo)}</b>
          <div class="small muted">${esc(n.cuerpo)}</div>
          <div class="tiny muted">${esc(n.fecha)}</div>
        </div>
      </div>
      ${n.platos && n.platos.length ? `
        <div class="notif-platos">
          <div class="tiny muted" style="margin-bottom:4px">Platos recomendados:</div>
          ${n.platos.map(p => `
            <div class="notif-plato">
              <b>${esc(p.nombre)}</b> — ${num(p.kcal)} kcal · P ${num(p.protein)}g · C ${num(p.carbs)}g · G ${num(p.fat)}g
              ${p.porque ? `<div class="tiny muted">${esc(p.porque)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      ` : (n.pendiente ? `<div class="tiny muted" style="margin-top:6px">Generando recomendaciones…</div>` : (n.errorIA ? `<div class="tiny muted" style="margin-top:6px">${esc(n.errorIA)}</div>` : ''))}
    </div>
  `).join('') : `
    <div class="empty">
      <span class="ico">${icon('bell')}</span>
      <b>Sin notificaciones</b>
      <p class="small muted">Cuando superes alguna de tus metas (grasas, carbohidratos, etc.) te avisaré aquí con platos que te convienen.</p>
    </div>
  `;
  const s = openSheet(`
    <h2>${icon('bell')} Notificaciones</h2>
    <div class="notif-lista">${html}</div>
    ${items.length ? `<button class="btn btn-ghost btn-block" id="notif-leidas" style="margin-top:12px">Marcar todas como leídas</button>` : ''}
  `);
  const btnLeidas = s.root.querySelector('#notif-leidas');
  if (btnLeidas) btnLeidas.onclick = async () => {
    await marcarTodasLeidas();
    s.close();
    toast('Notificaciones marcadas como leídas.', 'ok');
  };
}
