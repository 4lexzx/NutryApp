/* Registro de comidas: foto + IA, texto, manual y favoritos. También editor. */

import { DB, getSettings, getProfile, getPrompt } from '../db.js';
import { icon } from '../icons.js';
import { analyzeMeal, DEFAULT_PROMPT } from '../ai.js';
import { mountEditor, newDraft, openAddSheet, pickGrams } from '../editor.js';
import { calcTargets, computeTotals, searchFoods, FOODS } from '../nutrition.js';
import {
  todayISO, esc, num, toast, confirmSheet, openSheet, fileToDataURL, resizeImage,
  TIPOS_COMIDA, ICONO_TIPO, fmtLongDate, uid, debounce
} from '../util.js';

const state = { draft: null, tab: 'foto', photo: null, desc: '', date: todayISO() };
const viewRoot = () => document.getElementById('view');

/* ================= INICIO (registrar) ================= */
export async function renderStart(root, args, query) {
  const date = (query && query.d) || todayISO();
  state.date = date;
  const settings = await getSettings();
  const hasKey = !!(settings.apiKey && settings.apiKey.trim());
  const favorites = await DB.all('favorites');
  const nItems = state.draft ? state.draft.items.length : 0;

  root.innerHTML = `
    <div class="spread" style="margin-bottom:12px">
      <div><h1>Registrar comida</h1><div class="tiny muted">${esc(fmtLongDate(date))}</div></div>
      <a class="btn btn-sm btn-ghost" href="#/hoy/${date}">Volver al día</a>
    </div>

    <div class="tabs" id="lg-tabs">
      <button class="tab ${state.tab === 'foto' ? 'active' : ''}" data-tab="foto" type="button">${icon('camera')} Foto</button>
      <button class="tab ${state.tab === 'texto' ? 'active' : ''}" data-tab="texto" type="button">${icon('note')} Texto</button>
      <button class="tab ${state.tab === 'manual' ? 'active' : ''}" data-tab="manual" type="button">${icon('pencil')} Manual</button>
      <button class="tab ${state.tab === 'favoritos' ? 'active' : ''}" data-tab="fav" type="button">${icon('star')}</button>
    </div>

    <div id="lg-body"></div>

    ${!hasKey ? `<div class="note">${icon('key')} <b>Todavía no configuraste Gemini.</b> La app funciona igual para registrar
      comidas <b>manual</b> o desde <b>favoritos</b> sin gastar cuota. Si quieres el análisis automático con IA,
      ve a <a href="#/ajustes">Ajustes → IA</a> y pega tu API key.<br><a href="#/ia">Cómo obtener una key gratis →</a></div>` : ''}
  `;

  root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
    state.tab = b.dataset.tab === 'fav' ? 'favoritos' : b.dataset.tab;
    renderStart(root, args, query);
  });

  const body = root.querySelector('#lg-body');

  if (state.tab === 'foto') renderFoto(body, date, hasKey);
  else if (state.tab === 'texto') renderTexto(body, date, hasKey);
  else if (state.tab === 'manual') renderManual(body, date);
  else renderFavoritos(body, date, favorites);
}

