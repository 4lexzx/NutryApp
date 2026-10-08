/* Panel del día: progreso de metas, comidas registradas y agua. */

import { DB, getProfile, getSettings } from '../db.js';
import { icon } from '../icons.js';
import { calcTargets, computeTotals, bonusGymKcal } from '../nutrition.js';
import { fmtHoras, MUSCULOS, CARDIO, cargarGym, calcRacha, lampsHTML, consumeIgnicion } from './gym.js';
import {
  todayISO, addDays, dayLabel, relDayTitle, fmtLongDate, TIPOS_COMIDA, ICONO_TIPO,
  esc, num, toast, confirmSheet, openSheet, fromISODate, DIAS
} from '../util.js';

export async function render(root, params) {
  let date = params && params[0] ? params[0] : todayISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = todayISO();

  const [profile, settings, meals, water, gym, gy] = await Promise.all([
    getProfile(), getSettings(), DB.byDate('meals', date), DB.kvGet('water:' + date, null),
    DB.kvGet('gym:' + date, null), cargarGym()
  ]);

  const targets = profile ? calcTargets(profile) : null;
  const baseKcal = targets ? (profile.targets && profile.targets.kcal ? Number(profile.targets.kcal) : targets.kcal) : 0;
  const gymBonus = bonusGymKcal(gym, profile ? profile.weight : 0);
  const goalKcal = baseKcal + gymBonus;
  const goalP = targets ? (profile.targets && profile.targets.protein ? Number(profile.targets.protein) : targets.protein) : 0;
  const goalC = targets ? (profile.targets && profile.targets.carbs ? Number(profile.targets.carbs) : targets.carbs) : 0;
  const goalF = targets ? (profile.targets && profile.targets.fat ? Number(profile.targets.fat) : targets.fat) : 0;

  const ordered = TIPOS_COMIDA
    .map(t => ({ type: t, rows: meals.filter(m => m.type === t).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)) }))
    .filter(g => g.rows.length);

  const total = meals.reduce((acc, m) => {
    const t = computeTotals(m.items);
    acc.kcal += t.kcal; acc.p += t.protein; acc.c += t.carbs; acc.f += t.fat; acc.fi += t.fiber;
    return acc;
  }, { kcal: 0, p: 0, c: 0, f: 0, fi: 0 });

  const waterG = (water && water.glasses) || 0;
  const waterGoal = Number(settings.waterGoal) || 8;

  root.innerHTML = `
    <div class="daynav">
      <button class="btn btn-ghost btn-sm" id="d-prev" type="button" aria-label="Día anterior">‹</button>
      <div class="date">
        <div class="d1">${esc(dayLabel(date))}</div>
        <div class="d2">${esc(fmtLongDate(date))}</div>
      </div>
      <button class="btn btn-ghost btn-sm" id="d-next" type="button" aria-label="Día siguiente">›</button>
    </div>

    ${!profile ? `
      <div class="empty">
        <span class="ico">${icon('heart')}</span>
        <b>Primero configura tu perfil</b>
        <p class="small muted">Necesito tu peso, estatura, edad y objetivo para calcular tus metas diarias de kcal y macros.</p>
        <a class="btn btn-primary" href="#/perfil" style="display:inline-flex">Ir a mi perfil</a>
      </div>` : ''}

    <div class="card">
      <div class="macro-hero">
        <div class="big">${num(total.kcal)}<span style="font-size:1.1rem;font-weight:700"> ${goalKcal ? '/ ' + num(goalKcal) : ''}</span></div>
        <div class="lbl">kcal consumidas${goalKcal ? ' de tu meta' : ''}${gymBonus ? ` ${icon('dumbbell')} +${num(gymBonus)} por gym` : ''}</div>
        <div class="rest">${goalKcal
      ? (total.kcal <= goalKcal ? `Te faltan <b>${num(goalKcal - total.kcal)} kcal</b>` : `Superaste la meta en <b>${num(total.kcal - goalKcal)} kcal</b>`)
      : 'Configura tu perfil para ver metas'}</div>
      </div>
      <div class="bars">
        ${bar('kcal', 'Calorías', total.kcal, goalKcal, 'kcal', 0)}
        ${bar('prot', 'Proteína', total.p, goalP, 'g', 1)}
        ${bar('carb', 'Carbohidratos', total.c, goalC, 'g', 1)}
        ${bar('gras', 'Grasas', total.f, goalF, 'g', 1)}
      </div>
      <div class="statgrid" style="margin-top:14px">
        <div class="stat kcal"><div class="v">${num(total.kcal)}</div><div class="k">kcal</div></div>
        <div class="stat prot"><div class="v">${num(total.p, 1)}</div><div class="k">prot (g)</div></div>
        <div class="stat carb"><div class="v">${num(total.c, 1)}</div><div class="k">carb (g)</div></div>
        <div class="stat gras"><div class="v">${num(total.f, 1)}</div><div class="k">gras (g)</div></div>
      </div>
    </div>

    <div class="disclaimer"><span>${icon('alert')}</span><span>Los valores son <b>estimaciones</b> (IA + tabla de referencia), no mediciones exactas.</span></div>

    <div class="hero-actions">
      <a class="btn btn-primary btn-lg btn-block" href="#/registrar?d=${date}">${icon('camera')} Registrar comida</a>
    </div>

    ${gymCard(gym, date, gymBonus, gy)}

    <div class="card">
      <div class="card-title"><h3>${icon('droplet')} Agua</h3><span class="badge">${waterG}/${waterGoal} vasos</span></div>
      <div class="water">
        <div class="water-glasses" id="glasses"></div>
        <div class="stack" style="flex:none">
          <button class="btn btn-sm" id="w-more" type="button">＋</button>
          <button class="btn btn-sm btn-ghost" id="w-less" type="button">−</button>
        </div>
      </div>
      <div class="tiny muted" style="margin-top:8px">${waterGoal} vasos = ${num(250 * waterGoal / 1000, 2)} L al día (1 vaso = 250 ml · ajustable en Ajustes).</div>
    </div>

    ${ordered.length ? ordered.map(g => `
      <div class="group-title">${icon(ICONO_TIPO[g.type])} ${g.type}</div>
      ${g.rows.map(mealCard).join('')}
    `).join('') : `
      <div class="empty">
        <span class="ico">${icon('utensils')}</span>
        <b>${meals.length ? '' : 'Aún no registras comidas este día'}</b>
        <p class="small muted">Toma una foto de tu plato, describe el menú o ingrésalo a mano.</p>
        <a class="btn btn-outline" href="#/registrar?d=${date}" style="display:inline-flex">Registrar ahora</a>
      </div>`}

    <div class="card tight">
      <div class="spread">
        <div class="tiny muted">${icon('calendar')} <a href="#/historial">Ver historial semanal y mensual</a></div>
        <div class="tiny muted">${meals.length} comida${meals.length === 1 ? '' : 's'}</div>
      </div>
    </div>
  `;

  root.querySelector('#d-prev').onclick = () => render(root, [addDays(date, -1)]);
  root.querySelector('#d-next').onclick = () => render(root, [addDays(date, 1)]);
  root.querySelector('.daynav .date').onclick = () => pickDate(date, d => render(root, [d]));

  // agua
  const gl = root.querySelector('#glasses');
  const drawGlasses = () => {
    gl.innerHTML = Array.from({ length: waterGoal }, (_, i) => `<div class="glass ${i < waterG ? 'full' : ''}"></div>`).join('');
  };
  drawGlasses();
  const setWater = async v => {
    v = Math.max(0, Math.min(30, v));
    if (v === 0) await DB.kvDel('water:' + date);
    else await DB.kvSet({ k: 'water:' + date, date, glasses: v });
    render(root, [date]);
  };
  root.querySelector('#w-more').onclick = () => setWater(waterG + 1);
  root.querySelector('#w-less').onclick = () => setWater(waterG - 1);
  gl.onclick = e => {
    const all = Array.from(gl.children);
    const idx = all.indexOf(e.target);
    if (idx >= 0) setWater(idx + 1 === waterG ? idx : idx + 1);
  };

  // acciones de comidas
  root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => location.hash = `#/editar/${b.dataset.edit}`);
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const ok = await confirmSheet({ title: '¿Eliminar esta comida?', msg: 'Se borrará del día seleccionado. No se puede deshacer (usa un respaldo si quieres seguridad).', okText: 'Eliminar', danger: true });
    if (!ok) return;
    await DB.del('meals', Number(b.dataset.del));
    toast('Comida eliminada.', 'ok');
    render(root, [date]);
  });
  root.querySelectorAll('[data-items]').forEach(b => b.onclick = () => {
    const meal = meals.find(m => String(m.id) === b.dataset.items);
    if (meal) showItems(meal);
  });
}

