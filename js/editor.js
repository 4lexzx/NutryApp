/* Editor de plato: lista de ingredientes 100% editable con recálculo de totales. */

import { TIPOS_COMIDA, ICONO_TIPO, esc, openSheet, $, $$, toast, confirmSheet } from './util.js';
import { icon } from './icons.js';
import { computeTotals, itemMacros, searchFoods, foodToItem, FOODS } from './nutrition.js';

export function newDraft(overrides = {}) {
  return Object.assign({
    id: null, date: null, type: 'almuerzo', name: '', note: '',
    photo: '', items: [], source: 'manual'
  }, overrides);
}

export function mountEditor(root, draft, opts = {}) {
  root.innerHTML = '';
  const el = document.createElement('div');
  el.innerHTML = editorHTML(draft, opts);
  root.appendChild(el);

  const q = s => el.querySelector(s);

  // --- tipo ---
  $$('.chip[data-type]', el).forEach(c => c.addEventListener('click', () => {
    draft.type = c.dataset.type;
    $$('.chip[data-type]', el).forEach(x => x.classList.toggle('active', x.dataset.type === draft.type));
    const hint = q('#ed-tipo-hint');
    if (hint) hint.innerHTML = `${icon('clock')} Dejado a mano: <b>${draft.type}</b>.`;
  }));

  q('#ed-name').addEventListener('input', e => { draft.name = e.target.value; });
  q('#ed-note').addEventListener('input', e => { draft.note = e.target.value; });

  const photo = q('#ed-photo');
  const thumb = q('#ed-thumb');
  const syncPhoto = () => {
    if (draft.photo) {
      thumb.src = draft.photo;
      thumb.classList.remove('hidden');
      q('#ed-photo-empty').classList.add('hidden');
      q('#ed-photo-remove').classList.remove('hidden');
    } else {
      thumb.classList.add('hidden');
      q('#ed-photo-empty').classList.remove('hidden');
      q('#ed-photo-remove').classList.add('hidden');
    }
  };
  syncPhoto();
  q('#ed-photo-remove').addEventListener('click', () => { draft.photo = ''; syncPhoto(); });

  const renderItems = () => {
    const wrap = q('#ed-items');
    if (!draft.items.length) {
      wrap.innerHTML = `<div class="empty"><span class="ico">${icon('utensils')}</span><b>Sin ingredientes todavía</b><div class="small muted">Añade alimentos manualmente o usa la IA.</div></div>`;
    } else {
      wrap.innerHTML = draft.items.map((it, i) => itemRowHTML(it, i)).join('');
      bindRows(wrap);
    }
    updateTotals();
  };

  function bindRows(wrap) {
    $$('.ing-row', wrap).forEach(row => {
      const i = Number(row.dataset.i);
      const it = draft.items[i];
      const nameIn = row.querySelector('.ing-name');
      nameIn.addEventListener('input', e => { it.nombre = e.target.value; it.editado = true; });

      const gIn = row.querySelector('[data-k="g"]');
      gIn.addEventListener('input', e => {
        let g = parseFloat(e.target.value);
        if (!isFinite(g) || g < 0) g = 0;
        if (g > 5000) g = 5000;
        it.gramos = g;
        it.editado = true;
        const m = itemMacros(it);
        row.querySelector('[data-k="k"]').value = roundIt(m.k);
        row.querySelector('[data-k="p"]').value = roundIt(m.p);
        row.querySelector('[data-k="c"]').value = roundIt(m.c);
        row.querySelector('[data-k="f"]').value = roundIt(m.f);
        updateTotals();
      });

      ['k', 'p', 'c', 'f'].forEach(key => {
        const inp = row.querySelector(`[data-k="${key}"]`);
        inp.addEventListener('input', e => {
          let v = parseFloat(e.target.value);
          if (!isFinite(v) || v < 0) v = 0;
          it.editado = true;
          const g = Number(it.gramos) || 0;
          if (g > 0) {
            // convertimos el valor de la porción a "por 100 g" para conservar la escala
            const field = { k: 'k', p: 'p', c: 'c', f: 'f' }[key];
            it.per100[field] = Math.round(v * 100 / g * 10) / 10;
          }
          updateTotals();
        });
      });

      row.querySelector('.ing-del').addEventListener('click', () => {
        draft.items.splice(i, 1);
        renderItems();
      });
    });
  }

  const updateTotals = () => {
    const t = computeTotals(draft.items);
    q('#tot-k').textContent = t.kcal;
    q('#tot-p').textContent = t.protein;
    q('#tot-c').textContent = t.carbs;
    q('#tot-f').textContent = t.fat;
    q('#tot-fi').textContent = t.fiber;
    const warn = q('#ed-over');
    const target = opts.kcalTarget || 0;
    if (target > 0 && t.kcal > target * 1.05) {
      warn.classList.remove('hidden');
      warn.textContent = `Este plato supera el ${Math.round(t.kcal / target * 100)}% de tu meta diaria de kcal.`;
    } else warn.classList.add('hidden');
    return t;
  };

  q('#ed-add').addEventListener('click', () => openAddSheet(draft, renderItems));

  const saveBtn = q('#ed-save');
  saveBtn.addEventListener('click', async () => {
    const t = updateTotals();
    if (!draft.items.length) { toast('Añade al menos un ingrediente.', 'warn'); return; }
    if (t.kcal <= 0 && t.protein <= 0) { toast('Los macros están en 0. Revisa gramos y valores.', 'warn'); return; }
    if (!draft.name.trim()) draft.name = draft.items[0].nombre || 'Plato';
    draft.totals = t;
    saveBtn.disabled = true;
    try { await opts.onSave(draft); } finally { saveBtn.disabled = false; }
  });

  const favBtn = q('#ed-fav');
  if (favBtn) favBtn.addEventListener('click', async () => {
    const t = updateTotals();
    if (!draft.items.length) { toast('Añade ingredientes primero.', 'warn'); return; }
    if (!draft.name.trim()) draft.name = draft.items[0].nombre || 'Plato';
    draft.totals = t;
    await opts.onSaveFavorite ? await opts.onSaveFavorite(draft) : null;
  });

  const delBtn = q('#ed-del');
  if (delBtn && opts.onDelete) delBtn.addEventListener('click', () => opts.onDelete());

  const reBtn = q('#ed-re');
  if (reBtn && opts.onReanalyze) reBtn.addEventListener('click', async () => {
    const ok = await confirmSheet({
      title: '¿Re-analizar con la IA?',
      msg: 'Se reemplazarán los ingredientes actuales por los que estime la IA (1 consulta de tu cuota diaria). Podrás editar todo antes de guardar.',
      okText: 'Re-analizar'
    });
    if (!ok) return;
    const old = reBtn.innerHTML;
    reBtn.disabled = true;
    reBtn.innerHTML = '<span class="spinner"></span> Reanalizando…';
    try {
      await opts.onReanalyze(draft);
      renderItems();
    } catch (e) {
      toast((e && e.message) || 'No se pudo re-analizar.', 'err');
    } finally {
      reBtn.disabled = false;
      reBtn.innerHTML = old;
    }
  });

  const baseBtn = q('#ed-base');
  if (baseBtn && opts.onGuardarBase) baseBtn.addEventListener('click', async () => {
    const ok = await confirmSheet({
      title: '¿Guardar como tu porción estándar?',
      msg: 'La próxima vez que escribas este plato (o "2 platos de él") saldrá exactamente con estos gramos, sin gastar cuota de IA. Puedes borrarlo luego en Ajustes → Base de platos.',
      okText: 'Guardar'
    });
    if (!ok) return;
    baseBtn.disabled = true;
    try { await opts.onGuardarBase(draft); } catch (e) { toast((e && e.message) || 'No se pudo guardar en la base local.', 'err'); }
    finally { baseBtn.disabled = false; }
  });

  renderItems();
  return { updateTotals, renderItems };
}

