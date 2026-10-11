/* Ajustes: instalación, tema, IA, agua, respaldo y datos. */

import { DB, getSettings, saveSettings, getProfile, getPrompt, limpiarPlatosBase, listarPlatosBase, borrarPlatoBase } from '../db.js';
import { icon } from '../icons.js';
import { exportMealsCSV, exportWeightsCSV, exportBackup, importBackup, backupSummary, dataHelpHTML } from '../export.js';
import { testApiKey, modelOptions } from '../ai.js';
import { esc, toast, confirmSheet, pickFile, downloadFile, todayISO, openSheet } from '../util.js';
import { clearSession, currentUser } from '../auth.js';
import { nubeConfigurada } from '../config.js';
import { haySesion, emailSesion, emailNubeDe, pendientes } from '../cloud.js';
import { setSonidos, clic } from '../sound.js';
import { RECORDS_DEF, pedirPermiso, notificar, guardarRecordatorio, guardarHoraRecordatorio, encenderRecordatorios, cuerpoMacros, horaDe } from '../notif.js';

const VERSION = '2.1.9';
let hAct = null;   // oyente del evento "hay actualización" (uno solo, sin duplicar)

export async function render(root) {
  const s = await getSettings();
  const prof = await getProfile();
  const summary = await backupSummary();
  const promptSaved = !!(await getPrompt());
  const nBase = await DB.count('platos').catch(() => 0);
  const rem = (s.rem && typeof s.rem === 'object') ? s.rem : { on: false, ids: RECORDS_DEF.map(r => r.id) };
  const remIds = Array.isArray(rem.ids) ? rem.ids : [];
  const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  const remActivo = perm === 'granted' && rem.on === true;
  const remBadge = remActivo ? 'ok' : 'warn';
  const remBadgeTxt = remActivo ? 'encendidos' : (perm === 'denied' ? 'bloqueados' : 'apagados');
  const remEstado = remActivo
    ? 'Te avisaremos en las horas marcadas mientras la app esté abierta o en segundo plano. Android: con la app instalada el aviso sigue saliendo en segundo plano. iPhone: instálala en la pantalla de inicio (iOS 16.4+) y ábrela al menos una vez.'
    : perm === 'denied' ? 'El navegador bloqueó los avisos. Actívalos desde el candado/🔒 de la barra de direcciones (permisos del sitio) y vuelve aquí.'
    : perm === 'unsupported' ? 'Este navegador no permite notificaciones.'
    : 'Al activar, el navegador te pedirá permiso para mostrarte avisos.';
const nubeOk = nubeConfigurada();
const conNube = haySesion();
const nubeLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname);   // solo desarrollo
const cuentaOtra = conNube && !!currentUser() &&
  (emailSesion() || '').toLowerCase() !== emailNubeDe(currentUser());
  const nubePend = conNube ? await pendientes().catch(() => 0) : 0;

  root.innerHTML = `
    <h1>Ajustes</h1>

    <div class="card">
      <div class="card-title"><h3>${icon('smartphone')} Instalar en tu celular</h3></div>
      <p class="small muted">Esta es una PWA: se instala como una app normal, con ícono propio y pantalla completa,
        pero sin pasar por la Play Store.</p>
      <div class="col">
        <button class="btn btn-primary btn-block" id="s-install" type="button">${icon('download')} Instalar Nutri Gym</button>
        <div class="tiny muted" id="s-install-hint">Si no está disponible, abre esta página con <b>Chrome</b> → menú ⋮ →
          <b>“Instalar aplicación” / “Añadir a pantalla de inicio”</b>.</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title"><h3>${icon('sliders')} Apariencia</h3></div>
      <div class="row">
        <button class="btn btn-block ${s.theme === 'dark' ? 'btn-primary' : ''}" data-theme="dark" type="button">${icon('moon')} Oscuro</button>
        <button class="btn btn-block ${s.theme === 'light' ? 'btn-primary' : ''}" data-theme="light" type="button">${icon('sun')} Claro</button>
      </div>
      <div class="divider"></div>
      <b class="small">Sonidos al tocar los botones</b>
      <div class="tiny muted" style="margin:2px 0 8px">Un clic suave y bajito, como en las apps de Apple.</div>
      <div class="row">
        <button class="btn btn-block ${s.sounds !== false ? 'btn-primary' : ''}" data-snd="on" type="button">Encendido</button>
        <button class="btn btn-block ${s.sounds === false ? 'btn-primary' : ''}" data-snd="off" type="button">Apagado</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title"><h3>${icon('bot')} Inteligencia artificial</h3>
        <span class="badge ${s.apiKey ? 'ok' : 'warn'}">${s.apiKey ? 'key configurada' : 'sin key'}</span></div>
      <label class="field"><span class="lbl">Modelo</span>
        <select id="s-model">${modelOptions().map(m => `<option value="${m.v}" ${s.model === m.v ? 'selected' : ''}>${m.l}</option>`).join('')}</select></label>
      <label class="field"><span class="lbl">API key</span>
            <input id="s-key" type="password" autocomplete="off" spellcheck="false" placeholder="pega aquí tu clave de Google AI" value="${esc(s.apiKey || '')}"></label>
      <div class="row wrap">
        <button class="btn btn-sm" id="s-key-show" type="button">Ver</button>
        <button class="btn btn-sm btn-primary" id="s-key-save" type="button">Guardar</button>
        <button class="btn btn-sm btn-accent" id="s-key-test" type="button">Probar clave</button>
        <button class="btn btn-sm btn-ghost" id="s-key-del" type="button">Borrar</button>
      </div>
      <div id="s-key-res" class="hint"></div>
      <div class="divider"></div>
      <div class="spread">
        <div>
          <b class="small">Instrucciones de la IA</b>
          <div class="tiny muted">${promptSaved ? `${icon('check')} Prompt personalizado` : 'Usando el predeterminado (comida peruana)'}</div>
        </div>
        <a class="btn btn-sm btn-outline" href="#/ia">Editar</a>
      </div>
      <div class="divider"></div>
      <div class="spread">
        <div>
          <b class="small">Mis porciones estándar (base de platos)</b>
          <div class="tiny muted" id="s-base-count">${nBase === 0
            ? 'Sin porciones guardadas: los primeros análisis se repiten solo una vez'
            : `${nBase} porción${nBase === 1 ? '' : 'es'} guardada${nBase === 1 ? '' : 's'} · salen igual y sin gastar cuota`}</div>
        </div>
        <div class="row">
          <button class="btn btn-sm btn-outline" id="s-base-ver" type="button">Ver</button>
          <button class="btn btn-sm btn-ghost" id="s-base-clear" type="button" ${nBase ? '' : 'disabled'}>Borrar</button>
        </div>
      </div>
      <p class="tiny muted" style="margin-top:10px">Tu clave queda guardada en tu perfil de la nube: viaja contigo a
        otros dispositivos y solo tú puedes verla. Cada análisis la usa a través de /api/ai y la función la
        descarta al terminar.</p>
    </div>

    <div class="card">
      <div class="card-title"><h3>${icon('droplet')} Agua</h3></div>
      <label class="field"><span class="lbl">Vasos por día (1 vaso = 250 ml)</span>
        <input id="s-water" type="number" inputmode="numeric" min="0" max="30" value="${s.waterGoal}"></label>
      <button class="btn btn-sm btn-primary" id="s-water-save" type="button">Guardar meta de agua</button>
    </div>

    <div class="card">
      <div class="card-title"><h3>${icon('clock')} Recordatorios de comidas</h3>
        <span class="badge ${remBadge}" id="s-rem-badge">${remBadgeTxt}</span></div>
      <p class="small muted">Avisos para que no se te olvide anotar lo que comiste. Marca las comidas y
        ponles la hora que quieras: escríbela con el teclado o toca el reloj para elegirla. El aviso
        te muestra cuántas kcal y proteína llevas hoy.</p>
      <div class="rem-rows" id="s-rem-chips">
        ${RECORDS_DEF.map(r => `
        <div class="rem-row">
          <button type="button" class="chip ${remIds.indexOf(r.id) >= 0 ? 'active' : ''}" data-rem="${r.id}">${r.l}</button>
          <input type="text" inputmode="numeric" maxlength="5" class="rem-txt" data-remt="${r.id}"
            value="${horaDe({ rem }, r.id)}" aria-label="Hora del recordatorio de ${r.l} (escríbela o toca el reloj)">
          <button type="button" class="btn btn-sm btn-ghost rem-clock" data-remc="${r.id}"
            title="Elegir con el reloj" aria-label="Elegir la hora de ${r.l} con el reloj">${icon('clock')}</button>
          <input type="time" class="rem-picker" data-remh="${r.id}" value="${horaDe({ rem }, r.id)}" tabindex="-1" aria-hidden="true">
        </div>`).join('')}
      </div>
      <div class="col" style="margin-top:12px">
        <button class="btn ${remActivo ? '' : 'btn-primary'} ${remActivo ? 'btn-outline' : ''} btn-block" id="s-rem-on" type="button">
          ${remActivo ? 'Desactivar recordatorios' : 'Activar recordatorios'}</button>
        <button class="btn btn-block" id="s-rem-test" type="button">Probar aviso</button>
      </div>
      <div class="hint" id="s-rem-estado">${remEstado}</div>
    </div>

    <div class="card">
      <div class="card-title"><h3>${icon('save')} Datos y respaldo</h3></div>
      <div class="statgrid" style="margin-bottom:12px">
        <div class="stat"><div class="v">${summary.meals}</div><div class="k">comidas</div></div>
        <div class="stat"><div class="v">${summary.weights}</div><div class="k">pesos</div></div>
        <div class="stat"><div class="v">${summary.favorites}</div><div class="k">favoritos</div></div>
        <div class="stat"><div class="v">${prof ? icon('check') : '—'}</div><div class="k">perfil</div></div>
      </div>
      ${dataHelpHTML()}
      <div class="col">
        <button class="btn btn-primary btn-block" id="s-backup" type="button">${icon('download')} Descargar respaldo (.json)</button>
        <button class="btn btn-block" id="s-restore" type="button">${icon('upload')} Restaurar desde archivo</button>
        <div class="grid2">
          <button class="btn btn-sm" id="s-csv1" type="button">CSV comidas</button>
          <button class="btn btn-sm" id="s-csv2" type="button">CSV pesos</button>
        </div>
        <button class="btn btn-sm btn-ghost" id="s-csvall" type="button">${icon('file')} Exportar todo en un CSV maestro</button>
        <div class="divider"></div>
        <button class="btn btn-danger btn-block" id="s-clear" type="button">${icon('trash')} Borrar TODOS los datos</button>
      </div>
    </div>

    <div class="card" id="s-nube">
      <div class="card-title"><h3>${icon('upload')} Nube (respaldo en internet)</h3>
        <span class="badge ${!nubeOk ? 'warn' : conNube ? 'ok' : nubeLocal ? '' : 'warn'}" id="nb-badge">${!nubeOk ? 'sin configurar' : conNube ? 'conectada' : nubeLocal ? 'solo local' : 'conectando…'}</span></div>
      <p class="small muted">Tus datos se guardan <b>solos</b> en tu cuenta cada vez que haces un cambio, y se bajan
        en cualquier dispositivo donde entres. La nube entra <b>sola</b> al abrir la app y <b>nunca se cierra</b>:
        aquí no hay nada que tocar ni que configurar.</p>
      ${!nubeOk ? `
        <div class="note">${icon('alert')} La nube de esta instalación todavía no está configurada
          (falta la URL y la clave pública de Supabase en <b>js/config.js</b>).</div>` : `
        <div class="spread">
          <div>
            <b class="small" id="nb-email">${esc(emailSesion() || (nubeLocal ? 'desarrollo local' : 'conectando…'))}</b>
            ${cuentaOtra ? `<div class="tiny" style="color:var(--warn,#b45309);margin-top:3px">${icon('alert')}
              Este dispositivo usaría <b>${esc(emailNubeDe(currentUser()))}</b>.</div>` : ''}
            <div class="tiny muted" id="nb-estado">${conNube
              ? (nubePend ? `${nubePend} cambio${nubePend === 1 ? '' : 's'} pendiente${nubePend === 1 ? '' : 's'} por subir` : 'Todo sincronizado')
              : (nubeLocal ? 'En local (desarrollo) la nube se apaga para no tocar la real.' : 'Conectando la nube…')}</div>
          </div>
        </div>`}
      <div class="note" style="margin-top:10px">${icon('shield')} Si un día dejas de pagar Supabase (plan gratis se pausa
        tras 7 días sin uso), la app sigue funcionando en local; solo se apaga la sincronización.</div>
    </div>

    <div class="card">
      <div class="card-title"><h3>${icon('user')} Cuenta</h3></div>
      <div class="spread" style="margin-bottom:14px">
        <div class="row">
          <div>
            <b class="small">${esc(currentUser() || 'invitado')}</b>
            <div class="tiny muted">Sesión activa en este dispositivo</div>
          </div>
        </div>
      </div>
      <button class="btn btn-danger btn-block" id="s-logout" type="button">${icon('logout')} Cerrar sesión</button>
      <p class="tiny muted" style="margin-top:10px">Al cerrar sesión volverás a la pantalla de acceso.
        Tus comidas y ajustes <b>siguen guardados</b> en el teléfono.</p>
    </div>

    <div class="card">
      <div class="card-title"><h3><img class="acerca-logo" src="icons/icon-192-v3.png" alt=""> ${icon('info')} Acerca de</h3></div>
      <p class="small muted">Nutri Gym v${VERSION} · PWA con nube (Supabase) e IA con tu propia clave de Gemini.<br>
      Tus datos y tu perfil viven <b>en tu cuenta</b>: al iniciar sesión se suben y se bajan solos. El respaldo
      .json es opcional, por si un día quieres copia fuera de la nube.</p>
      <div class="col" style="margin:10px 0 4px">
        <button class="btn btn-primary btn-block" id="s-update" type="button" disabled>${icon('check')} Estás al día</button>
        <div class="hint" id="s-update-hint">Última versión instalada: v${VERSION}. Si sale una nueva, este botón se activa.</div>
      </div>
      <div class="note danger">${icon('lock')} Consejo: haz un <b>respaldo .json</b> al menos una vez por semana y guárdalo en
        Google Drive, tu PC o por correo. Si borras los datos del navegador, se pierde el historial.</div>
    </div>
  `;

  /* actualización de la app */
  const actBtn = root.querySelector('#s-update');
  const actHint = root.querySelector('#s-update-hint');
  const refrescAct = () => {
    const hay = !!window.__nutriAct;
    actBtn.disabled = !hay;
    actBtn.innerHTML = hay
      ? icon('refresh') + ' Actualizar ahora'
      : icon('check') + ' Estás al día';
    actHint.innerHTML = hay
      ? 'Hay una versión nueva. Al tocar, la app se recarga con lo último (también refresca el logo).'
      : `Última versión instalada: v${VERSION}. Si sale una nueva, este botón se activa.`;
  };
  refrescAct();
  if (hAct) document.removeEventListener('nutri-actualizacion', hAct);
  hAct = () => { if (document.contains(actBtn)) refrescAct(); };
  document.addEventListener('nutri-actualizacion', hAct);
  actBtn.onclick = async () => {
    if (actBtn.disabled) return;
    actBtn.disabled = true;
    actBtn.innerHTML = icon('refresh') + ' Actualizando…';
    if (window.__nutriAplicarAct) window.__nutriAplicarAct();
    else location.reload();
    // Si por lo que sea no llega el cambio, volvemos a dejar el botón usable.
    setTimeout(() => {
      if (document.contains(actBtn) && window.__nutriAct) refrescAct();
    }, 3500);
  };

  /* instalación */
  const instBtn = root.querySelector('#s-install');
  const instHint = root.querySelector('#s-install-hint');
  const refreshInstall = () => {
    const ip = window.__nutriInstall;
    if (ip && ip.canInstall) {
      instBtn.disabled = false;
      instHint.textContent = 'Toca el botón y confirma “Instalar”. La app quedará en tu pantalla de inicio.';
    } else if (window.matchMedia('(display-mode: standalone)').matches) {
      instBtn.disabled = true;
      instBtn.innerHTML = icon('check') + ' Ya está instalada';
    } else {
      instBtn.disabled = false;
    }
  };
  refreshInstall();
  instBtn.onclick = async () => {
    const ip = window.__nutriInstall;
    if (ip && ip.prompt) {
      ip.prompt();
      const choice = await ip.userChoice;
      if (choice && choice.outcome === 'accepted') toast('¡App instalada! Ya está en tu pantalla de inicio.', 'ok');
      window.__nutriInstall = null;
      refreshInstall();
    } else {
      toast('Abre esta página en Chrome y usa el menú ⋮ → “Instalar aplicación”.', 'warn');
    }
  };

  /* tema */
  root.querySelectorAll('[data-theme]').forEach(b => b.onclick = async () => {
    await saveSettings({ theme: b.dataset.theme });
    document.documentElement.dataset.theme = b.dataset.theme;
    document.querySelector('meta[name="theme-color"]').setAttribute('content', b.dataset.theme === 'dark' ? '#000000' : '#f2f2f7');
    toast('Tema cambiado.', 'ok');
    render(root);
  });

  /* sonidos */
  root.querySelectorAll('[data-snd]').forEach(b => b.onclick = async () => {
    const on = b.dataset.snd === 'on';
    await saveSettings({ sounds: on });
    setSonidos(on);
    if (on) clic();
    toast(on ? 'Sonidos encendidos.' : 'Sonidos apagados.', 'ok');
    render(root);
  });

  /* IA */
  const keyIn = root.querySelector('#s-key');
  root.querySelector('#s-key-show').onclick = e => {
    const show = keyIn.type === 'password';
    keyIn.type = show ? 'text' : 'password';
    e.target.textContent = show ? 'Ocultar' : 'Ver';
  };
  root.querySelector('#s-key-save').onclick = async () => {
    await saveSettings({ apiKey: keyIn.value.trim() });
    toast('API key guardada.', 'ok');
    render(root);
  };
  root.querySelector('#s-key-del').onclick = async () => {
    const ok = await confirmSheet({ title: '¿Borrar la API key?', msg: 'La IA dejará de funcionar hasta que pegues otra clave.', okText: 'Borrar', danger: true });
    if (!ok) return;
    await saveSettings({ apiKey: '' });
    toast('Clave borrada.', 'ok');
    render(root);
  };
  root.querySelector('#s-model').onchange = async e => { await saveSettings({ model: e.target.value }); toast('Modelo: ' + e.target.value, 'ok'); };
  /* ver mis porciones estándar (y poder revertir una guardada sin querer) */
  const baseVer = root.querySelector('#s-base-ver');
  if (baseVer) baseVer.onclick = async () => {
    const lista = await listarPlatosBase().catch(() => []);
    const filaHTML = p => {
      const g = Math.round((p.items || []).reduce((a, i) => a + (Number(i.gramos) || 0), 0));
      return `
      <div class="spread" style="padding:10px 0;border-top:1px solid rgba(128,128,128,.25)">
        <div>
          <b class="small">${esc(p.nombre || p.clave)}</b>
          <div class="tiny muted">${(p.items || []).length} ingrediente${(p.items || []).length === 1 ? '' : 's'} · ${g} g · ${p.fuente === 'usuario' ? 'tu porción' : 'analizada por IA'}</div>
        </div>
        <button class="btn btn-sm btn-ghost" data-del="${esc(p.clave)}" type="button">Quitar</button>
      </div>`;
    };
    const s = openSheet(`
      <h2>Mis porciones estándar</h2>
      <p class="small muted">Porciones que salen siempre igual cuando vuelves a escribir el plato.
        Si guardaste una sin querer, quítala aquí.</p>
      <div id="base-lista">
        ${lista.length ? lista.map(filaHTML).join('')
        : '<div class="empty" style="padding:16px">Todavía no guardas ninguna porción estándar.</div>'}
      </div>
      <button class="btn btn-block btn-ghost" id="base-cerrar" type="button" style="margin-top:14px">Cerrar</button>`);
    const refrescarContador = () => {
      const n = s.root.querySelectorAll('[data-del]').length;
      const cnt = root.querySelector('#s-base-count');
      if (cnt)       cnt.textContent = n === 0
        ? 'Sin porciones guardadas'
        : `${n} porción${n === 1 ? '' : 'es'} guardada${n === 1 ? '' : 's'} · salen igual siempre`;
      const clear = root.querySelector('#s-base-clear');
      if (clear) clear.disabled = n === 0;
      if (!n) {
        const vacio = s.root.querySelector('#base-lista');
        if (vacio && !vacio.querySelector('.empty')) vacio.innerHTML = '<div class="empty" style="padding:16px">Todavía no guardas ninguna porción estándar.</div>';
      }
    };
    s.root.querySelector('#base-cerrar').onclick = () => { s.close(); render(root); };
    s.root.querySelectorAll('[data-del]').forEach(btn => {
      btn.onclick = async () => {
        await borrarPlatoBase(btn.dataset.del).catch(() => {});
        const fila = btn.closest('.spread');
        if (fila) fila.remove();
        refrescarContador();
        toast('Porción estándar quitada.', 'ok');
      };
    });
  };

  root.querySelector('#s-base-clear').onclick = async () => {
    const ok = await confirmSheet({
      title: '¿Borrar la base de platos?',
      msg: 'Se olvidarán las porciones estándar guardadas. Tus comidas guardadas NO se tocan.',
      okText: 'Borrar', danger: true
    });
    if (!ok) return;
    await limpiarPlatosBase();
    toast('Base de platos borrada.', 'ok');
    render(root);
  };
  root.querySelector('#s-key-test').onclick = async e => {
    const btn = e.target, res = root.querySelector('#s-key-res');
    const key = keyIn.value.trim();
    await saveSettings({ apiKey: key });
    btn.disabled = true; btn.textContent = 'Probando…'; res.textContent = '';
    const r = await testApiKey(key, root.querySelector('#s-model').value);
    btn.disabled = false; btn.textContent = 'Probar clave';
    res.innerHTML = r.ok ? `<span style="color:var(--brand)">${icon('checkCircle')} ${esc(r.msg)}</span>` : `<span style="color:#ff9a9a">${icon('alert')} ${esc(r.msg)}</span>`;
  };

  /* nube (Supabase): SOLO lectura del estado — la nube se gestiona sola */
  window.__nutriNubeBadge = () => {
    const badge = root.querySelector('#nb-badge');
    const el = root.querySelector('#nb-estado');
    if ((!badge || !document.contains(badge)) && (!el || !document.contains(el))) return;
    if (!haySesion()) return;
    if (badge && badge.textContent !== 'conectada') {
      badge.textContent = 'conectada';
      badge.className = 'badge ok';
      const em = root.querySelector('#nb-email');
      if (em && !em.textContent.trim()) em.textContent = emailSesion();
    }
    pendientes().then(p => {
      if (el && document.contains(el)) {
        el.textContent = p ? `${p} cambio${p === 1 ? '' : 's'} pendiente${p === 1 ? '' : 's'} por subir` : 'Todo sincronizado';
      }
    }).catch(() => {});
  };

  /* agua */
  root.querySelector('#s-water-save').onclick = async () => {
    const v = Math.max(0, Math.min(30, parseInt(root.querySelector('#s-water').value, 10) || 0));
    await saveSettings({ waterGoal: v });
    toast(`Meta de agua: ${v} vasos.`, 'ok');
  };

  /* recordatorios */
  root.querySelectorAll('[data-rem]').forEach(b => b.onclick = async () => {
    const activo = !b.classList.contains('active');
    b.classList.toggle('active', activo);
    await guardarRecordatorio(b.dataset.rem, activo);
    const r = RECORDS_DEF.find(x => x.id === b.dataset.rem);
    toast(activo ? `${r.l}: recordatorio marcado.` : `${r.l}: recordatorio desmarcado.`, 'ok');
  });
  // hora de cada recordatorio: se escribe a mano o se elige con el reloj
  const guardaHora = async (id, valor, entrada) => {
    const ok = await guardarHoraRecordatorio(id, valor);
    if (!ok) {
      toast('Esa hora no es válida.', 'warn');
      if (entrada) entrada.value = horaDe({ rem }, id);
      return;
    }
    const r = RECORDS_DEF.find(x => x.id === id);
    toast(`${r.l}: te avisaré a las ${valor}.`, 'ok');
    root.querySelectorAll('[data-remt="' + id + '"]').forEach(i => { i.value = valor; });
    root.querySelectorAll('[data-remh="' + id + '"]').forEach(i => { i.value = valor; });
  };
  root.querySelectorAll('[data-remt]').forEach(inp => {
    inp.onchange = () => {
      const v = (inp.value || '').trim();
      const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(v);
      if (!m) {
        toast('Escribe la hora así: 08:00 o 13:30.', 'warn');
        inp.value = horaDe({ rem }, inp.dataset.remt);
        return;
      }
      const norm = String(m[1]).padStart(2, '0') + ':' + m[2];
      inp.value = norm;
      guardaHora(inp.dataset.remt, norm, inp);
    };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } };
  });
  root.querySelectorAll('[data-remc]').forEach(btn => btn.onclick = () => {
    const pick = root.querySelector('[data-remh="' + btn.dataset.remc + '"]');
    if (!pick) return;
    try { pick.showPicker(); } catch (e) { pick.focus(); pick.click(); }
  });
  root.querySelectorAll('[data-remh]').forEach(inp => inp.onchange = () => {
    if (inp.value) guardaHora(inp.dataset.remh, inp.value, null);
  });
  root.querySelector('#s-rem-on').onclick = async () => {
    if (remActivo) {
      await encenderRecordatorios(false);
      toast('Recordatorios apagados.', 'ok');
      render(root);
      return;
    }
    const r = await pedirPermiso();
    if (r === 'granted') {
      await encenderRecordatorios(true);
      toast('¡Recordatorios encendidos!', 'ok');
    } else if (r === 'denied') {
      toast('El navegador bloqueó los avisos: actívalos en los permisos del sitio.', 'warn');
    } else {
      toast('Este navegador no permite notificaciones.', 'warn');
    }
    render(root);
  };
  root.querySelector('#s-rem-test').onclick = async () => {
    let r = ('Notification' in window) ? Notification.permission : null;
    if (r !== 'granted') r = await pedirPermiso();
    if (r === 'granted') {
      const cuerpo = await cuerpoMacros();
      const ok = await notificar('NutriGym', cuerpo);
      if (ok) toast('Aviso enviado: míralo en la barra de notificaciones.', 'ok');
      render(root);
    } else {
      toast('Sin permiso de avisos todavía.', 'warn');
    }
  };

  /* datos */
  root.querySelector('#s-logout').onclick = async () => {
    const ok = await confirmSheet({
      title: '¿Cerrar sesión?',
      msg: 'Volverás a la pantalla de acceso. Tus datos quedan guardados en este dispositivo.',
      okText: 'Cerrar sesión'
    });
    if (!ok) return;
    clearSession();
    location.hash = '#/hoy';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    toast('Sesión cerrada.', 'ok');
  };
  root.querySelector('#s-backup').onclick = async () => {
    try { await exportBackup(); toast('Respaldo descargado. Guárdalo en un lugar seguro.', 'ok'); }
    catch (e) { toast('No se pudo generar el respaldo: ' + e.message, 'err'); }
  };
  root.querySelector('#s-restore').onclick = async () => {
    const f = await pickFile('application/json,.json');
    if (!f) return;
    const ok = await confirmSheet({
      title: '¿Restaurar este respaldo?',
      msg: 'Se reemplazarán TODOS los datos actuales por los del archivo. Te recomiendo descargar primero un respaldo.',
      okText: 'Restaurar', danger: true
    });
    if (!ok) return;
    try {
      const r = await importBackup(f);
      toast(`Restaurado: ${r.meals} comidas, ${r.weights} pesos.`, 'ok');
      render(root);
    } catch (e) { toast('Error al restaurar: ' + e.message, 'err'); }
  };
  root.querySelector('#s-csv1').onclick = async () => { const n = await exportMealsCSV(); toast(`CSV de ${n} comidas descargado.`, 'ok'); };
  root.querySelector('#s-csv2').onclick = async () => { const n = await exportWeightsCSV(); toast(`CSV de ${n} pesos descargado.`, 'ok'); };
  root.querySelector('#s-csvall').onclick = async () => {
    try {
      const data = await DB.exportAll();
      const rows = [['seccion', 'campo1', 'campo2', 'campo3', 'campo4', 'campo5']];
      (data.kv || []).forEach(k => rows.push(['ajustes/perfil', k.k, JSON.stringify(k).slice(0, 300), '', '', '']));
      (data.meals || []).forEach(m => rows.push(['comidas', m.date, m.type, m.name, m.items.length, JSON.stringify(m.totals || {})]));
      (data.weights || []).forEach(w => rows.push(['pesos', w.date, w.kg, w.note || '', '', '']));
      (data.favorites || []).forEach(f => rows.push(['favoritos', f.name, f.items.length, '', '', '']));
      (data.water || []).forEach(x => rows.push(['agua', x.date, x.glasses, '', '', '']));
      const csv = '\uFEFF' + rows.map(r => r.map(c => {
        const s2 = String(c ?? '');
        return /[",;\n]/.test(s2) ? '"' + s2.replace(/"/g, '""') + '"' : s2;
      }).join(',')).join('\r\n');
      downloadFile(`nutri-todo-${todayISO()}.csv`, csv, 'text/csv;charset=utf-8');
      toast('CSV maestro descargado.', 'ok');
    } catch (e) { toast('Error: ' + e.message, 'err'); }
  };
  root.querySelector('#s-clear').onclick = async () => {
    const ok = await confirmSheet({
      title: '¿Borrar TODOS los datos?',
      msg: 'Se eliminarán perfil, comidas, pesos, favoritos, ajustes y la base de platos de ESTE dispositivo. Esta acción no se puede deshacer.',
      okText: 'Sí, borrar todo', danger: true
    });
    if (!ok) return;
    const typed = prompt('Escribe BORRAR en mayúsculas para confirmar:');
    if (typed !== 'BORRAR') { toast('Cancelado.', 'warn'); return; }
    await DB.clearAll();
    toast('Todos los datos fueron borrados.', 'ok');
    location.hash = '#/perfil';
    render(root);
  };
}