function etiquetasGym(reg) {
  const mus = (reg.musculos || []).map(v => (MUSCULOS.find(m => m.v === v) || {}).l || v);
  const car = (reg.cardio || []).filter(v => v !== 'ninguno').map(v => (CARDIO.find(c => c.v === v) || {}).l || v);
  return mus.concat(car);
}

function gymCard(gym, date, bonus, gy) {
  const hoy = todayISO();
  const racha = calcRacha(gy.regs, gy.plan, hoy);
  const cumple = racha.estaSemana >= racha.plan;
  const ignite = consumeIgnicion();        // la racha se acaba de encender: anima la llama
  const estado = gym && gym.ido ? 'si' : gym ? 'no' : null;
  const pills = etiquetasGym(gym || {}).map(l => `<span class="chip pill">${esc(l)}</span>`).join('');
  return `
  <div class="card gym-card">
    <div class="gym-head">
      <span class="gym-ico">${icon('dumbbell')}</span>
      <div class="gym-t"><h3>Gimnasio</h3><div class="tiny muted">${esc(fmtLongDate(date))}</div></div>
      ${estado === 'si' ? `<span class="badge ok">Sí fui${bonus ? ` · +${num(bonus)} kcal` : ''}</span>`
      : estado === 'no' ? `<span class="badge warn">No fui</span>`
      : `<span class="badge">Sin registrar</span>`}
    </div>
    <div class="gym-racha">
      <span class="flame${racha.dias ? '' : ' off'}${ignite ? ' ignite' : ''}">${icon('flame')}</span>
      <div class="gr-main">
        <b class="racha-line">Racha: ${racha.dias} ${racha.dias === 1 ? 'día' : 'días'}</b>
        <div class="tiny muted">${cumple ? 'Plan de esta semana cumplido ✓' : `Esta semana ${racha.estaSemana}/${racha.plan} · aún no pierdes la racha`}</div>
      </div>
      <a class="btn btn-sm btn-ghost" href="#/gym?d=${date}" aria-label="Ver racha y plan">›</a>
    </div>
    ${lampsHTML(gy.regs, hoy)}
    ${estado === 'si' ? `
      <div class="gym-stats">
        <div class="gs"><div class="gs-v">${fmtHoras(gym.horas)}<small> h</small></div><div class="gs-k">entreno</div></div>
        <div class="gs"><div class="gs-v">+${num(bonus)}</div><div class="gs-k">kcal a la meta</div></div>
        <div class="gs"><div class="gs-v">${(gym.musculos || []).length + (gym.cardio || []).filter(c => c !== 'ninguno').length}</div><div class="gs-k">trabajos</div></div>
      </div>
      ${pills ? `<div class="chips" style="margin-top:10px">${pills}</div>` : ''}`
    : estado === 'no'
      ? `<p class="small muted" style="margin:10px 0 0">Marcaste que <b>no fuiste</b> este día. Si entrenaste después, edítalo y la meta se ajusta solita.</p>`
      : `<p class="small muted" style="margin:10px 0 0">Aún no marcas este día: horas, músculos y cardio suman kcal a tu meta.</p>`}
    <a class="btn btn-sm btn-outline btn-block" style="margin-top:12px" href="#/gym?d=${date}">${estado ? 'Editar' : 'Registrar gym'}</a>
  </div>`;
}

