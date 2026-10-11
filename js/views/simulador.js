/* Simulador de comida: estima cuánto sumaría una comida a la meta diaria
   SIN registrarla, y sugiere platos del norte del Perú (prioriza proteína
   y lo que falta). Se entra desde el botón "Simular comida" en Registrar. */

import { getSettings, getProfile, DB } from '../db.js';
import { icon } from '../icons.js';
import { simularComida, sugerirComidasSimulador } from '../ai.js';
import { calcTargets, computeTotals, bonusGymKcal } from '../nutrition.js';
import { esc, num, toast, todayISO, fmtLongDate, TIPOS_COMIDA, ICONO_TIPO } from '../util.js';

let tipo = 'almuerzo';
let desc = '';
let sim = null;       // resultado de la simulación { nombre, kcal, protein, carbs, fat, comentario }
let sugerencias = [];
let cargandoSim = false;
let cargandoSug = false;

const MACROS = ['kcal', 'protein', 'carbs', 'fat'];
const NOM = { kcal: 'calorías', protein: 'proteína', carbs: 'carbohidratos', fat: 'grasas' };
const UNI = { kcal: 'kcal', protein: 'g', carbs: 'g', fat: 'g' };

async function resumenDia(date) {
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
  const excedidos = {}, faltantes = {};
  MACROS.forEach(k => {
    const d = total[k] - goal[k];
    if (d > 0) excedidos[k] = Math.round(d);
    else if (d < 0) faltantes[k] = Math.round(-d);
  });
  return { total, goal, excedidos, faltantes, profile, gymBonus };
}

function statgridHTML(t, meta) {
  return MACROS.map(k => {
    const cls = k === 'kcal' ? 'kcal' : k === 'protein' ? 'prot' : k === 'carbs' ? 'carb' : 'gras';
    const lbl = k === 'protein' ? 'prot' : k === 'carbs' ? 'carb' : k === 'fat' ? 'gras' : 'kcal';
    const kTxt = meta ? `${lbl} ${num(meta[k])}${UNI[k] === 'kcal' ? '' : 'g'}` : lbl;
    return `<div class="stat ${cls}"><div class="v">${num(t[k])}</div><div class="k">${kTxt}</div></div>`;
  }).join('');
}

function avisosHTML(r) {
  if (!r) return '';
  const avisos = [];
  MACROS.forEach(k => {
    const pct = r.goal[k] > 0 ? (r.total[k] / r.goal[k]) * 100 : 0;
    if (r.excedidos[k] > 0) avisos.push({ nivel: 'danger', msg: `Ya pasaste ${NOM[k]}: ${num(r.excedidos[k])}${UNI[k] === 'kcal' ? ' kcal' : ' g'} sobre tu meta.` });
    else if (pct >= 90) avisos.push({ nivel: 'warn', msg: `Estás al ${pct.toFixed(0)}% de ${NOM[k]}: casi llegas al límite.` });
  });
  if (!avisos.length) return '';
  return avisos.map(a => `<div class="note ${a.nivel}" style="text-align:left">${icon('alert')} ${esc(a.msg)}</div>`).join('');
}

function proyectadoHTML(r, s) {
  const proy = MACROS.reduce((acc, k) => { acc[k] = r.total[k] + (s[k] || 0); return acc; }, {});
  const lineas = MACROS.map(k => {
    const meta = r.goal[k];
    const v = proy[k];
    const d = v - meta;
    let estado, color;
    if (d > 0) { estado = `+${num(d)}${UNI[k] === 'kcal' ? '' : ' g'} sobre`; color = 'var(--danger)'; }
    else if (v / meta >= 0.9) { estado = 'casi en el límite'; color = 'var(--warn)'; }
    else { estado = `faltan ${num(-d)}${UNI[k] === 'kcal' ? '' : ' g'}`; color = 'var(--brand)'; }
    return `<div class="sim-line"><span class="sim-k">${NOM[k]}</span><span class="sim-v" style="color:${color}">${num(v)} / ${num(meta)}${UNI[k] === 'kcal' ? ' kcal' : ' g'} · ${estado}</span></div>`;
  }).join('');
  return `<div class="sim-proy">${lineas}</div>`;
}

