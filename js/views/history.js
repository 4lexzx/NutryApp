/* Historial: resumen semanal y mensual con gráficos de promedios. */

import { DB, getProfile } from '../db.js';
import { icon } from '../icons.js';
import { calcTargets, computeTotals } from '../nutrition.js';
import { barChart } from '../charts.js';
import {
  todayISO, addDays, startOfWeek, startOfMonth, endOfMonth, fromISODate, toISODate,
  esc, num, MESES, DIAS_CORTO, TIPOS_COMIDA, ICONO_TIPO, fmtShortDate, diffDays
} from '../util.js';

const state = { tab: 'semana', anchor: todayISO() };

export async function render(root, args, query) {
  if (query && query.tab) state.tab = query.tab;
  if (query && query.d) state.anchor = query.d;

  const [profile, allMeals] = await Promise.all([getProfile(), DB.all('meals')]);
  const targets = profile ? calcTargets(profile) : null;
  const goal = profile ? (profile.targets && profile.targets.kcal) || targets.kcal : 0;
  const goalP = profile ? (profile.targets && profile.targets.protein) || targets.protein : 0;
  const goalC = profile ? (profile.targets && profile.targets.carbs) || targets.carbs : 0;
  const goalF = profile ? (profile.targets && profile.targets.fat) || targets.fat : 0;

  const isWeek = state.tab === 'semana';
  const start = isWeek ? startOfWeek(state.anchor) : startOfMonth(state.anchor);
  const end = isWeek ? addDays(start, 6) : endOfMonth(state.anchor);
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

  const byDate = {};
  allMeals.forEach(m => { (byDate[m.date] = byDate[m.date] || []).push(m); });

  const stat = days.map(date => {
    const rows = byDate[date] || [];
    const t = rows.reduce((a, m) => {
      const x = computeTotals(m.items);
      a.kcal += x.kcal; a.p += x.protein; a.c += x.carbs; a.f += x.fat;
      return a;
    }, { kcal: 0, p: 0, c: 0, f: 0 });
    return { date, rows, ...t };
  });

  const withData = stat.filter(s => s.rows.length);
  const avg = key => withData.length ? Math.round(withData.reduce((a, s) => a + s[key], 0) / withData.length) : 0;
  const sums = withData.reduce((a, s) => ({ kcal: a.kcal + s.kcal, p: a.p + s.p, c: a.c + s.c, f: a.f + s.f }), { kcal: 0, p: 0, c: 0, f: 0 });

  const title = isWeek
    ? `${fmtShortDate(start)} → ${fmtShortDate(end)}`
    : `${MESES[fromISODate(state.anchor).getMonth()]} de ${fromISODate(state.anchor).getFullYear()}`;

  root.innerHTML = `
    <h1>Historial</h1>
    <div class="tabs">
      <button class="tab ${isWeek ? 'active' : ''}" data-tb="semana" type="button">${icon('calendar')} Semana</button>
      <button class="tab ${!isWeek ? 'active' : ''}" data-tb="mes" type="button">${icon('calendarDays')} Mes</button>
    </div>

    <div class="daynav">
      <button class="btn btn-ghost btn-sm" id="h-prev" type="button">‹</button>
      <div class="date"><div class="d1">${esc(title)}</div><div class="d2">${withData.length} día${withData.length === 1 ? '' : 's'} con comidas</div></div>
      <button class="btn btn-ghost btn-sm" id="h-next" type="button">›</button>
    </div>

    <div class="card">
      <div class="card-title"><h3>Promedios del período</h3><span class="badge">${withData.length}/${days.length} días</span></div>
      <div class="statgrid">
        <div class="stat kcal"><div class="v">${num(avg('kcal'))}</div><div class="k">kcal/día</div></div>
        <div class="stat prot"><div class="v">${num(avg('p'))}</div><div class="k">prot (g)</div></div>
        <div class="stat carb"><div class="v">${num(avg('c'))}</div><div class="k">carb (g)</div></div>
        <div class="stat gras"><div class="v">${num(avg('f'))}</div><div class="k">gras (g)</div></div>
      </div>
      <div class="chart-legend" style="margin-top:12px">
        <span><i style="background:#38bdf8"></i>kcal del día</span>
        ${goal ? `<span><i style="background:#f59e0b"></i>meta (${num(goal)})</span><span><i style="background:#22c55e"></i>promedio</span>` : ''}
      </div>
      <div class="chart-box"><canvas id="h-chart"></canvas></div>
      <div class="tiny muted">Promedio total del período: <b>${num(sums.kcal)} kcal</b> · ${num(sums.p)} g proteína · ${num(sums.c)} g carbos · ${num(sums.f)} g grasas</div>
    </div>

    <div class="disclaimer"><span>${icon('alert')}</span><span>Valores estimados. Comparar promedios tiene más sentido que fijarse en un solo día.</span></div>

    ${isWeek ? weekRows(stat, goal) : monthRows(stat)}
  `;

  root.querySelectorAll('[data-tb]').forEach(b => b.onclick = () => { state.tab = b.dataset.tb; render(root, args, {}); });
  root.querySelector('#h-prev').onclick = () => {
    state.anchor = isWeek ? addDays(state.anchor, -7) : toISODate(new Date(fromISODate(state.anchor).getFullYear(), fromISODate(state.anchor).getMonth() - 1, 1));
    render(root, args, {});
  };
  root.querySelector('#h-next').onclick = () => {
    state.anchor = isWeek ? addDays(state.anchor, 7) : toISODate(new Date(fromISODate(state.anchor).getFullYear(), fromISODate(state.anchor).getMonth() + 1, 1));
    render(root, args, {});
  };
  root.querySelectorAll('[data-day]').forEach(el => el.onclick = () => { location.hash = `#/hoy/${el.dataset.day}`; });

  const canvas = root.querySelector('#h-chart');
  if (canvas) {
    requestAnimationFrame(() => barChart(canvas, {
      values: stat.map(s => s.kcal),
      labels: stat.map(s => String(fromISODate(s.date).getDate())),
      goal: goal || null,
      avg: withData.length ? avg('kcal') : null,
      color: '#38bdf8',
      unit: ''
    }));
  }
}

