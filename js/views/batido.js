/* Arma tu batido: licuadora gráfica que se llena al agregar ingredientes.
   Cada ingrediente tiene su unidad de medida (medio vaso, cucharada, unidad…),
   se controla con ＋/− en la propia lista, admite una descripción opcional que
   recalcula cantidades en el celular y permite agregar ingredientes extra. */

import { icon } from '../icons.js';
import { computeTotals } from '../nutrition.js';
import { esc, num, toast, todayISO, fmtLongDate, confirmSheet, openSheet, qtyTexto, uid } from '../util.js';
import { newDraft } from '../editor.js';
import { sugerirTipo, saveMeal } from './log.js';
import { clic, check, licuar } from '../sound.js';

const CAP = 700;          // ml de la licuadora (≈ g)
const INNER_TOP = 42;
const INNER_H = 164;
const INNER_BOTTOM = INNER_TOP + INNER_H;
const MARCAS = [200, 400, 600];   // marcas de ml del vaso

/** Ingredientes del batido: unidad de medida, color de capa y macros por 100 g. */
export const INGREDIENTES = [
  { g: 'Base líquida', id: 'leche', n: 'Leche entera', p: 'Medio vaso (125 ml)', gr: 125, c: '#f4efe4', m: { k: 61, p: 3.2, c: 4.8, f: 3.3, fi: 0 }, al: ['leche'],
    tipos: [
      { id: 'entera', c: 'Entera', n: 'Leche entera', p: 'Medio vaso (125 ml)', gr: 125, m: { k: 61, p: 3.2, c: 4.8, f: 3.3, fi: 0 } },
      { id: 'vaporada', c: 'Vaporada', n: 'Leche vaporada', p: 'Medio vaso (125 ml)', gr: 125, m: { k: 134, p: 6.8, c: 10, f: 7.6, fi: 0 } },
      { id: 'polvo', c: 'En polvo', n: 'Leche en polvo', p: 'Cucharada (10 g)', gr: 10, m: { k: 496, p: 26.2, c: 38.4, f: 26.2, fi: 0 } },
      { id: 'descremada', c: 'Descremada', n: 'Leche descremada', p: 'Medio vaso (125 ml)', gr: 125, m: { k: 34, p: 3.4, c: 5, f: 0.1, fi: 0 } },
      { id: 'almendras', c: 'De almendras', n: 'Leche de almendras', p: 'Medio vaso (125 ml)', gr: 125, m: { k: 15, p: 0.6, c: 0.3, f: 1.2, fi: 0 } }
    ] },
  { g: 'Base líquida', id: 'agua', n: 'Agua', p: 'Medio vaso (125 ml)', gr: 125, c: '#cfe9ff', m: { k: 0, p: 0, c: 0, f: 0, fi: 0 }, al: ['agua'] },
  { g: 'Base líquida', id: 'yogur', n: 'Yogur natural', p: 'Cucharada (20 g)', gr: 20, c: '#eef4ff', m: { k: 60, p: 3.5, c: 4.7, f: 3.3, fi: 0 }, spoon: 20, al: ['yogur', 'yogurt'] },
  { g: 'Base líquida', id: 'algarrobina', n: 'Algarrobina líquida', p: 'Cucharada (15 g)', gr: 15, c: '#8a5a2b', m: { k: 310, p: 1.5, c: 75, f: 0.5, fi: 0 }, spoon: 15, al: ['algarrobina'] },
  { g: 'Sólidos', id: 'platano', n: 'Plátano', p: '1 unidad (120 g)', gr: 120, c: '#ffd966', m: { k: 89, p: 1.1, c: 22.8, f: 0.3, fi: 2.6 }, al: ['plátano', 'banana'] },
  { g: 'Sólidos', id: 'avena', n: 'Avena', p: 'Cucharada (10 g)', gr: 10, c: '#e6d3a3', m: { k: 389, p: 16.9, c: 66.3, f: 6.9, fi: 10.6 }, spoon: 10, al: ['avena'] },
  { g: 'Sólidos', id: 'mani', n: 'Mantequilla de maní', p: 'Cucharada (16 g)', gr: 16, c: '#c98b4b', m: { k: 588, p: 25, c: 20, f: 50, fi: 6 }, spoon: 16, al: ['mantequilla de maní', 'maní'] },
  { g: 'Sólidos', id: 'miel', n: 'Miel', p: 'Cucharada (15 g)', gr: 15, c: '#f2b134', m: { k: 304, p: 0.3, c: 82, f: 0, fi: 0.2 }, spoon: 15, al: ['miel'] },
  { g: 'Sólidos', id: 'cacao', n: 'Cacao en polvo', p: 'Cucharada (10 g)', gr: 10, c: '#7a4a2b', m: { k: 228, p: 20, c: 58, f: 14, fi: 33 }, spoon: 10, al: ['cacao', 'cocoa'] },
  { g: 'Sólidos', id: 'almendras', n: 'Almendras', p: '1 unidad (1.2 g)', gr: 1.2, c: '#d9b98a', m: { k: 579, p: 21.2, c: 21.5, f: 49.9, fi: 12.5 }, max: 30, al: ['almendra'] },
  { g: 'Opcionales', id: 'proteina', n: 'Proteína en polvo', p: '1 scoop (30 g) · opcional', gr: 30, c: '#d9e9ff', m: { k: 380, p: 78, c: 8, f: 6, fi: 0 }, al: ['proteina', 'whey'] },
  { g: 'Opcionales', id: 'hielo', n: 'Hielo', p: '1 cubo (20 g)', gr: 20, c: '#dff4ff', m: { k: 0, p: 0, c: 0, f: 0, fi: 0 }, max: 20, al: ['hielo'] }
];