function roundIt(v) { return Math.round(v * 10) / 10; }

function itemRowHTML(it, i) {
  const m = itemMacros(it);
  return `
  <div class="ing-row" data-i="${i}">
    <div class="ing-top">
      <input class="ing-name" type="text" value="${esc(it.nombre)}" aria-label="Nombre del ingrediente">
      <button class="ing-del" type="button" title="Quitar ingrediente">${icon('x')}</button>
    </div>
    <div class="ing-grid">
      <label class="f g"><span>gramos</span><input class="num" data-k="g" type="number" inputmode="decimal" min="0" step="1" value="${it.gramos || 0}"></label>
      <label class="f"><span>kcal</span><input class="num" data-k="k" type="number" inputmode="decimal" min="0" step="1" value="${roundIt(m.k)}"></label>
      <label class="f"><span>prot</span><input class="num" data-k="p" type="number" inputmode="decimal" min="0" step="0.1" value="${roundIt(m.p)}"></label>
      <label class="f"><span> carb</span><input class="num" data-k="c" type="number" inputmode="decimal" min="0" step="0.1" value="${roundIt(m.c)}"></label>
      <label class="f"><span>gras</span><input class="num" data-k="f" type="number" inputmode="decimal" min="0" step="0.1" value="${roundIt(m.f)}"></label>
    </div>
    ${it.nota ? `<div class="tiny muted" style="margin-top:6px">${icon('note')} ${esc(it.nota)}</div>` : ''}
  </div>`;
}

