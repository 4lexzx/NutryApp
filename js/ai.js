/* Integración con la API de Gemini (Google AI Studio) para analizar fotos/descripciones.
   La API key se guarda SOLO en este celular (IndexedDB). */

import { b64FromDataURL, esc } from './util.js';

export const DEFAULT_PROMPT = `Eres un asistente de nutrición especializado en comida peruana y dietas para gimnasio.
Tu tarea: analizar la foto y/o descripción de UN plato (una sola porción para una persona).

INSTRUCCIONES
1. Identifica TODOS los ingredientes visibles o descritos.
2. Estima la porción de CADA ingrediente en GRAMOS de UNA porción de plato: no la receta entera, no la olla, no la orden completa.
   Referencias para UN plato de almuerzo (plato hondo de 24–26 cm):
   - Arroz blanco cocido: 100–180 g
   - Carne de res (lomo, bistec, guiso): 70–130 g
   - Pollo: 70–150 g (con hueso; sin hueso 70–120 g)
   - Papa (sancochada, frita, al horno): 100–150 g (2–3 papas medianas)
   - Camote, chaufa, tallarines, macarrones: 120–180 g
   - Verduras, ensalada, tomate, cebolla: 50–120 g
   - Frijoles, lentejas, maíz, palta: 50–100 g
   - Aceite, mantequilla, grasa, salsa de soya: 5–15 g (cucharadita = 5 g)
   - Queso, huevo, pan, chicharrón: 20–60 g
   - Bebidas (leche, jugo, chicha): 150–250 g
3. LA SUMA del plato ("porcion_total_g") debe quedar entre 250 y 600 g. Si pasa de 700 g es que exageraste: baja las porciones.
4. En FOTOS usa el plato como referencia de tamaño: un plato de almuerzo lleno pesa 350–600 g con comida. Si la carne ocupa 1/4 del plato son unos 100 g, no 300 g. No cuentes lo que queda en la olla ni otras porciones de la mesa.
5. Respeta las indicaciones del usuario ("poco arroz", "doble porción", "sin aceite", "para 2 personas"); si no dice nada, es UNA porción.
6. Calcula por ingrediente: kcal, proteína, carbohidratos, grasas y fibra.
7. Prioriza alimentos peruanos (lomo saltado, ají de gallina, arroz con pollo, tallarines verdes, ceviche, causa, papa a la huancaína, tacu tacu, estofado, seco de chivo, anticuchos, pollo a la brasa…). Si no conoces el plato, desglósalo en sus ingredientes base.
8. Si falta información (no se ve el arroz), incluye el ingrediente con una estimación razonable y márcalo en "nota".

RESPONDE EXCLUSIVAMENTE CON UN JSON VÁLIDO (sin texto fuera del JSON, sin markdown) con exactamente esta estructura:
{
  "nombre_plato": "Nombre corto del plato",
  "porcion_total_g": 370,
  "ingredientes": [
    {
      "nombre": "Arroz blanco cocido",
      "gramos": 150,
      "kcal": 195,
      "proteina": 4.1,
      "carbohidratos": 42.3,
      "grasas": 0.5,
      "fibra": 0.6,
      "nota": ""
    }
  ],
  "totales": { "kcal": 0, "proteina": 0, "carbohidratos": 0, "grasas": 0, "fibra": 0 },
  "comentario": "Observación breve, máx. 180 caracteres"
}

REGLAS
- Usa números (no strings) para gramos y macros. Sin signos "+" ni palabras.
- "totales" debe ser la SUMA exacta de todos los ingredientes.
- Un mínimo de 1 y máximo de 18 ingredientes.
- Nunca redondees hacia arriba "por si acaso": es mejor subestimar (sobre todo aceite y grasas).
- Un solo plato NO lleva 300 g de carne ni 400 g de arroz. Si el usuario no pidió doble porción, no la inventes.`;

export class AIError extends Error {
  constructor(msg, kind = 'otro') { super(msg); this.kind = kind; this.name = 'AIError'; }
}

/* Los modelos "-lite" regalan ~500 consultas por día en nivel gratuito;
   los flash "normales" solo ~20 por día. De ahí el orden. */
