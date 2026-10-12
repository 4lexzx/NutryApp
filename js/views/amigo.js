/* Amigo: su perfil tal como él lo publicó — foto, bio, comidas de hoy,
   historial, agua y gimnasio. Si todavía no son amigos, se ve la vista
   previa pública (foto, bio y resumen de hoy) con el botón para pedir
   amistad o para aceptar la que él ya te mandó. */

import { icon } from '../icons.js';
import { esc, num, todayISO, fmtLongDate, fromISODate, toast, confirmSheet } from '../util.js';
import { barChart } from '../charts.js';
import {
  haySesion, uidNube, misAmistades, bajarPerfiles, bajarCompartido,
  quitarAmistad, pedirAmistad, responderAmistad, verPerfil
} from '../cloud.js';

// historial de la persona que se está mirando y a qué día se le está viendo
// (por defecto, hoy). Se guarda aquí para que no se pierda al repintar.
const _amView = new Map();   // idAmigo -> { dia }

export async function render(root, path) {
  const id = String((path && path[0]) || '');
  const volver = `<a class="btn btn-outline btn-block" href="#/social" style="margin-top:10px">${icon('chevronLeft')} Volver a Social</a>`;
  if (!haySesion() || !id) {
    root.innerHTML = `<h1>Amigo</h1><div class="note">${icon('upload')} Conecta la nube para ver perfiles de amigos.${volver}</div>`;
    return;
  }

  const me = uidNube();
  let amis = [], perfs = [], comps = [];
  try {
    [amis, perfs, comps] = await Promise.all([misAmistades(), bajarPerfiles(), bajarCompartido()]);
  } catch (e) {
    try {
      [amis, perfs] = await Promise.all([misAmistades(), bajarPerfiles()]);
    } catch (e2) {
      root.innerHTML = `<h1>Amigo</h1><div class="note danger">No pude cargar el perfil. Revisa tu conexión con la nube.${volver}</div>`;
      return;
    }
  }

  if (id === me) {
    root.innerHTML = `<h1>Perfil</h1><div class="note">${icon('user')} Ese eres tú. <a href="#/perfil">Abre tu perfil</a>.${volver}</div>`;
    return;
  }

  const fila = amis.find(a => (a.uno === me && a.dos === id) || (a.dos === me && a.uno === id)) || null;
  const esAmigo = !!(fila && fila.estado === 'aceptada');
  const esRecibida = !!(fila && fila.estado === 'pendiente' && fila.dos === me);
  const esEnviada = !!(fila && fila.estado === 'pendiente' && fila.uno === me);

  // si aún no son amigos, su ficha pública viene del RPC (migración v2.5)
  let pub = perfs.find(x => x.user_id === id) || null;
  if (!pub && !esAmigo) {
    try { pub = await verPerfil(id); } catch (e) { pub = null; }
  }
  if (!pub) pub = {};

  const cr = comps.find(x => x.user_id === id);
  const c = (cr && cr.contenido) || {};
  const visible = k => pub[k] !== false;   // por defecto todo público (perfiles viejos)
  const privado = !visible('pub_perfil') && !visible('pub_comidas') &&
    (!esAmigo || (!visible('pub_historial') && !visible('pub_agua') && !visible('pub_gym')));

  // día a la vista (por defecto hoy). Se guarda por amigo para no perderlo al repintar.
  const hoyISO = todayISO();
  const st = _amView.get(id) || { dia: hoyISO };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(st.dia)) st.dia = hoyISO;
  const diaSel = st.dia;
  _amView.set(id, st);

  // el "hoy" del contenido viene etiquetado con su día (c.dia); si es otro día
  // (pasó la medianoche y aún no se recalcula), no se pinta como "hoy" de hoy.
  const diaComp = c.dia || '';
  const esHoyReal = !diaComp || diaComp === hoyISO;

  const meta = Number(c.meta) || Number(pub.meta_kcal) || 0;
  const kcal = esHoyReal ? (Number(c.kcal) || Number(pub.kcal_hoy) || 0) : 0;
  const ok = esHoyReal && (c.cumplio !== undefined ? !!c.cumplio : !!pub.cumplio);
  const racha = Number(c.racha) || Number(pub.racha) || 0;
  const pct = meta ? Math.max(0, Math.min(100, Math.round(kcal / meta * 100))) : 0;
  const M = esHoyReal ? (c.macros || {}) : {};
  const MT = c.metas || {};
  const nombre = pub.usuario || 'amigo';
  const foto = visible('pub_perfil') && pub.foto ? `<img src="${pub.foto}" alt="">` : icon('user');
  const bio = visible('pub_perfil') && pub.bio ? `<p class="small" style="margin:8px 0 0">${esc(pub.bio)}</p>` : '';

  const comidas = (esHoyReal && esAmigo && visible('pub_comidas') && Array.isArray(c.comidas)) ? c.comidas : [];
  // entradas con la fecha ilegible (la clave 'f' salía pisada por la grasa en
  // versiones viejas de la nube) se ignoran para no pintar días "1/1"
  const historialCru = esAmigo && visible('pub_historial') && Array.isArray(c.historial) ? c.historial : [];
  const historial = historialCru.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(String(d && d.f)));
  const agua = esAmigo && visible('pub_agua') && c.agua ? c.agua : null;
  const gym = esAmigo && visible('pub_gym') && c.gym ? c.gym : null;

  // kcal/macros del día que se pidió ver (para el selector de historial)
  const diaEntry = historial.find(d => d.f === diaSel) || null;
  const esHoySel = diaSel === hoyISO;
  const kcalSel = esHoySel ? kcal : (diaEntry ? Number(diaEntry.k) || 0 : 0);
  const macroSel = esHoySel ? M : (diaEntry ? { p: Number(diaEntry.p) || 0, c: Number(diaEntry.c) || 0, f: Number(diaEntry.g) || 0 } : null);
  const nComidasSel = esHoySel ? comidas.length : (diaEntry ? Number(diaEntry.n) || 0 : 0);

  const estadoBadge = (esHoyReal && esAmigo && visible('pub_comidas') && meta)
    ? `<span class="badge ${ok ? 'ok' : 'warn'}">${ok ? 'meta ✓' : pct + '%'}</span>` : '';

  const resumenHoy = (esHoyReal && visible('pub_comidas') && (kcal || meta)) ? `
    <div class="soc-hoy">
      <div class="soc-hoy-v">${num(kcal)}<span> / ${num(meta || 0)} kcal</span></div>
      ${meta ? `<div class="am-prog ${ok ? 'ok' : ''}"><i style="width:${Math.min(100, pct)}%"></i></div>` : ''}
      <div class="tiny muted" style="margin-top:5px">${icon('clock')} ${esc(fmtLongDate(hoyISO))}</div>
    </div>` : '';

  const chips = (visible('pub_perfil') && (racha || (agua && agua.r) || (gym && gym.r))) ? `<div class="am-chips" style="margin-top:8px">${
    racha ? `<span class="am-chip">${icon('flame')} racha ${racha}</span>` : ''}${
    agua && agua.r ? `<span class="am-chip">${icon('droplet')} agua ${agua.r} días</span>` : ''}${
    gym && gym.r ? `<span class="am-chip">${icon('dumbbell')} gym ${gym.r} días</span>` : ''}</div>` : '';

  const accionAmistad = esAmigo
    ? `<button class="btn btn-danger btn-block" id="am-del" type="button" style="margin-top:12px">${icon('x')} Dejar de ser amigos</button>`
    : esRecibida ? `
      <div class="soc-act">
        <button class="btn btn-primary" id="am-yes" type="button">${icon('check')} Aceptar amistad</button>
        <button class="btn btn-outline" id="am-no" type="button">${icon('x')} Rechazar</button>
      </div>
      <p class="tiny muted" style="margin:8px 0 0">Te mandó una solicitud: si la aceptas, se verán el día del otro.</p>`
    : esEnviada ? `
      <div class="note" style="margin-top:12px">${icon('clock')} Solicitud enviada: esperando que ${esc(nombre)} la acepte.</div>
      <button class="btn btn-outline btn-block" id="am-cancel" type="button" style="margin-top:8px">${icon('x')} Cancelar solicitud</button>`
    : `
      <div class="soc-act" style="margin-top:12px">
        <button class="btn btn-primary" id="am-add" type="button">${icon('plus')} Añadir amigo</button>
      </div>
      <p class="tiny muted" style="margin:8px 0 0">${esc(nombre)} recibirá tu solicitud y podrá aceptarla desde su Social.</p>`;

  const seccComidas = (esAmigo && visible('pub_comidas')) ? `
    <div class="card">
      <div class="card-title"><h3>${icon('utensils')} Comidas de hoy</h3>${estadoBadge}</div>
      ${esHoyReal ? `
      <div class="macro-hero">
        <div class="big">${num(kcal)}</div><div class="lbl">kcal de ${num(meta || 0)} · ${esc(fmtLongDate(hoyISO))}</div>
      </div>
      ${meta ? `<div class="am-prog ${ok ? 'ok' : ''}" style="margin:10px 0 4px"><i style="width:${pct}%"></i></div>` : ''}
      ${(M.p != null || M.c != null || M.f != null) ? `
      <div class="am-macros" style="margin:10px 0 2px">
        ${macroTag('Proteína', M.p, MT.protein)}
        ${macroTag('Carbos', M.c, MT.carbs)}
        ${macroTag('Grasas', M.f, MT.fat)}
      </div>` : ''}
      ${comidas.length ? `<ul class="am-meals big">${comidas.map(m => `
        <li><span class="am-meal-h">${esc(m.h || '')}</span> <span class="am-meal-n">${esc(m.n || '')}</span> <b>${num(m.k || 0)} kcal</b></li>`).join('')}</ul>`
      : `<p class="tiny muted" style="margin-top:10px">Todavía no anotó comidas hoy.</p>`}
      ` : `<p class="tiny muted" style="margin-top:4px">Aún sin datos de hoy.</p>`}
    </div>` : '';

  const seccHistorial = (esAmigo && visible('pub_historial') && historial.length) ? `
    <div class="card">
      <div class="card-title"><h3>${icon('barChart')} Historial</h3>
        ${!esHoySel ? `<span class="badge">${esc(fmtLongDate(diaSel))}</span>` : ''}</div>
      ${!esHoySel ? `
      <div class="macro-hero" style="margin-bottom:6px">
        <div class="big">${num(kcalSel)}</div>
        <div class="lbl">kcal · ${esc(fmtLongDate(diaSel))}${nComidasSel ? ` · ${nComidasSel} comida${nComidasSel === 1 ? '' : 's'}` : ''}</div>
      </div>
      ${(macroSel && (macroSel.p != null || macroSel.c != null || macroSel.f != null)) ? `
      <div class="am-macros" style="margin:6px 0 2px">
        ${macroTag('Proteína', macroSel.p, MT.protein)}
        ${macroTag('Carbos', macroSel.c, MT.carbs)}
        ${macroTag('Grasas', macroSel.f, MT.fat)}
      </div>` : ''}` : ''}
      ${selectorDiaHTML(diaSel, historial, hoyISO)}
      <div class="chart-box"><canvas id="am-hist"></canvas></div>
    </div>` : '';

  const seccAgua = (esAmigo && visible('pub_agua') && agua) ? `
    <div class="card">
      <div class="card-title"><h3>${icon('droplet')} Agua</h3>
        ${Number(agua.r) ? `<span class="badge ok">${icon('flame')} ${agua.r} día${agua.r === 1 ? '' : 's'}</span>` : ''}</div>
      <div class="statgrid">
        <div class="stat"><div class="v">${num(agua.v || 0)} / ${num(agua.meta || 8)}</div><div class="k">vasos de hoy</div></div>
        <div class="stat"><div class="v">${num((agua.v || 0) * 250 / 1000, 2)} L</div><div class="k">hoy</div></div>
      </div>
    </div>` : '';

  const seccGym = (esAmigo && visible('pub_gym') && gym) ? `
    <div class="card">
      <div class="card-title"><h3>${icon('dumbbell')} Gimnasio</h3>
        ${Number(gym.r) ? `<span class="badge ok">${icon('flame')} ${gym.r} día${gym.r === 1 ? '' : 's'}</span>` : ''}</div>
      <div class="statgrid">
        <div class="stat"><div class="v">${gym.ido ? icon('check') + ' sí' : '—'}</div><div class="k">entrenó hoy</div></div>
        ${gym.dias ? `<div class="stat"><div class="v">${esc(String(gym.dias))}</div><div class="k">plan semanal</div></div>` : ''}
      </div>
    </div>` : '';

  root.innerHTML = `
    <h1>${esc(nombre)}</h1>

    <div class="card">
      <div class="soc-head">
        <div class="avatar">${foto}</div>
        <div style="flex:1;min-width:0">
          <b>${esc(nombre)}</b>
          ${bio}
          ${chips}
        </div>
      </div>
      ${resumenHoy}
      ${privado ? `<div class="note" style="margin-top:10px">${icon('lock')} ${esAmigo ? 'Este amigo tiene el perfil privado: no comparte nada.' : 'Este perfil es privado: solo se ve su usuario.'}</div>` : ''}
      ${!esAmigo && !privado ? `<div class="note" style="margin-top:10px">${icon('eye')} Vista previa pública: para ver comidas, historial y más, añádelo como amigo.</div>` : ''}
      ${accionAmistad}
    </div>

    ${seccComidas}${seccHistorial}${seccAgua}${seccGym}
    ${volver}
  `;

  if (historial.length > 1) {
    requestAnimationFrame(() => {
      const canvas = root.querySelector('#am-hist');
      if (!canvas) return;
      const orden = historial.slice().reverse();   // del más antiguo a hoy
      barChart(canvas, {
        values: orden.map(d => Number(d.k) || 0),
        labels: orden.map(d => { const f = fromISODate(d.f); return `${f.getDate()}/${f.getMonth() + 1}`; }),
        color: '#38bdf8', unit: ' kcal', goal: meta || null
      });
    });
  }

  // selector de día: permite ver el resumen (kcal/macros) de días pasados
  const sel = root.querySelector('#am-dia-sel');
  if (sel) sel.onchange = () => {
    const v = String(sel.value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    st.dia = v;
    render(root, [id]);
  };

  const del = root.querySelector('#am-del');
  if (del) del.onclick = async () => {
    const seguro = await confirmSheet({
      title: `¿Dejar de ser amigos con ${nombre}?`,
      msg: 'Dejarán de ver el día del otro. Cualquiera puede volver a pedir amistad.',
      okText: 'Eliminar', danger: true
    });
    if (!seguro) return;
    try {
      await quitarAmistad(fila.id);
      toast('Amistad eliminada.', 'ok');
      location.hash = '#/social';
    } catch (e) { toast('No pude eliminar. Revisa la nube.', 'warn'); }
  };

  const yes = root.querySelector('#am-yes');
  if (yes) yes.onclick = async () => {
    try {
      await responderAmistad(fila.id, true);
      toast(`Ahora ${nombre} es tu amigo.`, 'ok');
      render(root, [id]);
    } catch (e) { toast('No pude aceptar. Revisa la nube.', 'warn'); }
  };
  const no = root.querySelector('#am-no');
  if (no) no.onclick = async () => {
    try {
      await responderAmistad(fila.id, false);
      toast('Solicitud rechazada.', 'ok');
      location.hash = '#/social';
    } catch (e) { toast('No pude rechazar. Revisa la nube.', 'warn'); }
  };
  const cancel = root.querySelector('#am-cancel');
  if (cancel) cancel.onclick = async () => {
    try {
      await quitarAmistad(fila.id);
      toast('Solicitud cancelada.', 'ok');
      render(root, [id]);
    } catch (e) { toast('No pude cancelar. Revisa la nube.', 'warn'); }
  };
  const add = root.querySelector('#am-add');
  if (add) add.onclick = async () => {
    add.disabled = true;
    try {
      const r = await pedirAmistad(nombre);
      if (r.ok) {
        toast(`Solicitud enviada a ${r.usuario}.`, 'ok');
        render(root, [id]);
      } else {
        toast(r.msg, 'warn');
        add.disabled = false;
      }
    } catch (e) {
      toast('No pude enviar la solicitud. Revisa la nube.', 'warn');
      add.disabled = false;
    }
  };
}

