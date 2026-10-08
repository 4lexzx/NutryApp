/* Nutri Gym · función serverless de IA (Vercel).
   Recibe { model, contents, generationConfig } desde la app y le añade
   la clave de Gemini (variable de entorno GEMINI_API_KEY) para llamar a
   Google. Devuelve la respuesta de Google tal cual (mismo JSON).

   Node 18+ (fetch global). No usa dependencias. */

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method === 'GET') {
    const key = process.env.GEMINI_API_KEY;
    res.status(key ? 200 : 500).json({ ok: !!key });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Método no permitido.' } });
    return;
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    res.status(500).json({
      error: { message: 'El servidor no tiene la clave de Gemini configurada (falta la variable GEMINI_API_KEY en Vercel).' }
    });
    return;
  }

  const { model, contents, generationConfig } = req.body || {};
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