const MODELS = [
  { v: 'gemini-3.1-flash-lite', l: 'gemini-3.1-flash-lite (recomendado, ~500/día)' },
  { v: 'gemini-3.5-flash-lite', l: 'gemini-3.5-flash-lite (~500/día)' },
  { v: 'gemini-3.8-flash', l: 'gemini-3.8-flash (solo 20/día gratis)' },
  { v: 'gemini-3.7-flash', l: 'gemini-3.7-flash (solo 20/día gratis)' },
  { v: 'gemini-3.5-flash', l: 'gemini-3.5-flash (solo 20/día gratis)' },
  { v: 'gemini-flash-latest', l: 'gemini-flash-latest (solo 20/día gratis)' }
];
export function modelOptions() { return MODELS; }

function friendlyError(status, bodyText, kind) {
  let apiMsg = '';
  try { apiMsg = JSON.parse(bodyText).error.message || ''; } catch (e) { apiMsg = bodyText.slice(0, 220); }
  const low = (apiMsg + ' ' + (kind || '')).toLowerCase();

  if (status === 400 && /api key|api_key|invalid/.test(low)) {
    return new AIError('Tu API key no es válida. Revisa que esté copiada completa en Ajustes → IA.', 'key');
  }
  if (status === 403) {
    return new AIError('La API rechazó la clave (403). Puede que la key esté restringida a otro dominio o que la API "Gemini API" no esté habilitada en Google AI Studio.', 'key');
  }
  if (status === 404 || /not found|is not found/.test(low)) {
    return new AIError(`El modelo no existe o no está disponible con tu clave: ${apiMsg || 'revisa el modelo en Ajustes → IA'}.`, 'modelo');
  }
  if (status === 429 || /rate limit|quota|resource_exhausted|too many requests/.test(low)) {
    const lim = (apiMsg.match(/limit:\s*(\d+)/i) || [])[1];
    const porDia = /per day|per_day|free_tier_requests|retry in \d+h/i.test(apiMsg);
    if (porDia) {
      return new AIError(
        `Se acabó la cuota diaria gratuita de este modelo${lim ? ` (${lim} consultas por día)` : ''}. ` +
        'Se renueva sola al día siguiente. Mientras tanto, en Ajustes → IA cambia a un modelo "-lite" ' +
        '(da ~500 consultas por día) o sigue escribiendo los platos a mano.', 'limite');
    }
    return new AIError('Límite por minuto alcanzado: hiciste varias consultas seguidas. Espera ~1 minuto y vuelve a intentarlo.', 'limite');
  }
  if (status === 500 || status === 503 || /overloaded|unavailable|internal/.test(low)) {
    return new AIError('El servicio de Gemini está saturado ahora mismo. Intenta de nuevo en unos segundos.', 'servidor');
  }
  if (/safety|blocked|prohibited/.test(low)) {
    return new AIError('La imagen/texto fue bloqueado por las políticas de contenido de Google. Prueba con otra foto o describe el plato con palabras.', 'contenido');
  }
  return new AIError(apiMsg ? `Error de Gemini (${status}): ${apiMsg}` : `Error de Gemini (${status}).`, 'otro');
}