let sel = new Map();     // id → gramos totales de ese ingrediente
let tipoSel = new Map(); // id → tipo elegido (ej.: leche = 'polvo')
let customs = [];        // ingredientes agregados a mano: { id, n, gr, m, c, al }
let desc = '';           // descripción opcional (texto mientras se escribe)

const rawById = id => INGREDIENTES.find(i => i.id === id) || customs.find(i => i.id === id);
/** Devuelve el ingrediente CON su tipo elegido (nombre, porción y macros del tipo). */
const actIng = i => {
  if (!i || !i.tipos || !i.tipos.length) return i;
  const t = i.tipos.find(x => x.id === tipoSel.get(i.id)) || i.tipos[0];
  return Object.assign({}, i, { n: t.n, p: t.p || i.p, gr: t.gr || i.gr, m: t.m });
};
const byId = id => actIng(rawById(id));
const sinAcentos = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const todoIng = () => INGREDIENTES.concat(customs).map(actIng);
const maxU = i => i.max || 10;
const cantU = i => {
  const u = sel.get(i.id) || 0;
  return u > 0 ? u / i.gr : 0;
};

/* ================= descripción → recálculo local ================= */
const PAT_CANT = '(?:\\d+\\s*/\\s*\\d+|\\d+(?:[.,]\\d+)?|media(?:s)?|medio(?:s)?|½|un\\s+cuarto|tres\\s+cuartos)';
const PAT_UNI = '(?:mililitros?|ml|gramos?|gr\\b|g\\b|vasos?|tazas?|cucharada(?:s)?|cucharadita(?:s)?|cda(?:s)?|cdtas?|unidad(?:es)?|cubos?|scoop(?:s)?|porcion(?:es)?)';

