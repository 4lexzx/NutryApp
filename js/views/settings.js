/* Ajustes: instalación, tema, IA, agua, respaldo y datos. */

import { DB, getSettings, saveSettings, getProfile, getPrompt } from '../db.js';
import { exportMealsCSV, exportWeightsCSV, exportBackup, importBackup, backupSummary, dataHelpHTML } from '../export.js';
import { testApiKey, modelOptions } from '../ai.js';
import { esc, toast, confirmSheet, pickFile, downloadFile, todayISO } from '../util.js';

const VERSION = '1.0.0';

export async function render(root) {
  const s = await getSettings();
  const prof = await getProfile();
  const summary = await backupSummary();
  const promptSaved = !!(await getPrompt());

  root.innerHTML = `
    <h1>Ajustes</h1>

    <div class="card">
      <div class="card-title"><h3>📲 Instalar en tu celular</h3></div>
      <p class="small muted">Esta es una PWA: se instala como una app normal, con ícono propio y pantalla completa,
        pero sin pasar por la Play Store.</p>
      <div class="col">
        <button class="btn btn-primary btn-block" id="s-install" type="button">⬇ Instalar Nutri Gym</button>
        <div class="tiny muted" id="s-install-hint">Si no está disponible, abre esta página con <b>Chrome</b> → menú ⋮ →
          <b>“Instalar aplicación” / “Añadir a pantalla de inicio”</b>.</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title"><h3>🎨 Apariencia</h3></div>
      <div class="row">
        <button class="btn btn-block ${s.theme === 'dark' ? 'btn-primary' : ''}" data-theme="dark" type="button">🌙 Oscuro</button>
        <button class="btn btn-block ${s.theme === 'light' ? 'btn-primary' : ''}" data-theme="light" type="button">☀️ Claro</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title"><h3>🤖 Inteligencia artificial</h3>
        <span class="badge ${s.apiKey ? 'ok' : 'warn'}">${s.apiKey ? 'key configurada' : 'sin key'}</span></div>
      <label class="field"><span class="lbl">Modelo</span>
        <select id="s-model">${modelOptions().map(m => `<option value="${m.v}" ${s.model === m.v ? 'selected' : ''}>${m.l}</option>`).join('')}</select></label>
      <label class="field"><span class="lbl">API key</span>
        <input id="s-key" type="password" autocomplete="off" spellcheck="false" placeholder="AIza…" value="${esc(s.apiKey || '')}"></label>
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
          <div class="tiny muted">${promptSaved ? 'Prompt personalizado ✓' : 'Usando el predeterminado (comida peruana)'}</div>
        </div>
        <a class="btn btn-sm btn-outline" href="#/ia">Editar</a>
      </div>
      <p class="tiny muted" style="margin-top:10px">La clave se guarda <b>solo en tu celular</b> (IndexedDB). Solo se envía
        a los servidores de Google cuando pides un análisis.</p>
    </div>

    <div class="card">
      <div class="card-title"><h3>💧 Agua</h3></div>
      <label class="field"><span class="lbl">Vasos por día (1 vaso = 250 ml)</span>
        <input id="s-water" type="number" inputmode="numeric" min="0" max="30" value="${s.waterGoal}"></label>
      <button class="btn btn-sm btn-primary" id="s-water-save" type="button">Guardar meta de agua</button>
    </div>

    <div class="card">
      <div class="card-title"><h3>💾 Datos y respaldo</h3></div>
      <div class="statgrid" style="margin-bottom:12px">
        <div class="stat"><div class="v">${summary.meals}</div><div class="k">comidas</div></div>
        <div class="stat"><div class="v">${summary.weights}</div><div class="k">pesos</div></div>
        <div class="stat"><div class="v">${summary.favorites}</div><div class="k">favoritos</div></div>
        <div class="stat"><div class="v">${prof ? '✓' : '—'}</div><div class="k">perfil</div></div>
      </div>
      ${dataHelpHTML()}
      <div class="col">
        <button class="btn btn-primary btn-block" id="s-backup" type="button">⬇ Descargar respaldo (.json)</button>
        <button class="btn btn-block" id="s-restore" type="button">⬆ Restaurar desde archivo</button>
        <div class="grid2">
          <button class="btn btn-sm" id="s-csv1" type="button">CSV comidas</button>
          <button class="btn btn-sm" id="s-csv2" type="button">CSV pesos</button>
        </div>
        <button class="btn btn-sm btn-ghost" id="s-csvall" type="button">📄 Exportar todo en un CSV maestro</button>
        <div class="divider"></div>
        <button class="btn btn-danger btn-block" id="s-clear" type="button">🗑 Borrar TODOS los datos</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title"><h3>ℹ️ Acerca de</h3></div>
      <p class="small muted">Nutri Gym v${VERSION} · PWA 100% local.<br>
      Tus datos (perfil, comidas, historial) viven <b>en este celular</b>. No hay cuentas ni servidores propios;
      la única conexión externa es la consulta opcional a Gemini (Google) cuando usas la IA.</p>
      <div class="note">⚠️ Los valores nutricionales son <b>estimaciones</b> generadas por IA y tablas de referencia.
        No sustituyen la opinión de un nutricionista.</div>
      <div class="note danger">🔒 Consejo: haz un <b>respaldo .json</b> al menos una vez por semana y guárdalo en
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
      instBtn.textContent = '✅ Ya está instalada';
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
    document.querySelector('meta[name="theme-color"]').setAttribute('content', b.dataset.theme === 'dark' ? '#0b1220' : '#f2f5fa');
    toast('Tema cambiado.', 'ok');
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
  root.querySelector('#s-key-test').onclick = async e => {
    const btn = e.target, res = root.querySelector('#s-key-res');
    const key = keyIn.value.trim();
    await saveSettings({ apiKey: key });
    btn.disabled = true; btn.textContent = 'Probando…'; res.textContent = '';
    const r = await testApiKey(key, root.querySelector('#s-model').value);
    btn.disabled = false; btn.textContent = 'Probar clave';
    res.innerHTML = r.ok ? `<span style="color:var(--brand)">✅ ${esc(r.msg)}</span>` : `<span style="color:#ff9a9a">⚠️ ${esc(r.msg)}</span>`;
  };

  /* agua */
  root.querySelector('#s-water-save').onclick = async () => {
    const v = Math.max(0, Math.min(30, parseInt(root.querySelector('#s-water').value, 10) || 0));
    await saveSettings({ waterGoal: v });
    toast(`Meta de agua: ${v} vasos.`, 'ok');
  };

  /* datos */
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
