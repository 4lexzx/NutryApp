/* Nutrición: fórmulas de gasto calórico, metas de macros y tabla de alimentos.
   TODOS los valores son estimaciones de referencia (no sustituyen a un nutricionista). */

export const SEXOS = [
  { v: 'hombre', l: 'Hombre' },
  { v: 'mujer', l: 'Mujer' }
];

export const ACTIVIDADES = [
  { v: 1.2, l: 'Sedentario', d: 'poco o nada de ejercicio, trabajo de escritorio' },
  { v: 1.375, l: 'Ligera', d: 'ejercicio ligero 1–3 días/semana' },
  { v: 1.55, l: 'Moderada', d: 'ejercicio moderado 3–5 días/semana' },
  { v: 1.725, l: 'Alta', d: 'ejercicio intenso 6–7 días/semana' },
  { v: 1.9, l: 'Muy alta', d: 'ejercicio muy intenso o trabajo físico' }
];

export const OBJETIVOS = [
  { v: 'deficit', l: 'Déficit (bajar grasa)', f: 0.80, pct: -20 },
  { v: 'mantenimiento', l: 'Mantenimiento', f: 1.0, pct: 0 },
  { v: 'recomp', l: 'Ganar músculo sin ganar grasa (recomposición)', f: 1.0, pct: 0, nota: 'calorías de mantenimiento con proteína alta: el músculo lo construye el entrenamiento, no las calorías de más' },
  { v: 'superavit', l: 'Superávit (ganar músculo)', f: 1.12, pct: 12 }
];

/** Proteína diaria por kg de peso según el objetivo */
const PROT_POR_KG = { deficit: 2.0, mantenimiento: 1.9, recomp: 2.2, superavit: 1.8 };

/** BMR — fórmula de Mifflin-St Jeor */
export function bmr(p) {
  const w = Number(p.weight) || 0, ht = Number(p.height) || 0, age = Number(p.age) || 0;
  const base = 10 * w + 6.25 * ht - 5 * age;
  return Math.round(p.sex === 'mujer' ? base - 161 : base + 5);
}

/** TDEE — gasto calórico total diario */
export function tdee(p) {
  const b = bmr(p);
  const act = ACTIVIDADES.find(a => String(a.v) === String(p.activity)) || ACTIVIDADES[0];
  return { bmr: b, activity: act, tdee: Math.round(b * Number(p.activity || 1.2)) };
}

/**
 * Metas diarias: kcal + proteína/carbohidratos/grasas.
 * Proteína por kg de peso; grasas como % de las kcal; carbohidratos = resto.
 */
export function calcTargets(p) {
  const { bmr: B, tdee: T, activity } = tdee(p);
  const obj = OBJETIVOS.find(o => o.v === p.objective) || OBJETIVOS[1];
  let kcal = Math.round(T * obj.f);
  if (kcal < B) kcal = B; // nunca por debajo del metabolismo basal

  const gKg = PROT_POR_KG[p.objective] || 1.9;
  const weight = Number(p.weight) || 0;
  let prot = Math.round(weight * gKg);
  let grasKcal = Math.round(kcal * 0.25);
  let gras = Math.round(grasKcal / 9);
  const minGras = Math.round(weight * 0.8);
  if (gras < minGras) { gras = minGras; grasKcal = gras * 9; }
  let carb = Math.round((kcal - grasKcal - prot * 4) / 4);
  if (carb < 40) { carb = 40; const used = prot * 4 + gras * 4; gras = Math.round((kcal - used - 40 * 4) / 9) || gras; }

  const lines = [
    `Peso actual: <b>${num_(weight, 1)} kg</b> · Estatura: <b>${num_(p.height)} cm</b> · Edad: <b>${num_(p.age)}</b> · Sexo: <b>${p.sex === 'mujer' ? 'mujer' : 'hombre'}</b>`,
    `<b>1) Metabolismo basal (Mifflin-St Jeor):</b> ${p.sex === 'mujer'
      ? '(10 × peso) + (6.25 × estatura) − (5 × edad) − 161'
      : '(10 × peso) + (6.25 × estatura) − (5 × edad) + 5'} = <b>${num_(B)} kcal</b>`,
    `<b>2) Gasto total (TDEE):</b> basal × ${num_(activity.v, 3)} (actividad ${activity.l}) = <b>${num_(T)} kcal</b>`,
    `<b>3) Objetivo (${obj.l}):</b> ${obj.pct >= 0 ? '+' : ''}${obj.pct}% → <b>${num_(kcal)} kcal/día</b>${obj.nota ? ` — ${obj.nota}` : ''}`,
    `<b>4) Proteína:</b> ${num_(gKg, 1)} g × ${num_(weight, 1)} kg = <b>${num_(prot)} g</b> (${num_(prot * 4)} kcal)`,
    `<b>5) Grasas:</b> 25% de las kcal (mín. 0.8 g/kg) = <b>${num_(gras)} g</b> (${num_(grasKcal)} kcal)`,
    `<b>6) Carbohidratos:</b> resto de las kcal ÷ 4 = <b>${num_(carb)} g</b>`
  ];

  return {
    kcal, protein: prot, carbs: carb, fat: gras,
    bmr: B, tdee: T, activityLabel: activity.l, objectiveLabel: obj.l,
    explanation: lines
  };
}