function gramosDe(cant, uni, ing) {
  let mult = 1, n = null;
  if (cant) {
    const c = String(cant).trim();
    if (/\/\s*\d/.test(c)) { const p = c.split('/'); n = Number(p[1]) ? Number(p[0]) / Number(p[1]) : null; }
    else if (/media|medio|½/.test(c)) mult = 0.5;
    else if (/un\s*cuarto/.test(c)) mult = 0.25;
    else if (/tres\s*cuartos/.test(c)) mult = 0.75;
    else n = parseFloat(c.replace(',', '.'));
    if (n != null && !isFinite(n)) n = null;
  }
  if (uni && /^(ml|mililitros?|gramos?|gr|g)$/i.test(uni)) {
    return n != null ? n : null;                      // "200 g de avena" / "250 ml de leche"
  }
  let base = null;
  if (uni) {
    if (/vaso/.test(uni)) base = 250;
    else if (/taza/.test(uni)) base = 240;
    else if (/cuchara|cda|cdta/.test(uni)) base = ing.spoon || 10;
    else if (/cubo|unidad|scoop|porcion/.test(uni)) base = ing.gr;
    else base = ing.gr;
  }
  if (base != null) return (n != null ? n : 1) * mult * base;
  if (n != null) return n > 10 ? n : n * ing.gr;      // "3 almendras" / "200" (gramos si es grande)
  return ing.gr * mult;                               // "medio plátano"
}

function buscarGramos(txt, ing) {
  for (const a of (ing.al || [])) {
    const ra = sinAcentos(a);
    const rb = `\\b${ra}s?\\b`;
    let m = txt.match(new RegExp(`${PAT_CANT}\\s*(${PAT_UNI})?\\s*(?:de\\s+|del\\s+)?\\s*${rb}`, 'i'));
    if (m) return gramosDe(m[0].match(new RegExp(PAT_CANT, 'i'))[0], m[1], ing);
    m = txt.match(new RegExp(`${rb}\\s*(?:de\\s+|del\\s+|:|con)?\\s*(${PAT_CANT})\\s*(${PAT_UNI})?`, 'i'));
    if (m) return gramosDe(m[1], m[2], ing);
  }
  return null;
}

function aplicarDescripcion(draw) {
  const txt = sinAcentos(desc);
  if (!txt.trim()) { toast('Escribe algo primero, Ej.: “medio vaso de leche, 2 cucharadas de avena”.', 'warn'); return; }
  const hechos = [];
  for (const ing of todoIng()) {
    const g = buscarGramos(txt, ing);
    if (g != null && isFinite(g) && g > 0) {
      const tope = maxU(ing) * ing.gr;
      const gg = Math.round(Math.min(g, tope) * 10) / 10;
      sel.set(ing.id, gg);
      hechos.push(`${ing.n} ${num(gg)} g`);
    }
  }
  if (!hechos.length) { toast('No reconocí cantidades. Ej.: “medio vaso de leche, 200 g de plátano, 3 almendras”.', 'warn'); return; }
  check();
  toast(`Recalculado: ${hechos.join(', ')}.`, 'ok');
  draw();
}

/* ================= resumen flotante tras licuar ================= */
function mostrarResumen(meal) {
  const t = meal.totals || {};
  const tipo = meal.type ? meal.type.charAt(0).toUpperCase() + meal.type.slice(1) : 'Almuerzo';
  const n = (meal.items || []).length;
  const back = document.createElement('div');
  back.className = 'ov-back';
  back.id = 'bt-overlay';
  back.innerHTML = `
    <div class="ov-card" role="dialog" aria-modal="true">
      <div class="ov-ico">${icon('checkCircle')}</div>
      <h3>Batido añadido a tu día</h3>
      <p class="small muted" style="margin:4px 0 0">Guardado como <b>${esc(tipo)}</b> · ${esc(fmtLongDate(meal.date))}</p>
      <div class="statgrid ov-stats">
        <div class="stat kcal"><div class="v">${num(t.kcal)}</div><div class="k">kcal</div></div>
        <div class="stat prot"><div class="v">${num(t.protein)}</div><div class="k">prot (g)</div></div>
        <div class="stat carb"><div class="v">${num(t.carbs)}</div><div class="k">carb (g)</div></div>
        <div class="stat gras"><div class="v">${num(t.fat)}</div><div class="k">gras (g)</div></div>
      </div>
      <p class="tiny muted">${n} ingrediente${n === 1 ? '' : 's'} · ${num(t.grams)} g${meal.note ? ' · con tu descripción' : ''}</p>
      <div class="col" style="margin-top:14px">
        <button class="btn btn-primary btn-block" id="bt-edit" type="button">${icon('pencil')} Editar plato</button>
        <button class="btn btn-ghost btn-block" id="bt-ok" type="button">Listo</button>
      </div>
      <div class="hint" style="text-align:center">Si algo está mal, edítalo: se abre el plato tal cual lo guardaste.</div>
    </div>`;
  document.getElementById('modal-root').appendChild(back);
  const cerrar = () => back.remove();
  back.addEventListener('click', e => { if (e.target === back) cerrar(); });
  back.querySelector('#bt-ok').onclick = cerrar;
  back.querySelector('#bt-edit').onclick = () => { cerrar(); location.hash = `#/editar/${meal.id}`; };
}