function renderFoto(body, date, hasKey) {
  body.innerHTML = `
    <div class="card">
      <div class="card-title"><h3>${icon('camera')} Foto del plato</h3>${state.photo ? '<span class="badge ok">Foto lista</span>' : ''}</div>
      <div class="grid2" style="margin-bottom:10px">
        <button class="btn btn-lg btn-primary" id="f-shot" type="button">${icon('camera')} Tomar foto</button>
        <button class="btn btn-lg" id="f-gal" type="button">${icon('image')} Galería</button>
      </div>
      ${state.photo ? `<img class="photo-preview" src="${state.photo}" alt="Plato">` :
      `<div class="empty" style="padding:22px 12px"><span class="ico">${icon('utensils')}</span><span class="small">Sube una foto o escribe el plato abajo</span></div>`}
      <label class="field" style="margin-top:12px"><span class="lbl">Descripción opcional (mejora la precisión)</span>
        <textarea id="f-desc" rows="2" placeholder="Ej. almuerzo de gimnasio, con poco arroz y doble presa de pollo">${esc(state.desc)}</textarea></label>
      <button class="btn btn-accent btn-lg btn-block" id="f-go" type="button">${icon('sparkles')} Analizar con la IA</button>
      ${!hasKey ? `<div class="hint">Necesitas tu API key: <a href="#/ajustes">Ajustes → IA</a>.</div>` : ''}
      <div class="hint">La foto se envía <b>solo</b> a Google Gemini para el análisis; no se sube a ningún otro servidor.</div>
    </div>
    <div class="hero-actions">
      <button class="btn btn-block" id="f-manual" type="button">${icon('pencil')} Escribir / ingresar a mano</button>
    </div>
  `;
  body.querySelector('#f-desc').oninput = e => { state.desc = e.target.value; };
  body.querySelector('#f-shot').onclick = () => pickPhoto(true, body, date, hasKey);
  body.querySelector('#f-gal').onclick = () => pickPhoto(false, body, date, hasKey);
  body.querySelector('#f-go').onclick = () => runAI({ date, hasKey, usePhoto: true });
  body.querySelector('#f-manual').onclick = () => { state.tab = 'manual'; renderStart(viewRoot(), [], { d: date }); };
}

function renderTexto(body, date, hasKey) {
  body.innerHTML = `
    <div class="card">
      <div class="card-title"><h3>${icon('note')} Describe tu plato</h3></div>
      <label class="field"><span class="lbl">¿Qué comiste?</span>
        <textarea id="t-desc" rows="4" placeholder="Ej. 1 lomo saltado con arroz (poco), 1 vaso de chicha morada, 1 presa de pollo a la brasa">${esc(state.desc)}</textarea></label>
      <button class="btn btn-accent btn-lg btn-block" id="t-go" type="button">${icon('sparkles')} Analizar con la IA</button>
      ${!hasKey ? `<div class="hint">Necesitas tu API key: <a href="#/ajustes">Ajustes → IA</a>.</div>` : ''}
      <div class="hint">No consume fotos (usa menos cuota). También puedes guardar sin IA desde la pestaña “Manual”.</div>
    </div>`;
  body.querySelector('#t-desc').oninput = e => { state.desc = e.target.value; };
  body.querySelector('#t-go').onclick = () => runAI({ date, hasKey, usePhoto: false });
}

function renderManual(body, date) {
  if (!state.draft || state.draft.id) {
    state.draft = newDraft({ date, type: guessType(), source: 'manual', name: state.desc ? state.desc.slice(0, 60) : '' });
  }
  state.draft.date = date;
  const draw = () => {
    body.innerHTML = `
      <div class="card">
        <div class="card-title"><h3>${icon('pencil')} Ingresar alimentos a mano</h3>
          <span class="badge">${state.draft.items.length} ingrediente${state.draft.items.length === 1 ? '' : 's'}</span></div>
        <label class="field"><span class="lbl">Buscar alimento</span>
          <input id="m-q" type="search" placeholder="Ej. arroz, pollo, lomo saltado…" autocomplete="off"></label>
        <div id="m-list"></div>
      </div>
      <div class="col">
        <button class="btn btn-primary btn-lg btn-block" id="m-rev" type="button" ${state.draft.items.length ? '' : 'disabled'}>
          Revisar y guardar (${state.draft.items.length}) →</button>
        <a class="btn btn-block" href="#/hoy/${date}">Cancelar</a>
      </div>`;
    const list = body.querySelector('#m-list');
    const drawList = q => {
      const res = searchFoods(q);
      list.innerHTML = res.map(f => `<button class="list-item" data-i="${FOODS.indexOf(f)}" type="button">
        <div class="li-main"><div class="li-t">${esc(f.n)}</div>
        <div class="li-s">${f.k} kcal · P ${f.p} · C ${f.c} · G ${f.f} /100 g</div></div>
        <div class="li-end">＋</div></button>`).join('') ||
        '<p class="small muted">Sin resultados. Prueba con otro nombre o usa la pestaña Foto/Texto con IA.</p>';
      list.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
        const food = FOODS[Number(b.dataset.i)];
        if (!food) { openAddSheet(state.draft, draw); return; }
        const s = openSheet('');
        pickGrams(food, s, state.draft, () => draw());
      });
    };
    drawList('');
    body.querySelector('#m-q').oninput = e => drawList(e.target.value);
    body.querySelector('#m-rev').onclick = () => { state.draft.source = 'manual'; location.hash = '#/nuevo'; };
  };
  draw();
}

