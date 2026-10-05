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
      <div class="card-title"><h3>${icon('key')} API key y modelo</h3></div>
      <label class="field"><span class="lbl">Modelo</span>
        <select id="ia-model">
          ${modelOptions().map(m => `<option value="${m.v}" ${settings.model === m.v ? 'selected' : ''}>${m.l}</option>`).join('')}
        </select></label>
      <label class="field"><span class="lbl">API key (se guarda solo en este celular)</span>
        <input id="ia-key" type="password" autocomplete="off" spellcheck="false" placeholder="AIza…" value="${esc(settings.apiKey || '')}"></label>
      <div class="row">
        <button class="btn btn-sm" id="ia-show" type="button">Ver</button>
        <button class="btn btn-sm btn-primary" id="ia-savekey" type="button">Guardar key</button>
        <button class="btn btn-sm btn-accent" id="ia-test" type="button">Probar</button>
      </div>
      <div id="ia-testres" class="hint"></div>
    </div>

    <div class="card">
      <div class="card-title"><h3>${icon('help')} Cómo funciona</h3></div>
      ${promptHelpHTML()}
    </div>

    <div class="card">
      <div class="card-title"><h3>${icon('key')} Conseguir una key gratis (paso a paso)</h3></div>
      <ol class="small muted" style="padding-left:20px;line-height:1.8">
        <li>Entra a <b>aistudio.google.com</b> con tu cuenta de Google (no necesita tarjeta).</li>
        <li>Busca <b>“Get API key” / “Obtener clave de API”</b> (botón arriba a la izquierda).</li>
        <li>Botón <b>Create API key</b> → <b>Create API key in new project</b> (o usa el proyecto que te sugiera).</li>
        <li>Copia la clave que empieza con <b>AIza…</b> y pégala arriba.</li>
        <li>En <b>API keys → Application restrictions</b> elige <b>HTTP referrers</b> y agrega
            <span class="kbd">https://TUUSUARIO.github.io/*</span> (el dominio donde instalarás la app).</li>
        <li>En <b>API restrictions</b> deja solo <b>Gemini API</b>.</li>
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

  const keyInput = root.querySelector('#ia-key');
  root.querySelector('#ia-show').onclick = e => {
    const isPw = keyInput.type === 'password';
    keyInput.type = isPw ? 'text' : 'password';
    e.target.textContent = isPw ? 'Ocultar' : 'Ver';
  };
  root.querySelector('#ia-savekey').onclick = async () => {
    await saveSettings({ apiKey: keyInput.value.trim() });
    toast('API key guardada en tu celular.', 'ok');
  };
  root.querySelector('#ia-model').onchange = async e => {
    await saveSettings({ model: e.target.value });
    toast('Modelo actualizado: ' + e.target.value, 'ok');
  };
  root.querySelector('#ia-test').onclick = async e => {
    const btn = e.target;
    const out = root.querySelector('#ia-testres');
    const key = keyInput.value.trim();
    await saveSettings({ apiKey: key });
    btn.disabled = true; btn.textContent = 'Probando…';
    out.textContent = '';
    const r = await testApiKey(key, root.querySelector('#ia-model').value);
    btn.disabled = false; btn.textContent = 'Probar';
    out.innerHTML = r.ok ? `<span style="color:var(--brand)">${icon('checkCircle')} ${esc(r.msg)}</span>` : `<span style="color:#ff9a9a">${icon('alert')} ${esc(r.msg)}</span>`;
    toast(r.msg, r.ok ? 'ok' : 'err');
  };
}
