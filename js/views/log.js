/* Registro de comidas: foto + IA, texto, manual y favoritos. También editor. */

import { DB, getSettings, getProfile, getPrompt, buscarPlatoBase, guardarPlatoBase } from '../db.js';
import { icon } from '../icons.js';
import { analyzeMeal, DEFAULT_PROMPT, claveConsulta, planPorciones, aplicarMultiplicador, detectarAmbiguedades } from '../ai.js';
import { mountEditor, newDraft, openAddSheet, pickGrams } from '../editor.js';
import { calcTargets, computeTotals, searchFoods, FOODS } from '../nutrition.js';
import {
  todayISO, esc, num, toast, confirmSheet, openSheet, fileToDataURL, resizeImage,
  TIPOS_COMIDA, ICONO_TIPO, fmtLongDate, uid, debounce, elegirTipo, faltanPorHora
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
  else if (state.tab === 'manual') await renderManual(body, date);
  else await renderFavoritos(body, date, favorites);
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
  body.querySelector('#f-shot').onclick = () => abrirCamara(date);
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

async function renderManual(body, date) {
  if (!state.draft || state.draft.id) {
    const s = await sugerirTipo(date, state.draft ? state.draft.items : null);
    state.draft = newDraft({ date, type: s.type, source: 'manual', name: state.desc ? state.desc.slice(0, 60) : '' });
    state.draft._hint = s.hint;
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

async function renderFavoritos(body, date, favorites) {
  if (!state.draft || state.draft.id) {
    const s = await sugerirTipo(date, null);
    state.draft = newDraft({ date, type: s.type, source: 'favorito' });
    state.draft._hint = s.hint;
  }
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

async function useFavorite(f, date, body) {
  const sug = await sugerirTipo(date, f.items);
  const s = openSheet(`
    <h2>${esc(f.name)}</h2>
    <p class="small">¿A qué comida la asignamos?</p>
    <p class="tiny muted" style="margin:-6px 0 8px">${sug.hint}</p>
    <div class="chips big" id="uf-t">
      ${TIPOS_COMIDA.map(t => `<button class="chip ${sug.type === t ? 'active' : ''}" data-t="${t}" type="button">${icon(ICONO_TIPO[t])} ${t}</button>`).join('')}
    </div>
    <div class="grid2" style="margin-top:14px">
      <button class="btn btn-primary" id="uf-ok" type="button">Cargar y editar</button>
      <button class="btn btn-ghost" id="uf-no" type="button">Cancelar</button>
    </div>`);
  let type = sug.type;
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
    state.draft._hint = sug.hint;
    s.close();
    location.hash = '#/nuevo';
  };
}

/* ---------- Foto + IA ---------- */
/* Cámara DENTRO de la app: no hay que salir a otra aplicación, así que no se
   pierde el evento de la foto al volver (el bug de "no carga hasta reiniciar"). */
function abrirCamara(date) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    pickPhoto(true, viewRoot(), date, true);   // respaldo: selector del sistema
    return;
  }
  let stream = null;
  let facing = 'environment';
  let cerrado = false;

  const back = document.createElement('div');
  back.className = 'cam-back';
  back.innerHTML = `
    <video class="cam-video" playsinline autoplay muted></video>
    <div class="cam-aviso hidden">Pidiendo acceso a la cámara…</div>
    <div class="cam-bar">
      <button class="btn btn-ghost" type="button" data-close>Cancelar</button>
      <button class="cam-snap" type="button" data-snap aria-label="Tomar foto"><span></span></button>
      <button class="btn btn-ghost" type="button" data-flip>Cambiar</button>
    </div>`;
  document.getElementById('modal-root').appendChild(back);

  const video = back.querySelector('video');
  const aviso = back.querySelector('.cam-aviso');
  const onHide = () => { if (document.hidden) cerrar(); };

  const cerrar = () => {
    if (cerrado) return;
    cerrado = true;
    try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch (e) {}
    document.removeEventListener('visibilitychange', onHide);
    document.removeEventListener('keydown', onKey);
    back.remove();
  };
  const onKey = e => { if (e.key === 'Escape') cerrar(); };

  const pedir = async () => {
    if (stream) { try { stream.getTracks().forEach(t => t.stop()); } catch (e) {} stream = null; }
    aviso.classList.remove('hidden');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
      video.srcObject = stream;
      aviso.classList.add('hidden');
      await video.play().catch(() => {});
    } catch (e) {
      cerrar();
      const denegado = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError' || e.name === 'NotFoundError');
      toast(denegado
        ? 'No se pudo usar la cámara. Permite el acceso a la cámara o usa "Galería".'
        : 'No se pudo abrir la cámara. Usa "Galería" para elegir una foto.', 'warn');
      if (!denegado) pickPhoto(true, viewRoot(), date, true);
    }
  };

  const capturar = async () => {
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) { toast('La cámara aún no está lista. Intenta otra vez.', 'warn'); return; }
    const snap = back.querySelector('[data-snap]');
    snap.disabled = true;
    try {
      const canvas = document.createElement('canvas');
      const r = Math.min(1, 1024 / Math.max(w, h));
      canvas.width = Math.round(w * r);
      canvas.height = Math.round(h * r);
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      const raw = canvas.toDataURL('image/jpeg', 0.86);
      state.photo = await resizeImage(raw, 1024, 0.78);
      cerrar();
      toast('Foto lista.', 'ok');
      renderStart(viewRoot(), [], { d: date });
    } catch (e) {
      snap.disabled = false;
      toast('No se pudo guardar la foto. Intenta otra vez.', 'err');
    }
  };

  back.querySelector('[data-close]').onclick = cerrar;
  back.querySelector('[data-snap]').onclick = capturar;
  back.querySelector('[data-flip]').onclick = () => { facing = facing === 'environment' ? 'user' : 'environment'; pedir(); };
  back.addEventListener('click', e => { if (e.target === back) cerrar(); });
  document.addEventListener('visibilitychange', onHide);
  document.addEventListener('keydown', onKey);
  pedir();
}