function bar(key, label, val, goal, unit, dec) {
  const pct = goal > 0 ? Math.min(100, (val / goal) * 100) : 0;
  const over = goal > 0 && val > goal;
  const rest = goal > 0 ? (over ? `+${num(val - goal, dec)} ${unit} sobre la meta` : `faltan ${num(goal - val, dec)} ${unit}`) : 'sin meta';
  return `
    <div class="bar-item">
      <div class="bar-top"><b>${label}</b><span class="${over ? '' : 'rest'}" style="${over ? 'color:#ff9a9a' : ''}">${num(val, dec)} / ${goal ? num(goal, dec) + ' ' + unit : '—'}</span></div>
      <div class="track ${over ? 'over' : ''}"><div class="fill ${key}" style="width:${pct}%"></div></div>
      <div class="tiny muted" style="margin-top:3px">${rest}</div>
    </div>`;
}

function mealCard(m) {
  const t = computeTotals(m.items);
  return `
  <div class="meal">
    <div class="meal-head">
      ${m.photo ? `<img class="meal-thumb" src="${m.photo}" alt="">`
      : `<div class="meal-thumb empty">${icon(ICONO_TIPO[m.type] || 'utensils')}</div>`}
      <div class="meal-main" data-items="${m.id}" role="button" tabindex="0">
        <div class="t">${esc(m.name || 'Plato')}</div>
        <div class="s">${esc(m.type)} · ${m.items.length} ingrediente${m.items.length === 1 ? '' : 's'}${m.source === 'ia' ? ` · ${icon('sparkles')} IA` : ''}${m.favId ? ` · ${icon('star')}` : ''}</div>
      </div>
      <div class="meal-kcal">${num(t.kcal)}<small>kcal</small></div>
    </div>
    <div class="meal-macros">
      <span class="mtag">P <b>${num(t.protein)} g</b></span>
      <span class="mtag">C <b>${num(t.carbs)} g</b></span>
      <span class="mtag">G <b>${num(t.fat)} g</b></span>
      <span class="mtag">${num(t.grams)} g</span>
      ${m.note ? `<span class="mtag">${icon('note')} ${esc(m.note)}</span>` : ''}
    </div>
    <div class="meal-actions">
      <button type="button" data-items="${m.id}">Ver ingredientes</button>
      <button type="button" data-edit="${m.id}">Editar</button>
      <button type="button" class="del" data-del="${m.id}">Eliminar</button>
    </div>
  </div>`;
}

