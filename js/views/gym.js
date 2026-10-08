/* Gimnasio del día: si fui, horas, músculos y cardio → suma kcal a la meta.
   Se guarda SIEMPRE el registro (también "No fui") para distinguirlo de
   "Sin registrar". Incluye el PLAN de días por semana y la RACHA (días
   seguidos cumpliendo el plan, verificada cada día) con lámparas por día. */

import { DB, getProfile } from '../db.js';
import { bonusGymKcal, detalleGym } from '../nutrition.js';
import { icon } from '../icons.js';
import { clic } from '../sound.js';
import { todayISO, esc, num, toast, fmtLongDate, dayLabel } from '../util.js';

export const MUSCULOS = [
  { v: 'pecho', l: 'Pecho' }, { v: 'espalda', l: 'Espalda' }, { v: 'hombros', l: 'Hombros' },
  { v: 'brazos', l: 'Brazos' }, { v: 'piernas', l: 'Piernas' }, { v: 'gluteos', l: 'Glúteos' },
  { v: 'abdomen', l: 'Abdomen' }, { v: 'completo', l: 'Cuerpo completo' }
];

export const CARDIO = [
  { v: 'ninguno', l: 'Sin cardio' }, { v: 'bicicleta', l: 'Bicicleta' }, { v: 'caminadora', l: 'Caminadora' },
  { v: 'cuerda', l: 'Saltar la cuerda' }, { v: 'eliptica', l: 'Elíptica' }, { v: 'remo', l: 'Remo' },
  { v: 'natacion', l: 'Natación' }, { v: 'otro', l: 'Otro' }
];

/** Horas sin decimales inútiles: 2 → "2", 1.5 → "1.5". */
export function fmtHoras(v) {
  const n = Number(v) || 0;
  return num(n, Math.abs(n - Math.round(n)) < 0.05 ? 0 : 1);
}

/* ================= plan, racha y lámparas ================= */

export const PLAN_DEF = 3;                  // días por semana por defecto

const DOS = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Lunes de la semana (lun-dom) de una fecha ISO. */
export const lunesDe = iso => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return DOS(d);
};

/** Registros de gym {fecha: reg} + plan semanal (kv 'gymPlan'). */
export async function cargarGym() {
  const rows = await DB.kvAll();
  const regs = {};
  let plan = PLAN_DEF;
  rows.forEach(r => {
    if (!r || typeof r.k !== 'string') return;
    if (r.k === 'gymPlan') plan = Math.max(1, Math.min(7, Number(r.n) || PLAN_DEF));
    else if (r.k.slice(0, 4) === 'gym:' && /^\d{4}-\d{2}-\d{2}$/.test(r.k.slice(4))) regs[r.k.slice(4)] = r;
  });
  return { regs, plan };
}

/**
 * Racha en DÍAS cumpliendo el plan, verificada cada día:
 * suma los días de gym de las semanas cerradas que cumplan el plan + los de la
 * semana en curso. La semana actual nunca la rompe (aún está en curso); solo
 * se pierde cuando una semana cierra POR DEBAJO del número del plan.
 * Así sigue contando día tras día, semana tras semana y mes a mes.
 */
export function calcRacha(regs, planN, hoy) {
  const plan = Math.max(1, Math.min(7, Number(planN) || PLAN_DEF));
  const cuenta = lunesISO => {
    const d = new Date(lunesISO + 'T12:00:00');
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const r = regs[DOS(d)];
      if (r && r.ido) n++;
      d.setDate(d.getDate() + 1);
    }
    return n;
  };
  const estaSemana = cuenta(lunesDe(hoy));
  let dias = estaSemana;
  const cur = new Date(lunesDe(hoy) + 'T12:00:00');
  for (let s = 0; s < 520; s++) {          // hasta 10 años hacia atrás
    cur.setDate(cur.getDate() - 7);
    const n = cuenta(DOS(cur));
    if (n >= plan) dias += n;
    else break;                            // semana cerrada bajo el plan: se pierde
  }
  return { dias, plan, estaSemana };
}