function renderFavoritos(body, date, favorites) {
  if (!state.draft || state.draft.id) state.draft = newDraft({ date, type: guessType(), source: 'favorito' });
  state.draft.date = date;
  body.innerHTML = `
    <div class="card">
      <div class="card-title"><h3>${icon('star')} Tus platos guardados</h3>
        <span class="badge">${favorites.length}</span></div>
      <p class="tiny muted">Reutilizar un favorito <b>no gasta consultas</b> a la IA.</p>
      ${favorites.length ? favorites.map(f => {
    const t = computeTotals(f.items);
    return `<button class="list-item" data-f="${f.id}" type="button">
          <div class="li-main"><div class="li-t">${esc(f.name)}</div>
            <div class="li-s">${num(t.kcal)} kcal · P ${t.protein} · C ${t.carbs} · G ${t.fat} · ${f.items.length} ingred.</div></div>
          <div class="li-end">Usar<br><span class="tiny">⋯</span></div>
        </button>`;
  }).join('') : `<div class="empty"><span class="ico">${icon('star')}</span><b>No tienes favoritos aún</b>
        <p class="small muted">Guarda un plato desde el editor (botón “Guardar favorito”) y aquí aparecerá.</p></div>`}
    </div>`;
  body.querySelectorAll('[data-f]').forEach(b => b.onclick = () => {
    const f = favorites.find(x => String(x.id) === b.dataset.f);
    if (!f) return;
    useFavorite(f, date, body);
  });
}

function useFavorite(f, date, body) {
  const s = openSheet(`
    <h2>${esc(f.name)}</h2>
    <p class="small muted">¿A qué comida la asignamos?</p>
    <div class="chips big" id="uf-t">
      ${TIPOS_COMIDA.map(t => `<button class="chip ${guessType() === t ? 'active' : ''}" data-t="${t}" type="button">${icon(ICONO_TIPO[t])} ${t}</button>`).join('')}
    </div>
    <div class="grid2" style="margin-top:14px">
      <button class="btn btn-primary" id="uf-ok" type="button">Cargar y editar</button>
      <button class="btn btn-ghost" id="uf-no" type="button">Cancelar</button>
    </div>`);
  let type = guessType();
  s.root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
    type = b.dataset.t;
    s.root.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('active', x.dataset.t === type));
  });
  s.root.querySelector('#uf-no').onclick = s.close;
  s.root.querySelector('#uf-ok').onclick = () => {
    state.draft = newDraft({
      date, type, name: f.name, source: 'favorito', favId: f.id, photo: '',
      items: JSON.parse(JSON.stringify(f.items || []))
    });
    s.close();
    location.hash = '#/nuevo';
  };
}

/* ---------- Foto + IA ---------- */
function pickPhoto(capture, body, date, hasKey) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  if (capture) input.capture = 'environment';
  input.onchange = async () => {
    const f = input.files && input.files[0];
    if (!f) return;
    try {
      const raw = await fileToDataURL(f);
      state.photo = await resizeImage(raw, 1024, 0.78);
      toast('Foto lista.', 'ok');
    } catch (e) {
      toast('No se pudo leer la imagen.', 'err');
      return;
    }
    renderStart(viewRoot(), [], { d: date });
  };
  document.body.appendChild(input); input.click(); input.remove();
}