function sugerenciasHTML(list) {
  if (!list.length) return '';
  return list.map(p => `
    <div class="sim-plato">
      <div class="sim-plato-head"><b>${esc(p.nombre)}</b><span class="tiny muted">${esc(p.porcion)}</span></div>
      <div class="tiny muted">${num(p.kcal)} kcal · P ${num(p.protein)}g · C ${num(p.carbs)}g · G ${num(p.fat)}g</div>
      ${p.porque ? `<div class="tiny sim-plato-why">${esc(p.porque)}</div>` : ''}
      <button class="btn btn-sm btn-outline sim-use" data-nom="${esc(p.nombre)}" data-kcal="${p.kcal}" data-p="${p.protein}" data-c="${p.carbs}" data-f="${p.fat}" type="button">${icon('calculator')} Simular este plato</button>
    </div>
  `).join('');
}

export async function render(root, args, query) {
  let date = (query && query.d) || (args && args[0]) || todayISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = todayISO();
  desc = ''; sim = null; sugerencias = []; cargandoSim = false; cargandoSug = false;

  root.innerHTML = `
    <div class="spread" style="margin-bottom:12px">
      <div><h1>${icon('calculator')} Simular comida</h1><div class="tiny muted">${esc(fmtLongDate(date))}</div></div>
      <a class="btn btn-sm btn-ghost" href="#/registrar?d=${date}">Volver</a>
    </div>

    <div class="card">
      <div class="card-title"><h3>${icon('target')} Tu día hasta ahora</h3></div>
      <div id="sim-hoy"></div>
    </div>

    <div class="card">
      <div class="card-title"><h3>${icon('utensils')} ¿Qué comida quieres simular?</h3></div>
      <div class="chips" id="sim-tipo">
        ${TIPOS_COMIDA.map(t => `<button type="button" class="chip ${tipo === t ? 'active' : ''}" data-t="${t}">${icon(ICONO_TIPO[t])} ${t}</button>`).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-title"><h3>${icon('note')} Describe lo que quieres comer</h3></div>
      <textarea id="sim-desc" class="ta-round" rows="3" placeholder="Ej. 1 seco de cabrito con frejoles, 1 vaso de chicha morada">${esc(desc)}</textarea>
      <button class="btn btn-analyze btn-lg btn-block" id="sim-go" type="button" style="margin-top:10px">${icon('sparkles')} Simular con la IA</button>
    </div>

    <div class="card" id="sim-resultado" style="display:none">
      <div class="card-title"><h3>${icon('trending')} Resultado de la simulación</h3></div>
      <div id="sim-res-body"></div>
    </div>

    <div class="card">
      <div class="card-title"><h3>${icon('sparkles')} Sugerencias para ${esc(tipo)}</h3></div>
      <button class="btn btn-outline btn-block" id="sim-sug" type="button">${icon('utensils')} Pedir sugerencias a la IA</button>
      <div id="sim-sug-list" style="margin-top:12px"></div>
    </div>
  `;

  const q = s => root.querySelector(s);

  // Estado inicial del día
  const r = await resumenDia(date);
  if (!r) {
    q('#sim-hoy').innerHTML = '<div class="empty"><span class="ico">' + icon('alert') + '</span><b>Sin perfil</b><p class="small muted">Completa tu perfil para ver la simulación.</p></div>';
    q('#sim-go').disabled = true;
    q('#sim-sug').disabled = true;
  } else {
    q('#sim-hoy').innerHTML = `
      <div class="statgrid">${statgridHTML(r.total, r.goal)}</div>
      <div style="margin-top:10px">${avisosHTML(r)}</div>
    `;
  }

  // Chips de tipo
  q('#sim-tipo').addEventListener('click', e => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    tipo = b.dataset.t;
    q('#sim-tipo').querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.t === tipo));
    q('#sim-sug').textContent = `🍽 Pedir sugerencias a la IA`;
  });

  q('#sim-desc').oninput = e => { desc = e.target.value; };

  // Simular con IA
  q('#sim-go').onclick = async () => {
    if (cargandoSim) return;
    if (!desc.trim()) { toast('Describe lo que quieres simular.', 'warn'); return; }
    const s = await getSettings();
    if (!s.apiKey) { toast('Falta tu API key en Ajustes.', 'warn'); return; }
    cargandoSim = true;
    const btn = q('#sim-go');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Simulando…';
    try {
      sim = await simularComida({ apiKey: s.apiKey, model: s.model || 'gemini-3.1-flash-lite', descripcion: desc.trim() });
      renderResultado(r, date);
      toast('Comida simulada (no registrada).', 'ok');
    } catch (e) {
      toast(e.message || 'Error al simular.', 'error');
    } finally {
      cargandoSim = false;
      btn.disabled = false;
      btn.innerHTML = `${icon('sparkles')} Simular con la IA`;
    }
  };

  function renderResultado(r, date) {
    if (!sim || !r) { q('#sim-resultado').style.display = 'none'; return; }
    q('#sim-resultado').style.display = '';
    q('#sim-res-body').innerHTML = `
      <div style="text-align:center;margin-bottom:10px"><b>${esc(sim.nombre)}</b></div>
      <div class="statgrid">${statgridHTML(sim, null)}</div>
      ${sim.comentario ? `<div class="note" style="text-align:left;margin-top:10px">${icon('sparkles')} ${esc(sim.comentario)}</div>` : ''}
      <div class="tiny muted" style="margin-top:10px;margin-bottom:4px">Proyectado si la comieras (sin registrar):</div>
      ${proyectadoHTML(r, sim)}
    `;
    // avisos de proyección
    const avisos = MACROS.map(k => {
      const d = (r.total[k] + sim[k]) - r.goal[k];
      if (d > 0) return `<div class="note danger" style="text-align:left">${icon('alert')} ¡Ojo! Esta comida te dejaría ${num(d)}${UNI[k] === 'kcal' ? ' kcal' : ' g'} sobre tu meta de ${NOM[k]}.</div>`;
      return '';
    }).filter(Boolean).join('');
    if (avisos) q('#sim-res-body').insertAdjacentHTML('beforeend', `<div style="margin-top:10px">${avisos}</div>`);
  }

  // Sugerencias IA
  q('#sim-sug').onclick = async () => {
    if (cargandoSug || !r) return;
    const s = await getSettings();
    if (!s.apiKey) { toast('Falta tu API key en Ajustes.', 'warn'); return; }
    cargandoSug = true;
    const btn = q('#sim-sug');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Pensando platos del norte…';
    try {
      sugerencias = await sugerirComidasSimulador({
        apiKey: s.apiKey, model: s.model || 'gemini-3.1-flash-lite',
        perfil: r.profile, metas: r.goal, consumido: r.total,
        excedidos: r.excedidos, faltantes: r.faltantes, tipo
      });
      q('#sim-sug-list').innerHTML = sugerenciasHTML(sugerencias);
      // simular al tocar "Simular este plato"
      q('#sim-sug-list').querySelectorAll('.sim-use').forEach(b => b.onclick = () => {
        sim = { nombre: b.dataset.nom, kcal: Number(b.dataset.kcal), protein: Number(b.dataset.p), carbs: Number(b.dataset.c), fat: Number(b.dataset.f), comentario: 'Plato sugerido por la IA.' };
        renderResultado(r, date);
        toast('Plato cargado en la simulación.', 'ok');
      });
    } catch (e) {
      toast(e.message || 'Error al pedir sugerencias.', 'error');
    } finally {
      cargandoSug = false;
      btn.disabled = false;
      btn.innerHTML = `${icon('utensils')} Pedir sugerencias a la IA`;
    }
  };
}