function editorHTML(draft, opts) {
  return `
  <div class="disclaimer"><span>${icon('alert')}</span><span>Valores <b>estimados</b> por IA o por tabla de referencia. Revisa y corrige porciones antes de guardar.</span></div>

  <div class="card">
    <div class="card-title"><h2>${draft.id ? 'Editar plato' : 'Nuevo plato'}</h2>
      ${draft.source ? `<span class="badge ${draft.source === 'base' ? 'ok' : 'ai'}">${draft.source === 'ia' ? `${icon('sparkles')} IA` : draft.source === 'base' ? `${icon('book')} Base local` : draft.source === 'favorito' ? `${icon('star')} Favorito` : draft.source === 'texto' ? `${icon('note')} Texto` : `${icon('pencil')} Manual`}</span>` : ''}
    </div>
    <div class="chips big" style="margin-bottom:12px">
      ${TIPOS_COMIDA.map(t => `<button type="button" class="chip ${draft.type === t ? 'active' : ''}" data-type="${t}">${icon(ICONO_TIPO[t])} ${t}</button>`).join('')}
    </div>
    ${opts.tipoHint ? `<div class="hint" id="ed-tipo-hint" style="margin:-6px 0 12px">${icon('clock')} ${opts.tipoHint}</div>` : ''}
    <label class="field"><span class="lbl">Nombre del plato</span>
      <input id="ed-name" type="text" placeholder="Ej. Lomo saltado con arroz" value="${esc(draft.name || '')}"></label>
    <label class="field"><span class="lbl">Nota opcional (porciones, aceite, etc.)</span>
      <input id="ed-note" type="text" placeholder="Ej. con poco arroz, sin papas" value="${esc(draft.note || '')}"></label>

    <div class="row" style="gap:12px;align-items:flex-start">
      <div class="grow">
        <div id="ed-photo-empty" class="empty" style="padding:18px 10px"><span class="ico">${icon('camera')}</span><span class="small">Sin foto</span></div>
        <img id="ed-thumb" class="photo-preview hidden" alt="Foto del plato">
        <button id="ed-photo-remove" class="btn btn-sm btn-ghost hidden" type="button">Quitar foto</button>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-title"><h3>Ingredientes</h3>
      <button id="ed-add" class="btn btn-sm btn-outline" type="button">＋ Añadir</button>
    </div>
    <div id="ed-items"></div>
    ${opts.onReanalyze ? `<button id="ed-re" class="btn btn-ghost btn-block" type="button" style="margin-top:8px">${icon('sparkles')} Re-analizar porciones con la IA</button>` : ''}
    ${opts.onGuardarBase ? `<button id="ed-base" class="btn btn-ghost btn-block" type="button" style="margin-top:8px">${icon('book')} Usar como mi porción estándar</button>` : ''}
    <div id="ed-over" class="over-msg hidden"></div>
  </div>

  <div class="totals-bar">
    <div class="t kcal"><div class="v" id="tot-k">0</div><div class="k">kcal</div></div>
    <div class="t prot"><div class="v" id="tot-p">0</div><div class="k">prot</div></div>
    <div class="t carb"><div class="v" id="tot-c">0</div><div class="k">carb</div></div>
    <div class="t gras"><div class="v" id="tot-f">0</div><div class="k">gras</div></div>
    <div class="t"><div class="v" id="tot-fi">0</div><div class="k">fibra</div></div>
  </div>

  <div class="col" style="margin-top:14px">
    <button id="ed-save" class="btn btn-primary btn-lg btn-block" type="button">${icon('save')} Guardar en el día</button>
    <div class="grid2">
      <button id="ed-fav" class="btn btn-outline" type="button">${icon('star')} Guardar favorito</button>
      ${opts.onDelete ? `<button id="ed-del" class="btn btn-danger" type="button">${icon('trash')} Eliminar</button>` : '<span></span>'}
    </div>
    <p class="tiny muted center">Se guardará en: <b>${esc(draft.date || '')}</b> · ${esc(draft.type)}</p>
  </div>`;
}