function num_(v, d = 0) {
  return Number(v).toLocaleString('es-PE', { maximumFractionDigits: d, minimumFractionDigits: 0 });
}

/* ---------- Comidas / ingredientes ---------- */
/** item: { nombre, gramos, per100: {k,p,c,f,fi} } (k kcal, p proteína, c carbohidratos, f grasas, fi fibra) */
export function itemMacros(item) {
  const g = Number(item.gramos) || 0;
  const p100 = item.per100 || { k: 0, p: 0, c: 0, f: 0, fi: 0 };
  const r = g / 100;
  return {
    k: (Number(p100.k) || 0) * r,
    p: (Number(p100.p) || 0) * r,
    c: (Number(p100.c) || 0) * r,
    f: (Number(p100.f) || 0) * r,
    fi: (Number(p100.fi) || 0) * r
  };
}
export function computeTotals(items) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, grams: 0 };
  (items || []).forEach(it => {
    const m = itemMacros(it);
    t.kcal += m.k; t.protein += m.p; t.carbs += m.c; t.fat += m.f; t.fiber += m.fi;
    t.grams += Number(it.gramos) || 0;
  });
  return {
    kcal: Math.round(t.kcal), protein: Math.round(t.protein), carbs: Math.round(t.carbs),
    fat: Math.round(t.fat), fiber: Math.round(t.fiber), grams: Math.round(t.grams)
  };
}
export function mealTotals(meal) { return computeTotals(meal.items); }

