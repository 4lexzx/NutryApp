/* Social (pestaña): buscar amigos, solicitudes y el día de tus amigos.
   1) Buscar: escribes el usuario y ves su ficha pública (foto, bio, kcal
      de hoy y racha) con el botón Añadir amigo.
   2) Solicitudes: se ve de quién viene y para quién es (De: X → Para: tú),
      con botones de Ver perfil / Aceptar / Rechazar, y un botón con el
      contador de pendientes que te lleva hasta ahí.
   3) Amigos: comidas de hoy, kcal, macros, agua, gym y rachas de quien
      lo publica. Se actualiza solo, sin spinner ni parpadeo. */

import { icon } from '../icons.js';
import { esc, num, toast, todayISO, toISODate } from '../util.js';
import {
  haySesion, uidNube, pedirAmistad, misAmistades, responderAmistad,
  quitarAmistad, bajarPerfiles, bajarCompartido, buscarUsuarios, verPerfil
} from '../cloud.js';
import { currentUser } from '../auth.js';

let _hash = '';
let _pendAntes = -1;          // para avisar cuando llega una solicitud nueva
let _consulta = '';           // lo que se escribió en el buscador
let _res = null;              // resultados de la última búsqueda

export async function render(root) {
  const conNube = haySesion();
  root.innerHTML = `
    <h1>Social</h1>

    ${!conNube ? `
    <div class="note">${icon('upload')} Conecta la nube para tener amigos y ver cómo van su día.</div>
    <div class="card">
      <div class="card-title"><h3>${icon('userCheck')} Amigos</h3></div>
      <div class="soc-head">
        <div class="avatar">${icon('user')}</div>
        <div style="flex:1;min-width:0">
          <b>${esc(currentUser() || '')}</b>
          <div class="hint" style="margin:3px 0 0">Este es tu usuario: con él te encuentran tus amigos.</div>
        </div>
      </div>
    </div>` : `
    <div class="soc-top">
      <button class="btn soc-req" id="soc-req" type="button" hidden>
        ${icon('bell')} Solicitudes <span class="soc-req-n" id="soc-req-n">0</span>
      </button>
    </div>

    <div class="card">
      <div class="card-title"><h3>${icon('search')} Buscar amigos</h3></div>
      <p class="hint" style="margin:0 0 10px">Escribe el usuario con el que entra tu amigo a la app.</p>
      <div class="row">
        <input id="am-in" type="text" placeholder="usuario" autocapitalize="none" autocorrect="off" autocomplete="off">
        <button class="btn btn-primary" id="am-add" type="button" style="flex:none">${icon('search')}<span class="am-btn-txt">Buscar</span></button>
      </div>
      <div id="am-res"></div>
    </div>

    <div id="am-sec-req"></div>
    <div id="am-sec-ami"></div>

    <p class="tiny muted" id="am-empty" style="display:none"></p>
    `}
  `;

  actualizarBadgeNav();
  if (!conNube) return;

  // refresco silencioso cuando la nube trae cambios (sin spinner ni parpadeo)
  const onNube = () => { if (root.isConnected) cargarAmigos(true); };
  document.addEventListener('nutri-nube-actualizada', onNube);
  if (root) root.addEventListener('DOMNodeRemoved', () => {
    document.removeEventListener('nutri-nube-actualizada', onNube);
  });

  const amIn = root.querySelector('#am-in');
  if (amIn) amIn.value = _consulta;
  pintarResultados();

  cargarAmigos(false);

  /* Pinta solo si cambió el contenido (evita el parpadeo de repintar igual). */
  async function cargarAmigos(silencioso) {
    const secReq = root.querySelector('#am-sec-req');
    if (!secReq) return;
    const secAmi = root.querySelector('#am-sec-ami');
    const empty = root.querySelector('#am-empty');
    const btnReq = root.querySelector('#soc-req');
    const nReq = root.querySelector('#soc-req-n');
    const me = uidNube();
    let amis = [], perfs = [], comps = [];
    try {
      [amis, perfs, comps] = await Promise.all([misAmistades(), bajarPerfiles(), bajarCompartido()]);
    } catch (e) {
      try {
        [amis, perfs] = await Promise.all([misAmistades(), bajarPerfiles()]);
      } catch (e2) {
        if (!silencioso) {
          empty.style.display = '';
          empty.textContent = 'No pude cargar amigos. Revisa tu conexión con la nube.';
        }
        return;
      }
    }
    const compDe = id => { const r = comps.find(x => x.user_id === id); return (r && r.contenido) || null; };

    const entrantes = amis.filter(a => a.estado === 'pendiente' && a.dos === me);
    const salientes = amis.filter(a => a.estado === 'pendiente' && a.uno === me);
    const aceptadas = amis.filter(a => a.estado === 'aceptada');

    // hash del contenido: si no cambió, no repintamos (sin parpadeo)
    const hash = JSON.stringify([
      entrantes.map(a => [a.id, a.uno]),
      salientes.map(a => [a.id, a.dos]),
      aceptadas.map(a => [a.id, a.uno, a.dos]),
      perfs.map(p => [p.user_id, p.usuario, p.foto, p.bio, p.meta_kcal, p.kcal_hoy, p.racha, p.pub_perfil, p.pub_comidas, p.pub_agua, p.pub_gym, p.actualizado]),
      comps.map(c => [c.user_id, c.contenido && c.contenido.kcal, c.contenido && c.contenido.racha, c.contenido && JSON.stringify(c.contenido.macros)])
    ]);
    if (silencioso && hash === _hash) return;
    _hash = hash;

    // quién manda/recibe cada solicitud aún no es amigo, así que su perfil no
    // viene en `perfiles` (RLS): su nombre y foto salen del RPC ver_perfil
    const idsFaltan = [...new Set([...entrantes.map(a => a.uno), ...salientes.map(a => a.dos)])]
      .filter(id => id !== me && !perfs.some(p => p.user_id === id));
    let extra = [];
    if (idsFaltan.length) {
      extra = (await Promise.all(idsFaltan.map(id => verPerfil(id).catch(() => null)))).filter(Boolean);
    }
    const buscar = id => perfs.find(x => x.user_id === id) || extra.find(x => x.user_id === id) || null;
    const avatar = id => { const pf = buscar(id); return pf && pf.foto ? `<img src="${pf.foto}" alt="">` : icon('user'); };
    const nombre = id => { const pf = buscar(id); return (pf && pf.usuario) || 'amigo'; };

    // aviso: llegó una solicitud nueva mientras mirabas la app
    if (_pendAntes >= 0 && entrantes.length > _pendAntes && silencioso) {
      const ult = entrantes[entrantes.length - 1];
      toast(`Nueva solicitud de amistad de ${nombre(ult.uno)}.`, 'ok');
    }
    _pendAntes = entrantes.length;
    pintarNav(entrantes.length);

    // botón de pendientes (arriba) con el contador
    if (btnReq && nReq) {
      nReq.textContent = String(entrantes.length);
      btnReq.hidden = !entrantes.length;
    }

    /* ---- 2) Solicitudes ---- */
    secReq.innerHTML = (entrantes.length || salientes.length) ? `
    <div class="card soc-sec" id="soc-req-card">
      <div class="card-title">
        <h3>${icon('userCheck')} Solicitudes</h3>
        ${entrantes.length ? `<span class="badge warn">${entrantes.length} pendiente${entrantes.length === 1 ? '' : 's'}</span>` : ''}
      </div>

      ${entrantes.length ? `
      <div class="soc-sec-h">Recibidas · quién te la manda y quién la acepta (tú)</div>
      ${entrantes.map(a => {
        const fid = a.uno;
        return `
        <div class="list-item am-item">
          <div class="avatar xs">${avatar(fid)}</div>
          <div class="li-main">
            <div class="li-t">${esc(nombre(fid))}</div>
            <div class="am-flow">De: <b>${esc(nombre(fid))}</b> ${icon('arrowRight')} Para: <b>tú</b></div>
          </div>
          <div class="li-end">
            <button class="btn btn-sm btn-outline" data-ver="${esc(fid)}" type="button" title="Ver su perfil">${icon('eye')}</button>
            <button class="btn btn-sm btn-primary" data-am-ok="${a.id}" type="button" title="Aceptar">${icon('check')}</button>
            <button class="btn btn-sm btn-ghost" data-am-no="${a.id}" type="button" title="Rechazar">${icon('x')}</button>
          </div>
        </div>`;
      }).join('')}` : ''}

      ${entrantes.length && salientes.length ? '<div class="divider"></div>' : ''}

      ${salientes.length ? `
      <div class="soc-sec-h">Enviadas · a quién se la mandaste y quién la va a aceptar</div>
      ${salientes.map(a => {
        const fid = a.dos;
        return `
        <div class="list-item am-item">
          <div class="avatar xs">${avatar(fid)}</div>
          <div class="li-main">
            <div class="li-t">${esc(nombre(fid))}</div>
            <div class="am-flow">De: <b>tú</b> ${icon('arrowRight')} Para: <b>${esc(nombre(fid))}</b></div>
          </div>
          <div class="li-end">
            <button class="btn btn-sm btn-outline" data-ver="${esc(fid)}" type="button" title="Ver su perfil">${icon('eye')}</button>
            <button class="btn btn-sm btn-ghost" data-am-x="${a.id}" type="button" title="Cancelar">${icon('x')}</button>
          </div>
        </div>`;
      }).join('')}` : ''}
    </div>` : '';

    /* ---- 3) El día de tus amigos ---- */
    secAmi.innerHTML = `
    <div class="card soc-sec">
      <div class="card-title"><h3>${icon('heart')} Tus amigos</h3>
        ${aceptadas.length ? `<span class="badge ok">${aceptadas.length}</span>` : ''}</div>
      ${aceptadas.length ? `
      <div class="soc-sec-h">El día de hoy de quien comparte su información</div>
      ${aceptadas.map(a => fichaAmigo(a.uno === me ? a.dos : a.uno, buscar, compDe, avatar, nombre)).join('')}
      ` : `
      <p class="tiny muted" style="margin:4px 0 0">Todavía no tienes amigos. Busca arriba con su usuario y envíale una solicitud.</p>`}
    </div>`;

    const nada = !entrantes.length && !salientes.length && !aceptadas.length;
    empty.style.display = nada ? '' : 'none';
    if (nada) empty.textContent = 'Aún no tienes amigos.';

    /* ---- botones ---- */
    secReq.querySelectorAll('[data-am-ok]').forEach(b => b.onclick = async () => {
      try {
        await responderAmistad(Number(b.dataset.amOk), true);
        toast('Amistad aceptada.', 'ok');
      } catch (e) { toast('No pude aceptar. Revisa la nube.', 'warn'); }
      cargarAmigos(false);
    });
    secReq.querySelectorAll('[data-am-no]').forEach(b => b.onclick = async () => {
      try {
        await responderAmistad(Number(b.dataset.amNo), false);
        toast('Solicitud rechazada.', 'ok');
      } catch (e) { toast('No pude rechazar. Revisa la nube.', 'warn'); }
      cargarAmigos(false);
    });
    secReq.querySelectorAll('[data-am-x]').forEach(b => b.onclick = async () => {
      try {
        await quitarAmistad(Number(b.dataset.amX));
        toast('Solicitud cancelada.', 'ok');
      } catch (e) { toast('No pude cancelar. Revisa la nube.', 'warn'); }
      cargarAmigos(false);
    });
    secReq.querySelectorAll('[data-ver]').forEach(b => b.onclick = () => {
      location.hash = '#/amigo/' + b.dataset.ver;
    });
    root.querySelectorAll('[data-friend]').forEach(b => {
      const ir = () => { const fid = b.dataset.friend; if (fid) location.hash = '#/amigo/' + fid; };
      b.onclick = e => { if (e.target.closest('button')) return; ir(); };
      b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); } };
    });
    if (btnReq) btnReq.onclick = () => {
      const card = root.querySelector('#soc-req-card');
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      card.classList.add('soc-flash');
      setTimeout(() => card.classList.remove('soc-flash'), 1200);
    };
  }

  /* Tarjeta del "día de un amigo" (lista dentro de Social). */
  function fichaAmigo(fid, buscar, compDe, avatar, nombre) {
    const pf = buscar(fid) || {};
    const c = compDe(fid) || {};
    const pub = k => pf[k] !== false;   // por defecto todo público (perfiles viejos)
    const privado = !pub('pub_perfil') && !pub('pub_comidas') && !pub('pub_agua') && !pub('pub_gym');
    const M = c.macros || {};
    const MT = c.metas || {};
    const meta = Number(c.meta) || Number(pf.meta_kcal) || 0;
    const kcal = Number(c.kcal) || Number(pf.kcal_hoy) || 0;
    const ok = c.cumplio !== undefined ? !!c.cumplio : !!pf.cumplio;
    const racha = pub('pub_comidas') ? (Number(c.racha) || Number(pf.racha) || 0) : 0;
    const agua = pub('pub_agua') && c.agua ? Number(c.agua.r) || 0 : 0;
    const gym = pub('pub_gym') && c.gym ? Number(c.gym.r) || 0 : 0;
    const comidas = pub('pub_comidas') && Array.isArray(c.comidas) ? c.comidas : [];
    const viejo = !pf.actualizado || toISODate(new Date(pf.actualizado)) !== todayISO();
    const pct = meta ? Math.max(0, Math.min(100, Math.round(kcal / meta * 100))) : 0;
    const detalle = meta ? `${num(kcal)} / ${num(meta)} kcal` : `${num(kcal)} kcal`;
    const estado = ok ? 'meta ✓' : (meta ? pct + '%' : num(kcal));
    const bio = pub('pub_perfil') && pf.bio ? `<div class="am-bio">${esc(pf.bio)}</div>` : '';
    const rachas = (agua || gym || racha) ? `<div class="am-chips">${
      racha ? `<span class="am-chip">${icon('flame')} ${racha}</span>` : ''}${
      agua ? `<span class="am-chip">${icon('droplet')} ${agua}</span>` : ''}${
      gym ? `<span class="am-chip">${icon('dumbbell')} ${gym}</span>` : ''}</div>` : '';
    const comidaLista = comidas.length ? `<ul class="am-meals">${comidas.slice(0, 3).map(m => `
      <li><span class="am-meal-h">${esc(m.h || '')}</span> ${esc(m.n || '')} <b>${num(m.k || 0)} kcal</b></li>`).join('')}${comidas.length > 3 ? `<li class="am-meals-more">+ ${comidas.length - 3} más…</li>` : ''}</ul>` : '';
    const macrosHtml = (pub('pub_comidas') && !viejo && M && (M.p != null || M.c != null || M.f != null)) ? `
      <div class="am-macros">
        ${macroLinea('Proteína', M.p, MT.protein)}
        ${macroLinea('Carbos', M.c, MT.carbs)}
        ${macroLinea('Grasas', M.f, MT.fat)}
      </div>` : '';
    return `
    <div class="list-item am-item am-friend" data-friend="${esc(fid)}" role="button" tabindex="0" style="cursor:pointer">
      <div class="avatar sm">${avatar(fid)}</div>
      <div class="li-main">
        <div class="li-t">${esc(nombre(fid))} ${icon('chevronRight')}</div>
        ${bio}
        ${privado
          ? `<div class="li-s">${icon('lock')} perfil privado</div>`
          : `${pub('pub_comidas') && !viejo ? `<div class="li-s">${detalle}</div>` : `<div class="li-s">aún sin datos de hoy</div>`}
             ${!viejo && meta ? `<div class="am-prog ${ok ? 'ok' : ''}"><i style="width:${pct}%"></i></div>` : ''}
             ${macrosHtml}${comidaLista}${rachas}`}
      </div>
      <div class="li-end">${!privado && pub('pub_comidas') && !viejo ? `<span class="badge ${ok ? 'ok' : 'warn'}">${estado}</span>` : ''}</div>
    </div>`;
  }

  /* Línea compacta de un macro: Proteína 80 / 120 g */
  function macroLinea(label, val, goal) {
    if (val == null) return '';
    const g = goal ? ` / ${num(goal)} g` : ' g';
    return `<span class="am-macro">${label} <b>${num(val)}${g}</b></span>`;
  }

  /* ---- 1) Búsqueda: ficha pública + botón Añadir amigo ---- */
  function pintarResultados() {
    const box = root.querySelector('#am-res');
    if (!box) return;
    if (!_res) { box.innerHTML = ''; return; }
    if (_res.error) {
      box.innerHTML = `<div class="note" style="margin-top:10px">${icon('alert')} No pude buscar. Revisa tu conexión con la nube.</div>`;
      return;
    }
    if (!_res.lista.length) {
      box.innerHTML = `<div class="note" style="margin-top:10px">${icon('info')} No hay nadie con ese usuario todavía.</div>`;
      return;
    }
    const me = uidNube();
    box.innerHTML = `<div class="soc-sec-h" style="margin-top:12px">Resultado${_res.lista.length > 1 ? 's' : ''}</div>` +
      _res.lista.slice(0, 6).map(p => {
        const esYo = p.user_id === me;
        return `
        <div class="soc-hit">
          <div class="soc-hit-top">
            <div class="avatar sm">${p.foto ? `<img src="${p.foto}" alt="">` : icon('user')}</div>
            <div style="flex:1;min-width:0">
              <div class="li-t">${esc(p.usuario)}</div>
              ${p.bio ? `<div class="am-bio">${esc(p.bio)}</div>` : ''}
              ${p.racha ? `<div class="am-chips"><span class="am-chip">${icon('flame')} racha ${num(p.racha)}</span></div>` : ''}
            </div>
          </div>
          <div class="soc-hit-act">
            <button class="btn btn-sm btn-outline" data-ver-hit="${esc(p.user_id)}" type="button">${icon('eye')} Ver perfil</button>
            ${esYo ? `<span class="badge ok">Eres tú</span>`
              : `<button class="btn btn-sm btn-primary" data-add="${esc(p.usuario)}" type="button">${icon('plus')} Añadir amigo</button>`}
          </div>
        </div>`;
      }).join('');

    box.querySelectorAll('[data-ver-hit]').forEach(b => b.onclick = () => {
      location.hash = '#/amigo/' + b.dataset.verHit;
    });
    box.querySelectorAll('[data-add]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try {
        const r = await pedirAmistad(b.dataset.add);
        if (r.ok) {
          _res = null;
          toast(`Solicitud enviada a ${r.usuario}.`, 'ok');
        } else {
          toast(r.msg, 'warn');
          b.disabled = false;
        }
      } catch (e) {
        toast('No pude enviar la solicitud. Revisa la nube.', 'warn');
        b.disabled = false;
      }
      cargarAmigos(false);
    });
  }

  async function buscarAmigo() {
    const v = (root.querySelector('#am-in').value || '').trim().toLowerCase();
    if (v.length < 2) { toast('Escribe el usuario de tu amigo (2 letras o más).', 'warn'); return; }
    _consulta = v;
    _res = { cargando: true, lista: [] };
    pintarResultados();
    try {
      const lista = await buscarUsuarios(v);
      lista.sort((a, b) => {
        const ex = String(a.usuario).toLowerCase() === v ? -1 : 0;
        const ey = String(b.usuario).toLowerCase() === v ? -1 : 0;
        return ex - ey || String(a.usuario).localeCompare(String(b.usuario));
      });
      _res = { lista };
    } catch (e) {
      console.warn('buscar usuarios:', e);
      _res = { error: true, lista: [] };
    }
    pintarResultados();
  }
  const amAdd = root.querySelector('#am-add');
  if (amAdd) amAdd.onclick = buscarAmigo;
  if (amIn) amIn.onkeydown = e => { if (e.key === 'Enter') buscarAmigo(); };
}

/* Aviso (punto rojo) de solicitudes pendientes en la barra de navegación. */
function pintarNav(n) {
  try {
    const dot = document.getElementById('nav-soc-badge');
    if (!dot) return;
    dot.textContent = String(n || 0);
    dot.style.display = n ? '' : 'none';
  } catch (e) { /* nada */ }
}

export async function actualizarBadgeNav() {
  try {
    if (!haySesion()) { pintarNav(0); return; }
    const me = uidNube();
    const amis = await misAmistades();
    pintarNav(amis.filter(a => a.estado === 'pendiente' && a.dos === me).length);
  } catch (e) { /* sin nube no hay aviso */ }
}
