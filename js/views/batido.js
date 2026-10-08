/* Arma tu batido: licuadora gráfica que se llena al agregar ingredientes. */

import { icon } from '../icons.js';
import { computeTotals } from '../nutrition.js';
import { esc, num, toast, todayISO, fmtLongDate, confirmSheet } from '../util.js';
import { newDraft } from '../editor.js';
import { sugerirTipo, getDraft, setDraft } from './log.js';

const CAP = 700;          // ml de la licuadora (≈ g)
const INNER_TOP = 42;     // borde superior del interior del vaso
const INNER_H = 164;      // altura interior del vaso
const INNER_BOTTOM = INNER_TOP + INNER_H;

/** Ingredientes del batido: porción típica, color de capa y macros por 100 g. */
export const INGREDIENTES = [
  { g: 'Base líquida', id: 'leche', n: 'Leche entera', p: '1 vaso (250 g)', gr: 250, c: '#f4efe4', m: { k: 61, p: 3.2, c: 4.8, f: 3.3, fi: 0 } },
  { g: 'Base líquida', id: 'agua', n: 'Agua', p: '1 vaso (250 ml)', gr: 250, c: '#cfe9ff', m: { k: 0, p: 0, c: 0, f: 0, fi: 0 } },
  { g: 'Base líquida', id: 'yogur', n: 'Yogur natural', p: '1 pote (170 g)', gr: 170, c: '#eef4ff', m: { k: 60, p: 3.5, c: 4.7, f: 3.3, fi: 0 } },
  { g: 'Base líquida', id: 'algarrobina', n: 'Algarrobina líquida', p: '1 cda (15 g)', gr: 15, c: '#8a5a2b', m: { k: 310, p: 1.5, c: 75, f: 0.5, fi: 0 } },
  { g: 'Sólidos', id: 'platano', n: 'Plátano', p: '1 unidad (120 g)', gr: 120, c: '#ffd966', m: { k: 89, p: 1.1, c: 22.8, f: 0.3, fi: 2.6 } },
  { g: 'Sólidos', id: 'avena', n: 'Avena', p: '4 cda (40 g)', gr: 40, c: '#e6d3a3', m: { k: 389, p: 16.9, c: 66.3, f: 6.9, fi: 10.6 } },
  { g: 'Sólidos', id: 'mani', n: 'Mantequilla de maní', p: '1 cda (16 g)', gr: 16, c: '#c98b4b', m: { k: 588, p: 25, c: 20, f: 50, fi: 6 } },
  { g: 'Sólidos', id: 'miel', n: 'Miel', p: '1 cda (15 g)', gr: 15, c: '#f2b134', m: { k: 304, p: 0.3, c: 82, f: 0, fi: 0.2 } },
  { g: 'Sólidos', id: 'cacao', n: 'Cacao en polvo', p: '1 cda (10 g)', gr: 10, c: '#7a4a2b', m: { k: 228, p: 20, c: 58, f: 14, fi: 33 } },
  { g: 'Opcionales', id: 'proteina', n: 'Proteína en polvo', p: '1 scoop (30 g) · opcional', gr: 30, c: '#d9e9ff', m: { k: 380, p: 78, c: 8, f: 6, fi: 0 } },
  { g: 'Opcionales', id: 'hielo', n: 'Hielo', p: '5 cubos (100 g)', gr: 100, c: '#dff4ff', m: { k: 0, p: 0, c: 0, f: 0, fi: 0 } }
];

const byId = id => INGREDIENTES.find(i => i.id === id);
let sel = new Map();   // id → porciones