/* El input del selector queda en la página hasta que llega la foto o se cancela:
   si se quita de inmediato, al volver de la cámara/galería a veces no llega el evento
   y la foto "no carga" hasta cerrar y abrir la app. */
let pickerPendiente = null;

function pickPhoto(capture, body, date, hasKey) {
  if (pickerPendiente) pickerPendiente.cerrar();
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  if (capture) input.capture = 'environment';
  input.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0';

  let procesado = false;
  const cerrar = () => {
    if (pickerPendiente && pickerPendiente.input === input) pickerPendiente = null;
    input.removeEventListener('change', procesar);
    if (input.parentNode) input.remove();
  };
  const procesar = async () => {
    if (procesado) return;
    const f = input.files && input.files[0];
    if (!f) return;
    procesado = true;
    cerrar();
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
  input.addEventListener('change', procesar);
  input.addEventListener('cancel', cerrar);
  pickerPendiente = { input, cerrar };
  document.body.appendChild(input);
  input.click();
}

/* Al volver a la app (se abrió la cámara/galería y regresamos). */
export function alVolverDeFoto() {
  const p = pickerPendiente;
  if (!p) return;
  if (p.input.files && p.input.files.length) {
    p.input.dispatchEvent(new Event('change'));   // el evento "change" no llegó solo
    return;
  }
  setTimeout(() => {                              // volvió sin foto: el selector se canceló
    if (pickerPendiente === p && !(p.input.files && p.input.files.length)) p.cerrar();
  }, 1200);
}

/* ================= ACLARACIONES ANTES DE ANALIZAR ================= */
/** Pregunta por escrito lo que falta (¿qué leche?) y resuelve con la opción elegida. */
function preguntarVariante(a) {
  return new Promise(resolve => {
    const s = openSheet(`
      <h2>Antes de analizar…</h2>
      <p class="small muted">Una pregunta rápida para que los gramos salgan más precisos.
        Lo guardamos en tu celular y no te lo volvemos a preguntar.</p>
      <h3 style="margin-top:12px">${esc(a.titulo)}</h3>
      <div class="chips big">
        ${a.opciones.map(o => `<button type="button" class="chip" data-ac="${esc(o)}">${esc(o)}</button>`).join('')}
      </div>
      <button class="btn btn-ghost btn-block" type="button" data-ac-skip style="margin-top:12px">Omitir (que la IA suponga)</button>`,
      { sticky: true });
    const onEsc = e => { if (e.key === 'Escape') terminar(null); };
    const terminar = v => { document.removeEventListener('keydown', onEsc); s.close(); resolve(v); };
    document.addEventListener('keydown', onEsc);
    s.root.querySelectorAll('[data-ac]').forEach(b => { b.onclick = () => terminar(b.dataset.ac); });
    s.root.querySelector('[data-ac-skip]').onclick = () => terminar(null);
  });
}

async function variantesGuardadas() {
  try { const r = await DB.kvGet('variantes'); return (r && r.map) || {}; }
  catch (e) { return {}; }
}

/**
 * Pregunta SIEMPRE las variantes que el texto no precisa (un día puede ser leche
 * evaporada y otro entera), y devuelve SOLO las respuestas de esta vez.
 * La última respuesta de cada variante queda guardada en el celular solo para
 * el re-analizar (ahí no se pregunta, para no gastar cuota).
 */
async function pedirAclaraciones(desc) {
  const pend = detectarAmbiguedades(desc);
  const respuestas = {};
  for (const a of pend) {
    const r = await preguntarVariante(a);
    if (r) respuestas[a.clave] = r;
  }
  if (Object.keys(respuestas).length) {
    try {
      const guardadas = await variantesGuardadas();
      await DB.kvSet({ k: 'variantes', map: { ...guardadas, ...respuestas } });
    } catch (e) { console.warn('No se guardaron las variantes:', e); }
  }
  return respuestas;
}

/** Aclaraciones que aplican a este texto (sin preguntar nada). */
async function aclaracionesDe(desc, base) {
  const guardadas = base || await variantesGuardadas();
  const out = {};
  for (const a of detectarAmbiguedades(desc)) {
    if (guardadas[a.clave] !== undefined) out[a.clave] = guardadas[a.clave];
  }
  return out;
}

/** "…leche con avena" + {leche:'entera'} → "…leche con avena. Aclaración del usuario: leche = entera." */
function anexarAclaraciones(desc, aclar) {
  const partes = Object.entries(aclar || {}).filter(([, v]) => v).map(([k, v]) => `${k} = ${v}`);
  if (!partes.length) return desc;
  return `${desc}. Aclaración del usuario: ${partes.join('; ')}.`;
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

  const desc = (state.desc || '').trim();
  const plan = planPorciones(desc);

  // 1) lo que no especificaste se pregunta SIEMPRE (antes de mirar la base local:
  //    un día puede ser leche evaporada y otro entera)
  const aclar = await pedirAclaraciones(desc).catch(() => ({}));
  const descFinal = anexarAclaraciones(desc, aclar);

  // 2) ¿ya analizamos ESTA variante? Entonces sale de la base local: mismo resultado y 0 cuota
  const clave = descFinal && !usePhoto ? claveConsulta(descFinal) : '';
  if (clave && plan.local) {
    const base = await buscarPlatoBase(clave).catch(() => null);
    if (base && base.items && base.items.length) {
      const items = aplicarMultiplicador(base.items, plan.mult);
      const nm = nombreConCantidad(base.nombre || desc, plan.mult);
      await montarDraftIA({
        date, name: base.nombre || desc, source: 'base', items, photo: '',
        note: notaPlato('Base local · sin gastar cuota', { supuestos: base.supuestos }),
        mult: plan.mult, baseClave: clave
      });
      toast(`Tu base local: ${nm} (sin consultar la IA).`, 'ok');
      return;
    }
  }

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
      description: descFinal,
      prompt,
      apiKey: settings.apiKey,
      model: settings.model,
      mult: plan.mult,
      multLocal: plan.local
    });
    if (cancelled) return;

    // 2) lo aprendido queda guardado en la base local para no repetir la consulta
    if (clave && plan.local) {
      try {
        await guardarPlatoBase({
          clave,
          consultas: [clave, claveConsulta(res.name)].filter(Boolean),
          nombre: res.name,
          items: res.baseItems || res.items,
          fuente: 'ia',
          confianza: res.confianza,
          supuestos: (res.supuestos || []).filter(s => !/lo pediste tú/.test(s))
        });
      } catch (e) { console.warn('No se pudo guardar en la base local:', e); }
    }

    await montarDraftIA({
      date, name: res.name, source: 'ia', items: res.items,
      photo: usePhoto ? state.photo : '',
      note: notaPlato(res.comment, res),
      mult: plan.mult, baseClave: clave || claveConsulta(res.name)
    });

    const sumG = res.items.reduce((a, i) => a + (Number(i.gramos) || 0), 0);
    if (plan.mult > 1) {
      toast(`Plato × ${plan.mult}: ${Math.round(sumG)} g en total (misma porción por plato). Revisa antes de guardar.`, 'ok');
    } else if (plan.mult < 1) {
      const como = plan.mult === 0.5
        ? 'Media porción: los gramos ya salen a la mitad'
        : `Porción ×${plan.mult}: los gramos ya salen ajustados`;
      toast(`${como} (lo pediste tú). Revisa antes de guardar.`, 'ok');
    } else if (sumG > 700) {
      toast(`La IA estimó ${Math.round(sumG)} g para un solo plato: revisa los gramos antes de guardar.`, 'warn');
    } else {
      toast('Plato detectado. Revisa y corrige antes de guardar.', 'ok');
    }
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
    body.querySelector('#ai-manual').onclick = async () => {
      const s = await sugerirTipo(date, null);
      state.draft = newDraft({ date, type: s.type, source: 'manual', photo: usePhoto ? state.photo : '', note: state.desc });
      state.draft._hint = s.hint;
      state.tab = 'manual';
      renderStart(root, [], { d: date });
    };
    toast(msg, 'err');
  }
}