async function callGemini({ parts, apiKey, model, variant = 0, attempt = 0 }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  // variant 0 = completo · 1 = sin thinking · 2 = sin thinking ni responseMimeType
  const cfg = { temperature: 0.2 };
  if (variant < 2) cfg.responseMimeType = 'application/json';
  if (variant < 1 && /2\.5|3\./.test(String(model))) cfg.thinkingConfig = { thinkingBudget: 0 };

  let res;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: cfg }),
      signal: ctrl.signal
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new AIError('Gemini tardó demasiado en responder. Revisa tu conexión e inténtalo de nuevo.', 'timeout');
    if (!navigator.onLine) throw new AIError('Sin conexión a internet. La app funciona sin red para ver y registrar comidas, pero el análisis con IA requiere internet.', 'sin-internet');
    throw new AIError('No se pudo conectar con Gemini. Revisa tu conexión e inténtalo de nuevo.', 'red');
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  if (!res.ok) {
    const low = text.toLowerCase();
    if (res.status === 400 && variant < 2 && /thinking/.test(low)) {
      return callGemini({ parts, apiKey, model, variant: 1 });
    }
    if (res.status === 400 && variant < 2 && /mime/.test(low)) {
      return callGemini({ parts, apiKey, model, variant: 2 });
    }
    // error transitorio del servidor de Google: esperamos y reintentamos una vez
    const transitorio = res.status === 500 || res.status === 503 || /overloaded|unavailable|internal/.test(low);
    if (transitorio && attempt < 1) {
      await new Promise(r => setTimeout(r, 2500));
      return callGemini({ parts, apiKey, model, variant, attempt: attempt + 1 });
    }
    throw friendlyError(res.status, text, text);
  }

  let data;
  try { data = JSON.parse(text); } catch (e) { throw new AIError('Respuesta ilegible de Gemini.', 'otro'); }

  const block = data.promptFeedback && data.promptFeedback.blockReason;
  if (block) throw new AIError('La solicitud fue bloqueada por filtros de Google (' + block + ').', 'contenido');

  const cand = data.candidates && data.candidates[0];
  if (!cand) throw new AIError('Gemini no devolvió resultado. Intenta de nuevo.', 'otro');
  if (cand.finishReason && /SAFETY|RECITATION|BLOCKLIST|PROHIBITED/.test(cand.finishReason)) {
    throw new AIError('La respuesta fue bloqueada por políticas de contenido. Cambia la foto o usa la descripción de texto.', 'contenido');
  }
  const out = (cand.content && cand.content.parts ? cand.content.parts : []).map(p => p.text || '').join('');
  if (!out.trim()) throw new AIError('Gemini respondió vacío. Intenta de nuevo.', 'otro');
  return out;
}

function extractJSON(text) {
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new AIError('La IA no devolvió JSON válido.', 'json');
  return JSON.parse(t.slice(a, b + 1));
}

const pick = (o, ...keys) => {
  for (const k of keys) { if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; }
  return undefined;
};
const n = v => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : 0; };

/** Normaliza la respuesta de Gemini a nuestro modelo interno de ingredientes. */
export function normalizeResult(raw) {
  const list = Array.isArray(raw.ingredientes) ? raw.ingredientes
    : Array.isArray(raw.ingredients) ? raw.ingredients
      : Array.isArray(raw.items) ? raw.items : null;
  if (!list || !list.length) throw new AIError('La IA no identificó ingredientes. Prueba con otra foto o escribe el plato.', 'json');

  const items = [];
  for (const it of list) {
    const nombre = String(pick(it, 'nombre', 'name', 'ingrediente') || '').trim();
    if (!nombre) continue;
    let gramos = n(pick(it, 'gramos', 'grams', 'porcion_g', 'peso_g', 'quantity_g'));
    if (gramos <= 0) gramos = 100;
    if (gramos > 3000) gramos = 3000;

    const kcal = n(pick(it, 'kcal', 'calorias', 'calories', 'energy_kcal'));
    const prot = n(pick(it, 'proteina', 'proteinas', 'protein'));
    const carb = n(pick(it, 'carbohidratos', 'carbs', 'carbohydrates'));
    const gras = n(pick(it, 'grasas', 'grasa', 'fat', 'fats'));
    const fib = n(pick(it, 'fibra', 'fiber'));

    const r = 100 / gramos;
    items.push({
      nombre,
      gramos: Math.round(gramos),
      per100: {
        k: round1(kcal * r), p: round1(prot * r), c: round1(carb * r),
        f: round1(gras * r), fi: round1(fib * r)
      },
      nota: String(pick(it, 'nota', 'note') || '')
    });
    if (items.length >= 20) break;
  }
  if (!items.length) throw new AIError('No se pudieron leer los ingredientes de la respuesta.', 'json');

  return {
    name: String(pick(raw, 'nombre_plato', 'nombre', 'name', 'title') || '').trim() || 'Plato detectado',
    totalG: n(pick(raw, 'porcion_total_g', 'total_g', 'gramos_totales')),
    comment: String(pick(raw, 'comentario', 'comment', 'observacion') || '').trim(),
    items
  };
}
function round1(v) { return Math.round((v || 0) * 10) / 10; }