export async function render(root, args, query) {
  let date = (query && query.d) || (args && args[0]) || todayISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = todayISO();

  const grupos = ['Base líquida', 'Sólidos', 'Opcionales'];

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
        <path d="M126 84h10M126 124h10M126 164h10" class="bmark"/>
        <path d="M92 200l16-9M108 200l-16-9" class="bblade"/>
        <rect x="44" y="216" width="112" height="52" rx="14" class="bbase"/>
        <circle cx="100" cy="242" r="9" class="bbtn"/>
        <rect x="56" y="268" width="16" height="8" rx="3" class="bpart"/>
        <rect x="128" y="268" width="16" height="8" rx="3" class="bpart"/>
      </svg>
      <div class="track" style="margin-top:8px"><div class="fill kcal" id="bt-fill" style="width:0%"></div></div>
      <div class="tiny muted" id="bt-cap" style="margin-top:6px">Capacidad ${CAP} ml · toca los ingredientes abajo</div>
    </div>

    <div class="card">
      <div class="card-title"><h3>Ingredientes</h3></div>
      ${grupos.map(g => `
        <div class="group-title">${g}</div>
        ${INGREDIENTES.filter(i => i.g === g).map(i => `
          <button class="list-item" data-add="${i.id}" type="button">
            <span style="width:14px;height:14px;border-radius:4px;background:${i.c};flex:none"></span>
            <div class="li-main"><div class="li-t">${esc(i.n)}</div>
            <div class="li-s">${esc(i.p)} · ${num(i.m.k * i.gr / 100)} kcal</div></div>
            <div class="li-end">＋</div>
          </button>`).join('')}
      `).join('')}
    </div>

    <div class="card" id="bt-list-card">
      <div class="card-title"><h3>Tu batido</h3><span class="badge" id="bt-count">0 ingredientes</span></div>
      <div id="bt-list"></div>
      <div class="statgrid" style="margin-top:12px" id="bt-totals"></div>
      <div class="col" style="margin-top:14px">
        <button class="btn btn-primary btn-lg btn-block" id="bt-use" type="button" disabled>Usar en el plato →</button>
        <button class="btn btn-block" id="bt-clear" type="button" disabled>${icon('trash')} Vaciar licuadora</button>
      </div>
      <div class="hint">Al usarlo se abre el editor con el batido listo para guardar en tu día.</div>
    </div>
  `;

  const q = s => root.querySelector(s);

  const itemsSeleccionados = () => INGREDIENTES.filter(i => sel.has(i.id)).map(i => ({ i, q: sel.get(i.id) }));
  const totalG = () => itemsSeleccionados().reduce((a, x) => a + x.i.gr * x.q, 0);
  const itemsParaPlato = () => itemsSeleccionados().map(x => ({
    nombre: x.q > 1 ? `${x.q}× ${x.i.n}` : x.i.n,
    gramos: x.i.gr * x.q,
    per100: { k: x.i.m.k, p: x.i.m.p, c: x.i.m.c, f: x.i.m.f, fi: x.i.m.fi },
    editado: false
  }));

  const drawLiquido = () => {
    const list = itemsSeleccionados();
    const total = totalG();
    const scale = INNER_H / Math.max(CAP, total);   // si desborda, todas las capas se comprimen
    let cum = 0;
    q('#bt-liq').innerHTML = list.map(x => {
      const h = x.i.gr * x.q * scale;
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
      : `Capacidad ${CAP} ml · toca los ingredientes abajo`;
  };

  const drawLista = () => {
    const list = itemsSeleccionados();
    const wrap = q('#bt-list');
    if (!list.length) {
      wrap.innerHTML = `<div class="empty" style="padding:16px 10px"><span class="ico">${icon('cup')}</span><b>Todavía sin ingredientes</b><div class="small muted">Toca arriba para empezar a armar tu batido.</div></div>`;
    } else {
      wrap.innerHTML = list.map(x => {
        const g = x.i.gr * x.q;
        const kcal = x.i.m.k * g / 100;
        return `<div class="spread" style="padding:9px 0;border-bottom:1px solid var(--line)">
          <div style="display:flex;gap:8px;align-items:center;min-width:0">
            <span style="width:13px;height:13px;border-radius:4px;background:${x.i.c};flex:none"></span>
            <div style="min-width:0"><b>${esc(x.i.n)}</b><div class="tiny muted">${num(g)} g · ${num(kcal)} kcal</div></div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex:none">
            <button class="btn btn-sm" data-dec="${x.i.id}" type="button" aria-label="Menos">−</button>
            <b class="mono" style="min-width:20px;text-align:center">${x.q}</b>
            <button class="btn btn-sm" data-inc="${x.i.id}" type="button" aria-label="Más">＋</button>
            <button class="btn btn-sm btn-ghost" data-del="${x.i.id}" type="button" aria-label="Quitar">${icon('x')}</button>
          </div>
        </div>`;
      }).join('');
    }
    const t = computeTotals(itemsParaPlato());
    q('#bt-count').textContent = `${list.length} ingrediente${list.length === 1 ? '' : 's'}`;
    q('#bt-totals').innerHTML = list.length ? `
      <div class="stat kcal"><div class="v">${num(t.kcal)}</div><div class="k">kcal</div></div>
      <div class="stat prot"><div class="v">${num(t.protein)}</div><div class="k">prot (g)</div></div>
      <div class="stat carb"><div class="v">${num(t.carbs)}</div><div class="k">carb (g)</div></div>
      <div class="stat gras"><div class="v">${num(t.fat)}</div><div class="k">gras (g)</div></div>`
      : '<div class="tiny muted" style="grid-column:1/-1">Los macros del batido aparecen aquí.</div>';
    q('#bt-use').disabled = !list.length;
    q('#bt-clear').disabled = !list.length;

    wrap.querySelectorAll('[data-inc]').forEach(b => b.onclick = () => {
      const v = sel.get(b.dataset.inc) || 0;
      if (v >= 10) { toast('Máximo 10 porciones por ingrediente.', 'warn'); return; }
      sel.set(b.dataset.inc, v + 1); draw();
    });
    wrap.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => {
      const id = b.dataset.dec;
      const v = (sel.get(id) || 0) - 1;
      if (v <= 0) sel.delete(id); else sel.set(id, v);
      draw();
    });
    wrap.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { sel.delete(b.dataset.del); draw(); });
  };

  const draw = () => { drawLiquido(); drawLista(); };

  root.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
    const id = b.dataset.add;
    sel.set(id, (sel.get(id) || 0) + 1);
    draw();
  });

  q('#bt-clear').onclick = async () => {
    const ok = await confirmSheet({ title: '¿Vaciar la licuadora?', msg: 'Se quitan todos los ingredientes del batido.', okText: 'Vaciar', danger: true });
    if (!ok) return;
    sel.clear();
    draw();
  };

  q('#bt-use').onclick = async () => {
    const items = itemsParaPlato();
    if (!items.length) return;
    const prev = getDraft();
    if (prev && prev.items && prev.items.length && !prev.id) {
      const ok = await confirmSheet({ title: '¿Reemplazar el plato actual?', msg: `Ya tienes ${prev.items.length} ingrediente${prev.items.length === 1 ? '' : 's'} en el borrador. Se reemplazará por tu batido.`, okText: 'Reemplazar' });
      if (!ok) return;
    }
    const s = await sugerirTipo(date, items);
    setDraft(newDraft({ date, type: s.type, name: 'Batido', source: 'batido', items, mult: 1, _hint: s.hint }));
    sel.clear();
    location.hash = '#/nuevo';
  };

  draw();
}