/** Quita el prefijo de cantidad ("1/2 Manzana" → "Manzana", "2 platos de Arroz
    con pollo" → "Arroz con pollo") para que la cantidad nunca se duplique. */
function sinCantidad(nombre) {
  return String(nombre || '')
    .replace(/^\s*(?:\d+\/\d+|[¼½¾])\s+/, '')
    .replace(/^\s*\d+\s+platos?\s+de\s+/i, '')
    .replace(/^\s*\d+(?:[.,]\d+)?\s*[×x]\s+/i, '')
    .trim();
}

/** Nombre visible con la cantidad pedida: "1/2 Manzana", "1/4 Galleta",
    "2 platos de Arroz con pollo". Sin cantidad (mult 1) el nombre queda tal cual. */
function nombreConCantidad(nombre, m) {
  const mult = Number(m) || 1;
  const n = sinCantidad(nombre);
  if (mult === 1 || !n) return String(nombre || '').trim();
  if (mult === 0.5) return `1/2 ${n}`;
  if (mult === 0.25) return `1/4 ${n}`;
  if (mult === 0.75) return `3/4 ${n}`;
  if (mult < 1) return `${mult}× ${n}`;
  return `${mult} platos de ${n}`;
}

/** Arma el borrador del editor a partir de un análisis (IA o base local). */
async function montarDraftIA(o) {
  const profile = await getProfile();
  const targets = profile ? calcTargets(profile) : null;
  const s = await sugerirTipo(o.date, o.items);
  state.draft = newDraft({
    date: o.date, type: s.type, name: nombreConCantidad(o.name, o.mult), source: o.source,
    photo: o.photo || '', note: o.note || '', items: o.items,
    mult: o.mult || 1, baseClave: o.baseClave || ''
  });
  state.draft._hint = s.hint;
  if (targets) state.draft._kcalTarget = (profile.targets && profile.targets.kcal) || targets.kcal;
  state.desc = '';
  location.hash = '#/nuevo';
}

