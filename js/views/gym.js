/* Gimnasio del día: si fui, horas, músculos y cardio → suma kcal a la meta.
   Se guarda SIEMPRE el registro (también "No fui") para distinguirlo de
   "Sin registrar". */

import { DB, getProfile } from '../db.js';
import { bonusGymKcal, detalleGym } from '../nutrition.js';
import { icon } from '../icons.js';
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

export async function render(root, args, query) {
  let date = (query && query.d) || (args && args[0]) || todayISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = todayISO();

  const [profile, reg] = await Promise.all([getProfile(), DB.kvGet('gym:' + date, null)]);
  const peso = profile ? Number(profile.weight) || 0 : 0;

  const form = {
    ido: !!(reg && reg.ido),
    marcado: !!reg,                          // ya pasó por aquí (aunque haya dicho "No")
    horas: reg && reg.horas != null ? Number(reg.horas) : 1,
    musculos: (reg && reg.musculos || []).slice(),
    cardio: (reg && reg.cardio || []).slice()
  };

  root.innerHTML = `
    <div class="spread" style="margin-bottom:12px">
      <div><h1>${icon('dumbbell')} Gimnasio</h1><div class="tiny muted">${esc(dayLabel(date))} · ${esc(fmtLongDate(date))}</div></div>
      <a class="btn btn-sm btn-ghost" href="#/hoy/${date}">Volver al día</a>
    </div>

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
  };

  const updEstado = () => {
    const b = q('#gy-estado');
    b.textContent = form.marcado ? (form.ido ? 'Sí fui' : 'No fui') : 'Sin marcar';
    b.className = 'badge ' + (form.marcado ? (form.ido ? 'ok' : 'warn') : '');
  };

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
      toast(b > 0 ? `Gimnasio guardado: +${num(b)} kcal a tu meta.` : 'Gimnasio guardado.', 'ok');
    } else {
      toast('Gimnasio guardado: hoy no fuiste. La meta sigue igual.', 'ok');
    }
    location.hash = '#/hoy/' + date;
  };

  updEstado();
  updEst();
}