/* ---------- Añadir ingrediente ---------- */
export function openAddSheet(draft, onChange) {
  const s = openSheet(`
    <h2>Añadir ingrediente</h2>
    <label class="field"><span class="lbl">Buscar en la tabla de alimentos</span>
      <input id="ad-q" type="search" placeholder="Ej. arroz, pollo, lomo saltado…" autocomplete="off"></label>
    <div id="ad-list"></div>
    <div class="grid2" style="margin-top:10px">
      <button class="btn btn-outline" id="ad-custom" type="button">${icon('pencil')} Personalizado</button>
      <button class="btn btn-ghost" id="ad-close" type="button">Cerrar</button>
    </div>`);

  const list = $('#ad-list', s.sheet);
  const draw = q => {
    const res = searchFoods(q);
    list.innerHTML = res.length
      ? res.map((f, i) => `<button class="list-item" data-i="${FOODS.indexOf(f)}" type="button">
          <div class="li-main"><div class="li-t">${esc(f.n)}</div>
          <div class="li-s">por 100 g → ${f.k} kcal · P ${f.p} · C ${f.c} · G ${f.f}</div></div>
          <div class="li-end">＋</div></button>`).join('')
      : '<p class="small muted">Sin resultados. Usa “Personalizado”.</p>';
    $$('[data-i]', list).forEach(btn => btn.addEventListener('click', () => {
      pickGrams(FOODS[Number(btn.dataset.i)], s, draft, onChange);
    }));
  };
  draw('');
  $('#ad-q', s.sheet).addEventListener('input', e => draw(e.target.value));
  $('#ad-close', s.sheet).addEventListener('click', s.close);
  $('#ad-custom', s.sheet).addEventListener('click', () => customIngredient(s, draft, onChange));
}