function macroLine(s, goal, goalP, goalC, goalF) {
  const pct = goal ? Math.round(s.kcal / goal * 100) : 0;
  return `<span class="mtag">P ${num(s.p)}</span><span class="mtag">C ${num(s.c)}</span><span class="mtag">G ${num(s.f)}</span>
    ${goal ? `<span class="mtag" style="color:${pct > 110 ? '#ff9a9a' : 'inherit'}">${pct}%</span>` : ''}`;
}

function weekRows(stat, goal) {
  return `
    <div class="group-title">Días de la semana</div>
    ${stat.map(s => {
    const d = fromISODate(s.date);
    const has = s.rows.length > 0;
    const pct = goal ? Math.min(100, s.kcal / goal * 100) : 0;
    return `
      <div class="hrow ${has ? '' : 'empty-day'}" data-day="${s.date}">
        <div class="hd"><div class="d1">${DIAS_CORTO[d.getDay()]} ${d.getDate()}</div>
          <div class="d2">${has ? s.rows.length + ' comidas' : 'sin datos'}</div></div>
        <div class="hb">
          <div class="track" style="margin-bottom:6px"><div class="fill kcal" style="width:${pct}%"></div></div>
          <div class="row wrap" style="gap:5px">${has ? macroLine(s, goal) : '<span class="tiny muted">Toca para registrar</span>'}</div>
        </div>
        <div class="hk">${has ? num(s.kcal) : '—'}<small>${goal ? 'de ' + num(goal) : 'kcal'}</small></div>
      </div>`;
  }).join('')}`;
}

function monthRows(stat) {
  const withData = stat.filter(s => s.rows.length);
  return `
    <div class="group-title">Días con comidas</div>
    ${withData.length ? withData.slice().reverse().map(s => {
    const d = fromISODate(s.date);
    const tipo = s.rows.map(m => icon(ICONO_TIPO[m.type] || 'utensils')).join('');
    return `
      <div class="hrow" data-day="${s.date}">
        <div class="hd"><div class="d1">${DIAS_CORTO[d.getDay()]} ${d.getDate()}</div>
          <div class="d2">${s.rows.length} comidas ${tipo}</div></div>
        <div class="hb"><div class="row wrap" style="gap:5px">${macroLine(s, 0)}</div></div>
        <div class="hk">${num(s.kcal)}<small>kcal</small></div>
      </div>`;
  }).join('') : `<div class="empty"><span class="ico">${icon('barChart')}</span><b>Sin comidas en este mes</b>
      <p class="small muted">Registra tu primera comida para ver el resumen.</p>
      <a class="btn btn-outline" href="#/registrar" style="display:inline-flex">Registrar</a></div>`}`;
}