/* ---------- Tabla de alimentos base (por 100 g) ---------- */
/* { n: nombre, k: kcal, p: proteína, c: carbohidratos, f: grasas, fi: fibra } */
export const FOODS = [
  // Cereales y tubérculos
  { n: 'Arroz blanco (cocido)', k: 130, p: 2.7, c: 28.2, f: 0.3, fi: 0.4 },
  { n: 'Arroz tres segundos (cocido)', k: 126, p: 2.6, c: 27.6, f: 0.4, fi: 0.5 },
  { n: 'Quinoa (cocida)', k: 120, p: 4.4, c: 21.3, f: 1.9, fi: 2.8 },
  { n: 'Fideos / pasta (cocidos)', k: 158, p: 5.8, c: 30.9, f: 0.9, fi: 1.8 },
  { n: 'Papa sancochada', k: 87, p: 1.9, c: 20.1, f: 0.1, fi: 1.7 },
  { n: 'Papa frita', k: 300, p: 3.4, c: 41, f: 15, fi: 3.8 },
  { n: 'Papa al horno', k: 93, p: 2.5, c: 21, f: 0.1, fi: 2.2 },
  { n: 'Camote sancochado', k: 90, p: 1.6, c: 21, f: 0.1, fi: 3 },
  { n: 'Yuca sancochada', k: 112, p: 1.4, c: 27, f: 0.3, fi: 1.8 },
  { n: 'Choclo cocido (maíz)', k: 96, p: 3.3, c: 21, f: 1.4, fi: 2.7 },
  { n: 'Tostada de arroz', k: 387, p: 8.2, c: 78, f: 2.8, fi: 1.6 },
  { n: 'Pan blanco', k: 265, p: 9, c: 49, f: 3.2, fi: 2.7 },
  { n: 'Pan integral', k: 247, p: 13, c: 41, f: 3.4, fi: 7 },
  { n: 'Pan con chicharrón', k: 320, p: 13, c: 36, f: 14, fi: 1.6 },
  { n: 'Avena en hojuelas (seca)', k: 389, p: 16.9, c: 66.3, f: 6.9, fi: 10.6 },
  { n: 'Avena cocida con agua', k: 71, p: 2.5, c: 12, f: 1.5, fi: 1.7 },
  { n: 'Granola', k: 471, p: 10, c: 64, f: 20, fi: 7 },
  { n: 'Tortilla de trigo', k: 218, p: 5.7, c: 36, f: 5.5, fi: 3.4 },

  // Carnes y pescados
  { n: 'Pechuga de pollo a la plancha', k: 165, p: 31, c: 0, f: 3.6, fi: 0 },
  { n: 'Muslo de pollo (sin piel, cocido)', k: 177, p: 24.4, c: 0, f: 8.2, fi: 0 },
  { n: 'Pollo a la brasa (con piel)', k: 230, p: 26, c: 0, f: 14, fi: 0 },
  { n: 'Pollo frito', k: 246, p: 26, c: 7.5, f: 15, fi: 0.3 },
  { n: 'Carne de res (lomo) a la plancha', k: 250, p: 26, c: 0, f: 16, fi: 0 },
  { n: 'Carne molida de res (cocida)', k: 254, p: 25.7, c: 0, f: 16.7, fi: 0 },
  { n: 'Cerdo asado', k: 242, p: 27, c: 0, f: 14, fi: 0 },
  { n: 'Chicharrón de cerdo', k: 400, p: 20, c: 15, f: 30, fi: 0 },
  { n: 'Anticucho de corazón', k: 200, p: 22, c: 5, f: 11, fi: 0.5 },
  { n: 'Salmón', k: 208, p: 20, c: 0, f: 13, fi: 0 },
  { n: 'Atún al agua (lata)', k: 116, p: 26, c: 0, f: 0.8, fi: 0 },
  { n: 'Pescado blanco (merluza)', k: 88, p: 18, c: 0, f: 1.5, fi: 0 },
  { n: 'Camarones / langostinos', k: 99, p: 24, c: 0.2, f: 0.3, fi: 0 },
  { n: 'Huevo sancochado / frito', k: 155, p: 13, c: 1.1, f: 11, fi: 0 },
  { n: 'Huevo revuelto (con mantequilla)', k: 148, p: 10, c: 1.6, f: 11, fi: 0 },
  { n: 'Clara de huevo', k: 52, p: 11, c: 0.7, f: 0.2, fi: 0 },

  // Platos peruanos
  { n: 'Lomo saltado', k: 185, p: 14, c: 12, f: 9, fi: 1.5 },
  { n: 'Ají de gallina', k: 150, p: 9, c: 9, f: 9, fi: 1.2 },
  { n: 'Arroz con pollo', k: 165, p: 8, c: 22, f: 5, fi: 1.2 },
  { n: 'Tallarines verdes', k: 150, p: 5.5, c: 20, f: 6, fi: 2.5 },
  { n: 'Ceviche de pescado', k: 80, p: 15, c: 4, f: 1, fi: 0.5 },
  { n: 'Tiradito', k: 90, p: 15, c: 4.5, f: 2, fi: 0.5 },
  { n: 'Tacu tacu con carne', k: 180, p: 9, c: 25, f: 6, fi: 2 },
  { n: 'Papa a la huancaína', k: 140, p: 4, c: 13, f: 8.5, fi: 1.5 },
  { n: 'Causa limeña (pollo)', k: 145, p: 6, c: 16, f: 6.5, fi: 1.8 },
  { n: 'Solterito (queso y frejol)', k: 110, p: 5, c: 10, f: 6, fi: 2.4 },
  { n: 'Escabeche de pollo', k: 150, p: 14, c: 6, f: 8, fi: 1 },
  { n: 'Estofado de res', k: 130, p: 12, c: 6, f: 6.5, fi: 1.2 },
  { n: 'Seco de chivo (cabra)', k: 165, p: 15, c: 8, f: 8, fi: 1.4 },
  { n: 'Juane de pollo', k: 175, p: 10, c: 20, f: 6, fi: 1.6 },
  { n: 'Picante de carne', k: 140, p: 13, c: 7, f: 7, fi: 1.5 },
  { n: 'Carne de palta / palta rellena', k: 175, p: 3, c: 9, f: 15, fi: 4.5 },
  { n: 'Rachi / menudo', k: 90, p: 13, c: 1.5, f: 3.6, fi: 0 },
  { n: 'Sopa de maní', k: 95, p: 4.5, c: 9, f: 4.5, fi: 1.3 },
  { n: 'Caldo de gallina', k: 60, p: 6, c: 2, f: 3, fi: 0.2 },
  { n: 'Parihuela de mariscos', k: 75, p: 9, c: 4, f: 2.5, fi: 0.4 },
  { n: 'Arroz con leche', k: 130, p: 3, c: 24, f: 2.5, fi: 0.3 },
  { n: 'Picarones', k: 250, p: 5, c: 45, f: 6, fi: 2 },
  { n: 'Chicha morada (vaso)', k: 60, p: 0.2, c: 15, f: 0, fi: 0.1 },

  // Platos del norte — Piura y Sullana
  { n: 'Seco de cabrito con frejoles', k: 175, p: 15.5, c: 12, f: 7.5, fi: 2 },
  { n: 'Cabrito al horno / patarashca', k: 195, p: 23, c: 2, f: 10, fi: 0.3 },
  { n: 'Tamalito verde (piurano)', k: 170, p: 6.5, c: 23, f: 6, fi: 2.2 },
  { n: 'Majarisco (mariscos)', k: 95, p: 10, c: 6, f: 3, fi: 0.8 },
  { n: 'Ceviche piurano con chifles', k: 95, p: 14, c: 7, f: 1.5, fi: 1 },
  { n: 'Chifles (plátano frito)', k: 250, p: 1.5, c: 47, f: 6.5, fi: 3 },
  { n: 'Arroz con pato', k: 195, p: 11, c: 22, f: 7, fi: 1.2 },
  { n: 'Sudado de pescado', k: 120, p: 15, c: 4, f: 4.5, fi: 0.6 },
  { n: 'Chupe de camarones', k: 90, p: 9, c: 6, f: 3.5, fi: 0.5 },
  { n: 'Tiradito norteño', k: 92, p: 15, c: 4.5, f: 2, fi: 0.5 },
  { n: 'Pan de yema (piurano)', k: 355, p: 8.5, c: 58, f: 10, fi: 2 },
  { n: 'Refresco de fruta natural', k: 50, p: 0.5, c: 12, f: 0.1, fi: 0.2 },

  // Lácteos y huevos
  { n: 'Queso fresco', k: 250, p: 18, c: 4, f: 19, fi: 0 },
  { n: 'Queso amarillo (fetas)', k: 350, p: 24, c: 2, f: 28, fi: 0 },
  { n: 'Yogur natural', k: 60, p: 3.5, c: 4.7, f: 3.3, fi: 0 },
  { n: 'Yogur bebible sabor', k: 90, p: 3, c: 14, f: 2.5, fi: 0 },
  { n: 'Leche entera', k: 61, p: 3.2, c: 4.8, f: 3.3, fi: 0 },
  { n: 'Leche descremada', k: 34, p: 3.4, c: 5, f: 0.1, fi: 0 },
  { n: 'Leche evaporada (en polvo)', k: 493, p: 26, c: 38, f: 27, fi: 0 },
  { n: 'Whey protein (polvo, por scoope medido en g)', k: 400, p: 80, c: 8, f: 6, fi: 0 },

  // Legumbres y tubérculos andinos
  { n: 'Frejol cocido', k: 127, p: 8.7, c: 22.8, f: 0.5, fi: 6.4 },
  { n: 'Lenteja cocida', k: 116, p: 9, c: 20, f: 0.4, fi: 7.9 },
  { n: 'Garbanzo cocido', k: 164, p: 8.9, c: 27.4, f: 2.6, fi: 7.6 },
  { n: 'Habas cocidas', k: 110, p: 7.6, c: 17, f: 0.4, fi: 5.4 },

  // Frutas
  { n: 'Plátano / banana', k: 89, p: 1.1, c: 22.8, f: 0.3, fi: 2.6 },
  { n: 'Manzana', k: 52, p: 0.3, c: 13.8, f: 0.2, fi: 2.4 },
  { n: 'Naranja', k: 47, p: 0.9, c: 11.8, f: 0.1, fi: 2.4 },
  { n: 'Uva', k: 69, p: 0.7, c: 18.1, f: 0.2, fi: 0.9 },
  { n: 'Papaya', k: 43, p: 0.5, c: 10.8, f: 0.3, fi: 1.7 },
  { n: 'Sandía', k: 30, p: 0.6, c: 7.6, f: 0.2, fi: 0.4 },
  { n: 'Piña', k: 50, p: 0.5, c: 13, f: 0.1, fi: 1.4 },
  { n: 'Mango', k: 60, p: 0.8, c: 15, f: 0.4, fi: 1.6 },
  { n: 'Fresas', k: 32, p: 0.7, c: 7.7, f: 0.3, fi: 2 },
  { n: 'Durazno', k: 39, p: 0.9, c: 9.5, f: 0.3, fi: 1.5 },

  // Verduras
  { n: 'Palta / aguacate', k: 160, p: 2, c: 8.5, f: 14.7, fi: 6.4 },
  { n: 'Tomate', k: 18, p: 0.9, c: 3.9, f: 0.2, fi: 1.2 },
  { n: 'Cebolla', k: 40, p: 1.1, c: 9.3, f: 0.1, fi: 1.7 },
  { n: 'Lechuga', k: 15, p: 1.4, c: 2.9, f: 0.2, fi: 1.3 },
  { n: 'Espinaca', k: 23, p: 2.9, c: 3.6, f: 0.4, fi: 2.2 },
  { n: 'Brócoli', k: 34, p: 2.8, c: 6.6, f: 0.4, fi: 2.6 },
  { n: 'Zanahoria', k: 41, p: 0.9, c: 9.6, f: 0.2, fi: 2.8 },
  { n: 'Repollo / repollitos', k: 25, p: 1.3, c: 5.8, f: 0.1, fi: 2.5 },

  // Snacks, extras y bebidas
  { n: 'Maní crocante', k: 567, p: 26, c: 16, f: 49, fi: 8.5 },
  { n: 'Mantequilla de maní', k: 588, p: 25, c: 20, f: 50, fi: 6 },
  { n: 'Nueces / almendras', k: 607, p: 20, c: 21, f: 54, fi: 7 },
  { n: 'Papas fritas de bolsa (snack)', k: 540, p: 6, c: 53, f: 34, fi: 4 },
  { n: 'Chocolate con leche', k: 535, p: 7.6, c: 59, f: 31, fi: 2 },
  { n: 'Helado de vainilla', k: 207, p: 3.5, c: 24, f: 11, fi: 0.7 },
  { n: 'Galleta (tipo maría)', k: 450, p: 7, c: 75, f: 15, fi: 2 },
  { n: 'Palomitas de maíz', k: 387, p: 13, c: 78, f: 4.5, fi: 14.5 },
  { n: 'Aceite de oliva / vegetal', k: 884, p: 0, c: 0, f: 100, fi: 0 },
  { n: 'Mantequilla', k: 717, p: 0.9, c: 0.1, f: 81, fi: 0 },
  { n: 'Mayonesa', k: 680, p: 1, c: 0.6, f: 75, fi: 0 },
  { n: 'Salsa de soja (sillao)', k: 53, p: 8, c: 4.9, f: 0.1, fi: 0.3 },
  { n: 'Gaseosa / refresco', k: 42, p: 0, c: 10.6, f: 0, fi: 0 },
  { n: 'Jugo de naranja natural', k: 45, p: 0.7, c: 10.4, f: 0.2, fi: 0.2 },
  { n: 'Cerveza', k: 43, p: 0.5, c: 3.6, f: 0, fi: 0 },
  { n: 'Café / té sin azúcar', k: 2, p: 0.1, c: 0.3, f: 0, fi: 0 }
];

export function searchFoods(q) {
  const s = (q || '').trim().toLowerCase();
  if (!s) return FOODS.slice(0, 30);
  return FOODS.filter(f => f.n.toLowerCase().includes(s)).slice(0, 40);
}
export function foodToItem(f, gramos) {
  return { nombre: f.n, gramos: Number(gramos) || 0, per100: { k: f.k, p: f.p, c: f.c, f: f.f, fi: f.fi } };
}
