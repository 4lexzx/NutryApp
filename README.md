# 🏋️ Nutri Gym — Control de alimentación para gimnasio (PWA)

App para tu celular Android (y cualquier navegador) que registra lo que comes, calcula tus metas
de **kcal / proteína / carbohidratos / grasas**, y puede analizar tus platos con **Gemini AI**
(foto o descripción). Tus datos se guardan **en tu celular** (IndexedDB) y, si activas la **nube
(Supabase)**, se sincronizan entre tus dispositivos con tu propia cuenta. Para la IA, **cada
usuario pega su propia clave gratuita de Gemini** en Ajustes → IA: esa clave se queda **solo en su
celular** y viaja únicamente en cada consulta a `/api/ai`, que solo hace de puente hacia Google.

> ⚠️ **Aviso**: los valores nutricionales son **estimaciones** generadas por IA y por una tabla de
> referencia de alimentos. No sustituyen la opinión de un nutricionista.

---

## Índice

1. [Qué es y cómo funciona por dentro](#1-qué-es-y-cómo-funciona-por-dentro)
2. [Límites y cosas que debes saber](#2-límites-y-cosas-que-debes-saber)
3. [Publicar la app GRATIS (Vercel o GitHub Pages)](#3-publicar-la-app-gratis-paso-a-paso)
4. [Instalarla en tu celular (pantalla de inicio)](#4-instalarla-en-tu-celular-pantalla-de-inicio)
5. [API key de Gemini gratis (Google AI Studio)](#5-api-key-de-gemini-gratis-google-ai-studio)
6. [Primeros pasos dentro de la app](#6-primeros-pasos-dentro-de-la-app)
7. [Uso diario](#7-uso-diario)
8. [Respaldos, Excel y cambiar de celular](#8-respaldo-excel-y-cambiar-de-celular)
9. [Generar un APK gratis (opcional)](#9-generar-un-apk-gratis-opcional)
10. [Solución de problemas](#10-solución-de-problemas)
11. [Estructura del proyecto y edición del código](#11-estructura-del-proyecto-y-edición-del-código)
12. [La nube (Supabase): sincronizar tus datos](#12-la-nube-supabase-sincronizar-tus-datos)

---

## 1. Qué es y cómo funciona por dentro

| Parte | Tecnología | ¿Necesita internet? |
|---|---|---|
| Interfaz (pantallas) | HTML + CSS + JavaScript puro (sin frameworks) | No |
| Tus datos (perfil, comidas, pesos, favoritos) | **IndexedDB** (base de datos de tu navegador) | No |
| Sincronizarlos con la nube (**automática al iniciar sesión**) | **Supabase** (cuenta propia, con RLS) | **Sí, solo eso** |
| Ver el día, el historial y los gráficos | Se lee de IndexedDB | No |
| Guardar comidas, editar, favoritos | Se escribe en IndexedDB | No |
| **Análisis de platos con IA** | Tu clave de Gemini (pegada en Ajustes → IA) enviada a `/api/ai` en **Vercel**, que llama a **Gemini** | **Sí, solo eso** |
| Guardar la app en el celular | Manifest + Service Worker (PWA) | No (una vez instalada) |

**Archivos del proyecto**

```
APP_Nutri/
├── index.html                 ← pantalla única (contenedor de todas las vistas)
├── manifest.webmanifest       ← hace que sea instalable (ícono + pantalla completa)
├── sw.js                      ← service worker: abre y funciona SIN internet
├── vercel.json                ← config de Vercel (función serverless, 60 s máx.)
├── .nojekyll                  ← le dice a GitHub Pages que sirva los archivos tal cual
├── api/
│   └── ai.js                  ← servidor: recibe la foto/texto + tu clave y llama a Gemini
├── supabase/
│   ├── schema.sql             ← SQL para crear la base de la nube: tabla `registros` + vistas legibles
│   ├── migracion_v2_1.sql     ← SQL para ordenar una base ya existente (renombra `datos` → `registros`)
│   ├── migracion_v2_2_social.sql ← SQL para añadir el perfil social: `perfiles` (foto, bio, racha) y `amistades`
│   └── migracion_v2_3_social.sql ← SQL para la privacidad: flags en `perfiles` + tabla `compartido` (comidas/historial de amigos)
├── icons/                     ← íconos PNG (192, 512 y maskable)
├── css/styles.css             ← diseño oscuro/claro, móvil primero, botones grandes
└── js/
    ├── app.js                 ← arranque, rutas (#/hoy, #/registrar, …), tema, instalación
    ├── db.js                  ← IndexedDB (kv, meals, weights, favorites) + respaldos
    ├── config.js              ← URL y clave pública de tu Supabase (opcional)
    ├── cloud.js               ← cuenta, sincronización y cola de cambios de la nube
    ├── nutrition.js           ← fórmulas Mifflin-St Jeor, metas y tabla de alimentos
    ├── ai.js                  ← llama a /api/ai enviando tu clave (guardada en el celular)
    ├── editor.js              ← editor de plato (ingredientes 100% editables)
    ├── charts.js              ← gráficos en canvas (peso, barras semana/mes)
    ├── export.js              ← CSV para Excel + respaldo/restauración .json
    ├── util.js                ← fechas, toasts, ventanas emergentes, imágenes
    ├── sound.js               ← tick suave solo en botones importantes (interruptor en Ajustes)
    └── views/                 ← una pantalla por módulo (hoy, registro, historial…)
```

**No hay ningún build ni instalación de programas**: son archivos estáticos. Se sirven tal cual.

---

## 2. Límites y cosas que debes saber

1. **Cuota gratuita de Gemini (sin facturación)**: depende del modelo. Los modelos **`-lite` regalan
   ~500 consultas por día** (`gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`) mientras que los
   flash “normales” (`3.8/3.7/3.6/3.5-flash`) solo regalan **20 consultas por día**. La app viene
   con **`gemini-3.1-flash-lite`**, que es la que aguanta varios análisis por día para dos
    personas. Una **foto consume bastante más tokens** que un texto, y **cada foto de un análisis
   con varias fotos cuenta como una consulta aparte**. Los valores exactos de tu
   cuenta los ves en Google AI Studio y en <https://ai.google.dev/gemini-api/docs/rate-limits>;
   la cuota diaria se renueva sola cada día. Si llegas al límite, la app te avisa y puedes cambiar
   de modelo en **Ajustes → IA** (o seguir a mano: no gasta cuota).
2. **Costo: $0.** Mientras **no actives la facturación** en Google Cloud, solo existe la cuota
   gratuita. Nunca actives Billing para esta app.
3. **Tu API key de Gemini vive en Ajustes → IA**: si la nube está conectada se guarda **en tu
   cuenta de la nube** (solo tú puedes verla, con las políticas RLS) y aparece en cualquier
   dispositivo donde entres; si no, se queda en ese celular. Para analizar viaja únicamente en
   esa petición a `/api/ai`. Usa una clave con cuota gratuita y **no actives facturación**.
4. **Si borras los datos del navegador (o actualizas Android de forma agresiva), pierdes el
   historial** (a menos que tengas la nube conectada, que lo restaura solo). También puedes hacer
   respaldos `.json` seguido (paso 8).
5. **Modo sin IA**: puedes usar la app entera escribiendo los platos a mano o reutilizando
   favoritos. No se gasta cuota.
6. La app **solo** habla con tu servidor de Vercel (IA) y, **si activas la nube**, con tu
   Supabase. No hay ningún otro servidor ni servicio de terceros.

---

## 3. Publicar la app GRATIS (paso a paso)

Hay dos caminos: **Vercel** (recomendado: la IA funciona desde el primer momento, con HTTPS y
gratis) o **GitHub Pages** (solo estático: la IA queda desactivada porque no puede ejecutar el
servidor `/api/ai`).

### 3.0 Vercel — la forma recomendada (la IA funciona)

1. Sube el proyecto a GitHub (como en 3.2–3.3, rama `main`).
2. Entra a <https://vercel.com> con tu cuenta de GitHub → **Add New → Project** → importa tu
   repositorio.
3. **Framework Preset**: déjalo en *Other* (no hay build). **Root Directory**: `.`. Vercel
   detecta solo la carpeta `api/` y crea la función serverless.
4. En **Environment Variables** no hace falta ninguna: la clave de Gemini la pega **cada usuario**
   en su propia app (paso 5), no el servidor.
5. **Deploy**. En 1 minuto te da una URL con HTTPS (esta app vive en
   `https://nutrygym.vercel.app`).
6. Abre esa URL en el celular → funciona igual (ícono, offline, todo).

> Cada vez que hagas `git push`, Vercel vuelve a desplegar solo. `/api/ai` solo hace de puente:
> recibe la clave en cada consulta, la usa y la descarta (no se guarda ni se escribe en los logs).

### 3.1 GitHub Pages (solo sin IA): crea la cuenta (si no tienes)

1. Entra a <https://github.com> → **Sign up** → correo, contraseña y usuario (gratis).
2. Verifica tu correo.

### 3.2 Crea el repositorio

1. Botón verde **+** (arriba a la derecha) → **New repository**.
2. **Repository name**: `NutryApp` (tiene que ser exactamente ese formato).
3. Marca **Public** (obligatorio para Pages gratis).
4. Marca **Add a README file**.
5. **Create repository**.

### 3.3 Sube los archivos de la app

**Opción A — desde la web (la más fácil si nunca has usado Git)**

1. Dentro de tu repositorio, pulsa **Add file → Upload files**.
2. Arrastra **todo el contenido de la carpeta `APP_Nutri`** (index.html, manifest.webmanifest,
   sw.js, .nojekyll, css/, js/, icons/, README.md). Puedes subir varios archivos y carpetas a la vez.
3. **Commit changes**.

**Opción B — con la terminal (si ya tienes Git)**

```bash
cd "C:\Users\Alexander\Documents\Proyectos\_vender\APP_Nutri"
git init
git add .
git commit -m "Nutri Gym v1"
git branch -M main
git remote add origin https://github.com/4lexzx/NutryApp.git
git push -u origin main
```

### 3.4 Activa GitHub Pages

1. En el repositorio → pestaña **Settings → Pages**.
2. En **Source**: rama `main` y carpeta `/ (root)` → **Save**.
3. Espera 1–2 minutos. Aparecerá un enlace verde:
   `https://4lexzx.github.io/NutryApp/`
4. Ábrelo en el celular con **Chrome**: debería verse la app (pantalla “Hoy”).

> Si ves una página en blanco: verifica que subiste `index.html` en la **raíz** del repositorio
> (no dentro de otra carpeta) y que existe el archivo `.nojekyll`.

### 3.5 Otras opciones 100% gratuitas (si te atoras)

| Servicio | Cómo | URL |
|---|---|---|
| **Netlify Drop** (el más rápido) | Arrastras la carpeta `APP_Nutri` a la página y en 10 segundos te da un enlace HTTPS | <https://app.netlify.com/drop> |
| **Cloudflare Pages** | Conectas tu repo de GitHub o subes archivos | <https://pages.cloudflare.com> |
| **Vercel** | Importas el repo de GitHub | <https://vercel.com> |

Cualquiera de estas sirve igual: la app es HTML estático.

### 3.6 Cómo actualizar la app después

1. Cambia los archivos en tu PC.
2. Vuelve a subirlos (o `git add . && git commit && git push`).
3. En el celular, abre la app: si hay versión nueva, en **Ajustes → Acerca de** se **activa el
   botón “Actualizar ahora”** (normalmente muestra “✓ Estás al día” y queda deshabilitado) y
   sale un aviso *“Hay una nueva versión…”*. Tócala y la app se recarga con lo nuevo (también
   refresca el logo del ícono). Si no la tocas, se aplica sola la próxima vez que cierres
   del todo la app.

---

## 4. Instalarla en tu celular (pantalla de inicio)

1. Abre la URL en **Chrome de Android** (la URL de Vercel, por ejemplo
   `https://nutrygym.vercel.app`, o la de GitHub Pages si la usaste).
2. Toca **Instalar Nutri Gym** (dentro de Ajustes), o el menú **⋮ → Instalar aplicación /
   Añadir a pantalla de inicio**.
3. Confirmas y el ícono 🟩 **Nutri Gym** aparece en tu pantalla: se abre a pantalla completa,
   sin barra de direcciones, como una app normal.
4. La primera vez que la abres con internet, el service worker guarda la app en caché: a partir de
   ahí **puedes abrirla y ver tus datos sin conexión** (solo el análisis con IA necesita red).

Si Chrome no ofrece “Instalar”, usa **⋮ → Agregar a pantalla de inicio** (también crea el ícono).

---

## 5. API key de Gemini gratis (Google AI Studio)

Cada usuario pega **su propia** clave en la app: **Ajustes → IA → API key → Guardar** (se guarda en
ese celular, en IndexedDB, y no se sube a la nube). El servidor `/api/ai` solo la recibe en cada
petición para llamar a Google y la descarta al terminar.

### 5.1 Crear la clave (5 minutos, gratis, sin tarjeta)

1. En tu PC o celular, entra a <https://aistudio.google.com> con tu cuenta de Google.
2. Busca el botón **Get API key / Obtener clave de API** (arriba a la izquierda).
3. **Create API key → Create API key in new project** (deja que cree el proyecto si te lo pide).
4. Copia la clave (empieza con `AIza…`). Guárdala en un lugar seguro, por ejemplo un correo que te
   envíes a ti mismo.
5. En la app: **Ajustes → IA**, pega la clave en el campo **API key** → **Guardar** → **Probar
   clave**. En otro celular se repite el mismo paso con la clave de cada quien.

### 5.2 Restringir la clave (opcional)

La clave viaja del celular a `/api/ai` y de ahí a Google, así que **no pongas restricciones de
HTTP referrers** en Google Cloud: al llegar sin referrer de navegador, la restricción bloquearía
todos los análisis. Si quieres una capa extra de control, en
<https://console.cloud.google.com/apis/credentials> abre tu clave → **API restrictions → Restrict
key → Gemini API** (solo esa API).

### 5.3 Notas de seguridad y costo

- **No actives facturación** (Billing). Sin facturación no hay cobro posible: solo cuota gratuita.
- Si algún día la activas, ve a **Billing → Budgets & alerts** y pon una alerta de **S/ 1 / $ 1**.
- La clave vive **solo en el celular donde la pegaste**: si borras los datos del navegador se
  pierde (basta con pegarla de nuevo; no se sube a la nube).

---

## 6. Primeros pasos dentro de la app

### 0. Primero: la pantalla de acceso

Al abrir la app aparece un candado local (no usa servidor ni internet). Los datos de fábrica son:

| | |
|---|---|
| **Usuario** | `alexsu` |
| **Contraseña** | `123456` |

**Cada quien con su usuario:** si otra persona usa la app en su celular, que toque
**“¿Primera vez? Crear usuario”**, escriba su usuario (ej. `camila123` — **solo minúsculas,
números, punto, guion o guion bajo**: sin espacios ni ñ) y una contraseña de 4 o más
caracteres. El candado (usuario y contraseña) queda **solo en ese dispositivo**; en la app
publicada, **los datos se suben solos a la nube** la primera vez que entras. No hace falta
exportar ni importar nada:

- La **cuenta de la nube se crea sola** por detrás (tu usuario + `@nutrigym.app`): tú nunca
  ves ni escribes ese correo.
- **Dos personas con el mismo nombre de usuario**: la segunda no podrá conectar a la nube (la
  app se lo avisa y puede seguir en local). Elige nombres distintos.
- Si te equivocas aparece *“Usuario o contraseña incorrectos.”* y puedes volver a intentarlo.
- Para salir: **Ajustes → Cerrar sesión**; tus comidas, perfil y ajustes quedan guardados.
- Si dos usuarios están en **el mismo celular**, ven los mismos datos (el candado separa quién entra,
  no las comidas). En celulares distintos cada quien ve lo suyo.

> ⚠️ Es un candado para curiosos, **no es seguridad real**: el usuario y la contraseña viajan dentro
> del código de la app, que cualquiera puede leer en la web. Sirve para que nadie vea tu comida
> agarrando tu celular, nada más. **Anota tu contraseña**: no hay “recuperar contraseña”.

1. **Perfil** (pestaña 💪): peso, estatura, edad, sexo, nivel de actividad y objetivo
   (déficit / mantenimiento / ganar músculo sin ganar grasa / superávit).
   Arriba tienes tu **perfil social**: tu **foto** y tu **bio** (se suben solas con la
   sincronización) y el acceso a la pestaña **Social**.
   En la pestaña **Social** (👥 en la barra de abajo) está la tarjeta **Amigos**: busca a
   alguien **por usuario**, acepta o rechaza solicitudes y mira el día de tus amigas/os —
   **kcal de hoy contra su meta con barra de progreso, si la cumplieron y su racha** — sin ver
   nada más de su información. Un **punto rojo** en el icono 👥 avisa de solicitudes nuevas.
2. Pulsa **“🧮 Calcular mis metas”**. Verás:
   - tu **gasto calórico (TDEE)** y la fórmula usada paso a paso (Mifflin-St Jeor × factor de
     actividad, luego el % del objetivo: −20% déficit, 0% mantenimiento y recomposición,
     +12% superávit);
   - metas de **kcal, proteína (g/kg — 2.2 en recomposición, 2.0 en déficit…), grasas
     (% de kcal) y carbohidratos (resto)**.
   - **Ganar músculo sin ganar grasa (recomposición)**: calorías de mantenimiento con
     proteína alta; el músculo lo construye el entrenamiento, no las calorías de más.
3. Si quieres, pulsa **“Editar”** y escribe tus metas **a mano**; el badge cambiará a
   *“editadas a mano”*. El botón *“Volver al cálculo”* restaura la fórmula.
4. **Ajustes → Inteligencia artificial**: ahí ves el modelo activo y puedes **probar la IA** (la
   clave la puso quien publicó la app, en Vercel — tú no pegas nada). En **Instrucciones de la IA**
   (#/ia) puedes editar el prompt; el predeterminado ya trae:
   - identificación de ingredientes con **porciones de UN solo plato en gramos**
     (arroz 100–180 g, carne 70–130 g, papa 100–150 g, aceite 5–15 g; el plato completo
     debe quedar entre 250 y 600 g — si la IA exagera, la app te avisa),
   - foco en **comida peruana** (lomo saltado, ají de gallina, arroz con pollo, tallarines verdes,
     ceviche, causa, papa a la huancaína, tacu tacu, pollo a la brasa…),
   - cálculo de **kcal, proteína, carbohidratos, grasas y fibra**,
   - salida en **JSON estructurado** que la app transforma en una tabla editable.
5. **Registrar peso** en 💪 para ver tu gráfico de evolución.
6. **Ajustes → Apariencia**: eliges tema **oscuro/claro** y enciendes o apagas los **sonidos
   suaves de los botones** (un tick bajito estilo Apple, como el teclado del iPhone). Solo suena
   en los botones que **hacen algo importante**: analizar, guardar, eliminar, confirmar,
   respaldos… no en la navegación ni en las pestañas. Suena cuando **presionas de verdad** (tocas
   y levantas el dedo encima): **deslizar el dedo sobre un botón no suena**. Viene encendido.

---

## 7. Uso diario

La barra de abajo tiene 6 botones en este orden: **🏠 Hoy · 📊 Historial · ➕ Registrar (el
botón redondo) · 👥 Social · 💪 Perfil · ⚙️ Ajustes**.

### Registrar una comida (botón ＋)

| Pestaña | Qué hace | ¿Gasta cuota de IA? |
|---|---|---|
| 📷 **Foto** | **La cámara se abre dentro de la app** (no sales de la app) o eliges de galería — puedes elegir **varias fotos seguidas (hasta 4)** y quitarlas una por una; + descripción opcional → **Analizar con la IA** (cada foto se analiza por separado y todo se junta en **un solo plato**, con los nombres combinados tipo *“Pan + Café con leche”*) | Sí |
| 📝 **Texto** | Escribes “1 lomo saltado con arroz, poco arroz” → **Analizar con la IA** | Sí |
| ✋ **Manual** | Buscas en la tabla de alimentos, pones gramos → sin IA | **No** |
| ⭐ **Favoritos** | Cargas un plato guardado con 2 toques → sin IA | **No** |

**Antes de guardar siempre ves el editor**: lista de ingredientes con **gramos, kcal, proteína,
carbos y grasas editables**. Si cambias los gramos, las macros se recalculan; si corriges una
macro, la escala se mantiene. Puedes **quitar** ingredientes, **añadir** nuevos y los **totales**
se actualizan solos. Eliges el tipo de comida (desayuno/almuerzo/cena/snack) y **Guardar**.

- **⭐ Guardar favorito**: lo deja en Favoritos para reutilizarlo sin gastar IA.
- **🥤 Arma tu batido** (botón arriba de las pestañas): una **licuadora gráfica** con **marcas de
  ml en el vaso (200, 400, 600 y 700)** que se va llenando capa por capa, con **sonido de check**
  al agregar. Cada ingrediente trae su **unidad de medida real**: leche y agua en **medio vaso
  (125 ml)**, yogur y avena **por cucharada (20 g y 10 g)**, plátano **por unidad (120 g)**,
  almendras y hielo **por pieza (1.2 g y 20 g)**, miel/maní/cacao/algarrobina por cucharada y
  **proteína (opcional)** por scoop. En **la propia lista** ves cuántos llevas y quitas o agregas
  con **＋ / − sin tener que bajar** (el contador *“N agregados · kcal”* está en el título de la
  tarjeta). Ves los **ml vs 700 ml** con barra de capacidad y aviso si se desborda, más las **kcal
  y macros en vivo**.
- **📝 Descripción (opcional)** en el batido: escribes algo como *“medio vaso de leche, 2
  cucharadas de avena, 3 almendras, 200 g de plátano”* y al tocar **Aplicar y recalcular** la app
  **ajusta (y agrega) los ingredientes que reconoce, en tu celular y sin IA**; el texto se guarda
  como nota del plato.
- **➕ Ingrediente que no está**: si te falta algo lo agregas tú (nombre, gramos y kcal).
- **🥛 ¿Qué leche usas?**: debajo de “Leche” eliges el **tipo con un toque** — **Entera, Vaporada,
  En polvo, Descremada o De almendras**. Cada una trae sus **macros propias** (por ejemplo, la en
  polvo se cuenta **por cucharada de 10 g**, muy diferente a un medio vaso de entera); al cambiarla
  **se conservan las porciones** que ya llevabas y el nombre del plato se guarda con el tipo
  (“Leche en polvo”).
- **🥤 ¡Licuar!**: el botón final dice **¡Licuar!** — al pulsarlo **suena la licuadora (~1 s)** y la
  animación muestra la licuadora **licuando de verdad** (aspas girando, vaso vibrando, burbujas
  subiendo). Al terminar el batido **se guarda solo en tu día** (sin saltar al editor) y aparece un
  **resumen flotante grande con kcal, proteína, carbos y grasas**; desde ahí puedes tocar
  **“Editar plato”** (se abre tal cual lo guardaste) o **“Listo”** (sigues en la licuadora, lista
  para otro batido). **Sin gastar IA.**
- Si la IA se equivoca (por ejemplo la porción), corrígela: es lo esperado, es una **estimación**.
- **✨ Re-analizar con la IA**: el botón aparece al editar una comida guardada **y también recién
  analizada** (por si te equivocaste al escribir un ingrediente: corrige el nombre y dale a
  **Re-analizar** — la app te avisa *“Cambiaste el nombre de un ingrediente: pulsa arriba para que
  la IA lo vuelva a mirar”*). La IA vuelve a estimar los gramos con tu foto o con el nombre/nota
  del plato y **actualiza los ingredientes** (1 consulta de tu cuota diaria; te pide confirmación
  y puedes editar todo antes de Guardar).
  **No sube tus porciones**: parte de los gramos que ya tienes registrados y solo puede
  mantenerlos o bajarlos (máximo +15%, y te avisa si la IA se pasa).
  **Tus correcciones manuales no se pierden**: lo que hayas cambiado a mano (gramos o nombre del
  ingrediente) se conserva tal cual; la IA solo re-estima el resto, y el aviso te dice cuántas
  correcciones tuyas mantuvo. Las preguntas de variantes no se repiten aquí: se aplican las
  respuestas que diste al analizar.

### Te pregunta antes de analizar (siempre que no lo especifiques tú)

Si lo que escribes puede significar varias cosas, la app **te pregunta primero** (antes de gastar
cuota de IA **y antes de consultar tu base de platos**) y con tu respuesta arma la consulta más
precisa. Pregunta por:

- **leche** (entera, evaporada, en polvo, descremada, de almendras…)
- **tipo de avena** (en hojuelas, en polvo, cocida…) y **tipo de arroz** (blanco, tres segundos, integral)
- **pollo** (pechuga, muslo, al horno…), **pan**, **queso**, **atún**, **yogurt** y **jugo**
- **aceite** (oliva, canola…) y el **líquido del batido** (agua o leche)

Reglas:

- **No pregunta** si el texto ya lo trae escrito (“leche de almendras”, “arroz integral”,
  **“pan pizza”**, “cachanga”…): eso no se pregunta, solo lo que quedó ambiguo (un “pan” a secas).
  Si escribes un plato o pan con nombre propio, la IA lo toma **tal cual**, con receta del norte
  (cachanga, pan de yema, pan bomba…), sin “¿qué tipo de pan?” de por medio.
- Respondes con un toque, o **“Omitir (que la IA suponga)”**; también puedes cerrar la pregunta
  con la tecla Escape.
- **Siempre pregunta de nuevo** si lo vuelves a omitir: ayer pudiste usar leche entera y hoy
  evaporada, así que la app no se adivina — tú eliges cada vez.
- Como la aclaración viaja en la consulta, **cada variante aprende por separado**: “leche entera
  con avena” y “leche evaporada con avena” quedan en filas distintas de tu base local.
- Las respuestas se guardan en tu celular y se re-aplican **solo al re-analizar** (donde ya no
  aparecen las preguntas), para que esa corrección no se pierda.
- La aclaración también vale en **favoritos** que salen de la IA.

### ¿De qué comida es? La app lo adivina sola

Al abrir el editor, el tipo de comida (desayuno/almuerzo/cena/snack) se elige según **3 cosas**:

1. **La hora**: a la 1 p. m. es almuerzo, aunque no hayas desayunado; **las 5 p. m. ya es
   merienda (snack), nunca cena** — la cena recién se sugiere **desde las 7 p. m.**
2. **Lo que ya registraste hoy**: si ya desayunaste, nunca te vuelve a sugerir desayuno; lo que
   sigue es la que viene (desayuno → almuerzo → cena). Si una comida principal ya pasó y no la
   registraste, el aviso te dice **“Falta registrar: desayuno”** (a las 5 p. m. te recuerda el
   almuerzo si falta, y si ya almorzaste la merienda es un snack).
3. **El tamaño**: los **snacks son cosas pequeñas** (café, fruta, galletas), no platos; un plato
   completo no se clasifica como snack. De noche (7 p. m. en adelante) manda la cena si todavía
   no cenaste.

Los botones siguen siendo tuyos: si te equivoca, cambias el tipo a mano y el aviso pasa a
decirte que lo dejaste manual.

### Cómo analiza la IA (reglas nuevas)

- **📍 Comida del norte (Piura y Sullana)**: el prompt está adaptado a la gastronomía de la
  zona (seco de cabrito con frejoles, tamalitos verdes, majarisco, ceviche piurano con chifles,
  chifles, sudado, arroz con pato, chupe de camarones…) y a cómo se preparan **allí**.
- **🥣 Lectura literal**: si escribes “avena”, es avena — la IA **nunca** la cambia por café ni
  por otro ingrediente parecido; “leche con avena” y “avena con leche” son lo mismo.
- **🍽 Porciones por defecto**: si no pones cantidad, asume **1 taza de bebida (250 ml)** y
  **1 plato personal** de la zona, y te lista lo que asumió en **“supuestos”** (más la
  **confianza** del 0–100%) en la nota del plato.
- **✖️ “2 platos” = doble exacto**: la app guarda la porción base de 1 plato y la multiplica
  ella misma (los mismos gramos × 2), sin dejar que la IA invente cantidades distintas.
- **½ · ¼ · ¾ y cantidades en su cuadrito**: si escribes **“media manzana”**, **“½ galleta”**,
  **“1/4 chirimoya”**, **“un cuarto de pan”** o **“3/4 de galleta”**, la app calcula la fracción
  (gramos × ½, × ¼ o × ¾). El nombre queda **limpio** (“Manzana”) y la cantidad se ve en su
  propio cuadrito **Cant.** al lado (estilo ingredientes): muestra **1** cuando no pediste nada,
  **1/2**, **1/4** o **2** cuando sí — y es **editable**: cambias el número y los gramos y macros
  se reescalan al instante. La nota te avisa *“½ porción (lo pediste tú)”* cuando hubo fracción.
  **“2 platos de arroz con pollo”** sale con los gramos exactos × 2 y Cant. = 2.
- **📚 Base local de platos**: lo que analizas queda guardado en tu celular; la próxima vez que
  escribas el mismo plato con las mismas respuestas (aunque sea en otro orden: “avena con leche”)
  sale **igual y sin gastar cuota**. En el editor, **“Usar como mi porción estándar”** guarda tus
  gramos corregidos como la porción oficial de ese plato. Y en **Ajustes → Mis porciones
  estándar → Ver** ves la lista completa (nombre, ingredientes y gramos) y puedes **“Quitar”**
  una porción que se guardó sin querer: la próxima vez que la consultes la IA la analiza de nuevo.
- **🧪 Temperatura 0.2 + JSON validado**: respuestas consistentes; si el JSON viene malo, la app
  reintenta una vez y te avisa en vez de mostrar datos rotos.
- **🥛 Contenedores y medidas**: el prompt identifica el recipiente de la foto o del texto y usa
  su capacidad estándar (vaso cheleero/pinta 500–600 ml, vaso americano 250–350 ml, lata 355 ml,
  botella 625 ml, jarra 1 L, taza 250 ml, cuchara sopera 15 ml, scoop de proteína 30 g) en vez de
  adivinar “a ojo”.
- **🥤 Batidos de gimnasio desglosados**: un batido nunca sale como un bloque “batido 400 g”:
  la IA lo abre ingrediente por ingrediente (scoop de proteína 30 g, avena 10 g por cucharada,
  plátano 100–120 g, mantequilla de maní 15 g, leche 250 ml, miel 21 g, nueces 15–30 g, hielo 0 kcal).

### Panel del día (📅 Hoy)

- Navegas de día en día con **‹ ›** o tocando la fecha.
- Ves **kcal consumidas vs meta** y **4 barras de progreso** con lo que falta de cada macro.
- Lista de comidas del día con sus macros; puedes **Ver ingredientes / Editar / Eliminar**.
- Contador de **agua** (vasos de 250 ml): la tarjeta te dice la cuenta clara, por ejemplo
  **“8 vasos = 2.00 L al día (1 vaso = 250 ml)”**, y la meta se cambia en Ajustes. Los vasos se
  ven **dibujados uno por uno** y se llenan con una **animación de líquido** más un **sonidito de
  agua** cada vez que sumas; los grandes botones **− / +** restan o suman (y también puedes tocar
  cualquier vaso para marcarlo hasta ese punto).
- **🏋️ Gimnasio del día**: la tarjeta **Gimnasio** (con icono y estado claro: **Sí fui**, **No fui**
  o **Sin registrar** — marcar “No hoy” **también se guarda**, ya no se pierde el registro) muestra
  las horas, los trabajos del día y las etiquetas de **músculos** (pecho, espalda, hombros, brazos,
  piernas, glúteos, abdomen, cuerpo completo) y **cardio** (bicicleta, caminadora, saltar la cuerda,
  elíptica, remo, natación…). El formulario usa **dos tarjetas grandes Sí/No** y **3 pasos
  numerados** (horas, músculos, cardio) con una **vista previa “+X kcal” en grande y la fórmula**
  (peso × horas × intensidad MET) antes de guardar. Ese día tu **meta de kcal sube sola** ≈ *peso ×
  horas × intensidad* (sin peso en el perfil se estima a 250 kcal/h) y en la cabecera te avisa
  **“+X por gym”**. Se guarda por día, entra al respaldo y puedes editarlo para días pasados desde ‹ ›.
- **🔥 Racha del gimnasio (con plan)**: tu **plan de días por semana** vive en el **perfil**
  (junto a Nivel de actividad, en rangos como **“3-4 días”**) y está **sincronizado en ambos
  sentidos**: lo cambias en Gimnasio y se actualiza en Perfil, y al revés. La app lleva una
  **racha en días** que sigue **día tras día, semana tras semana y mes a mes**, pero **se verifica
  cada día**: no se pierde mientras sigas dentro del rango de tu plan (aguanta entre semanas y al
   cambiar de mes) y **solo se pierde si una semana cierra por debajo del mínimo** (con “3-4 días”,
   pierdes solo si cierras la semana con menos de 3). Cuando **guardas gym y la racha crece o se
   enciende**, la app se llena de **fuego 🔥 a PANTALLA COMPLETA** (llama gigante, resplandor y
   brasas con **sonido de fogata**; se cierra sola o con un toque) y en Hoy la **llama se enciende
   con una animación de chispa** (gris/apagada cuando va en 0), junto a **7 lámparas por día de la
   semana**
   (L M X J V S D): **encendida** cuando ese día hubo gym y **gris mientras siga apagada hoy**,
   con el avance **“k de N días”** de la semana.
- **⏰ Recordatorios de comidas** (Ajustes → Recordatorios): activas el permiso una vez, marcas
  las comidas que te sirven y les pones **la hora que quieras** (por defecto **desayuno 08:00,
  almuerzo 13:00 y cena 20:00**, cada una con su reloj editable). El aviso se titula **NutriGym**
  (solo el nombre de la app) y el cuerpo pregunta **“¿Ya anotaste…?”** con **cuántas kcal y
  proteína llevas hoy** y **cuántas kcal te quedan** por registrar (el botón **Probar aviso**
  muestra exactamente eso) y sale con **el logo de la app** (icono
  grande a color y la silueta del logo en la barra: nada de cuadrados). Funciona en **Android e
  iPhone** (PWA
   instalada en la pantalla de inicio, iOS 16.4+) mientras la app esté abierta o en segundo plano;
   al tocar el aviso se abre **Hoy**. Todo se programa en tu celular, sin servidores ni costo.

### Historial (📊)

- **Semana**: 7 días con barras de kcal, meta y promedio + resumen de promedios.
- **Mes**: gráfico de barras del mes y lista de los días con comidas.
- Tocas cualquier día y saltas a ese día en **Hoy**.

---

## 8. Respaldos, Excel y cambiar de celular

> ☁️ **Si tienes la nube conectada** (paso 12), tus datos ya están respaldados solos: en el celular
> nuevo basta con **crear/conectar tu cuenta** en Ajustes → Nube y todo baja solo. Aun así, un
> `.json` mensual de cortesía no sobra.

Ve a **Ajustes → Datos y respaldo**:

- **⬇ Descargar respaldo (.json)**: guarda TODO (perfil, comidas, pesos, favoritos, ajustes,
  IA y tu base de platos). Guárdalo en Google Drive, tu PC o mándatelo por correo.
  **Hazlo al menos 1 vez por semana.**
- **⬆ Restaurar desde archivo**: elige un `.json` → reemplaza los datos del dispositivo
  (te avisa antes; descarga primero un respaldo actual).
- **CSV comidas / CSV pesos**: se abren en **Excel** o **Google Sheets** con coma como separador
  (archivo UTF-8 con BOM: se ven bien los acentos).
- **📄 Exportar todo en un CSV maestro**: una sola hoja con perfil, comidas, pesos y favoritos.
- **🗑 Borrar TODOS los datos**: pide confirmación escribiendo `BORRAR`.

**Para cambiar de celular** (sin nube): respaldo `.json` en el celular nuevo → abrir la URL de la
app → Ajustes → Restaurar. **Con nube**: solo crea/conecta tu cuenta y pulsa **Bajar**.

---

## 9. Generar un APK gratis (opcional)

**No es necesario**: la PWA instalada ya te da ícono y pantalla completa. Si aun así quieres un
`.apk` para instalarlo/lookearlo, esta es la ruta gratis:

### Opción A — PWABuilder (la más fácil, sin instalar nada)

1. Sube la app a GitHub Pages (paso 3) y ten la URL viva:
   `https://4lexzx.github.io/NutryApp/`
2. Entra a <https://pwabuilder.com> y pega tu URL → **Start**.
3. Espera el análisis (debe detectar el manifest: si no, revisa que `manifest.webmanifest` cargue).
4. **Package for stores → Android → Generate** (te puede pedir iniciar sesión con GitHub: es gratis).
5. Descargas un `.zip` que trae el **APK/AAB** y las instrucciones de firma. PWABuilder te da un
   paso de **Signing** para crear tu keystore (gratis) y obtener el **APK firmado**.
6. Copia el `.apk` al celular → en Android: **Ajustes → Aplicaciones → Instalar apps de orígenes
   desconocidos** (permite el navegador que lo descargó) → abrir el archivo → **Instalar**.

> Para que el APK se comporte 100% como app (sin barra de navegador) PWABuilder te pide subir un
> archivo `assetlinks.json` a `/.well-known/` de tu dominio. Si no lo haces, el APK igual instala
> y funciona, pero puede abrirse dentro de Chrome.

### Opción B — Bubblewrap CLI (gratis, con más pasos)

Requiere **Node.js** y **Java (JDK 17)** instalados en tu PC:

```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest=https://4lexzx.github.io/NutryApp/manifest.webmanifest
bubblewrap build      # genera app-release-signed.apk
```

### Opción C — Capacitor / Android Studio (gratis, más pesado)

Crea un contenedor nativo con `npm create @capacitor/app` y apunta la URL de GitHub Pages.
Útil solo si vas a publicar en la Play Store.

---

## 10. Solución de problemas

| Problema | Solución |
|---|---|
| *“La IA no responde / servidor no encontrado”* | La app llama a `/api/ai` de **tu** Vercel: si publicaste en GitHub Pages o Netlify estático, la IA no existe ahí (publica en Vercel, paso 3.0). Si la IA responde con error de clave, ve a **Ajustes → IA** y vuelve a pegar tu API key (**Probar clave**). |
| *“Límite alcanzado / cuota”* | Es la **cuota gratuita** de Gemini. Espera 1 minuto (o al día siguiente) o cambia de modelo en Ajustes → IA. Mientras tanto puedes registrar **manual**. |
| *“El modelo no existe”* | Cambia el modelo en Ajustes → IA (usa `gemini-3.1-flash-lite`). |
| *“Se acabó la cuota diaria gratuita”* | Ese modelo solo regala 20 consultas/día; en **Ajustes → IA** cámbialo por un modelo **`-lite`** (~500/día) o espera a que se renueve al día siguiente. |
| *“Sin conexión a internet”* | El análisis con IA y la nube necesitan red. Ver historial/registrar manual funciona igual sin internet (y lo que guardes se sube solo al volver). |
| La app no instala | Úsala en **Chrome** (no en Firefox/Samsung Internet si no ofrece instalar) y con **HTTPS** (Vercel y GitHub Pages sí). O usa ⋮ → *Añadir a pantalla de inicio*. |
| Se ve rara al abrir | Recarga: menú ⋮ → **Actualizar**. |
| El ícono sigue con el logo viejo | Ajustes → Acerca de → **Actualizar ahora** (solo se activa si hay versión nueva) y espera unos minutos. Si aun así no cambia, quita el ícono de la pantalla de inicio y vuelve a tocar **Instalar**. |
| *“Ups, algo salió mal”* | Recarga la página. Si persiste, revisa la consola de Chrome (⋮ → Herramientas → Consola de JS) y los mensajes de error. |
| **Borré los datos del navegador** | Si tenías la nube conectada, vuelve a conectarla y todo baja solo. Si no, restaura tu respaldo `.json` desde Ajustes. |
| Cambié de celular | Con nube: crea/conecta tu cuenta y pulsa **Bajar**. Sin nube: restaura el `.json` (paso 8). |
| La nube dice *“sin configurar”* | Falta pegar la URL y la clave de Supabase en `js/config.js` y redeployar (paso 12.2). |
| No entra la nube (correo/rechazo) | En Supabase → Authentication → Settings, revisa que **Confirm email** esté desactivado (paso 12.1) y que usuario/contraseña sean los mismos. |
| *“Nube: 1 cambio pendiente”* casi siempre | Vuelve a tocar **Sincronizar** en Ajustes → Nube; si sigue, pulsa **Bajar** (muestra los datos de la nube) o revisa que estés en línea. |
| ¿Se envían mis fotos a algún lado? | Solo cuando tocas “Analizar con la IA”: van a **tu servidor en Vercel** (`/api/ai`) y de ahí a **Gemini (Google)**, junto con tu clave de este celular. Nunca a otra parte. |
| El iPhone no muestra la app | Safari → botón **Compartir → Añadir a pantalla de inicio**. |

---

## 11. Estructura del proyecto y edición del código

La app es JavaScript estático con módulos ES (`<script type="module">`). No necesita `npm`,
bundler ni servidor propio.

**Rutas** (hash, funciona en cualquier hosting):

```
#/hoy          panel del día            #/registrar   foto / texto / manual / favoritos
#/nuevo        editor de un plato nuevo  #/editar/:id  editar una comida guardada
#/historial    semana y mes con gráficos #/perfil      datos, metas y peso
#/ajustes      tema, IA, agua, datos     #/ia          prompt de Gemini
```

**Cambios rápidos**

- **Tabla de alimentos**: `js/nutrition.js` (array `FOODS`, valores por 100 g).
- **Prompt por defecto de la IA**: `js/ai.js` (constante `DEFAULT_PROMPT`).
- **Fórmulas de metas**: `js/nutrition.js` (`calcTargets`).
- **Colores/diseño**: `css/styles.css` (variables en `:root` y `[data-theme="light"]`).
- **Nombre y colores del ícono**: `icons/` (PNG) y `manifest.webmanifest`.
- **Sonidos**: archivos `.wav` en `sfx/` (tocar, check, licuar, fogata y agua). El del agua es una
  **grabación real** (“Pouring Water” de Universfield vía **Pixabay**, Pixabay Content License:
  uso libre, incluso comercial, sin atribución).
- **Versión de la app**: se ve en **Ajustes → Acerca de** (`js/views/settings.js`, constante
  `VERSION`, formato `2.0.x`). **En cada cambio publicado sube el último dígito** (2.0.0 → 2.0.1
  → 2.0.2…) para que el usuario sepa de un vistazo si ya tiene la última actualización.
  Además sube el nombre de caché `CACHE` en `sw.js` (por ejemplo `nutri-gym-v2.0.1`) para forzar
  la descarga de los archivos nuevos en el celular.
- **URL de la nube y configuración**: `js/config.js` (URL y clave pública de Supabase; la clave
  pública no es secreta, pero si prefieres no subirla, déjala vacía y pégala en el navegador).
- **Sincronización**: `js/cloud.js`; estructura de la nube en `supabase/schema.sql` (usa `supabase/migracion_v2_1.sql` si tu base viene de una versión anterior, `supabase/migracion_v2_2_social.sql` para añadir el perfil social: `perfiles` y `amistades`, y `supabase/migracion_v2_3_social.sql` para la privacidad: flags de visibilidad en `perfiles` + tabla `compartido` con lo que cada uno publica a sus amigos).
- **Servidor de IA**: `api/ai.js` (recibe la petición en Vercel —con la clave que envía el cliente
  en ese mismo request— y llama a Gemini). `vercel.json` solo ajusta el tiempo máximo (60 s).

**Verla en local en tu PC** (opcional): necesitas un servidor porque los módulos ES y el service
worker no corren desde `file://`:

```bash
cd APP_Nutri
python -m http.server 8080
# abre http://localhost:8080
```

---

## 12. La nube (Supabase): sincronizar tus datos

La app **siempre** guarda primero en tu celular y, **en cuanto entras con tu usuario, la nube se
conecta sola** (mismo usuario y contraseña del candado): tus datos quedan en **tu cuenta**, en
cualquier dispositivo donde entres. Usas **tu propia cuenta de Supabase** (gratis para empezar):
nadie más ve tus datos gracias a las políticas de seguridad (RLS) de la tabla. La tarjeta
**Nube** de Ajustes te deja desconectar, sincronizar a mano o crear otra cuenta si quieres.

En la versión publicada (producción) el acceso es **solo con la nube**: al entrar se valida el
usuario y la contraseña contra Supabase **antes** de abrir la app y se bajan tus datos, así que
en cualquier PC o celular ves lo mismo con **la misma cuenta y la misma contraseña**. En local
(desarrollo y pruebas) sigue pudiendo entrar con el candado del navegador.

Además, la tabla `usuarios_registrados` de la BD guarda cada cuenta con su **usuario y correo**
(y una comprobación de unicidad global: **el nombre de usuario no se puede repetir** en toda la
app). Esa tabla se llena sola cada vez que se crea una cuenta; para activarla hay que aplicar la
migración `supabase/migracion_v2_4_usuarios.sql` en Supabase SQL Editor.

### 12.1 Crear la base de datos (una sola vez)

1. Entra a <https://supabase.com> → **New project** (elige nombre, región y contraseña de admin).
2. En el panel lateral: **SQL Editor → New query**.
3. Abre el archivo `supabase/schema.sql` de este repo, cópialo **tal cual** y pégalo → **Run**
   (debe decir “Success”). Eso crea la tabla `registros` con permisos RLS: cada cuenta solo ve lo suyo,
   y las vistas **comidas, pesos, agua, favoritos, platos y ajustes** (léen como tablas simples).
   También crea las tablas del **perfil social** (`perfiles` con foto/bio/racha y `amistades`).
4. En **Authentication → Sign In / Providers**: **desactiva “Confirm email”** (así tu cuenta
   queda lista al instante; es tu cuenta privada).

### 12.2 Decirle a la app dónde está esa base

1. En Supabase → **Project Settings → API** copia dos cosas: la **Project URL** y la
   **anon/public key**.
2. En tu PC, edita `js/config.js` y pega ambas (reemplaza los textos vacíos).
3. Sube el cambio (`git push`): Vercel redespliega solo.

### 12.3 Conectar (en cada dispositivo)

1. **Entra con tu usuario del candado** y la nube se conecta sola: usa ese mismo usuario y
   contraseña para generar la cuenta de Supabase (el correo queda como
   `tuusuario@nutrigym.app`; nunca escribes ni ves esas credenciales).
2. La app **sube todo lo que tengas** y te muestra el conteo (*"Subí tus datos: N registros"*);
   si la nube ya tenía datos de otro dispositivo, **baja** esos también.
3. El badge de la tarjeta **Nube** (Ajustes) te dice el estado: **conectada**, **desconectada**,
   **N cambios pendientes** o **Todo sincronizado**. También hay botones **Subir todo**,
   **Bajar todo** y **Sincronizar**, y puedes crear/conectar **otra cuenta a mano** si quieres.

### Cómo se comporta

- **Al abrir la app con la nube conectada hace una sincronización completa**: baja todo, sube la
  cola y **deja TODO en la base de datos** (comidas, pesos, perfil, ajustes, foto y bio). Después,
  cada cambio se sube solo en unos segundos. El guardado local es solo **caché** para que abra al
  instante y funcione sin internet.

- **Si tienes la app abierta en otro dispositivo o pestaña, se actualiza sola**: cada vez que vuelves
  a la pestaña (y cada 10 minutos) la app baja lo nuevo de la nube y **refresca la pantalla donde
  estés** (Hoy, Historial, Social…) sin que tengas que navegar. En Ajustes → Nube te muestra el
  correo conectado; si no coincide con el de tu usuario, cierra sesión y vuelve a entrar.

- Cada vez que registras algo (comida, peso, gym, agua, favoritos…), la app lo **encola y lo sube
  solo** en unos segundos; si estás sin internet, queda en una **cola pendiente** y se sube al
  volver (el badge te avisa). Al abrir la app o volver a conectar, **baja** los últimos cambios.
- **La primera vez que conectas**: si tu nube está vacía, sube todo lo local; si ya hay datos en
  la nube, baja esos y los mezcla con los tuyos (gana lo más reciente).
- **No se sincronizan**: la **lista de usuarios** del candado local ni el historial de cambios
  pendientes. (Tu clave de Gemini **sí** viaja con tu cuenta de la nube, para tenerla en todos
  tus dispositivos; solo tú puedes leerla.)
- Dos dispositivos con la misma cuenta nube ven **los mismos datos**. El candado local de la app
  (usuario `alexsu`) sigue existiendo: protege la app en ese dispositivo, no sustituye a la cuenta
  de la nube.

---

### Resumen en una frase

Publica la app en **Vercel** (gratis, con IA desde el primer minuto), ábrela en Chrome y
**Añadir a pantalla de inicio** (gratis), crea tu cuenta de **Supabase** si quieres tus datos en
todos tus dispositivos (gratis) y listo: tienes una app de control de alimentación con IA que
funciona **en tu celular, con o sin internet**.
