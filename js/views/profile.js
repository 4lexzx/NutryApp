/* Perfil, cálculo de metas y evolución de peso. */

import { DB, getProfile, saveProfile } from '../db.js';
import { icon } from '../icons.js';
import { calcTargets, bmr, tdee, ACTIVIDADES, OBJETIVOS, SEXOS } from '../nutrition.js';
import { lineChart } from '../charts.js';
import { todayISO, esc, num, toast, confirmSheet, openSheet, fmtShortDate, fromISODate, toISODate, uid, DIAS, pickFile, fileToDataURL, resizeImage } from '../util.js';
import { currentUser } from '../auth.js';
import { haySesion, uidNube, pedirAmistad, misAmistades, responderAmistad, quitarAmistad, bajarPerfiles } from '../cloud.js';
import { PLAN_RANGOS, PLAN_RANGO_DEF, rangoLabel } from './gym.js';

export async function render(root) {
  const p = (await getProfile()) || {
    weight: '', height: '', age: '', sex: 'hombre', activity: 1.55, objective: 'mantenimiento'
  };
  const conNube = haySesion();
  const gymRango = (p.gymDays && PLAN_RANGOS.indexOf(p.gymDays) >= 0) ? p.gymDays : PLAN_RANGO_DEF;
  const weights = (await DB.all('weights')).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const isNew = !(await getProfile());
  const t = (p.weight && p.height && p.age) ? calcTargets(p) : null;
  const manual = !!(p.targets && p.targets.kcal);
  const goal = manual ? p.targets : t;

  root.innerHTML = `
    <h1>Mi perfil</h1>

    <div class="card">
      <div class="card-title"><h3>${icon('user')} Perfil social</h3>
        <span class="badge ${conNube ? 'ok' : 'warn'}">${conNube ? 'en la nube' : 'solo local'}</span></div>
      <div class="soc-head">
        <div class="avatar">${p.foto ? `<img src="${p.foto}" alt="Foto de perfil">` : icon('user')}</div>
        <div style="flex:1;min-width:0">
          <b>${esc(currentUser() || '')}</b>
          <div class="hint" style="margin:3px 0 0">Este es tu usuario: así te encuentran tus amigos.</div>
          <div class="row" style="margin-top:8px;gap:8px">
            <button class="btn btn-sm btn-outline" id="p-photo" type="button">${icon('camera')} ${p.foto ? 'Cambiar foto' : 'Poner foto'}</button>
            ${p.foto ? '<button class="btn btn-sm btn-ghost" id="p-photo-del" type="button">Quitar</button>' : ''}
          </div>
        </div>
      </div>
      <label class="field"><span class="lbl">Bio (opcional, la ven tus amigos)</span>
        <textarea id="p-bio" maxlength="140" style="min-height:68px" placeholder="Ej. Entreno 4 veces por semana">${esc(p.bio || '')}</textarea></label>
      <button class="btn btn-primary btn-block" id="p-social" type="button">${icon('check')} Guardar perfil social</button>
      <div class="hint">La foto y la bio se guardan en tu cuenta y se suben solas con la sincronización.</div>
    </div>

    <div class="card">
      <div class="card-title"><h3>${icon('userCheck')} Amigos</h3>
        <span class="badge" id="am-badge" style="display:none">0</span></div>
      ${!conNube ? `<div class="note">Conecta la nube para tener amigos y ver cómo llevan su día. Tu usuario sería <b>${esc(currentUser() || '')}</b>.</div>` : `
      <div class="row" style="margin-bottom:6px">
        <input id="am-in" type="text" placeholder="Buscar amigo por usuario" autocapitalize="none" autocorrect="off" autocomplete="off">
        <button class="btn btn-primary" id="am-add" type="button" style="flex:none">${icon('plus')}</button>
      </div>
      <div id="am-req"></div>
      <div id="am-out"></div>
      <div id="am-list"></div>
      <p class="tiny muted" id="am-empty" style="display:none"></p>`}
    </div>

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
      <label class="field"><span class="lbl">Días de gimnasio por semana (tu plan de racha)</span>
        <select id="p-gym">${PLAN_RANGOS.map(r => `<option value="${r}" ${r === gymRango ? 'selected' : ''}>${rangoLabel(r)}${r === PLAN_RANGO_DEF ? ' (por defecto)' : ''}</option>`).join('')}</select></label>
      <div class="hint" style="margin:-8px 0 14px">Vale también en la vista Gimnasio (cambiás allá y se actualiza aquí, y al revés).
        Tu racha solo se pierde si una semana cierra por debajo del mínimo del rango: con “3-4 días” aguantas mientras hagas 3 o más.</div>
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

  // ---- perfil social: foto y bio ----
  const guardarSocial = async cambios => {
    const base = (await getProfile()) || {
      weight: '', height: '', age: '', sex: 'hombre', activity: 1.55, objective: 'mantenimiento'
    };
    await saveProfile(Object.assign(base, cambios));
  };

  const photoBtn = root.querySelector('#p-photo');
  if (photoBtn) photoBtn.onclick = async () => {
    const f = await pickFile('image/*');
    if (!f) return;
    try {
      const dUrl = await resizeImage(await fileToDataURL(f), 320, 0.82);
      await guardarSocial({ foto: dUrl });
      toast('Foto de perfil guardada.', 'ok');
      render(root);
    } catch (e) { toast('No pude cargar esa imagen.', 'warn'); }
  };
  const photoDel = root.querySelector('#p-photo-del');
  if (photoDel) photoDel.onclick = async () => {
    await guardarSocial({ foto: null });
    toast('Foto quitada.', 'ok');
    render(root);
  };
  const socialBtn = root.querySelector('#p-social');
  if (socialBtn) socialBtn.onclick = async () => {
    const bio = (root.querySelector('#p-bio').value || '').trim().slice(0, 140);
    await guardarSocial({ bio });
    toast('Perfil social guardado. Tus amigos ya lo ven.', 'ok');
    render(root);
  };

  // ---- amigos: solicitudes + el día de tus amigos ----
  if (conNube) cargarAmigos();

  async function cargarAmigos() {
    const badge = root.querySelector('#am-badge');
    if (!badge) return;
    const reqBox = root.querySelector('#am-req');
    const outBox = root.querySelector('#am-out');
    const listBox = root.querySelector('#am-list');
    const empty = root.querySelector('#am-empty');
    const me = uidNube();
    let amis = [], perfs = [];
    try {
      [amis, perfs] = await Promise.all([misAmistades(), bajarPerfiles()]);
    } catch (e) {
      empty.style.display = '';
      empty.textContent = 'No pude cargar amigos. Revisa tu conexión con la nube.';
      return;
    }
    const buscar = id => perfs.find(x => x.user_id === id) || null;
    const avatar = id => { const pf = buscar(id); return pf && pf.foto ? `<img src="${pf.foto}" alt="">` : icon('user'); };
    const nombre = id => { const pf = buscar(id); return (pf && pf.usuario) || 'amigo'; };

    const entrantes = amis.filter(a => a.estado === 'pendiente' && a.dos === me);
    const salientes = amis.filter(a => a.estado === 'pendiente' && a.uno === me);
    const aceptadas = amis.filter(a => a.estado === 'aceptada');

    badge.style.display = aceptadas.length ? '' : 'none';
    badge.className = 'badge ok';
    badge.textContent = String(aceptadas.length);

    reqBox.innerHTML = entrantes.length ? `<div class="divider"></div><b>Solicitudes recibidas</b>` + entrantes.map(a => `
      <div class="list-item am-item">
        <div class="avatar xs">${avatar(a.uno)}</div>
        <div class="li-main"><div class="li-t">${esc(nombre(a.uno))}</div>
          <div class="li-s">quiere ser tu amigo</div></div>
        <div class="li-end">
          <button class="btn btn-sm btn-primary" data-am-ok="${a.id}" type="button" title="Aceptar">${icon('check')}</button>
          <button class="btn btn-sm btn-ghost" data-am-no="${a.id}" type="button" title="Rechazar">${icon('x')}</button>
        </div>
      </div>`).join('') : '';

    outBox.innerHTML = salientes.length ? `<div class="divider"></div><b>Solicitudes enviadas</b>` + salientes.map(a => `
      <div class="list-item am-item">
        <div class="avatar xs">${avatar(a.dos)}</div>
        <div class="li-main"><div class="li-t">${esc(nombre(a.dos))}</div>
          <div class="li-s">esperando respuesta…</div></div>
        <div class="li-end"><button class="btn btn-sm btn-ghost" data-am-x="${a.id}" type="button" title="Cancelar">${icon('x')}</button></div>
      </div>`).join('') : '';

    const hoy = todayISO();
    listBox.innerHTML = aceptadas.length ? `<div class="divider"></div><b>Hoy</b>` + aceptadas.map(a => {
      const fid = a.uno === me ? a.dos : a.uno;
      const pf = buscar(fid) || {};
      const meta = Number(pf.meta_kcal) || 0;
      const kcal = Number(pf.kcal_hoy) || 0;
      const ok = !!pf.cumplio;
      const racha = Number(pf.racha) || 0;
      const viejo = !pf.actualizado || toISODate(new Date(pf.actualizado)) !== todayISO();
      const detalle = meta ? `${num(kcal)} / ${num(meta)} kcal` : `${num(kcal)} kcal`;
      const estado = ok ? 'meta ✓' : (meta ? Math.round(kcal / meta * 100) + '%' : num(kcal));
      return `
      <div class="list-item am-item" style="cursor:default">
        <div class="avatar sm">${avatar(fid)}</div>
        <div class="li-main">
          <div class="li-t">${esc(nombre(fid))}</div>
          <div class="li-s">${viejo ? 'aún sin datos de hoy' : detalle}${racha ? ' · ' + icon('flame') + ' ' + racha + (racha === 1 ? ' día' : ' días') : ''}</div>
          ${pf.bio ? `<div class="am-bio">${esc(pf.bio)}</div>` : ''}
        </div>
        <div class="li-end">${viejo ? '' : `<span class="badge ${ok ? 'ok' : 'warn'}">${estado}</span>`}</div>
      </div>`;
    }).join('') : '';

    const nada = !entrantes.length && !salientes.length && !aceptadas.length;
    empty.style.display = nada ? '' : 'none';
    if (nada) empty.textContent = 'Aún no tienes amigos. Busca arriba con su usuario (el nombre con el que entra a la app).';

    root.querySelectorAll('[data-am-ok]').forEach(b => b.onclick = async () => {
      try {
        await responderAmistad(Number(b.dataset.amOk), true);
        toast('Amistad aceptada.', 'ok');
      } catch (e) { toast('No pude aceptar. Revisa la nube.', 'warn'); }
      cargarAmigos();
    });
    root.querySelectorAll('[data-am-no]').forEach(b => b.onclick = async () => {
      try {
        await responderAmistad(Number(b.dataset.amNo), false);
        toast('Solicitud rechazada.', 'ok');
      } catch (e) { toast('No pude rechazar. Revisa la nube.', 'warn'); }
      cargarAmigos();
    });
    root.querySelectorAll('[data-am-x]').forEach(b => b.onclick = async () => {
      try {
        await quitarAmistad(Number(b.dataset.amX));
        toast('Solicitud cancelada.', 'ok');
      } catch (e) { toast('No pude cancelar. Revisa la nube.', 'warn'); }
      cargarAmigos();
    });
  }

  async function buscarAmigo() {
    const v = (root.querySelector('#am-in').value || '').trim().toLowerCase();
    if (!v) { toast('Escribe el usuario de tu amigo.', 'warn'); return; }
    let r;
    try {
      r = await pedirAmistad(v);
    } catch (e) { toast('No pude buscar. Revisa la nube.', 'warn'); return; }
    if (r.ok) {
      root.querySelector('#am-in').value = '';
      toast(`Solicitud enviada a ${r.usuario}.`, 'ok');
      cargarAmigos();
    } else {
      toast(r.msg, 'warn');
    }
  }
  const amAdd = root.querySelector('#am-add');
  if (amAdd) amAdd.onclick = buscarAmigo;
  const amIn = root.querySelector('#am-in');
  if (amIn) amIn.onkeydown = e => { if (e.key === 'Enter') buscarAmigo(); };

  // ---- guardar perfil ----
  root.querySelector('#p-save').onclick = async () => {
    const next = {
      weight: parseFloat(root.querySelector('#p-w').value) || 0,
      height: parseFloat(root.querySelector('#p-h').value) || 0,
      age: parseInt(root.querySelector('#p-a').value, 10) || 0,
      sex: root.querySelector('#p-s').value,
      activity: parseFloat(root.querySelector('#p-act').value),
      objective: root.querySelector('#p-obj').value,
      gymDays: root.querySelector('#p-gym').value
    };
    if (!next.weight || !next.height || !next.age) { toast('Completa peso, estatura y edad.', 'warn'); return; }
    next.targets = p.targets || null;
    await saveProfile(next);
    toast('Perfil guardado. Metas recalculadas.', 'ok');
    render(root);
  };

  // ---- plan de gym: se guarda apenas cambia (y Gimnasio lo lee igual) ----
  root.querySelector('#p-gym').onchange = async e => {
    const v = PLAN_RANGOS.indexOf(e.target.value) >= 0 ? e.target.value : PLAN_RANGO_DEF;
    const pr = (await getProfile()) || {};
    pr.gymDays = v;
    await saveProfile(pr);
    toast(`Plan de gym: ${rangoLabel(v)} por semana. Sincronizado con Gimnasio.`, 'ok');
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