/** Lámparas de la semana actual (lun..dom): encendida si ese día hubo gym. */
export function lampsSemana(regs, hoy) {
  const d = new Date(lunesDe(hoy) + 'T12:00:00');
  const out = [];
  for (let i = 0; i < 7; i++) {
    const fecha = DOS(d);
    const r = regs[fecha];
    out.push({ fecha, dia: i, hoy: fecha === hoy, ido: !!(r && r.ido) });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** HTML de las 7 lámparas (L M X J V S D). */
export function lampsHTML(regs, hoy) {
  const L = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  return `<div class="lamps">${lampsSemana(regs, hoy).map(x =>
    `<span class="lamp${x.ido ? ' on' : ''}${x.hoy ? ' hoy' : ''}" title="${esc(x.fecha)}${x.ido ? ' · gym' : ''}"><i>${L[x.dia]}</i></span>`).join('')}</div>`;
}

/* ================= vista ================= */

export async function render(root, args, query) {
  let date = (query && query.d) || (args && args[0]) || todayISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = todayISO();

  const [gymAll, profile, reg] = await Promise.all([cargarGym(), getProfile(), DB.kvGet('gym:' + date, null)]);
  const regs = gymAll.regs;
  let plan = gymAll.plan;
  const peso = profile ? Number(profile.weight) || 0 : 0;

  const form = {
    ido: !!(reg && reg.ido),
    marcado: !!reg,                          // ya pasó por aquí (aunque haya dicho "No")
    horas: reg && reg.horas != null ? Number(reg.horas) : 1,
    musculos: (reg && reg.musculos || []).slice(),
    cardio: (reg && reg.cardio || []).slice()
  };

  const rachaHTML = () => {
    const r = calcRacha(regs, plan, todayISO());
    const cumple = r.estaSemana >= r.plan;
    return `
      <div class="card-title"><h3>${icon('flame')} Tu racha</h3>
        <span class="badge ${r.dias ? 'ok' : ''}">${r.dias} ${r.dias === 1 ? 'día' : 'días'}</span></div>
      <div class="gym-racha-big">
        <span class="flame${r.dias ? '' : ' off'}">${icon('flame')}</span>
        <div><div class="racha-n">${r.dias} <small>${r.dias === 1 ? 'día' : 'días'}</small></div>
        <div class="tiny muted">seguidos cumpliendo tu plan de gimnasio</div></div>
      </div>
      <div class="gym-sec">
        <div class="gym-sec-title"><span class="gym-num">★</span> Mi plan: cuántos días por semana</div>
        <div class="chips" id="gy-plan">
          ${[1, 2, 3, 4, 5, 6, 7].map(n => `<button type="button" class="chip ${n === plan ? 'active' : ''}" data-plan="${n}">${n} ${n === 1 ? 'día' : 'días'}</button>`).join('')}
        </div>
        <div class="hint">La racha se revisa <b>cada día</b>: no se pierde mientras sigas dentro de los días de tu plan (aguanta entre semanas y al cambiar de mes); <b>solo se pierde si una semana cierra por debajo de ese número</b>.</div>
      </div>
      <div class="gym-sec">
        <div class="gym-sec-title"><span class="gym-num">7</span> Esta semana: lámparas por día</div>
        ${lampsHTML(regs, todayISO())}
        <div class="plan-prog" style="margin-top:10px">
          <span class="badge ${cumple ? 'ok' : 'warn'}">${r.estaSemana} de ${r.plan} días${cumple ? ' ✓' : ''}</span>
          <span class="tiny muted">${cumple ? 'Plan de esta semana cumplido' : `Te faltan ${r.plan - r.estaSemana} sin perder la racha`}</span>
        </div>
      </div>`;
  };

  root.innerHTML = `
    <div class="spread" style="margin-bottom:12px">
      <div><h1>${icon('dumbbell')} Gimnasio</h1><div class="tiny muted">${esc(dayLabel(date))} · ${esc(fmtLongDate(date))}</div></div>
      <a class="btn btn-sm btn-ghost" href="#/hoy/${date}">Volver al día</a>
    </div>

    <div class="card racha-card" id="gy-racha">${rachaHTML()}</div>

    <div class="card">
      <div class="card-title"><h3>¿Fuiste al gimnasio este día?</h3>
        <span class="badge ${form.marcado ? (form.ido ? 'ok' : 'warn') : ''}" id="gy-estado">${form.marcado ? (form.ido ? 'Sí fui' : 'No fui') : 'Sin marcar'}</span></div>

      <div class="gym-pick" id="gy-ido">
        <button type="button" class="gym-opt ${form.ido ? 'active' : ''}" data-ido="si">
          <span class="go-ico">${icon('dumbbell')}</span>
          <b>Sí, fui</b>
          <small>Suma kcal a la meta de hoy</small>
        </button>
        <button type="button" class="gym-opt ${form.marcado && !form.ido ? 'active' : ''}" data-ido="no">
          <span class="go-ico">${icon('moon')}</span>
          <b>No hoy</b>
          <small>La meta sigue igual</small>
        </button>
      </div>

      <div id="gy-form" class="${form.ido ? '' : 'hidden'}" style="margin-top:16px">
        <div class="gym-sec">
          <div class="gym-sec-title"><span class="gym-num">1</span> ¿Cuántas horas entrenaste?</div>
          <div class="chips" id="gy-h-quick" style="margin-bottom:8px">
            ${[0.5, 1, 1.5, 2, 3].map(h => `<button type="button" class="chip ${form.horas === h ? 'active' : ''}" data-h="${h}">${fmtHoras(h)} h</button>`).join('')}
          </div>
          <label class="field"><span class="lbl">Horas (puedes escribirlas)</span>
            <input id="gy-h" type="number" inputmode="decimal" min="0.25" max="8" step="0.25" value="${form.horas}"></label>
        </div>

        <div class="gym-sec">
          <div class="gym-sec-title"><span class="gym-num">2</span> ¿Qué músculos trabajaste?</div>
          <div class="chips" id="gy-mus">
            ${MUSCULOS.map(m => `<button type="button" class="chip ${form.musculos.indexOf(m.v) >= 0 ? 'active' : ''}" data-mus="${m.v}">${esc(m.l)}</button>`).join('')}
          </div>
        </div>

        <div class="gym-sec">
          <div class="gym-sec-title"><span class="gym-num">3</span> ¿Hiciste cardio?</div>
          <div class="chips" id="gy-cardio">
            ${CARDIO.map(c => `<button type="button" class="chip ${c.v === 'ninguno' ? (form.cardio.length === 0 ? 'active' : '') : (form.cardio.indexOf(c.v) >= 0 ? 'active' : '')}" data-cardio="${c.v}">${esc(c.l)}</button>`).join('')}
          </div>
        </div>

        <div class="gym-bonus" id="gy-est"></div>
      </div>

      <button class="btn btn-primary btn-lg btn-block" id="gy-save" type="button" style="margin-top:14px">${icon('check')} Guardar gimnasio</button>
      <div class="hint" style="margin-top:8px">Si dices “No hoy” también se guarda el registro, así ves que marcaste el día.</div>
    </div>

    <div class="tiny muted">La meta de kcal de esos días sube ≈ <b>peso × horas × intensidad</b> (fuerza y cardio con valores MET). Sin peso en el perfil se estima a 250 kcal por hora.</div>
  `;

  const q = s => root.querySelector(s);
  const est = q('#gy-est');

  const updEst = () => {
    if (!form.ido) { est.classList.add('hidden'); return; }
    est.classList.remove('hidden');
    const reg2 = { ido: 1, horas: form.horas, musculos: form.musculos, cardio: form.cardio };
    const d = detalleGym(reg2, peso);
    est.innerHTML = d.kcal > 0
      ? `<div class="gb-big">+${num(d.kcal)} <small>kcal</small></div>
         <div class="gb-sub">suman a tu meta de hoy</div>
         <div class="gb-formula">${icon('calculator')} ${esc(d.formula)}</div>`
      : `<div class="gb-sub">Agrega horas para ver cuánto suma a tu meta.</div>`;
    est.classList.remove('gb-pop'); void est.offsetWidth; est.classList.add('gb-pop');
  };

  const updEstado = () => {
    const b = q('#gy-estado');
    b.textContent = form.marcado ? (form.ido ? 'Sí fui' : 'No fui') : 'Sin marcar';
    b.className = 'badge ' + (form.marcado ? (form.ido ? 'ok' : 'warn') : '');
  };

  const bindPlan = () => {
    const box = q('#gy-plan');
    if (!box) return;
    box.querySelectorAll('[data-plan]').forEach(b => b.onclick = async () => {
      plan = Math.max(1, Math.min(7, Number(b.dataset.plan) || PLAN_DEF));
      await DB.kvSet({ k: 'gymPlan', n: plan });
      clic();
      toast(`Plan: ${plan} ${plan === 1 ? 'día' : 'días'} por semana.`, 'ok');
      q('#gy-racha').innerHTML = rachaHTML();
      bindPlan();
    });
  };
  bindPlan();

  q('#gy-ido').querySelectorAll('[data-ido]').forEach(b => b.onclick = () => {
    form.ido = b.dataset.ido === 'si';
    form.marcado = true;
    q('#gy-ido').querySelectorAll('[data-ido]').forEach(x => x.classList.toggle('active', (x.dataset.ido === 'si') === form.ido));
    q('#gy-form').classList.toggle('hidden', !form.ido);
    updEstado();
    updEst();
  });

  const setHoras = v => {
    form.horas = Math.max(0.25, Math.min(8, Number(v) || 1));
    q('#gy-h').value = form.horas;
    q('#gy-h-quick').querySelectorAll('[data-h]').forEach(x => x.classList.toggle('active', Number(x.dataset.h) === form.horas));
    updEst();
  };
  q('#gy-h').oninput = e => { form.horas = Number(e.target.value); updEst(); };
  q('#gy-h').onchange = e => setHoras(e.target.value);
  q('#gy-h-quick').querySelectorAll('[data-h]').forEach(b => b.onclick = () => setHoras(b.dataset.h));

  q('#gy-mus').querySelectorAll('[data-mus]').forEach(b => b.onclick = () => {
    const v = b.dataset.mus;
    if (v === 'completo') form.musculos = form.musculos.indexOf('completo') >= 0 ? [] : ['completo'];
    else {
      if (form.musculos.indexOf('completo') >= 0) form.musculos = form.musculos.filter(x => x !== 'completo');
      form.musculos = form.musculos.indexOf(v) >= 0 ? form.musculos.filter(x => x !== v) : form.musculos.concat([v]);
    }
    q('#gy-mus').querySelectorAll('[data-mus]').forEach(x => x.classList.toggle('active', form.musculos.indexOf(x.dataset.mus) >= 0));
    updEst();
  });

  q('#gy-cardio').querySelectorAll('[data-cardio]').forEach(b => b.onclick = () => {
    const v = b.dataset.cardio;
    if (v === 'ninguno') form.cardio = [];
    else form.cardio = form.cardio.indexOf(v) >= 0 ? form.cardio.filter(x => x !== v) : form.cardio.concat([v]);
    q('#gy-cardio').querySelectorAll('[data-cardio]').forEach(x =>
      x.classList.toggle('active', x.dataset.cardio === 'ninguno' ? form.cardio.length === 0 : form.cardio.indexOf(x.dataset.cardio) >= 0));
    updEst();
  });

  q('#gy-save').onclick = async () => {
    // Se guarda SIEMPRE (también "No fui") para poder distinguirlo de "Sin registrar".
    await DB.kvSet({
      k: 'gym:' + date, date, ido: form.ido,
      horas: form.horas, musculos: form.musculos, cardio: form.cardio
    });
    if (form.ido) {
      const b = bonusGymKcal({ ido: 1, horas: form.horas, musculos: form.musculos, cardio: form.cardio }, peso);
      regs[date] = { ido: true, horas: form.horas, musculos: form.musculos, cardio: form.cardio };
      const r = calcRacha(regs, plan, todayISO());
      toast(b > 0 ? `Gimnasio guardado: +${num(b)} kcal · racha de ${r.dias} ${r.dias === 1 ? 'día' : 'días'}.` : 'Gimnasio guardado.', 'ok');
    } else {
      toast('Gimnasio guardado: hoy no fuiste. La meta sigue igual.', 'ok');
    }
    location.hash = '#/hoy/' + date;
  };

  updEstado();
  updEst();
}
