/* Instrucciones de la IA (prompt editable que se envía a Gemini). */

import { getPrompt, savePrompt, getSettings, saveSettings } from '../db.js';
import { icon } from '../icons.js';
import { DEFAULT_PROMPT, promptHelpHTML, testApiKey, modelOptions } from '../ai.js';
import { esc, toast, confirmSheet, openSheet } from '../util.js';

export async function render(root) {
  const saved = await getPrompt();
  const settings = await getSettings();
  const current = saved || DEFAULT_PROMPT;

  root.innerHTML = `
    <div class="spread" style="margin-bottom:12px">
      <div><h1>Instrucciones de la IA</h1><div class="tiny muted">Prompt que recibe Gemini en cada análisis</div></div>
      <a class="btn btn-sm btn-ghost" href="#/ajustes">${icon('chevronLeft')} Ajustes</a>
    </div>

    <div class="card">
      <div class="card-title"><h3>${icon('note')} Mi prompt</h3>
        <span class="badge ${saved ? 'ok' : ''}">${saved ? 'personalizado' : 'predeterminado'}</span></div>
      <textarea id="ia-prompt" rows="16" spellcheck="false">${esc(current)}</textarea>
      <div class="col" style="margin-top:12px">
        <button class="btn btn-primary btn-block" id="ia-save" type="button">${icon('save')} Guardar instrucciones</button>
        <button class="btn btn-block" id="ia-reset" type="button">${icon('refresh')} Restaurar el predeterminado</button>
      </div>
      <div class="hint">Se guardan <b>solo en tu celular</b>. Se usan únicamente cuando tocas “Analizar con la IA”.</div>
    </div>

    <div class="card">
      <div class="card-title"><h3>${icon('key')} Modelo</h3>
        <span class="badge ok">clave en el servidor</span></div>
      <label class="field"><span class="lbl">Modelo</span>
        <select id="ia-model">
          ${modelOptions().map(m => `<option value="${m.v}" ${settings.model === m.v ? 'selected' : ''}>${m.l}</option>`).join('')}
        </select></label>
      <div class="row">
        <button class="btn btn-sm btn-accent" id="ia-test" type="button">Probar la IA</button>
      </div>
      <div id="ia-testres" class="hint"></div>
      <div class="hint">La clave de Gemini vive en el servidor de la app (Vercel). Tú no tienes que configurar nada:
        cada análisis pasa por <b>/api/ai</b> y la clave nunca se guarda en tu teléfono.</div>
    </div>

    <div class="card">
      <div class="card-title"><h3>${icon('help')} Cómo funciona</h3></div>
      ${promptHelpHTML()}
    </div>

    <div class="card">
      <div class="card-title"><h3>${icon('shield')} Sobre la clave de Gemini</h3></div>
      <ol class="small muted" style="padding-left:20px;line-height:1.8">
        <li>La app llama a su propio servidor (<b>/api/ai</b>) y quien responde la consulta a Gemini es el servidor.</li>
        <li>La clave está como variable de entorno en <b>Vercel</b> (GEMINI_API_KEY): no viaja en la app ni se ve en el navegador.</li>
        <li>Si el análisis falla con “función de IA no disponible”, el servidor aún no tiene la clave configurada.</li>
        <li>NUNCA actives la facturación: sin ella solo usas la cuota gratuita (costo $0).</li>
      </ol>
      <div class="note">${icon('alert')} Si más adelante activas facturas, fija un <b>presupuesto de alertas</b> en Google Cloud (Billing → Budgets).</div>
      <a class="btn btn-outline btn-block" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">${icon('external')} Abrir Google AI Studio</a>
    </div>
  `;

  root.querySelector('#ia-save').onclick = async () => {
    const v = root.querySelector('#ia-prompt').value.trim();
    if (v.length < 40) { toast('El prompt es demasiado corto.', 'warn'); return; }
    await savePrompt(v);
    toast('Instrucciones guardadas.', 'ok');
    render(root);
  };

  root.querySelector('#ia-reset').onclick = async () => {
    const ok = await confirmSheet({ title: '¿Restaurar el prompt predeterminado?', msg: 'Se reemplazará tu prompt actual por el original (foco en comida peruana).', okText: 'Restaurar' });
    if (!ok) return;
    await savePrompt(DEFAULT_PROMPT);
    toast('Prompt predeterminado restaurado.', 'ok');
    render(root);
  };

  root.querySelector('#ia-model').onchange = async e => {
    await saveSettings({ model: e.target.value });
    toast('Modelo actualizado: ' + e.target.value, 'ok');
  };
  root.querySelector('#ia-test').onclick = async e => {
    const btn = e.target;
    const out = root.querySelector('#ia-testres');
    btn.disabled = true; btn.textContent = 'Probando…';
    out.textContent = '';
    const r = await testApiKey('', root.querySelector('#ia-model').value);
    btn.disabled = false; btn.textContent = 'Probar la IA';
    out.innerHTML = r.ok ? `<span style="color:var(--brand)">${icon('checkCircle')} ${esc(r.msg)}</span>` : `<span style="color:#ff9a9a">${icon('alert')} ${esc(r.msg)}</span>`;
    toast(r.msg, r.ok ? 'ok' : 'err');
  };
}