/** Nota del plato: comentario de la IA + supuestos + confianza. */
function notaPlato(comentario, res) {
  const p = [];
  if (comentario) p.push(String(comentario).slice(0, 140));
  if (res && res.supuestos && res.supuestos.length) p.push('Supuestos: ' + res.supuestos.join('; ').slice(0, 140));
  if (res && res.confianza != null) p.push(Math.round(res.confianza * 100) + '% seguro');
  return p.join(' · ').slice(0, 240);
}

/** Guarda en la base local lo que el usuario corrigió en el editor ("esa avena es de 40 g"). */
async function guardarBaseDesdeEditor(d) {
  const mult = Number(d.mult) || 1;
  const limpio = sinCantidad(d.name || '');   // la base guarda la porción COMPLETA con su nombre sin cantidad
  const clave = d.baseClave || claveConsulta(limpio);
  if (!clave) { toast('Ponle nombre al plato antes de guardarlo como estándar.', 'warn'); return; }
  const items = mult !== 1
    ? d.items.map(it => ({ ...it, gramos: Math.round((Number(it.gramos) || 0) / mult * 10) / 10 }))
    : d.items;
  await guardarPlatoBase({ clave, consultas: [clave, claveConsulta(limpio)].filter(Boolean), nombre: limpio, items, fuente: 'usuario' });
  toast(`Porción estándar guardada: "${limpio}" (sin gastar cuota en tu próxima consulta).`, 'ok');
}

