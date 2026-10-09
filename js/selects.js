/* Desplegables con estilo de la app.
   El <select> nativo se conserva (su valor, sus options y su evento change
   siguen intactos), pero el menú se abre en una hoja bonita en vez del
   cuadrado del sistema. Funciona en cualquier pantalla, ahora o más adelante. */

import { openSheet, esc } from './util.js';
import { icon } from './icons.js';

let listo = false;

function buscarSelect(e) {
  return e && e.target && e.target.closest ? e.target.closest('select') : null;
}

function abrir(sel) {
  if (document.querySelector('.sheet-back')) return;
  const lbl = sel.closest('label');
  const lblEl = lbl && lbl.querySelector('.lbl');
  const titulo = lblEl ? lblEl.textContent.trim() : 'Elige una opción';
  const actual = String(sel.value);
  const opciones = Array.from(sel.options || []);
  const s = openSheet(`
    <h2>${esc(titulo)}</h2>
    <div class="sel-list">
      ${opciones.map(o => {
        const on = String(o.value) === actual;
        return `<button type="button" class="sel-opt ${on ? 'on' : ''}" data-v="${esc(String(o.value))}">
          <span>${esc((o.textContent || '').trim())}</span>${on ? icon('check') : ''}</button>`;
      }).join('')}
    </div>`);
  s.sheet.querySelectorAll('.sel-opt').forEach(b => {
    b.onclick = () => {
      const v = b.getAttribute('data-v');
      if (String(sel.value) !== v) {
        sel.value = v;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      s.close();
    };
  });
}

export function iniciarSelects() {
  if (listo || typeof document === 'undefined') return;
  listo = true;

  // bloquea el menú nativo (se abre al soltar el clic) y enfoca el campo
  document.addEventListener('mousedown', e => {
    const sel = buscarSelect(e);
    if (!sel) return;
    e.preventDefault();
    sel.focus();
  }, true);

  document.addEventListener('click', e => {
    const sel = buscarSelect(e);
    if (!sel) return;
    e.preventDefault();
    abrir(sel);
  }, true);

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'ArrowDown') return;
    const sel = document.activeElement;
    if (sel && sel.tagName === 'SELECT') { e.preventDefault(); abrir(sel); }
  });
}
