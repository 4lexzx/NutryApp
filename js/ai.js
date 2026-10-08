/* Integración con la API de Gemini (Google AI Studio) para analizar fotos/descripciones.
   La API key se guarda SOLO en este celular (IndexedDB). */

import { b64FromDataURL, esc } from './util.js';

export const DEFAULT_PROMPT = `Eres un asistente de nutrición especializado en la gastronomía del NORTE DEL PERÚ (Piura y Sullana) y en dietas para gimnasio.
Tu tarea: analizar la foto y/o la descripción y devolver la BASE de UNA porción personal (la app multiplica sola si el usuario pidió varias).

CONTEXTO REGIONAL — PIURA Y SULLANA (norte del Perú)
- El usuario vive en Piura. Interpreta los platos COMO SE PREPARAN ALLÍ, con sus ingredientes reales, no versiones genéricas de otra región.
- Platos típicos: seco de cabrito con frejoles (con albahaca), cabrito al horno / patarashca, tamalitos verdes piuranos, majarisco, ceviche piurano (con chifles y ají charapita), chifles, sudado y seco de pescado, arroz con pato, chupe de camarones, tiradito norteño, picante de pescado, menestra de frijol, refrescos de fruta.
- Panes y loncheras del norte: pan de yema, pan bomba (de Piura), pan francés / bigote, pan de molde, pan integral, pan con queso, pan tajado con queso y tomate o aderezo («pan pizza»), y la CACHANGA: pan fino, llano y crujiente típico de Piura y Sullana (frita o al horno, común en el desayuno y la lonchera). Reconócelos por su nombre tal cual, aunque no estén en tablas genéricas.
- Cuidado con las confusiones de región: el "seco" del norte es de CABRITO con frejoles (no es el seco limeño de chivo); el ceviche piurano lleva CHIFLES.
- Para cada plato: desglosa los ingredientes con gramos por porción personal y calcula kcal, proteína, carbohidratos y grasas.

INTERPRETACIÓN LITERAL — REGLA DE ORO
1. Lee literalmente lo que escribe el usuario. Si escribe "avena" es AVENA (hojuelas o bebible): NUNCA la reemplaces por café, maíz ni otro ingrediente parecido.
2. "leche con avena" y "avena con leche" son la MISMA bebida: leche + avena. NO es café con leche.
3. Nunca sustituyas un ingrediente por otro "similar". Si algo es ambiguo, elige la interpretación más probable, respétala y avísalo en "supuestos".
4. Reconoce nombres coloquiales peruanos: frejoles = frijoles, choclo = maíz, sillao = salsa de soya, mazamorra, quinua, kiwicha, chicha, refresco, atado, etc.
5. NUNCA cuestiones ni reinterpretes lo que el usuario ya escribió con claridad: si dice «pan pizza», ese es el plato (no preguntes «¿qué tipo de pan?» ni lo reduzcas a «pan»); si dice «cena cachanga», la cena es cachanga. Usa el nombre completo tal cual en "nombre_plato" e interprétalo como se prepara en el norte del Perú. Solo pregunta por variantes cuando el término quedó SOLO y sin calificar (ej. «pan» a secas).

PORCIONES POR DEFECTO
6. Si el usuario NO da cantidad: bebidas = 1 taza (250 ml ≈ 250 g); "leche con avena" = 1 taza (leche 200 ml ≈ 200 g + avena 30 g, indícalo en supuestos); platos = 1 plato personal típico de la zona (plato hondo de 24–26 cm).
7. Devuelve SIEMPRE la base de UNA porción personal. Si el usuario pidió varias porciones ("2 platos"), NO las mezcles ni cambies los gramos: la app multiplica la base por ese número. Nunca inventes cantidades distintas para el mismo plato dentro de la misma consulta.
8. Siempre lista en "supuestos" lo que asumiste (gramos de avena, tamaño del plato, qué se ve en la foto, etc.).

RANGOS DE REFERENCIA (para UN plato de almuerzo, 24–26 cm)
- Arroz blanco cocido: 100–180 g · Carne de res: 70–130 g · Pollo: 70–150 g (sin hueso 70–120 g)
- Papa: 100–150 g · Camote, chaufa, tallarines, macarrones: 120–180 g · Verduras: 50–120 g
- Frejoles, lentejas, maíz, palta: 50–100 g · Aceite/mantequilla/salsa: 5–15 g (cucharadita = 5 g)
- Queso, huevo, pan, chicharrón: 20–60 g · Bebidas: 150–250 g · Avena seca: 20–40 g
- La suma del plato ("porcion_total_g") debe quedar entre 250 y 600 g (bebidas: 150–300 g).

OTRAS REGLAS
9. Las cantidades que ESCRIBE el usuario mandan SOBRE tus rangos: si dice "200 g de chaufa", ese ingrediente son exactamente 200 g; si da un peso total de plato, todos los ingredientes deben sumar como máximo ese número (el aceite y la cebolla se incluyen dentro). Si dice "poco arroz", "doble porción", "sin aceite" o "para 2 personas", respétalo. FRACCIONES: "media fruta" / "½" = la MITAD (1/2), "un cuarto" / "1/4" = un cuarto (1/4), "tres cuartos" / "3/4" = 3/4 de lo normal; si NO pone fracción la porción es ENTERA. Si el mensaje te pide "la base de UNA porción", devuelve la porción COMPLETA aunque él haya dicho media o 1/4 (la app la reduce sola); si te pide el total ya ajustado, aplica tú la fracción y anótala en "supuestos".
10. En FOTOS usa el plato como referencia: un plato hondo lleno pesa 350–600 g; si la carne ocupa 1/4 del plato son unos 100 g. No cuentes la olla ni otras porciones de la mesa.
11. Calcula por ingrediente: kcal, proteína, carbohidratos, grasas y fibra.
12. Si falta información (no se ve el arroz), incluye el ingrediente con una estimación razonable y márcalo en "supuestos".
13. Si el mensaje trae "Cantidades registradas", úsalas como TOPE: no aumentes ninguna; solo baja si excede lo razonable para UN plato personal.

CONTENEDORES Y MEDIDAS (en fotos y en texto)
14. Identifica el recipiente y usa su capacidad estándar: vaso cheleero / pinta grande (jarra alta de cerveza o chela): 500–600 ml · vaso mediano (americano, pilsener): 250–350 ml · vaso pequeño: 150–200 ml · lata: 355 ml · botella pequeña: 625 ml · jarra: 1 L · taza o mug: 250 ml · cuchara sopera: 15 ml · cucharada: 10 g de sólido (15 ml de líquido) · scoop de proteína: 30 g.
15. Si la foto muestra un vaso, jarra o lata, calcula el líquido por la capacidad del recipiente (vaso cheleero lleno ≈ 500–600 ml), NO "a ojo". Si el usuario escribe "1 vaso cheleero de chicha" son 500–600 ml. Elige el recipiente que coincida con lo que se ve: alto y estrecho = cheleero (500–600 ml); corto y ancho = mediano (250–350 ml); si no puedes identificarlo, toma 300 ml y márcalo en "supuestos".
16. Si el mensaje trae "Aclaración del usuario", es VERDAD ABSOLUTA y manda sobre tus rangos (ej. "leche = evaporada" → ese ingrediente es leche evaporada, no entera); anótalo en "supuestos".

BATIDOS Y LICUADOS DE GIMNASIO
17. Si describe un batido/shake/licuado (proteína, avena, plátano, mantequilla de maní, acai, huevo…), DESGLÓSALO ingrediente por ingrediente con gramos de CADA uno: nunca un solo bloque "batido 400 g" sin detalle.
18. Porciones típicas de batido: scoop de proteína en polvo = 30 g · cucharada de avena = 10 g · plátano mediano = 100–120 g · cucharada de mantequilla de maní = 15 g · vaso de leche = 250 ml · cucharada de miel = 21 g · puñado de nueces o almenas = 15–30 g · hielo = 0 kcal. El líquido cuenta en gramos (250 ml ≈ 250 g). Si el batido lleva 6 ingredientes, lista los 6 (mínimo 2 g cada uno), cada uno con sus macros.

RESPONDE EXCLUSIVAMENTE CON UN JSON VÁLIDO (sin texto fuera del JSON, sin markdown) con exactamente esta estructura:
{
  "nombre_plato": "Nombre corto del plato",
  "porcion_total_g": 370,
  "ingredientes": [
    { "nombre": "Arroz blanco cocido", "gramos": 150, "kcal": 195, "proteina": 4.1, "carbohidratos": 42.3, "grasas": 0.5, "fibra": 0.6, "nota": "" }
  ],
  "totales": { "kcal": 0, "proteina": 0, "carbohidratos": 0, "grasas": 0, "fibra": 0 },
  "supuestos": ["Tamaño del plato asumido: hondo de 25 cm", "Avena: 30 g en 1 taza de leche"],
  "confianza": 0.85,
  "comentario": "Observación breve, máx. 180 caracteres"
}

REGLAS DEL FORMATO
- Usa números (no strings) para gramos y macros. Sin signos "+" ni palabras.
- "totales" debe ser la SUMA exacta de todos los ingredientes.
- Mínimo 1 y máximo 18 ingredientes.
- "supuestos": array de frases cortas (puede estar vacío si no asumiste nada). "confianza": número entre 0 y 1 (qué tan seguro estás del plato identificado).
- Nunca redondees hacia arriba "por si acaso": es mejor subestimar (sobre todo aceite y grasas).
- Si hay "Cantidades registradas", la suma final NO puede superarlas.
- Un solo plato NO lleva 300 g de carne ni 400 g de arroz. Si el usuario no pidió doble porción, no la inventes.`;