/**
 * Une la respuesta de la IA con lo que ya corregiste a mano.
 * Lo marcado como editado (nombre o gramos) MANDA sobre lo que devuelva la IA;
 * lo demás se actualiza con la nueva estimación.
 */
function fusionarReanalisis(viejos, nuevos) {
  const coincide = (a, b) => {
    const ka = claveConsulta(a || ''), kb = claveConsulta(b || '');
    if (!ka || !kb) return false;
    if (ka === kb) return true;
    const ta = ka.split(' '), tb = kb.split(' ');
    const chico = ta.length <= tb.length ? ta : tb;
    const grande = ta.length <= tb.length ? tb : ta;
    return chico.every(x => grande.includes(x));
  };
  let conservados = 0;
  const items = (nuevos || []).map(n => {
    const m = (viejos || []).find(v => v.editado && coincide(v.nombre, n.nombre));
    if (!m) return n;
    conservados++;
    return { ...n, nombre: m.nombre, gramos: m.gramos, per100: m.per100 || n.per100, nota: m.nota || n.nota, editado: true };
  });
  (viejos || []).forEach(v => {
    if (v.editado && !(nuevos || []).some(n => coincide(v.nombre, n.nombre))) {
      items.push(v);
      conservados++;
    }
  });
  return { items, conservados };
}

/**
 * Re-análisis con la IA desde el editor (plato nuevo o ya guardado):
 * pide confirmación en el botón, conserva tus correcciones manuales y
 * re-estima el resto con la foto/nombre/nota actuales.
 */