export function pickGrams(food, s, draft, onChange) {
  s.sheet.innerHTML = `
    <h2>${esc(food.n)}</h2>
    <p class="small muted">Por 100 g → ${food.k} kcal · P ${food.p} g · C ${food.c} g · G ${food.f} g${food.fi ? ' · Fibra ' + food.fi + ' g' : ''}</p>
    <label class="field"><span class="lbl">¿Cuántos gramos?</span>
      <input id="pk-g" type="number" inputmode="decimal" min="1" max="3000" step="1" value="100"></label>
    <div class="chips" style="margin-bottom:12px">
      ${[50, 100, 150, 200, 250, 300].map(g => `<button class="chip" data-g="${g}" type="button">${g} g</button>`).join('')}
    </div>
    <div class="grid2">
      <button class="btn btn-primary" id="pk-ok" type="button">Añadir</button>
      <button class="btn btn-ghost" id="pk-back" type="button">Volver</button>
    </div>`;
  $$('[data-g]', s.sheet).forEach(b => b.addEventListener('click', () => { $('#pk-g', s.sheet).value = b.dataset.g; }));
  $('#pk-back', s.sheet).addEventListener('click', () => { s.close(); openAddSheet(draft, onChange); });
  $('#pk-ok', s.sheet).addEventListener('click', () => {
    const g = Math.max(1, Math.min(3000, parseFloat($('#pk-g', s.sheet).value) || 100));
    draft.items.push({ ...foodToItem(food, g), editado: true });
    s.close(); onChange();
  });
  setTimeout(() => { const i = $('#pk-g', s.sheet); if (i) { i.focus(); i.select(); } }, 60);
}

function customIngredient(s, draft, onChange) {
  s.sheet.innerHTML = `
    <h2>Ingrediente personalizado</h2>
    <p class="small muted">Escribe la porción completa que vas a comer (no por 100 g).</p>
    <label class="field"><span class="lbl">Nombre</span><input id="ci-n" type="text" placeholder="Ej. Salsa de la casa"></label>
    <div class="grid2">
      <label class="field"><span class="lbl">Gramos</span><input id="ci-g" type="number" inputmode="decimal" value="50"></label>
      <label class="field"><span class="lbl">kcal</span><input id="ci-k" type="number" inputmode="decimal" value="0"></label>
      <label class="field"><span class="lbl">Proteína (g)</span><input id="ci-p" type="number" inputmode="decimal" value="0"></label>
      <label class="field"><span class="lbl">Carbos (g)</span><input id="ci-c" type="number" inputmode="decimal" value="0"></label>
      <label class="field"><span class="lbl">Grasas (g)</span><input id="ci-f" type="number" inputmode="decimal" value="0"></label>
      <label class="field"><span class="lbl">Fibra (g)</span><input id="ci-fi" type="number" inputmode="decimal" value="0"></label>
    </div>
    <div class="grid2">
      <button class="btn btn-primary" id="ci-ok" type="button">Añadir</button>
      <button class="btn btn-ghost" id="ci-back" type="button">Volver</button>
    </div>`;
  $('#ci-back', s.sheet).addEventListener('click', () => { s.close(); openAddSheet(draft, onChange); });
  $('#ci-ok', s.sheet).addEventListener('click', () => {
    const g = parseFloat($('#ci-g', s.sheet).value) || 0;
    const n = $('#ci-n', s.sheet).value.trim();
    if (!n) { toast('Ponle nombre al ingrediente.', 'warn'); return; }
    if (g <= 0) { toast('Los gramos deben ser mayores a 0.', 'warn'); return; }
    const r = 100 / g;
    draft.items.push({
      nombre: n, gramos: g,
      per100: {
        k: roundIt((parseFloat($('#ci-k', s.sheet).value) || 0) * r),
        p: roundIt((parseFloat($('#ci-p', s.sheet).value) || 0) * r),
        c: roundIt((parseFloat($('#ci-c', s.sheet).value) || 0) * r),
        f: roundIt((parseFloat($('#ci-f', s.sheet).value) || 0) * r),
        fi: roundIt((parseFloat($('#ci-fi', s.sheet).value) || 0) * r)
      },
      editado: true
    });
    s.close(); onChange();
  });
}
