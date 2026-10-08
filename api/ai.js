/* Nutri Gym · función serverless de IA (Vercel).
   Recibe { apiKey, model, contents, generationConfig } desde la app: la clave
   la pega CADA CLIENTE en Ajustes → IA y viaja solo en este request (no se
   guarda aquí). Usamos la del body y, si no viene, la variable de entorno
   GEMINI_API_KEY (opcional, para quien prefiera una clave compartida).
   Devuelve la respuesta de Google tal cual (mismo JSON).

   Node 18+ (fetch global). No usa dependencias. */

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method === 'GET') {
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Método no permitido.' } });
    return;
  }

  const { apiKey, model, contents, generationConfig } = req.body || {};
  const key = String(apiKey || '').trim() || String(process.env.GEMINI_API_KEY || '').trim();
  if (!key) {
    res.status(401).json({
      error: { message: 'Falta tu API key de Gemini: pégala en Ajustes → IA.' }
    });
    return;
  }
  if (!model || !Array.isArray(contents)) {
    res.status(400).json({ error: { message: 'Faltan model o contents.' } });
    return;
  }

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/'
    + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig })
    });
    const txt = await r.text();
    res.status(r.status);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(txt);
  } catch (e) {
    res.status(502).json({ error: { message: 'No se pudo contactar a Gemini: ' + (e && e.message ? e.message : e) } });
  }
};
