/* Social (pestaña): amigos — solicitudes, buscar por usuario y el día de
   tus amigos: kcal, meta, racha y bio (sus logros de hoy). */

import { icon } from '../icons.js';
import { esc, num, toast, todayISO, toISODate } from '../util.js';
import { haySesion, uidNube, pedirAmistad, misAmistades, responderAmistad, quitarAmistad, bajarPerfiles } from '../cloud.js';
import { currentUser } from '../auth.js';

export async function render(root) {
  const conNube = haySesion();
  root.innerHTML = `
    <h1>Social</h1>

    ${!conNube ? `
    <div class="note">${icon('upload')} Conecta la nube (Ajustes → Nube) para tener amigos y ver cómo van su día.</div>
    <div class="card">
      <div class="card-title"><h3>${icon('userCheck')} Amigos</h3></div>
      <div class="soc-head">
        <div class="avatar">${icon('user')}</div>
        <div style="flex:1;min-width:0">
          <b>${esc(currentUser() || '')}</b>
          <div class="hint" style="margin:3px 0 0">Este es tu usuario: con él te encuentran tus amigos cuando conectes la nube.</div>
        </div>
      </div>
    </div>` : `
    <div class="card">
      <div class="card-title"><h3>${icon('userCheck')} Amigos</h3>
        <span class="badge ok" id="am-badge" style="display:none">0</span></div>
      <div class="row" style="margin-bottom:6px">
        <input id="am-in" type="text" placeholder="Buscar amigo por usuario" autocapitalize="none" autocorrect="off" autocomplete="off">
        <button class="btn btn-primary" id="am-add" type="button" style="flex:none">${icon('plus')}</button>
      </div>
      <div id="am-req"></div>
      <div id="am-out"></div>
      <div id="am-list"></div>
      <p class="tiny muted" id="am-empty" style="display:none"></p>
      <div class="divider"></div>
      <div class="spread">
        <span class="tiny muted">Se actualiza solo mientras la nube esté conectada.</span>
        <button class="btn btn-sm btn-outline" id="am-refresh" type="button" style="flex:none">${icon('refresh')} Actualizar</button>
      </div>
    </div>`}
  `;

  actualizarBadgeNav();
  if (!conNube) return;

  cargarAmigos();

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
    pintarNav(entrantes.length);

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
    listBox.innerHTML = aceptadas.length ? `<div class="divider"></div><b>El día de tus amigos</b>` + aceptadas.map(a => {
      const fid = a.uno === me ? a.dos : a.uno;
      const pf = buscar(fid) || {};
      const meta = Number(pf.meta_kcal) || 0;
      const kcal = Number(pf.kcal_hoy) || 0;
      const ok = !!pf.cumplio;
      const racha = Number(pf.racha) || 0;
      const viejo = !pf.actualizado || toISODate(new Date(pf.actualizado)) !== hoy;
      const pct = meta ? Math.max(0, Math.min(100, Math.round(kcal / meta * 100))) : 0;
      const detalle = meta ? `${num(kcal)} / ${num(meta)} kcal` : `${num(kcal)} kcal`;
      const estado = ok ? 'meta ✓' : (meta ? pct + '%' : num(kcal));
      return `
      <div class="list-item am-item" style="cursor:default">
        <div class="avatar sm">${avatar(fid)}</div>
        <div class="li-main">
          <div class="li-t">${esc(nombre(fid))}</div>
          <div class="li-s">${viejo ? 'aún sin datos de hoy' : detalle}${racha ? ' · ' + icon('flame') + ' ' + racha + (racha === 1 ? ' día' : ' días') : ''}</div>
          ${!viejo && meta ? `<div class="am-prog ${ok ? 'ok' : ''}"><i style="width:${pct}%"></i></div>` : ''}
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
  const amRe = root.querySelector('#am-refresh');
  if (amRe) amRe.onclick = () => cargarAmigos();
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