async function reanalizarDraft(d) {
  const settings = await getSettings();
  const oldG = Math.round((d.items || []).reduce((a, i) => a + (Number(i.gramos) || 0), 0));
  const prev = (d.items || []).filter(i => Number(i.gramos) > 0)
    .map(i => `${Math.round(Number(i.gramos))} g de ${(i.nombre || '').trim()}`);
  const partes = [d.name, d.note];
  if (prev.length) {
    partes.push(`Cantidades registradas actualmente: ${prev.join(', ')}.`);
    partes.push('No aumentes estas cantidades: solo puedes bajarlas si son excesivas para UN plato personal.');
  }
  let desc = partes.filter(s => s && String(s).trim()).join('. ').trim();
  // tus aclaraciones guardadas (leche = evaporada…) también valen al re-analizar
  const aclar = await aclaracionesDe([d.name, d.note, ...(d.items || []).map(i => i.nombre)].join(' ')).catch(() => ({}));
  desc = anexarAclaraciones(desc, aclar);
  if (!d.photo && !desc) throw new Error('Este plato no tiene foto ni nombre para re-analizar.');
  const prompt = (await getPrompt()) || DEFAULT_PROMPT;
  const res = await analyzeMeal({
    imageDataUrl: d.photo || null,
    description: desc,
    prompt,
    apiKey: settings.apiKey,
    model: settings.model,
    maxTotalG: oldG > 0 ? Math.round(oldG * 1.15) : 0
  });
  if (!res.items || !res.items.length) throw new Error('La IA no devolvió ingredientes.');
  const fusion = fusionarReanalisis(d.items || [], res.items);
  d.items = fusion.items;
  const t = computeTotals(d.items);
  const conservados = fusion.conservados
    ? ` Mantuvimos ${fusion.conservados} corrección${fusion.conservados === 1 ? '' : 'es'} manual${fusion.conservados === 1 ? '' : 'es'}.`
    : '';
  if (oldG > 0 && t.grams > oldG + 15) {
    toast(`Ojo: la IA subió las porciones de ${oldG} g a ${t.grams} g. Bájalas a mano si no te cuadran (${t.kcal} kcal).${conservados}`, 'warn');
  } else {
    toast(`Porciones recalculadas: ${t.grams} g y ${t.kcal} kcal.${conservados} Revisa y guarda.`, 'ok');
  }
}

/** Tipos de comida ya registrados en una fecha. */async function tiposDelDia(date) {
  try {
    const meals = await DB.byDate('meals', date || todayISO());
    return meals.map(m => m.type).filter(Boolean);
  } catch (e) { return []; }
}

/** Tamaño estimado de lo que vas a registrar: ¿es plato o cosa pequeña? */
function tamanioDe(items) {
  if (!items || !items.length) return '';
  const t = computeTotals(items);
  if (t.kcal >= 350 || t.grams >= 350) return 'plato';
  if (t.kcal <= 200) return 'pequeno';
  return '';
}

/**
 * Sugerencia de comida según la hora del día, lo que ya comiste hoy y el
 * tamaño de lo que vas a registrar. Devuelve { type, hint }.
 */
async function sugerirTipo(date, items) {
  const hechos = await tiposDelDia(date);
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  const type = elegirTipo(h, hechos, tamanioDe(items));
  const f = faltanPorHora(h, hechos);
  let hint = 'Sugerido por la hora y por lo que ya comiste hoy.';
  if (f.length) hint += ` Todavía no registras: <b>${f.join(', ')}</b>.`;
  return { type, hint };
}

/* ================= EDITOR ================= */
export async function renderNew(root) {
  if (!state.draft) { location.hash = '#/registrar'; return; }
  const profile = await getProfile();
  const targets = profile ? calcTargets(profile) : null;
  const draft = state.draft;
  mountEditor(root, draft, {
    kcalTarget: draft._kcalTarget || (profile ? (profile.targets?.kcal || (targets && targets.kcal)) : 0),
    tipoHint: draft.id ? '' : (draft._hint || ''),
    onSave: d => saveMeal(d),
    onSaveFavorite: d => saveFav(d),
    onGuardarBase: d => guardarBaseDesdeEditor(d),
    onReanalyze: d => reanalizarDraft(d)
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
    onGuardarBase: d => guardarBaseDesdeEditor(d),
    onReanalyze: d => reanalizarDraft(d)
  });
}

async function saveMeal(draft) {
  const meal = {
    id: draft.id || uid(),
    date: draft.date || todayISO(),
    type: draft.type || 'almuerzo',
    name: (draft.name || 'Plato').slice(0, 80),
    note: (draft.note || '').slice(0, 240),
    photo: draft.photo || '',
    items: draft.items,
    totals: computeTotals(draft.items),
    source: draft.source || 'manual',
    mult: Number(draft.mult) || 1,
    baseClave: draft.baseClave || '',
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