/**
 * Analiza foto y/o descripción con Gemini.
 * @returns {Promise<{name,totalG,comment,items}>}
 */
export async function analyzeMeal({ imageDataUrl, description, prompt, apiKey, model }) {
  if (!navigator.onLine) throw new AIError('Sin conexión a internet. El análisis con IA necesita red; tus datos guardados sí se ven sin conexión.', 'sin-internet');
  if (!apiKey) throw new AIError('Falta tu API key de Gemini. Ve a Ajustes → IA y pégala (se guarda solo en tu celular).', 'sin-key');

  const parts = [];
  if (imageDataUrl) parts.push({ inline_data: { mime_type: 'image/jpeg', data: b64FromDataURL(imageDataUrl) } });

  let txt = (prompt || DEFAULT_PROMPT).trim();
  if (!/json/i.test(txt)) txt += '\n\nRecuerda: responde ÚNICAMENTE con JSON válido.';
  if (description && description.trim()) txt += `\n\nDescripción del usuario: ${description.trim()}`;
  if (!imageDataUrl) txt += '\n\nNo hay foto, basa tu análisis solo en la descripción de texto.';
  parts.push({ text: txt });

  const first = await callGemini({ parts, apiKey, model });
  let raw;
  try { raw = extractJSON(first); }
  catch (e) {
    // Reintento: pedimos que corrija el JSON
    const retry = await callGemini({
      parts: [...parts,
        { text: 'Tu respuesta anterior no era JSON válido. Devuelve SOLO el JSON corregido, sin comentarios ni markdown.' }],
      apiKey, model
    });
    raw = extractJSON(retry);
  }
  return normalizeResult(raw);
}

/** Prueba rápida de la API key (devuelve true/false). */
export async function testApiKey(apiKey, model = 'gemini-3.1-flash-lite') {
  if (!navigator.onLine) return { ok: false, msg: 'Sin conexión a internet.' };
  if (!apiKey) return { ok: false, msg: 'Aún no has pegado una API key.' };
  try {
    await callGemini({
      parts: [{ text: 'Responde solo con la palabra OK' }],
      apiKey, model
    });
    return { ok: true, msg: 'La clave funciona correctamente.' };
  } catch (e) {
    return { ok: false, msg: e.message || 'Error desconocido.' };
  }
}

export function promptHelpHTML() {
  return `
    <div class="note">
      <b>Qué hace este prompt:</b> le dice a Gemini qué debe devolver. La app espera un
      <b>JSON</b> con los ingredientes en gramos y sus macros; con eso arma la tabla editable.
    </div>
    <p class="small muted">Si rompes el formato, la app te avisará. Puedes volver al prompt original con el botón
      <b>“Restaurar predeterminado”</b>.</p>
    <code class="codeblock">{
  "nombre_plato": "Lomo saltado con arroz",
  "porcion_total_g": 400,
  "ingredientes": [
    { "nombre": "Lomo de res", "gramos": 100,
      "kcal": 250, "proteina": 26, "carbohidratos": 0,
      "grasas": 15, "fibra": 0, "nota": "" },
    { "nombre": "Arroz blanco cocido", "gramos": 150,
      "kcal": 195, "proteina": 4.1, "carbohidratos": 42.3,
      "grasas": 0.5, "fibra": 0.6, "nota": "" }
  ],
  "totales": { "kcal": 0, "proteina": 0, "carbohidratos": 0, "grasas": 0, "fibra": 0 },
  "comentario": "Buena fuente de proteína; cuidado con el aceite del salteado."
}</code>
    <p class="tiny muted" style="margin-top:10px">Las porciones son de UN plato (250–600 g en total):
      si la IA devuelve gramos exagerados, ajústalos tú en la tabla antes de guardar.</p>
    <p class="tiny muted" style="margin-top:6px">Escapado de HTML: ${esc('utiliza texto libre, sin código HTML dentro del prompt.')}</p>`;
}
