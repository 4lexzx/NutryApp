/* Gimnasio del día: si fui, horas, músculos y cardio → suma kcal a la meta.
   Se guarda SIEMPRE el registro (también "No fui") para distinguirlo de
   "Sin registrar". El PLAN de días por semana vive en el PERFIL (rangos como
   "3-4 días", sincronizados con Perfil) y la RACHA (días seguidos cumpliendo
   el plan, verificada cada día) se enciende con sonido y animación. */

import { DB, getProfile, saveProfile } from '../db.js';
import { bonusGymKcal, detalleGym } from '../nutrition.js';
import { icon } from '../icons.js';
import { clic, fuego } from '../sound.js';
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

export const PLAN_DEF = 3;                  // mínimo del rango por defecto
export const PLAN_RANGO_DEF = '3-4';        // rango por defecto (está en el perfil)

/** Rangos de días por semana (el primero es el mínimo que exige la racha). */
export const PLAN_RANGOS = ['1-2', '2-3', '3-4', '4-5', '5-6', '6-7', '7'];

/** Mínimo del plan: '3-4' → 3, '7' → 7, número suelto 4 → 4, inválido → 3. */
export function planMin(plan) {
  const n = parseInt(String(plan == null ? '' : plan).trim(), 10);
  return Math.max(1, Math.min(7, isFinite(n) && n > 0 ? n : PLAN_DEF));
}

/** De un plan viejo (número suelto) al rango equivalente. */
export function rangoDe(n) {
  const min = planMin(n);
  return min >= 7 ? '7' : `${min}-${min + 1}`;
}

/** Etiqueta bonita de un rango: '3-4' → '3-4 días', '7' → '7 días'. */
export function rangoLabel(r) { return r === '7' ? '7 días' : `${r} días`; }

const DOS = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Lunes de la semana (lun-dom) de una fecha ISO. */
export const lunesDe = iso => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return DOS(d);
};

/**
 * Registros de gym {fecha: reg} + plan semanal.
 * El plan vive en el PERFIL (profile.gymDays, rango "3-4"); si venís del plan
 * viejo (kv 'gymPlan' con un número) se migra una sola vez al perfil.
 */
export async function cargarGym() {
  const [rows, profile] = await Promise.all([DB.kvAll(), getProfile()]);
  const regs = {};
  let viejo = 0;
  rows.forEach(r => {
    if (!r || typeof r.k !== 'string') return;
    if (r.k === 'gymPlan') viejo = Number(r.n) || 0;
    else if (r.k.slice(0, 4) === 'gym:' && /^\d{4}-\d{2}-\d{2}$/.test(r.k.slice(4))) regs[r.k.slice(4)] = r;
  });
  let plan = profile && profile.gymDays ? String(profile.gymDays) : '';
  if (plan && PLAN_RANGOS.indexOf(plan) < 0) plan = rangoDe(plan);
  if (!plan) plan = viejo ? rangoDe(viejo) : PLAN_RANGO_DEF;
  if (profile && profile.gymDays !== plan) await saveProfile(Object.assign({}, profile, { gymDays: plan }));
  if (viejo) await DB.kvDel('gymPlan');       // migrado al perfil
  return { regs, plan };
}

/**
 * Racha en DÍAS cumpliendo el plan, verificada cada día:
 * suma los días de gym de las semanas cerradas que cumplan el plan + los de la
 * semana en curso. La semana actual nunca la rompe (aún está en curso); solo
 * se pierde cuando una semana cierra POR DEBAJO del mínimo del rango del plan
 * (plan '3-4' → pierde solo si cierra con menos de 3). Acepta el rango
 * ('3-4') o el mínimo directo (3), como el plan viejo.
 */