/* Chip compacto de un macro: Proteína 80 / 120 g */
function macroTag(label, val, goal) {
  if (val == null) return '';
  const g = goal ? ` / ${num(goal)} g` : ' g';
  return `<span class="am-macro">${label} <b>${num(val)}${g}</b></span>`;
}

/* Selector de día para ver el historial de días pasados de un amigo.
   Muestra los días que traen datos, del más reciente al más viejo. */
function selectorDiaHTML(diaSel, historial, hoyISO) {
  const conDatos = historial.filter(d => Number(d.k) > 0 || Number(d.n) > 0);
  if (conDatos.length < 2) return '';   // sin días de sobra no hay nada que elegir
  // día de hoy primero, luego los demás (más recientes primero)
  const opts = [{ f: hoyISO, hoy: true }]
    .concat(conDatos.filter(d => d.f !== hoyISO))
    .sort((a, b) => String(b.f).localeCompare(String(a.f)));
  const items = opts.map(d => {
    const f = fromISODate(d.f);
    const etiqueta = d.f === hoyISO
      ? 'Hoy'
      : `${f.getDate()}/${f.getMonth() + 1}${d.f === diaSel ? ' ·' : ''}`;
    return `<option value="${esc(d.f)}"${d.f === diaSel ? ' selected' : ''}>${esc(etiqueta)}</option>`;
  }).join('');
  return `
    <label class="field" style="margin:0 0 10px">
      <select id="am-dia-sel" aria-label="Elegir día del historial">${items}</select>
    </label>`;
}