async function runAI({ date, hasKey, usePhoto }) {
  const root = viewRoot();
  const body = root.querySelector('#lg-body');
  const settings = await getSettings();
  const descEl = body.querySelector('#f-desc') || body.querySelector('#t-desc');
  if (descEl) state.desc = descEl.value;
  if (!hasKey || !settings.apiKey) {
    toast('Configura tu API key en Ajustes → IA primero.', 'warn');
    location.hash = '#/ajustes';
    return;
  }
  if (usePhoto && !state.photo) { toast('Toma o elige una foto primero (o usa la pestaña Texto).', 'warn'); return; }
  if (!usePhoto && !state.desc.trim()) { toast('Escribe qué comiste primero.', 'warn'); return; }

  body.innerHTML = `
    <div class="card loading-block">
      <div class="spinner"></div>
      <b>Analizando con Gemini…</b>
      <p class="small muted">Esto puede tardar entre 5 y 25 segundos.<br>
      ${state.photo && usePhoto ? 'Enviando foto' : 'Enviando descripción'} + tus instrucciones de IA.</p>
      <button class="btn btn-ghost btn-sm" id="ai-cancel" type="button">Cancelar</button>
    </div>`;

  let cancelled = false;
  body.querySelector('#ai-cancel').onclick = () => { cancelled = true; renderStart(root, [], { d: date }); };

  try {
    const prompt = (await getPrompt()) || DEFAULT_PROMPT;
    const res = await analyzeMeal({
      imageDataUrl: usePhoto ? state.photo : null,
      description: state.desc,
      prompt,
      apiKey: settings.apiKey,
      model: settings.model
    });
    if (cancelled) return;

    const profile = await getProfile();
    const targets = profile ? calcTargets(profile) : null;
    state.draft = newDraft({
      date, type: guessType(), name: res.name, source: 'ia',
      photo: usePhoto ? state.photo : '',
      note: res.comment || state.desc || '',
      items: res.items
    });
    if (targets) state.draft._kcalTarget = (profile.targets && profile.targets.kcal) || targets.kcal;
    state.desc = '';
    const sumG = res.items.reduce((a, i) => a + (Number(i.gramos) || 0), 0);
    if (sumG > 700) {
      toast(`La IA estimó ${Math.round(sumG)} g para un solo plato: revisa los gramos antes de guardar.`, 'warn');
    } else {
      toast('Plato detectado. Revisa y corrige antes de guardar.', 'ok');
    }
    location.hash = '#/nuevo';
  } catch (e) {
    if (cancelled) return;
    const msg = e && e.message ? e.message : 'Error desconocido.';
    body.innerHTML = `
      <div class="card">
        <div class="card-title"><h3>No se pudo analizar</h3></div>
        <div class="note danger">${esc(msg)}</div>
        <div class="col">
          <button class="btn btn-primary btn-block" id="ai-retry" type="button">Reintentar</button>
          <a class="btn btn-block" href="#/registrar?d=${date}">Elegir otra opción</a>
          <a class="btn btn-ghost btn-block" href="#/ajustes">Ir a Ajustes → IA</a>
          <button class="btn btn-ghost btn-block" id="ai-manual" type="button">${icon('pencil')} Ingresar a mano (sin IA)</button>
        </div>
      </div>`;
    body.querySelector('#ai-retry').onclick = () => runAI({ date, hasKey, usePhoto });
    body.querySelector('#ai-manual').onclick = () => {
      state.draft = newDraft({ date, type: guessType(), source: 'manual', photo: usePhoto ? state.photo : '', note: state.desc });
      state.tab = 'manual';
      renderStart(root, [], { d: date });
    };
    toast(msg, 'err');
  }
}

