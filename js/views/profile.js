/* Perfil, cálculo de metas y evolución de peso. */

import { DB, getProfile, saveProfile } from '../db.js';
import { icon } from '../icons.js';
import { calcTargets, bmr, tdee, ACTIVIDADES, OBJETIVOS, SEXOS } from '../nutrition.js';
import { lineChart } from '../charts.js';
import { todayISO, esc, num, toast, confirmSheet, openSheet, fmtShortDate, fromISODate, toISODate, uid, DIAS } from '../util.js';

export async function render(root) {
  const p = (await getProfile()) || {
    weight: '', height: '', age: '', sex: 'hombre', activity: 1.55, objective: 'mantenimiento'
  };
  const weights = (await DB.all('weights')).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const isNew = !(await getProfile());
  const t = (p.weight && p.height && p.age) ? calcTargets(p) : null;
  const manual = !!(p.targets && p.targets.kcal);
  const goal = manual ? p.targets : t;

  root.innerHTML = `
    <h1>Mi perfil</h1>

    <div class="card">
      <div class="card-title"><h3>${icon('barChart')} Datos</h3>${isNew ? '<span class="badge warn">nuevo</span>' : ''}</div>
      <div class="grid2">
        <label class="field"><span class="lbl">Peso (kg)</span>
          <input id="p-w" type="number" inputmode="decimal" step="0.1" min="25" max="350" value="${esc(p.weight)}" placeholder="78.5"></label>
        <label class="field"><span class="lbl">Estatura (cm)</span>
          <input id="p-h" type="number" inputmode="numeric" step="1" min="100" max="230" value="${esc(p.height)}" placeholder="172"></label>
        <label class="field"><span class="lbl">Edad</span>
          <input id="p-a" type="number" inputmode="numeric" step="1" min="13" max="100" value="${esc(p.age)}" placeholder="28"></label>
        <label class="field"><span class="lbl">Sexo</span>
          <select id="p-s">${SEXOS.map(s => `<option value="${s.v}" ${p.sex === s.v ? 'selected' : ''}>${s.l}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span class="lbl">Nivel de actividad</span>
        <select id="p-act">${ACTIVIDADES.map(a => `<option value="${a.v}" ${String(p.activity) === String(a.v) ? 'selected' : ''}>${a.l} — ${a.d}</option>`).join('')}</select></label>
      <label class="field"><span class="lbl">Objetivo</span>
        <select id="p-obj">${OBJETIVOS.map(o => `<option value="${o.v}" ${p.objective === o.v ? 'selected' : ''}>${o.l}</option>`).join('')}</select></label>
      <button class="btn btn-primary btn-lg btn-block" id="p-save" type="button">${icon('calculator')} Calcular mis metas</button>
      <div class="hint">Las metas se pueden editar a mano después de calcularlas.</div>
    </div>

    ${t ? `
    <div class="card">
      <div class="card-title"><h3>${icon('target')} Mis metas diarias</h3>
        <span class="badge ${manual ? 'warn' : 'ok'}">${manual ? 'editadas a mano' : 'cálculo automático'}</span></div>
      <div class="macro-hero">
        <div class="big">${num(goal.kcal)}</div><div class="lbl">kcal por día</div>
      </div>
      <div class="statgrid" style="margin-top:12px">
        <div class="stat prot"><div class="v">${num(goal.protein)} g</div><div class="k">proteína</div></div>
        <div class="stat carb"><div class="v">${num(goal.carbs)} g</div><div class="k">carbos</div></div>
        <div class="stat gras"><div class="v">${num(goal.fat)} g</div><div class="k">grasas</div></div>
        <div class="stat"><div class="v">${num(t.tdee)}</div><div class="k">TDEE kcal</div></div>
      </div>

      <div class="divider"></div>
      <div class="spread" style="margin-bottom:8px">
        <b>Editar metas manualmente</b>
        <button class="btn btn-sm ${manual ? 'btn-ghost' : 'btn-outline'}" id="p-manual" type="button">${manual ? 'Volver al cálculo' : 'Editar'}</button>
      </div>
      <div id="p-edit" class="${manual ? '' : 'hidden'}">
        <div class="grid4">
          <label class="field"><span class="lbl">kcal</span><input id="m-k" type="number" inputmode="numeric" value="${goal.kcal}"></label>
          <label class="field"><span class="lbl">prot (g)</span><input id="m-p" type="number" inputmode="numeric" value="${goal.protein}"></label>
          <label class="field"><span class="lbl">carb (g)</span><input id="m-c" type="number" inputmode="numeric" value="${goal.carbs}"></label>
          <label class="field"><span class="lbl">gras (g)</span><input id="m-f" type="number" inputmode="numeric" value="${goal.fat}"></label>
        </div>
        <button class="btn btn-primary btn-block" id="m-save" type="button">Guardar metas</button>
      </div>

      <div class="divider"></div>
      <h3>¿Cómo se calcularon?</h3>
      <div class="formula">${t.explanation.map(l => `<div>${l}</div>`).join('')}</div>
      <p class="tiny muted" style="margin-top:8px">Referencias: Mifflin-St Jeor (gasto basal) y factores de actividad de la
      Academia de Nutrición y Dietética. Son <b>estimaciones</b>: ajusta según cómo evolucione tu peso.</p>
    </div>` : `
    <div class="note">Completa peso, estatura y edad para ver tu gasto calórico y tus metas de macros.</div>`}

    <div class="card">
      <div class="card-title"><h3>${icon('scale')} Evolución de peso</h3><span class="badge">${weights.length} registro${weights.length === 1 ? '' : 's'}</span></div>
      <div class="row" style="margin-bottom:12px">
        <input id="w-in" type="number" inputmode="decimal" step="0.1" min="25" max="350" placeholder="Peso de hoy (kg)" value="${esc(currentWeight(weights, p))}">
        <button class="btn btn-primary" id="w-add" type="button" style="flex:none">Registrar</button>
      </div>
      ${weights.length > 1 ? `<div class="chart-box"><canvas id="w-chart"></canvas></div>` : `<p class="tiny muted">Registra tu peso seguido (misma hora, en ayunas) para ver la tendencia.</p>`}
      ${weights.length ? `<div class="tiny muted" style="margin-bottom:8px">${weightSummary(weights)}</div>` : ''}
      <div id="w-list">
        ${weights.slice().reverse().slice(0, 10).map(w => `
          <button class="list-item" data-w="${w.id}" type="button">
            <div class="li-main"><div class="li-t">${num(w.kg, 1)} kg</div>
              <div class="li-s">${esc(fmtShortDate(w.date))}${w.note ? ' · ' + esc(w.note) : ''}</div></div>
            <div class="li-end">${icon('pencil')}</div>
          </button>`).join('')}
      </div>
      ${!weights.length ? '<p class="tiny muted">Aún no hay registros.</p>' : ''}
    </div>
  `;

  // ---- guardar perfil ----
  root.querySelector('#p-save').onclick = async () => {
    const next = {
      weight: parseFloat(root.querySelector('#p-w').value) || 0,
      height: parseFloat(root.querySelector('#p-h').value) || 0,
      age: parseInt(root.querySelector('#p-a').value, 10) || 0,
      sex: root.querySelector('#p-s').value,
      activity: parseFloat(root.querySelector('#p-act').value),
      objective: root.querySelector('#p-obj').value
    };
    if (!next.weight || !next.height || !next.age) { toast('Completa peso, estatura y edad.', 'warn'); return; }
    next.targets = p.targets || null;
    await saveProfile(next);
    toast('Perfil guardado. Metas recalculadas.', 'ok');
    render(root);
  };

  // ---- metas manuales ----
  const manualBtn = root.querySelector('#p-manual');
  if (manualBtn) manualBtn.onclick = async () => {
    if (manual) {
      const pr = await getProfile();
      pr.targets = null;
      await saveProfile(pr);
      toast('Volvimos al cálculo automático.', 'ok');
      render(root);
    } else {
      root.querySelector('#p-edit').classList.toggle('hidden');
    }
  };
  const mSave = root.querySelector('#m-save');
  if (mSave) mSave.onclick = async () => {
    const pr = await getProfile();
    pr.targets = {
      kcal: parseInt(root.querySelector('#m-k').value, 10) || 0,
      protein: parseInt(root.querySelector('#m-p').value, 10) || 0,
      carbs: parseInt(root.querySelector('#m-c').value, 10) || 0,
      fat: parseInt(root.querySelector('#m-f').value, 10) || 0
    };
    if (!pr.targets.kcal) { toast('La meta de kcal no puede ser 0.', 'warn'); return; }
    await saveProfile(pr);
    toast('Metas guardadas.', 'ok');
    render(root);
  };

  // ---- peso ----
  const addW = async () => {
    const v = parseFloat(root.querySelector('#w-in').value);
    if (!isFinite(v) || v < 25 || v > 350) { toast('Escribe un peso válido en kg.', 'warn'); return; }
    const date = todayISO();
    const existing = (await DB.byDate('weights', date))[0];
    if (existing) {
      await DB.put('weights', Object.assign(existing, { kg: v, updatedAt: Date.now() }));
      toast(`Peso de hoy actualizado: ${num(v, 1)} kg.`, 'ok');
    } else {
      await DB.add('weights', { id: uid(), date, kg: v, createdAt: Date.now() });
      toast(`Peso registrado: ${num(v, 1)} kg.`, 'ok');
    }
    const pr = await getProfile();
    if (pr) { pr.weight = v; await saveProfile(pr); }
    render(root);
  };
  root.querySelector('#w-add').onclick = addW;

  root.querySelectorAll('[data-w]').forEach(b => b.onclick = async () => {
    const w = await DB.get('weights', Number(b.dataset.w));
    if (!w) return;
    const s = openSheet(`
      <h2>${num(w.kg, 1)} kg</h2>
      <p class="small muted">${esc(fmtShortDate(w.date))}</p>
      <label class="field"><span class="lbl">Peso (kg)</span><input id="we-g" type="number" inputmode="decimal" step="0.1" value="${w.kg}"></label>
      <label class="field"><span class="lbl">Nota opcional</span><input id="we-n" type="text" value="${esc(w.note || '')}" placeholder="Ej. en ayunas"></label>
      <div class="col">
        <button class="btn btn-primary btn-block" id="we-ok" type="button">Guardar</button>
        <button class="btn btn-danger btn-block" id="we-del" type="button">Eliminar registro</button>
        <button class="btn btn-ghost btn-block" id="we-no" type="button">Cancelar</button>
      </div>`);
    s.root.querySelector('#we-no').onclick = s.close;
    s.root.querySelector('#we-ok').onclick = async () => {
      const g = parseFloat(s.root.querySelector('#we-g').value);
      if (!isFinite(g) || g < 25 || g > 350) { toast('Peso no válido.', 'warn'); return; }
      w.kg = g; w.note = s.root.querySelector('#we-n').value.slice(0, 60); w.updatedAt = Date.now();
      await DB.put('weights', w);
      const pr = await getProfile();
      if (pr && w.date === todayISO()) { pr.weight = g; await saveProfile(pr); }
      s.close(); toast('Peso actualizado.', 'ok'); render(root);
    };
    s.root.querySelector('#we-del').onclick = async () => {
      const ok = await confirmSheet({ title: '¿Eliminar este registro?', msg: 'No se puede deshacer.', okText: 'Eliminar', danger: true });
      if (!ok) return;
      await DB.del('weights', w.id);
      s.close(); render(root);
    };
  });

  if (weights.length > 1) {
    requestAnimationFrame(() => {
      const last = weights.slice(-14);
      const canvas = root.querySelector('#w-chart');
      if (canvas) lineChart(canvas, {
        values: last.map(w => Number(w.kg)),
        labels: last.map(w => { const d = fromISODate(w.date); return `${d.getDate()}/${d.getMonth() + 1}`; }),
        color: '#22c55e', unit: ''
      });
    });
  }
}

function currentWeight(weights, p) {
  if (weights.length) return weights[weights.length - 1].kg;
  return p.weight || '';
}

function weightSummary(weights) {
  if (weights.length < 2) return '';
  const first = weights[0].kg, last = weights[weights.length - 1].kg;
  const d = last - first;
  const span = Math.round((fromISODate(weights[weights.length - 1].date) - fromISODate(weights[0].date)) / 86400000);
  const sign = d > 0 ? '+' : '';
  return `Desde el primer registro (${num(first, 1)} kg) hasta hoy: <b>${sign}${num(d, 1)} kg</b> en ${span} día${span === 1 ? '' : 's'}.`;
}