function showItems(meal) {
  const t = computeTotals(meal.items);
  openSheet(`
    <h2>${esc(meal.name || 'Plato')}</h2>
    <p class="small muted" style="text-transform:capitalize">${esc(meal.type)} · ${esc(meal.date)}${meal.note ? ' · ' + esc(meal.note) : ''}</p>
    <ul style="list-style:none;padding:0;margin:0">
      ${meal.items.map(it => {
    const mm = computeTotals([{ ...it, gramos: 100 }]);
    return `<li class="spread" style="padding:9px 0;border-bottom:1px solid var(--line)">
          <div><b>${esc(it.nombre)}</b><div class="tiny muted">${it.gramos} g → ${mm.kcal * it.gramos / 100 | 0} kcal</div></div>
          <div class="tiny mono muted">P ${Math.round(mm.protein * it.gramos / 100)} · C ${Math.round(mm.carbs * it.gramos / 100)} · G ${Math.round(mm.fat * it.gramos / 100)}</div>
        </li>`;
  }).join('')}
    </ul>
    <div class="statgrid" style="margin-top:14px">
      <div class="stat kcal"><div class="v">${num(t.kcal)}</div><div class="k">kcal</div></div>
      <div class="stat prot"><div class="v">${num(t.protein)}</div><div class="k">prot</div></div>
      <div class="stat carb"><div class="v">${num(t.carbs)}</div><div class="k">carb</div></div>
      <div class="stat gras"><div class="v">${num(t.fat)}</div><div class="k">gras</div></div>
    </div>
    ${meal.photo ? `<img class="photo-preview" style="margin-top:12px" src="${meal.photo}" alt="">` : ''}
    <button class="btn btn-block btn-ghost" type="button" onclick="this.closest('.sheet-back').remove()" style="margin-top:14px">Cerrar</button>
  `);
}

function pickDate(current, onPick) {
  const s = openSheet(`
    <h2>Ir a un día</h2>
    <label class="field"><span class="lbl">Fecha</span><input id="pd-i" type="date" value="${current}"></label>
    <div class="grid2">
      <button class="btn btn-primary" id="pd-ok" type="button">Ir</button>
      <button class="btn btn-ghost" id="pd-today" type="button">Hoy</button>
    </div>`);
  s.root.querySelector('#pd-ok').onclick = () => {
    const v = s.root.querySelector('#pd-i').value;
    s.close();
    if (v) onPick(v);
  };
  s.root.querySelector('#pd-today').onclick = () => { s.close(); onPick(todayISO()); };
}