export class AIError extends Error {
  constructor(msg, kind = 'otro') { super(msg); this.kind = kind; this.name = 'AIError'; }
}

/* ================= Utilidades de texto (base local y porciones) ================= */
export function sinAcentos(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Clave normalizada de una consulta, para buscar/guardar en la base local.
 * Ignora mayúsculas, acentos, puntuación, cantidades ("2 platos de") y el orden
 * de las palabras: "leche con avena" y "avena con leche" dan la MISMA clave.
 */
export function claveConsulta(texto) {
  let t = sinAcentos(texto || '');
  t = t.replace(/[.,;:!?()"“”'’]/g, ' ');
  t = t.replace(/\bx\s*\d+\b/g, ' ');
  t = t.replace(/\b\d+\s*(platos?|porciones?)\s*(de|del|del plato)?\b/g, ' ');
  t = t.replace(/\b(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|media|medio)\s*(platos?|porciones?)\s*(de|del)?\b/g, ' ');
  t = t.replace(/\b(platos?|porciones?)\s+(de|del)\b/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.split(' ').sort().join(' ');
}

/* ============ Pregunta rápida ANTES de analizar (variantes de alimentos) ============
   Si lo que escribe puede significar varias cosas (leche entera/evaporada/en polvo…),
   la app pregunta ANTES de llamar a la IA (y antes de la base local): un día puede ser
   leche evaporada y otro entera. La última respuesta se guarda solo para el re-analizar. */
const VARIANTES = [
  {
    clave: 'leche',
    test: /\bleche\b/i,
    ya: /\bleche\s+(entera|evaporada|en\s+polvo|descremada|light|integral|semidescremada|de\s+(almendras|soya|avena|coco)|vegetal)\b/i,
    titulo: '¿Qué leche usaste?',
    opciones: ['entera', 'evaporada', 'en polvo', 'descremada', 'leche de almendras']
  },
  {
    clave: 'arroz',
    test: /\barroz\b/i,
    ya: /\barroz\s+(blanco|tres\s+segundos|integral|salado|al\s+horno|chaufa|con\s+leche)\b/i,
    titulo: '¿Qué arroz?',
    opciones: ['blanco', 'tres segundos', 'integral']
  },
  {
    clave: 'avena',
    test: /\bavena\b/i,
    ya: /\bavena\s+(en\s+hojuelas|bebible|instant[aá]a|en\s+polvo|molida)\b/i,
    titulo: '¿Qué tipo de avena?',
    opciones: ['en hojuelas', 'bebible instantánea', 'en polvo']
  },
  {
    clave: 'pollo',
    test: /\bpollo\b/i,
    ya: /\bpollo\s+(pechuga|muslo|entero|a\s+la\s+brasa|al\s+horno|frito|deshebrado|guisado)\b/i,
    titulo: '¿Qué parte de pollo?',
    opciones: ['pechuga', 'muslo', 'pollo entero', 'pollo a la brasa']
  },
  {
    clave: 'pan',
    test: /\bpan\b|\bpanes\b/i,
    // si ya escribió algo después del pan («pan pizza», «pan de yema», «cachanga»…)
    // ya lo especificó: no se le vuelve a preguntar.
    ya: /\bpan(es)?\s+[a-záéíóúñ]/i,
    titulo: '¿Qué pan?',
    opciones: ['blanco', 'integral', 'pan francés', 'pan de molde']
  },
  {
    clave: 'queso',
    test: /\bqueso\b/i,
    ya: /\bqueso\s+(fresco|amarillo|parmesano|mozzarella|edam|panela|coste[ñn]o|rayado)\b/i,
    titulo: '¿Qué queso?',
    opciones: ['fresco', 'amarillo', 'parmesano', 'mozzarella']
  },
  {
    clave: 'atún',
    test: /\bat[uú]n\b/i,
    ya: /\bat[uú]n\s+(al\s+agua|en\s+aceite|natural)\b/i,
    titulo: '¿Atún en conserva?',
    opciones: ['al agua', 'en aceite']
  },
  {
    clave: 'yogurt',
    test: /\byogurt\b|\byogur\b/i,
    ya: /\byogur(?:t)?\s+(natural|bebible|griego|con\s+frutas?|descremado|batido)\b/i,
    titulo: '¿Qué yogurt?',
    opciones: ['natural', 'griego', 'bebible', 'con frutas']
  },
  {
    clave: 'jugo',
    test: /\bjugo\b/i,
    ya: /\bjugo\s+(natural|en\s+polvo|con\s+pulpa|exprimido|de\s+caja)\b/i,
    titulo: '¿Qué jugo?',
    opciones: ['natural', 'en polvo', 'de caja']
  },
  {
    clave: 'aceite',
    test: /\baceite\b/i,
    ya: /\baceite\s+(de\s+oliva|oliva|canola|girasol|de\s+palta|de\s+coco)\b/i,
    titulo: '¿Qué aceite?',
    opciones: ['de oliva', 'canola', 'girasol']
  },
  {
    clave: 'líquido del batido',
    test: /\b(batido|shake|licuado|prote[ií]na\s+en\s+polvo)\b/i,
    ya: /\b(con|de|en|y)\s+(agua|leche|jugo|agua\s+de|leche\s+de)\b/i,
    titulo: '¿En qué líquido haces el batido?',
    opciones: ['agua', 'leche', 'leche de almendras', 'leche de avena']
  }
];

/** Variantes detectadas en el texto que todavía el usuario no precisó. */
export function detectarAmbiguedades(texto) {
  const t = String(texto || '');
  if (!t.trim()) return [];
  return VARIANTES
    .filter(v => v.test.test(t) && !v.ya.test(t))
    .map(v => ({ clave: v.clave, titulo: v.titulo, opciones: v.opciones }));
}

/** Cuántas porciones pidió el usuario (2 platos → 2, media porción → 0.5, nada → 1).
    Solo cuenta platos/porciones: "2 vasos de chicha" NO multiplica el plato entero. */
export function multiplicadorPorciones(texto) {
  const t = sinAcentos(texto || '');
  const palabras = { uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
  let m = null;
  let g = t.match(/\b(2|3|4|5|6|7|8|9|10)\s*(platos?|porciones?)\b/);
  if (g) m = Number(g[1]);
  if (m == null) { g = t.match(/\b(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(platos?|porciones?)\b/); if (g) m = palabras[g[1]]; }
  if (m == null) { g = t.match(/\bx\s*(2|3|4|5|6|7|8|9|10)\b/); if (g) m = Number(g[1]); }
  if (m == null && /\bdoble (porcion|plato)\b/.test(t)) m = 2;
  if (m == null && /\btriple (porcion|plato)\b/.test(t)) m = 3;
  if (m == null && /\b(media|medio) (porcion|plato)\b/.test(t)) m = 0.5;
  // "media manzana", "medio plátano", "½ galleta": mitad de lo que sea (menos
  // abstracciones como "a media tarde" o "a media hora")
  if (m == null && /\b(media|medio)\s+(?!tarde\b|manana\b|hora\b|sesion\b|cuenta\b|vida\b|semana\b|clase\b|reunion\b|racha\b|noche\b)[a-z]{3,}\b/.test(t)) m = 0.5;
  if (m == null && /(?:^|\s)(?:1\/2|½|0[.,]5)\s+(?:de\s+)?[a-z]{3,}/.test(t)) m = 0.5;
  // cuartos: "1/4 chirimoya", "un cuarto de pan", "3/4 de galleta", "tres cuartos de pan"
  if (m == null && /(?:^|\s)(?:1\/4|¼|0[.,]25)\s+(?:de\s+)?[a-z]{3,}/.test(t)) m = 0.25;
  if (m == null && /(?:^|\s)(?:3\/4|¾|0[.,]75)\s+(?:de\s+)?[a-z]{3,}/.test(t)) m = 0.75;
  if (m == null && /\b(?:un\s+)?cuarto\s+de\s+(?!hora\b|tarde\b|manana\b)[a-z]{3,}/.test(t)) m = 0.25;
  if (m == null && /\b(?:tres\s+)?cuartos\s+de\s+(?!hora\b|tarde\b|manana\b)[a-z]{3,}/.test(t)) m = 0.75;
  if (m == null) m = 1;
  return Math.max(0.25, Math.min(10, m));
}

/** Multiplica una porción base por el número pedido (2 platos = 2× exacto). */
export function aplicarMultiplicador(items, mult) {
  const m = Number(mult) || 1;
  if (m === 1) return items;
  return (items || []).map(it => ({
    ...it,
    gramos: Math.round((Number(it.gramos) || 0) * m * 10) / 10
  }));
}

/**
 * Plan de porciones de una consulta:
 *  - mult: cuántas porciones pidió (2 platos → 2)
 *  - local: si podemos multiplicar NOSOTROS (true) o hay más cosas en la frase
 *    ("2 platos … y 1 vaso de chicha") y entonces el total lo arma la IA.
 */
export function planPorciones(texto) {
  const mult = multiplicadorPorciones(texto);
  if (mult === 1) return { mult: 1, local: true };
  const t = sinAcentos(texto);
  const resto = t
    .replace(/\b\d+\s*(platos?|porciones?)\s*(de|del)?\b/g, ' ')
    .replace(/\b(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(platos?|porciones?)\s*(de|del)?\b/g, ' ');
  const otraCantidad = /\b\d+\s*(vasos?|tazas?|cucharadas?|rebanadas?|presas?|pedazos?)\b/.test(resto)
    || /\b(un|una|medio|media|cuarto|cuartos)\s+(vaso|taza|porcion|cucharada)\b/.test(resto)
    || /\b(?:cuarto|cuartos|1\/4|3\/4|¼|¾)\s+de\s+(?:un\s+)?(?:vaso|taza|cucharada|porcion)\b/.test(resto);
  return { mult, local: !otraCantidad };
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

  const supuestos = Array.isArray(raw.supuestos)
    ? raw.supuestos.map(x => String(x).trim()).filter(Boolean).slice(0, 8) : [];
  const confRaw = parseFloat(raw.confianza);
  const confianza = isFinite(confRaw) ? Math.max(0, Math.min(1, confRaw)) : null;

  return {
    name: String(pick(raw, 'nombre_plato', 'nombre', 'name', 'title') || '').trim() || 'Plato detectado',
    totalG: n(pick(raw, 'porcion_total_g', 'total_g', 'gramos_totales')),
    comment: String(pick(raw, 'comentario', 'comment', 'observacion') || '').trim(),
    supuestos,
    confianza,
    items
  };
}
function round1(v) { return Math.round((v || 0) * 10) / 10; }

/** Valida una respuesta normalizada antes de mostrarla (si algo no cuadra, no llega a la tabla). */
export function validarResultado(r) {
  if (!r || !String(r.name || '').trim()) throw new AIError('La IA no devolvió el nombre del plato.', 'json');
  if (!Array.isArray(r.items) || !r.items.length) throw new AIError('La IA no devolvió ingredientes.', 'json');
  if (r.items.length > 20) throw new AIError('La IA devolvió demasiados ingredientes para un plato.', 'json');
  for (const it of r.items) {
    const g = Number(it.gramos) || 0;
    if (!(g > 0)) throw new AIError(`Ingrediente sin gramos válidos: ${it.nombre || '?'}.`, 'json');
    if (g > 3000) throw new AIError(`Porción irreal en "${it.nombre}": ${g} g.`, 'json');
    if (!it.per100 || !isFinite(Number(it.per100.k))) throw new AIError(`Valores nutricionales ilegibles en "${it.nombre}".`, 'json');
  }
  const sum = r.items.reduce((a, i) => a + (Number(i.gramos) || 0), 0);
  if (sum > 4000) throw new AIError('La IA devolvió una porción irreal (más de 4 kg).', 'json');
  return r;
}

/**
 * Analiza foto y/o descripción con Gemini.
 * @param {number} [opts.maxTotalG] tope máximo para la suma de gramos del plato
 *   (si el usuario ya tenía registradas sus porciones, la IA no puede subirlas).
 * @param {number} [opts.mult] porciones pedidas (2 platos → 2); la base se multiplica aquí.
 * @param {boolean} [opts.multLocal] true = la multiplicación es exacta (la hace la app);
 *   false = hay más elementos en la frase y el total lo arma la IA.
 * @returns {Promise<{name,totalG,comment,supuestos,confianza,items}>}
 */
export async function analyzeMeal({ imageDataUrl, description, prompt, apiKey, model, maxTotalG, mult = 1, multLocal = true }) {
  if (!navigator.onLine) throw new AIError('Sin conexión a internet. El análisis con IA necesita red; tus datos guardados sí se ven sin conexión.', 'sin-internet');
  if (!apiKey) throw new AIError('Falta tu API key de Gemini. Ve a Ajustes → IA y pégala (se guarda solo en tu celular).', 'sin-key');

  const m = Number(mult) || 1;
  const parts = [];
  if (imageDataUrl) parts.push({ inline_data: { mime_type: 'image/jpeg', data: b64FromDataURL(imageDataUrl) } });

  let txt = (prompt || DEFAULT_PROMPT).trim();
  if (!/json/i.test(txt)) txt += '\n\nRecuerda: responde ÚNICAMENTE con JSON válido.';
  if (description && description.trim()) txt += `\n\nDescripción del usuario: ${description.trim()}`;
  if (!imageDataUrl) txt += '\n\nNo hay foto, basa tu análisis solo en la descripción de texto.';
  if (m !== 1 && multLocal) {
    txt += m > 1
      ? `\n\nIMPORTANTE: aunque el usuario pidió ${m} platos, devuelve SOLO la base de UNA porción (la app la multiplica por ${m}).`
      : `\n\nIMPORTANTE: el usuario pidió una FRACCIÓN de la porción (${m}). Devuelve SOLO la base de la porción COMPLETA normal: NO la dividas tú, la app la reduce sola.`;
  } else if (m !== 1) {
    txt += `\n\nIMPORTANTE: el usuario pidió ${m < 1 ? 'la MITAD de la porción (0.5)' : `${m} porciones`} en total. Devuelve el total YA ajustado × ${m}, usando los MISMOS gramos por porción.`;
  }
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
  const out = validarResultado(normalizeResult(raw));
  if (m > 1 && multLocal) {
    out.baseItems = out.items;          // la porción base (1 plato) para la base local
    out.items = aplicarMultiplicador(out.items, m);
    // red de seguridad: aunque la IA haya devuelto el doble ya multiplicado, nunca más de 600 g por porción
    out.items = limitarTotal(out.items, Math.round(600 * m));
  }
  if (m < 1 && multLocal) {
    out.baseItems = out.items;          // la porción COMPLETA para la base local (la fracción se aplica al consultar)
    out.items = aplicarMultiplicador(out.items, m);
    out.supuestos = [...(out.supuestos || []), m === 0.5
      ? '½ porción (lo pediste tú): los gramos ya salen a la mitad.'
      : `Porción ×${m} (lo pediste tú): los gramos ya salen ajustados.`];
  }
  if (maxTotalG > 0) out.items = limitarTotal(out.items, maxTotalG);
  return out;
}

/* Si el usuario ya tenía registradas sus porciones, la IA no puede subirlas:
   si la suma pasa del tope, baja todas las porciones proporcionalmente. */
function limitarTotal(items, maxG) {
  const list = items || [];
  const sum = list.reduce((a, i) => a + (Number(i.gramos) || 0), 0);
  if (!(maxG > 0) || sum <= maxG || sum <= 0) return list;
  const k = maxG / sum;
  return list.map(i => ({ ...i, gramos: Math.max(1, Math.round((Number(i.gramos) || 0) * k)) }));
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
  "supuestos": ["Plato hondo de 25 cm"],
  "confianza": 0.85,
  "comentario": "Buena fuente de proteína; cuidado con el aceite del salteado."
}</code>
    <p class="tiny muted" style="margin-top:10px">Las porciones son de UN plato (250–600 g en total):
      si la IA devuelve gramos exagerados, ajústalos tú en la tabla antes de guardar.</p>
    <p class="tiny muted" style="margin-top:6px">Escapado de HTML: ${esc('utiliza texto libre, sin código HTML dentro del prompt.')}</p>`;
}
