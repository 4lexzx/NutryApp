/* Ajustes: instalación, tema, IA, agua, respaldo y datos. */

import { DB, getSettings, saveSettings, getProfile, getPrompt, limpiarPlatosBase, listarPlatosBase, borrarPlatoBase } from '../db.js';
import { icon } from '../icons.js';
import { exportMealsCSV, exportWeightsCSV, exportBackup, importBackup, backupSummary, dataHelpHTML } from '../export.js';
import { testApiKey, modelOptions } from '../ai.js';
import { esc, toast, confirmSheet, pickFile, downloadFile, todayISO, openSheet } from '../util.js';
import { clearSession, currentUser } from '../auth.js';
import { setSonidos, clic } from '../sound.js';
import { RECORDS_DEF, pedirPermiso, notificar, guardarRecordatorio, guardarHoraRecordatorio, encenderRecordatorios, cuerpoMacros, horaDe } from '../notif.js';

const VERSION = '1.2.9';

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
      <p class="tiny muted" style="margin-top:10px">La clave se guarda <b>solo en tu celular</b> (IndexedDB). Solo se envía
        a los servidores de Google cuando pides un análisis.</p>
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
        ponles la hora que quieras; el aviso te muestra cuántas kcal y proteína llevas hoy.</p>
      <div class="rem-rows" id="s-rem-chips">
        ${RECORDS_DEF.map(r => `
        <div class="rem-row">
          <button type="button" class="chip ${remIds.indexOf(r.id) >= 0 ? 'active' : ''}" data-rem="${r.id}">${r.l}</button>
          <input type="time" data-remh="${r.id}" value="${horaDe({ rem }, r.id)}" aria-label="Hora del recordatorio de ${r.l}">
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

    <div class="card">
      <div class="card-title"><h3>${icon('user')} Cuenta</h3></div>
      <div class="spread" style="margin-bottom:14px">
        <div class="row">
          <div>
            <b class="small">${esc(currentUser() || 'invitado')}</b>
            <div class="tiny muted">Sesión activa en este dispositivo</div>
          </div>
        </div>
        <span class="badge ok">${icon('lock')} local</span>
      </div>
      <button class="btn btn-danger btn-block" id="s-logout" type="button">${icon('logout')} Cerrar sesión</button>
      <p class="tiny muted" style="margin-top:10px">Al cerrar sesión volverás a la pantalla de acceso.
        Tus comidas y ajustes <b>siguen guardados</b> en el teléfono.</p>
    </div>

    <div class="card">
      <div class="card-title"><h3>${icon('info')} Acerca de</h3></div>
      <p class="small muted">Nutri Gym v${VERSION} · PWA 100% local.<br>
      Tus datos (perfil, comidas, historial) viven <b>en este celular</b>. No hay cuentas ni servidores propios;
      la única conexión externa es la consulta opcional a Gemini (Google) cuando usas la IA.</p>
      <div class="note">${icon('alert')} Los valores nutricionales son <b>estimaciones</b> generadas por IA y tablas de referencia.
        No sustituyen la opinión de un nutricionista.</div>
      <div class="note danger">${icon('lock')} Consejo: haz un <b>respaldo .json</b> al menos una vez por semana y guárdalo en
        Google Drive, tu PC o por correo. Si borras los datos del navegador, se pierde el historial.</div>
    </div>
  `;

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
      <p class="small muted">Platos analizados que salen siempre igual (y sin gastar cuota) cuando los vuelves a escribir.
        Si guardaste uno sin querer, quítalo aquí y la próxima vez la IA lo analizará de nuevo.</p>
      <div id="base-lista">
        ${lista.length ? lista.map(filaHTML).join('')
        : '<div class="empty" style="padding:16px">Todavía no guardas ninguna porción estándar.</div>'}
      </div>
      <button class="btn btn-block btn-ghost" id="base-cerrar" type="button" style="margin-top:14px">Cerrar</button>`);
    const refrescarContador = () => {
      const n = s.root.querySelectorAll('[data-del]').length;
      const cnt = root.querySelector('#s-base-count');
      if (cnt) cnt.textContent = n === 0
        ? 'Sin porciones guardadas: los primeros análisis se repiten solo una vez'
        : `${n} porción${n === 1 ? '' : 'es'} guardada${n === 1 ? '' : 's'} · salen igual y sin gastar cuota`;
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
        toast('Porción estándar quitada: la próxima consulta la IA la analizará de nuevo.', 'ok');
      };
    });
  };

  root.querySelector('#s-base-clear').onclick = async () => {
    const ok = await confirmSheet({
      title: '¿Borrar la base de platos?',
      msg: 'Se olvidarán los platos que la IA ya analizó: la próxima vez que consultes uno gastará 1 consulta de nuevo. Tus comidas guardadas NO se tocan.',
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
  root.querySelectorAll('[data-remh]').forEach(inp => inp.onchange = async () => {
    const ok = await guardarHoraRecordatorio(inp.dataset.remh, inp.value);
    if (!ok) { toast('Esa hora no es válida.', 'warn'); return; }
    const r = RECORDS_DEF.find(x => x.id === inp.dataset.remh);
    toast(`${r.l}: te avisaré a las ${inp.value}.`, 'ok');
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
      const ok = await notificar('Aviso de prueba', cuerpo);
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
      msg: 'Se eliminarán perfil, comidas, pesos, favoritos, ajustes y API key de ESTE dispositivo. Esta acción no se puede deshacer.',
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