function guessType() {
  const h = new Date().getHours();
  if (h < 11) return 'desayuno';
  if (h < 16) return 'almuerzo';
  if (h < 21) return 'cena';
  return 'snack';
}

/* ================= EDITOR ================= */
export async function renderNew(root) {
  if (!state.draft) { location.hash = '#/registrar'; return; }
  const profile = await getProfile();
  const targets = profile ? calcTargets(profile) : null;
  const draft = state.draft;
  mountEditor(root, draft, {
    kcalTarget: draft._kcalTarget || (profile ? (profile.targets?.kcal || (targets && targets.kcal)) : 0),
    onSave: d => saveMeal(d),
    onSaveFavorite: d => saveFav(d)
  });
}

export async function renderEdit(root, args) {
  const id = Number(args[0]);
  const meal = await DB.get('meals', id);
  if (!meal) { toast('No encontré esa comida.', 'err'); location.hash = '#/hoy'; return; }
  const profile = await getProfile();
  const targets = profile ? calcTargets(profile) : null;
  mountEditor(root, meal, {
    kcalTarget: profile ? (profile.targets?.kcal || (targets && targets.kcal)) : 0,
    onSave: async d => {
      d.updatedAt = Date.now();
      await DB.put('meals', d);
      toast('Cambios guardados.', 'ok');
      location.hash = `#/hoy/${d.date}`;
    },
    onDelete: async () => {
      const ok = await confirmSheet({ title: '¿Eliminar la comida?', msg: 'Se borrará de forma permanente de este día.', okText: 'Eliminar', danger: true });
      if (!ok) return;
      await DB.del('meals', meal.id);
      toast('Comida eliminada.', 'ok');
      location.hash = `#/hoy/${meal.date}`;
    },
    onSaveFavorite: d => saveFav(d),
    onReanalyze: async d => {
      const settings = await getSettings();
      const desc = [d.name, d.note].filter(s => s && String(s).trim()).join('. ').trim();
      if (!d.photo && !desc) throw new Error('Este plato no tiene foto ni nombre para re-analizar.');
      const prompt = (await getPrompt()) || DEFAULT_PROMPT;
      const res = await analyzeMeal({
        imageDataUrl: d.photo || null,
        description: desc,
        prompt,
        apiKey: settings.apiKey,
        model: settings.model
      });
      if (!res.items || !res.items.length) throw new Error('La IA no devolvió ingredientes.');
      d.items = res.items;
      const t = computeTotals(d.items);
      toast(`Porciones recalculadas: ${Math.round(t.grams)} g y ${Math.round(t.kcal)} kcal. Revisa y guarda.`, 'ok');
    }
  });
}

async function saveMeal(draft) {
  const meal = {
    id: draft.id || uid(),
    date: draft.date || todayISO(),
    type: draft.type || 'almuerzo',
    name: (draft.name || 'Plato').slice(0, 80),
    note: (draft.note || '').slice(0, 160),
    photo: draft.photo || '',
    items: draft.items,
    totals: computeTotals(draft.items),
    source: draft.source || 'manual',
    favId: draft.favId || null,
    createdAt: draft.createdAt || Date.now(),
    updatedAt: Date.now()
  };
  await DB.put('meals', meal);
  state.draft = null;
  toast(`Guardado: ${num(meal.totals.kcal)} kcal.`, 'ok');
  location.hash = `#/hoy/${meal.date}`;
}

async function saveFav(draft) {
  const existing = draft.favId ? await DB.get('favorites', draft.favId) : null;
  const fav = {
    id: existing ? existing.id : uid(),
    name: (draft.name || (draft.items[0] && draft.items[0].nombre) || 'Plato favorito').slice(0, 80),
    items: JSON.parse(JSON.stringify(draft.items)),
    type: draft.type,
    createdAt: existing ? existing.createdAt : Date.now()
  };
  await DB.put('favorites', fav);
  toast('Guardado en favoritos (sin costo de IA).', 'ok');
}
