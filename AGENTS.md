# AGENTS.md

PWA estática "Nutri Gym" (control de nutrición/gimnasio). HTML + CSS + JS vanilla con módulos ES.
No hay `package.json`, ni bundler, ni linter, ni tests automatizados. Idioma de UI, comentarios y
commits: español.

## Los cambios solo valen si se publican

- El deploy es `git push` a `main` en <https://github.com/4lexzx/NutryApp>. Eso dispara
  **Vercel** (<https://nutrygym.vercel.app>, sitio principal) y el workflow
  `.github/workflows/pages.yml` (GitHub Pages, publica la raíz del repo tal cual).
- Un archivo modificado en disco **no** llega al celular del usuario: mientras no se haga push,
  la app en producción sigue igual. Si el usuario reporta "no me aparece el cambio", lo primero
  es verificar la versión servida: `curl https://nutrygym.vercel.app/sw.js | grep CACHE`.

## Ritual de versión en cada cambio publicado (README §11)

Tres lugares, siempre juntos:

1. `js/views/settings.js` → constante `VERSION` (formato `2.2.x`; se ve en Ajustes → Acerca de).
2. `sw.js` → `CACHE = 'nutri-gym-v2.2.x'`. Sin subirlo el celular sigue leyendo su caché vieja.
3. `index.html` y `manifest.webmanifest` → el query `?v=N` de manifest e íconos.

## Service worker (`sw.js`)

- No hace `skipWaiting` al instalar: la versión nueva queda en espera y el usuario la aplica con
  **Ajustes → Actualizar ahora** (ese botón solo aparece si hay un SW esperando) o al cerrar y
  reabrir la app.
- `manifest.webmanifest` SIEMPRE se pide a la red, para que el ícono de la pantalla de inicio se
  actualice solo.
- Todo lo demás es caché-primero con relleno en segundo plano.

## Íconos y logo

- Se generan con `python tools/make-icons.py` (requiere Pillow) a partir de `logo-oficial.png`
  en la raíz. Salidas en `icons/`:
  - `icon-192-v4.png` / `icon-512-v4.png` / `icon-maskable-512-v4.png`: logo completo.
  - `logo-mark-256.png`: solo el monograma. Es el que usan topbar (30px), login (64px) y
    "Acerca de" (26px); el logo completo ilegible en tamaños chicos.
  - `notif-badge-v4.png`: silueta blanca con alfa para la barra de estado (si se sube un PNG
    opaco, Android dibuja un cuadro en su lugar).
- `.gitignore` tiene `/*.png`: los PNG de la raíz (incluido `logo-oficial.png` y capturas) **no**
  se commitean; `icons/*.png` sí. Regenerar íconos exige tener el logo en la raíz de esa máquina.
- **Cambiar el ícono de la app instalada sin desinstalar**: renombra los PNG con sufijo nuevo
  (`-v4` → `-v5`) y actualiza las rutas en `manifest.webmanifest`, `index.html`, `sw.js`
  (PRECACHE) y `js/notif.js`, además del `?v=` y de `VERSION`/`CACHE`. Una URL distinta es lo
  único que hace que Chrome baje el PNG otra vez y repinte el ícono del lanzador.

## Desarrollo local

- `python -m http.server 8123` y abrir <http://127.0.0.1:8123>. Los módulos ES no cargan con
  `file://`.
- Candado local: usuarios en IndexedDB, sesión en `localStorage['ng.session']` (30 días). El
  usuario sembrado la primera vez es `alexsu` / `123456`.
- En localhost la nube (Supabase) queda apagada salvo que haya cfg en el navegador
  (`nubeAutomaticaOk` en `js/config.js`), para no tocar la base real.
- Un service worker viejo del perfil de prueba sirve módulos cacheados y produce errores raros
  tipo "does not provide an export named X": se limpia con
  `navigator.serviceWorker.getRegistrations()` → `unregister()` + borrar `caches.keys()`.

## Nube e IA

- Supabase: claves en `js/config.js` y **son públicas por diseño** (RLS protege los datos). Schema
  en `supabase/schema.sql`; cambios incrementales como `supabase/migracion_v2_x_*.sql` (versionado
  a mano, no hay migrador).
- La clave de Gemini **nunca** va en el cliente: vive en Vercel y la usa `api/ai.js`
  (`vercel.json` solo sube su `maxDuration` a 60 s).