/* ================= vista ================= */
export async function render(root, args, query) {
  let date = (query && query.d) || (args && args[0]) || todayISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = todayISO();
  desc = '';

  root.innerHTML = `
    <div class="spread" style="margin-bottom:12px">
      <div><h1>${icon('cup')} Arma tu batido</h1><div class="tiny muted">${esc(fmtLongDate(date))}</div></div>
      <a class="btn btn-sm btn-ghost" href="#/registrar?d=${date}">Volver</a>
    </div>

    <div class="card" style="text-align:center">
      <div class="card-title"><h3>Licuadora</h3><span class="badge" id="bt-ml-badge">0 / ${CAP} ml</span></div>
      <div id="bt-warn" class="note warn hidden" style="text-align:left"></div>
      <svg id="bt-svg" viewBox="0 0 200 280" width="200" height="280" role="img" aria-label="Licuadora con el batido">
        <rect x="92" y="6" width="16" height="12" rx="4" class="bpart"/>
        <rect x="64" y="16" width="72" height="20" rx="7" class="bpart"/>
        <rect x="54" y="36" width="92" height="176" rx="14" class="bjar"/>
        <clipPath id="bt-clip"><rect x="60" y="${INNER_TOP}" width="80" height="${INNER_H}" rx="9"/></clipPath>
        <g clip-path="url(#bt-clip)" id="bt-liq"></g>
        ${MARCAS.map(ml => {
    const y = INNER_BOTTOM - (ml / CAP) * INNER_H;
    return `<path d="M120 ${y.toFixed(1)}h22" class="bmark"/><text x="150" y="${(y + 3).toFixed(1)}" class="blabel">${ml}</text>`;
  }).join('')}
        <path d="M120 ${INNER_TOP}h22" class="bmark"/><text x="150" y="${INNER_TOP + 3}" class="blabel">${CAP}</text>
        <g class="bblade-g"><path d="M92 200l16-9M108 200l-16-9" class="bblade"/></g>
        <g id="bt-bub" clip-path="url(#bt-clip)">
          <circle class="bub" cx="78" cy="198" r="4" style="animation-delay:0s"/>
          <circle class="bub" cx="106" cy="204" r="3" style="animation-delay:.28s"/>
          <circle class="bub" cx="92" cy="210" r="5" style="animation-delay:.55s"/>
          <circle class="bub" cx="118" cy="200" r="3.5" style="animation-delay:.8s"/>
        </g>
        <rect x="44" y="216" width="112" height="52" rx="14" class="bbase"/>
        <circle cx="100" cy="242" r="9" class="bbtn"/>
        <rect x="56" y="268" width="16" height="8" rx="3" class="bpart"/>
        <rect x="128" y="268" width="16" height="8" rx="3" class="bpart"/>
      </svg>
      <div class="track" style="margin-top:8px"><div class="fill kcal" id="bt-fill" style="width:0%"></div></div>
      <div class="tiny muted" id="bt-cap" style="margin-top:6px">Capacidad ${CAP} ml · marcas en el vaso: 200, 400, 600</div>
    </div>

    <div class="card">
      <div class="card-title"><h3>Descripción</h3><span class="badge">Opcional</span></div>
      <label class="field"><span class="lbl">¿Qué echaste y en cuánto?</span>
        <textarea id="bt-desc" rows="2" placeholder="Ej. medio vaso de leche, 2 cucharadas de avena, 3 almendras, 200 g de plátano…">${esc(desc)}</textarea></label>
      <button class="btn btn-outline btn-block" id="bt-recalc" type="button">${icon('sparkles')} Aplicar y recalcular</button>
      <div class="hint">Se procesa solo en tu celular: ajusta y agrega los ingredientes que reconozca. El texto se guarda como nota del plato.</div>
    </div>

    <div class="card" id="bt-picker">
      <div class="card-title"><h3>Ingredientes</h3><span class="badge" id="bt-count">0 agregados</span></div>
      <div id="bt-groups"></div>
      <button class="list-item" id="bt-custom" type="button">
        <span class="li-ico">${icon('plus')}</span>
        <div class="li-main"><div class="li-t">Ingrediente que no está</div>
        <div class="li-s">Agrégalo tú: nombre, gramos y kcal</div></div>
        <div class="li-end">＋</div>
      </button>
    </div>

    <div class="card" id="bt-list-card">
      <div class="card-title"><h3>Tu batido</h3></div>
      <div id="bt-list"></div>
      <div class="statgrid" style="margin-top:12px" id="bt-totals"></div>
      <div class="col" style="margin-top:14px">
        <button class="btn btn-primary btn-lg btn-block btn-licuar" id="bt-use" type="button" disabled>${icon('cup')} ¡Licuar!</button>
        <button class="btn btn-block" id="bt-clear" type="button" disabled>${icon('trash')} Vaciar licuadora</button>
      </div>
      <div class="hint">Al licuar se guarda el batido en tu día y ves un resumen con sus macros; después puedes editarlo desde ahí si quieres cambiar algo.</div>
    </div>
  `;

  const q = s => root.querySelector(s);

  const itemsSeleccionados = () => todoIng().filter(i => sel.has(i.id)).map(i => ({ i, grams: sel.get(i.id) }));
  const totalG = () => itemsSeleccionados().reduce((a, x) => a + x.grams, 0);
  const itemsParaPlato = () => itemsSeleccionados().map(x => {
    const cu = cantU(x.i);
    return {
      nombre: Math.abs(cu - 1) > 0.001 ? `${qtyTexto(cu)}× ${x.i.n}` : x.i.n,
      gramos: Math.round(x.grams * 10) / 10,
      per100: { k: x.i.m.k, p: x.i.m.p, c: x.i.m.c, f: x.i.m.f, fi: x.i.m.fi },
      editado: false
    };
  });

  const drawLicuadora = () => {
    const list = itemsSeleccionados();
    const total = totalG();
    const scale = INNER_H / Math.max(CAP, total);
    let cum = 0;
    q('#bt-liq').innerHTML = list.map(x => {
      const h = x.grams * scale;
      const y = INNER_BOTTOM - cum - h;
      cum += h;
      return `<rect class="bfill" x="60" y="${y.toFixed(1)}" width="80" height="${Math.max(0, h).toFixed(1)}" style="fill:${x.i.c}"/>`;
    }).join('');
    const pct = Math.min(100, total / CAP * 100);
    q('#bt-fill').style.width = pct + '%';
    q('#bt-ml-badge').textContent = `${num(total)} / ${CAP} ml`;
    const warn = q('#bt-warn');
    if (total > CAP) {
      warn.classList.remove('hidden');
      warn.innerHTML = `${icon('alert')} <b>¡Se desborda!</b> Llevas ${num(total)} ml y la licuadora llega a ${CAP} ml. Quita algo o usa menos porciones.`;
    } else warn.classList.add('hidden');
    q('#bt-cap').textContent = total > 0
      ? `${num(total)} ml · ${pct.toFixed(0)}% de la licuadora`
      : `Capacidad ${CAP} ml · marcas en el vaso: 200, 400, 600`;
  };

  const rowHTML = i => {
    const grams = sel.get(i.id) || 0;
    const cu = cantU(i);
    const kcal = i.m.k * i.gr / 100;
    return `<div class="list-item bt-row ${grams > 0 ? 'on' : ''}">
      <span class="bt-dot" style="background:${i.c}"></span>
      <div class="li-main"><div class="li-t">${esc(i.n)}</div>
      <div class="li-s">${esc(i.p)} · ${num(kcal)} kcal</div></div>
      <div class="li-end">${grams > 0
        ? `<div class="qtybox">
            <button class="btn btn-sm" data-dec="${i.id}" type="button" aria-label="Quitar una porción">−</button>
            <b class="mono" data-qty="${i.id}">${qtyTexto(cu)}</b>
            <button class="btn btn-sm" data-inc="${i.id}" type="button" aria-label="Agregar una porción">＋</button>
          </div>`
        : `<button class="btn btn-sm btn-outline" data-add="${i.id}" type="button">＋</button>`}</div>
    </div>`;
  };

  const tiposHTML = i => {
    if (!i.tipos || !i.tipos.length) return '';
    const activo = tipoSel.get(i.id) || i.tipos[0].id;
    return `<div class="bt-tipos" data-tipos="${i.id}">
      <span class="tiny muted">Tipo:</span>
      ${i.tipos.map(t => `<button type="button" class="chip ${activo === t.id ? 'active' : ''}" data-tipo="${i.id}:${t.id}">${esc(t.c)}</button>`).join('')}
    </div>`;
  };

  const drawPicker = () => {
    const orden = ['Base líquida', 'Sólidos', 'Opcionales'];
    const gruposVistos = {};
    todoIng().forEach(i => { (gruposVistos[i.g || 'Otros'] = gruposVistos[i.g || 'Otros'] || []).push(i); });
    const claves = orden.filter(g => gruposVistos[g]).concat(Object.keys(gruposVistos).filter(g => orden.indexOf(g) < 0));
    q('#bt-groups').innerHTML = claves.map(g => `
      <div class="group-title">${esc(g)}</div>
      ${gruposVistos[g].map(i => rowHTML(i) + tiposHTML(i)).join('')}
    `).join('');
    const items = itemsSeleccionados();
    const t = computeTotals(itemsParaPlato());
    q('#bt-count').textContent = items.length
      ? `${items.length} agregado${items.length === 1 ? '' : 's'} · ${num(t.kcal)} kcal`
      : '0 agregados';

    q('#bt-picker').querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
      const i = byId(b.dataset.add);
      if (!i) return;
      sel.set(i.id, Math.min(i.gr, maxU(i) * i.gr));
      check();
      draw();
    });
    q('#bt-picker').querySelectorAll('[data-inc]').forEach(b => b.onclick = () => {
      const i = byId(b.dataset.inc);
      if (!i) return;
      const g = (sel.get(i.id) || 0) + i.gr;
      if (g > maxU(i) * i.gr) { toast(`Máximo ${maxU(i)} porciones de ${i.n}.`, 'warn'); return; }
      sel.set(i.id, g);
      check();
      draw();
    });
    q('#bt-picker').querySelectorAll('[data-dec]').forEach(b => b.onclick = () => {
      const i = byId(b.dataset.dec);
      if (!i) return;
      const g = (sel.get(i.id) || 0) - i.gr;
      if (g <= 0.01) sel.delete(i.id); else sel.set(i.id, Math.round(g * 10) / 10);
      clic();
      draw();
    });
    q('#bt-picker').querySelectorAll('[data-tipo]').forEach(b => b.onclick = () => {
      const [id, tid] = b.dataset.tipo.split(':');
      const raw = rawById(id);
      if (!raw || !raw.tipos) return;
      const antes = actIng(raw);
      const cu = cantU(antes);               // porciones que ya tienes: se conservan
      tipoSel.set(id, tid);
      const desp = actIng(raw);
      if (sel.has(id) && cu > 0) sel.set(id, Math.min(Math.round(desp.gr * cu * 10) / 10, maxU(desp) * desp.gr));
      clic();
      draw();
    });
  };

  const drawLista = () => {
    const list = itemsSeleccionados();
    const wrap = q('#bt-list');
    if (!list.length) {
      wrap.innerHTML = `<div class="empty" style="padding:16px 10px"><span class="ico">${icon('cup')}</span><b>Todavía sin ingredientes</b><div class="small muted">Toca ＋ arriba para empezar a armar tu batido.</div></div>`;
    } else {
      wrap.innerHTML = list.map(x => {
        const cu = cantU(x.i);
        const kcal = x.i.m.k * x.grams / 100;
        return `<div class="spread" style="padding:9px 0;border-bottom:1px solid var(--line)">
          <div style="display:flex;gap:8px;align-items:center;min-width:0">
            <span class="bt-dot" style="background:${x.i.c}"></span>
            <div style="min-width:0"><b>${esc(x.i.n)}</b><div class="tiny muted">${num(x.grams)} g · ${qtyTexto(cu)} porc. · ${num(kcal)} kcal</div></div>
          </div>
          <div class="qtybox" style="flex:none">
            <button class="btn btn-sm" data-dec="${x.i.id}" type="button" aria-label="Menos">−</button>
            <b class="mono">${qtyTexto(cu)}</b>
            <button class="btn btn-sm" data-inc="${x.i.id}" type="button" aria-label="Más">＋</button>
            <button class="btn btn-sm btn-ghost" data-del="${x.i.id}" type="button" aria-label="Quitar">${icon('x')}</button>
          </div>
        </div>`;
      }).join('');
    }
    const t = computeTotals(itemsParaPlato());
    q('#bt-totals').innerHTML = list.length ? `
      <div class="stat kcal"><div class="v">${num(t.kcal)}</div><div class="k">kcal</div></div>
      <div class="stat prot"><div class="v">${num(t.protein)}</div><div class="k">prot (g)</div></div>
      <div class="stat carb"><div class="v">${num(t.carbs)}</div><div class="k">carb (g)</div></div>
      <div class="stat gras"><div class="v">${num(t.fat)}</div><div class="k">gras (g)</div></div>`
      : '<div class="tiny muted" style="grid-column:1/-1">Los macros del batido aparecen aquí.</div>';
    q('#bt-use').disabled = !list.length;
    q('#bt-clear').disabled = !list.length;

    wrap.querySelectorAll('[data-inc]').forEach(b => b.onclick = () => {
      const i = byId(b.dataset.inc);
      const g = (sel.get(i.id) || 0) + i.gr;
      if (g > maxU(i) * i.gr) { toast(`Máximo ${maxU(i)} porciones de ${i.n}.`, 'warn'); return; }
      sel.set(i.id, g); check(); draw();
    });
    wrap.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => {
      const i = byId(b.dataset.dec);
      const g = (sel.get(i.id) || 0) - i.gr;
      if (g <= 0.01) sel.delete(i.id); else sel.set(i.id, Math.round(g * 10) / 10);
      clic(); draw();
    });
    wrap.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      sel.delete(b.dataset.del); clic(); draw();
    });
  };

  const draw = () => { drawLicuadora(); drawPicker(); drawLista(); };

  /* --- descripción --- */
  q('#bt-desc').oninput = e => { desc = e.target.value; };
  q('#bt-recalc').onclick = () => aplicarDescripcion(draw);

  /* --- ingrediente extra --- */
  q('#bt-custom').onclick = () => {
    const s = openSheet(`
      <h2>Ingrediente que no está</h2>
      <p class="small muted">Escribe la porción que vas a echar (no por 100 g).</p>
      <label class="field"><span class="lbl">Nombre</span><input id="bc-n" type="text" placeholder="Ej. Espinaca, Canela, Coco rallado…"></label>
      <div class="grid2">
        <label class="field"><span class="lbl">Gramos</span><input id="bc-g" type="number" inputmode="decimal" value="30"></label>
        <label class="field"><span class="lbl">kcal</span><input id="bc-k" type="number" inputmode="decimal" value="0"></label>
        <label class="field"><span class="lbl">Proteína (g)</span><input id="bc-p" type="number" inputmode="decimal" value="0"></label>
        <label class="field"><span class="lbl">Carbos (g)</span><input id="bc-c" type="number" inputmode="decimal" value="0"></label>
        <label class="field"><span class="lbl">Grasas (g)</span><input id="bc-f" type="number" inputmode="decimal" value="0"></label>
      </div>
      <div class="grid2">
        <button class="btn btn-primary" id="bc-ok" type="button">Añadir</button>
        <button class="btn btn-ghost" id="bc-back" type="button">Cancelar</button>
      </div>`);
    s.root.querySelector('#bc-back').onclick = s.close;
    s.root.querySelector('#bc-ok').onclick = () => {
      const n = s.root.querySelector('#bc-n').value.trim();
      const g = parseFloat(s.root.querySelector('#bc-g').value) || 0;
      if (!n) { toast('Ponle nombre al ingrediente.', 'warn'); return; }
      if (g <= 0) { toast('Los gramos deben ser mayores a 0.', 'warn'); return; }
      const r = 100 / g;
      const rd = v => Math.round((parseFloat(s.root.querySelector(v).value) || 0) * r * 10) / 10;
      const id = 'x' + uid();
      const ing = {
        id, n, g: 'Agregados', p: `${num(g)} g`, gr: g, c: '#b0b7c3',
        m: { k: rd('#bc-k'), p: rd('#bc-p'), c: rd('#bc-c'), f: rd('#bc-f'), fi: 0 },
        al: [sinAcentos(n)], custom: true
      };
      customs.push(ing);
      sel.set(id, g);
      s.close();
      check();
      toast(`${n} agregado al batido.`, 'ok');
      draw();
    };
  };

  /* --- acciones --- */
  q('#bt-clear').onclick = async () => {
    const ok = await confirmSheet({ title: '¿Vaciar la licuadora?', msg: 'Se quitan todos los ingredientes del batido.', okText: 'Vaciar', danger: true });
    if (!ok) return;
    sel.clear();
    draw();
  };

  q('#bt-use').onclick = async () => {
    const items = itemsParaPlato();
    if (!items.length) return;
    // ¡Licuar! → 1.3 s de sonido de licuadora + la licuadora licuando en pantalla.
    // Al terminar el batido se GUARDA en el día (sin saltar al editor) y queda
    // un resumen flotante con sus macros para verlo bien o editarlo después.
    const btn = q('#bt-use');
    const svg = q('#bt-svg');
    const txt0 = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `${icon('cup')} Licuando…`;
    svg.classList.add('blending');
    licuar();
    try { svg.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* si no se puede, sigue */ }
    await new Promise(r => setTimeout(r, 1300));
    svg.classList.remove('blending');
    const s = await sugerirTipo(date, items);
    const meal = await saveMeal(newDraft({
      date, type: s.type, name: 'Batido', source: 'batido',
      items, mult: 1, note: desc.trim().slice(0, 140)
    }), { navegar: false });
    sel.clear();
    desc = '';
    q('#bt-desc').value = '';
    btn.innerHTML = txt0;
    draw();                                  // licuadora vacía, botón queda deshabilitado
    check();                                 // "check" al añadirse a tu día
    mostrarResumen(meal);
  };

  draw();
}