export function calcRacha(regs, planN, hoy) {
  const plan = planMin(planN);
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

/* ===== Encendido de la racha: el guardado avisa y Hoy anima la llama ===== */
let proximaIgnicion = false;

/** Marca que la próxima tarjeta de Hoy debe encender la llama con animación. */
export function marcarIgnicion() { proximaIgnicion = true; }

/** La consume (una sola vez) quien muestre la tarjeta de racha. */
export function consumeIgnicion() {
  const v = proximaIgnicion;
  proximaIgnicion = false;
  return v;
}

/** Fuego a PANTALLA COMPLETA con sonido de fogata: llama gigante, resplandor
    y brasas; se cierra sola a los pocos segundos o al tocar en cualquier parte. */
export function mostrarFuego(dias) {
  fuego();
  const back = document.createElement('div');
  back.className = 'fire-back';
  back.id = 'fire-overlay';
  back.setAttribute('role', 'dialog');
  back.setAttribute('aria-modal', 'true');
  back.innerHTML = `
    <div class="fire-glow"></div>
    <div class="fire-stage">
      <span class="fire-big">${icon('flame')}</span>
      <div class="fire-embers">${'<i></i>'.repeat(10)}</div>
    </div>
    <div class="fire-txt">${dias > 1 ? `¡Racha de ${dias} días!` : '¡Racha encendida!'}</div>`;
  document.getElementById('modal-root').appendChild(back);
  const cerrar = () => back.remove();
  back.addEventListener('click', cerrar);
  setTimeout(cerrar, 2600);
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
          ${PLAN_RANGOS.map(r => `<button type="button" class="chip ${r === plan ? 'active' : ''}" data-plan="${r}">${rangoLabel(r)}</button>`).join('')}
        </div>
        <div class="hint">Se guarda en tu <b>perfil</b> (junto a Nivel de actividad) y vale en toda la app.
          La racha se revisa <b>cada día</b>: no se pierde mientras sigas dentro del rango de tu plan (aguanta entre semanas y al cambiar de mes);
          <b>solo se pierde si una semana cierra por debajo del mínimo</b> (con “3-4 días”, pierdes solo si cierras la semana con menos de 3).</div>
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
      plan = PLAN_RANGOS.indexOf(b.dataset.plan) >= 0 ? b.dataset.plan : PLAN_RANGO_DEF;
      const pr = (await getProfile()) || {};
      pr.gymDays = plan;
      await saveProfile(pr);                 // sincronizado con la vista de Perfil
      clic();
      toast(`Plan: ${rangoLabel(plan)} por semana (guardado en tu perfil).`, 'ok');
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
    const antes = calcRacha(regs, plan, todayISO());
    await DB.kvSet({
      k: 'gym:' + date, date, ido: form.ido,
      horas: form.horas, musculos: form.musculos, cardio: form.cardio
    });
    if (form.ido) {
      const b = bonusGymKcal({ ido: 1, horas: form.horas, musculos: form.musculos, cardio: form.cardio }, peso);
      regs[date] = { ido: true, horas: form.horas, musculos: form.musculos, cardio: form.cardio };
      const r = calcRacha(regs, plan, todayISO());
      if (r.dias > antes.dias) {
        mostrarFuego(r.dias);               // fuego a pantalla completa (sonido incluido)
        marcarIgnicion();                 // Hoy anima el encendido de la llama
        toast(antes.dias === 0
          ? `Gimnasio guardado${b > 0 ? `: +${num(b)} kcal` : ''} · ¡racha encendida con ${r.dias} ${r.dias === 1 ? 'día' : 'días'}!`
          : `Gimnasio guardado${b > 0 ? `: +${num(b)} kcal` : ''} · racha de ${r.dias} ${r.dias === 1 ? 'día' : 'días'}.`, 'ok');
      } else {
        toast(b > 0 ? `Gimnasio guardado: +${num(b)} kcal · racha de ${r.dias} ${r.dias === 1 ? 'día' : 'días'}.` : 'Gimnasio guardado.', 'ok');
      }
    } else {
      toast('Gimnasio guardado: hoy no fuiste. La meta sigue igual.', 'ok');
    }
    location.hash = '#/hoy/' + date;
  };

  updEstado();
  updEst();
}
