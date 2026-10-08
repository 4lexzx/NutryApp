/* Configuración de la nube (Supabase).
   La URL y la clave "anon" NO son secretos: viajan dentro de la app pública
   y los datos los protege la política RLS (solo tú ves lo tuyo).
   La clave de Gemini NO vive aquí: se guarda en Vercel (GEMINI_API_KEY).
   Deja esto vacío ('') hasta que lleguen tus datos de Supabase. */

function cfgLocal() {
  try { return JSON.parse(localStorage.getItem('ng.nube.cfg') || 'null'); } catch (e) { return null; }
}
const local = cfgLocal();

export const SUPABASE_URL = (local && local.url) || 'https://uyrhoxcdizondvakxoug.supabase.co';
export const SUPABASE_ANON_KEY = (local && local.anon) || 'sb_publishable_gCimKRKCqDEdC-FT1xsJvQ_KNbXSNGs';
export function nubeConfigurada() { return !!(SUPABASE_URL && SUPABASE_ANON_KEY); }
