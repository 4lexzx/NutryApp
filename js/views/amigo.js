/* Amigo: su perfil tal como él lo publicó — foto, bio, comidas de hoy,
   historial, agua y gimnasio. Cada sección se ve solo si él la dejó pública. */

import { icon } from '../icons.js';
import { esc, num, todayISO, fmtLongDate, fromISODate, toast, confirmSheet } from '../util.js';
import { barChart } from '../charts.js';
import { haySesion, uidNube, misAmistades, bajarPerfiles, bajarCompartido, quitarAmistad } from '../cloud.js';

export async function render(root, path) {
  const id = String((path && path[0]) || '');
  const volver = `<a class="btn btn-outline btn-block" href="#/social" style="margin-top:10px">${icon('chevronLeft')} Volver a Social</a>`;
  if (!haySesion() || !id) {
    root.innerHTML = `<h1>Amigo</h1><div class="note">${icon('upload')} Conecta la nube (Ajustes → Nube) para ver perfiles de amigos.${volver}</div>`;
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

  const amistad = amis.find(a => a.estado === 'aceptada' &&
    ((a.uno === me && a.dos === id) || (a.dos === me && a.uno === id)));
  if (!amistad) {
    root.innerHTML = `<h1>Amigo</h1><div class="note">${icon('lock')} Solo los amigos pueden ver este perfil.${volver}</div>`;
    return;
  }

  const pf = perfs.find(x => x.user_id === id) || {};
  const cr = comps.find(x => x.user_id === id);
  const c = (cr && cr.contenido) || {};
  const pub = k => pf[k] !== false;   // por defecto todo público (perfiles viejos)
  const privado = !pub('pub_perfil') && !pub('pub_comidas') && !pub('pub_historial') && !pub('pub_agua') && !pub('pub_gym');

  const meta = Number(c.meta) || Number(pf.meta_kcal) || 0;
  const kcal = Number(c.kcal) || Number(pf.kcal_hoy) || 0;
  const ok = c.cumplio !== undefined ? !!c.cumplio : !!pf.cumplio;
  const racha = Number(c.racha) || Number(pf.racha) || 0;
  const pct = meta ? Math.max(0, Math.min(100, Math.round(kcal / meta * 100))) : 0;
  const nombre = pf.usuario || 'amigo';
  const foto = pub('pub_perfil') && pf.foto ? `<img src="${pf.foto}" alt="">` : icon('user');
  const bio = pub('pub_perfil') && pf.bio ? `<p class="small" style="margin:8px 0 0">${esc(pf.bio)}</p>` : '';

  const comidas = pub('pub_comidas') && Array.isArray(c.comidas) ? c.comidas : [];
  const historial = pub('pub_historial') && Array.isArray(c.historial) ? c.historial : [];
  const agua = pub('pub_agua') && c.agua ? c.agua : null;
  const gym = pub('pub_gym') && c.gym ? c.gym : null;

  const estadoBadge = (pub('pub_comidas') && meta)
    ? `<span class="badge ${ok ? 'ok' : 'warn'}">${ok ? 'meta ✓' : pct + '%'}</span>` : '';

  const seccComidas = pub('pub_comidas') ? `
    <div class="card">
      <div class="card-title"><h3>${icon('utensils')} Comidas de hoy</h3>${estadoBadge}</div>
      <div class="macro-hero">
        <div class="big">${num(kcal)}</div><div class="lbl">kcal de ${num(meta || 0)} · ${esc(fmtLongDate(todayISO()))}</div>
      </div>
      ${meta ? `<div class="am-prog ${ok ? 'ok' : ''}" style="margin:10px 0 4px"><i style="width:${pct}%"></i></div>` : ''}
      ${comidas.length ? `<ul class="am-meals big">${comidas.map(m => `
        <li><span class="am-meal-h">${esc(m.h || '')}</span> <span class="am-meal-n">${esc(m.n || '')}</span> <b>${num(m.k || 0)} kcal</b></li>`).join('')}</ul>`
      : `<p class="tiny muted" style="margin-top:10px">Todavía no anotó comidas hoy.</p>`}
    </div>` : '';

  const seccHistorial = (pub('pub_historial') && historial.length) ? `
    <div class="card">
      <div class="card-title"><h3>${icon('barChart')} Historial (14 días)</h3></div>
      <div class="chart-box"><canvas id="am-hist"></canvas></div>
    </div>` : '';

  const seccAgua = (pub('pub_agua') && agua) ? `
    <div class="card">
      <div class="card-title"><h3>${icon('droplet')} Agua</h3>
        ${Number(agua.r) ? `<span class="badge ok">${icon('flame')} ${agua.r} día${agua.r === 1 ? '' : 's'}</span>` : ''}</div>
      <div class="statgrid">
        <div class="stat"><div class="v">${num(agua.v || 0)} / ${num(agua.meta || 8)}</div><div class="k">vasos de hoy</div></div>
        <div class="stat"><div class="v">${num((agua.v || 0) * 250 / 1000, 2)} L</div><div class="k">hoy</div></div>
      </div>
    </div>` : '';

  const seccGym = (pub('pub_gym') && gym) ? `
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
          ${racha && pub('pub_comidas') ? `<div class="am-chips" style="margin-top:6px"><span class="am-chip">${icon('flame')} racha ${racha}</span></div>` : ''}
        </div>
      </div>
      ${privado ? `<div class="note" style="margin-top:10px">${icon('lock')} Este amigo tiene el perfil privado: no comparte nada.</div>` : ''}
      <button class="btn btn-danger btn-block" id="am-del" type="button" style="margin-top:12px">${icon('x')} Dejar de ser amigos</button>
    </div>

    ${seccComidas}${seccHistorial}${seccAgua}${seccGym}
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

  const del = root.querySelector('#am-del');
  if (del) del.onclick = async () => {
    const ok2 = await confirmSheet({
      title: `¿Dejar de ser amigos con ${nombre}?`,
      msg: 'Dejarán de ver el día del otro. Cualquiera puede volver a pedir amistad.',
      okText: 'Eliminar', danger: true
    });
    if (!ok2) return;
    try {
      await quitarAmistad(amistad.id);
      toast('Amistad eliminada.', 'ok');
      location.hash = '#/social';
    } catch (e) { toast('No pude eliminar. Revisa la nube.', 'warn'); }
  };
}
