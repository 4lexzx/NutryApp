/* Pantalla de acceso: candado local + nube automática.
   Al entrar (o crear usuario), los datos se conectan solos a la nube. */

import { icon } from '../icons.js';
import { verify, createUser, removeUser, setSession } from '../auth.js';
import { conectarAutomatica } from '../cloud.js';
import { toast } from '../util.js';

export async function render(root, onOk) {
  root.innerHTML = `
    <div class="auth">
      <div class="auth-badge" aria-hidden="true"><img class="auth-badge-img" src="icons/icon-192-v3.png" alt=""></div>
      <h1 class="auth-title">Nutri Gym</h1>
      <p class="auth-sub" id="au-sub">Inicia sesión para ver tus comidas del día</p>

      <form class="auth-form" id="auth-form" novalidate autocomplete="off">
        <div class="auth-fields">
          <label class="auth-field">
            <span class="auth-lbl">${icon('user')}<span>Usuario</span></span>
            <input id="au-user" type="text" inputmode="text" autocapitalize="none"
                   autocorrect="off" spellcheck="false" placeholder="tu usuario"
                   autocomplete="username" enterkeyhint="next">
          </label>
          <label class="auth-field">
            <span class="auth-lbl">${icon('lock')}<span>Contraseña</span></span>
            <span class="auth-input-wrap">
              <input id="au-pass" type="password" placeholder="••••••"
                     autocomplete="current-password" enterkeyhint="go">
              <button type="button" class="auth-eye" id="au-eye" aria-label="Mostrar contraseña"
                      title="Mostrar contraseña">${icon('eye')}</button>
            </span>
          </label>
        </div>

        <div class="auth-err hidden" id="au-err" role="alert"></div>

        <button class="btn btn-primary btn-lg btn-block" id="au-go" type="submit">
          <span class="lbl">Iniciar sesión</span>
        </button>

        <button class="auth-link" id="au-register" type="button">¿Primera vez? Crear usuario</button>
      </form>

      <form class="auth-form hidden" id="reg-form" novalidate autocomplete="off">
        <div class="auth-fields">
          <label class="auth-field">
            <span class="auth-lbl">${icon('user')}<span>Usuario nuevo</span></span>
            <input id="rg-user" type="text" inputmode="text" autocapitalize="none"
                   autocorrect="off" spellcheck="false" placeholder="ej. camila123"
                   autocomplete="username" enterkeyhint="next">
            <span class="hint">Solo minúsculas, números y . _ - · sin espacios ni ñ</span>
          </label>
          <label class="auth-field">
            <span class="auth-lbl">${icon('lock')}<span>Contraseña</span></span>
            <input id="rg-pass" type="password" placeholder="mínimo 4 caracteres"
                   autocomplete="new-password" enterkeyhint="next">
          </label>
          <label class="auth-field">
            <span class="auth-lbl">${icon('lock')}<span>Repite la contraseña</span></span>
            <input id="rg-pass2" type="password" placeholder="otra vez"
                   autocomplete="new-password" enterkeyhint="go">
          </label>
        </div>

        <div class="auth-err hidden" id="rg-err" role="alert"></div>

        <button class="btn btn-primary btn-lg btn-block" id="rg-go" type="submit">
          <span class="lbl">Crear usuario</span>
        </button>

        <button class="auth-link" id="rg-back" type="button">Ya tengo una cuenta</button>
      </form>

      <p class="auth-hint">${icon('upload')}<span>Entras con tu usuario y tus datos quedan guardados en tu cuenta, en cualquier dispositivo.</span></p>
    </div>`;

  const form = root.querySelector('#auth-form');
  const regForm = root.querySelector('#reg-form');
  const sub = root.querySelector('#au-sub');
  const userInput = root.querySelector('#au-user');
  const passInput = root.querySelector('#au-pass');
  const errBox = root.querySelector('#au-err');
  const goBtn = root.querySelector('#au-go');
  const eyeBtn = root.querySelector('#au-eye');
  const regUser = root.querySelector('#rg-user');
  const regPass = root.querySelector('#rg-pass');
  const regPass2 = root.querySelector('#rg-pass2');
  const regErrBox = root.querySelector('#rg-err');
  const regGoBtn = root.querySelector('#rg-go');

  const showError = (box, boxForm, firstInput, msg) => {
    box.innerHTML = `${icon('alert')}<span>${msg}</span>`;
    box.classList.remove('hidden');
    boxForm.classList.remove('shake');
    void boxForm.offsetWidth;
    boxForm.classList.add('shake');
    if (firstInput) firstInput.focus();
  };
  const clearError = () => errBox.classList.add('hidden');
  const clearRegError = () => regErrBox.classList.add('hidden');

  const setMode = mode => {
    const creating = mode === 'reg';
    form.classList.toggle('hidden', creating);
    regForm.classList.toggle('hidden', !creating);
    sub.textContent = creating
      ? 'Crea tu usuario: tus datos quedan en tu cuenta'
      : 'Inicia sesión para ver tus comidas del día';
    clearError();
    clearRegError();
    setTimeout(() => (creating ? regUser : userInput).focus(), 40);
  };

  eyeBtn.addEventListener('click', () => {
    const show = passInput.type === 'password';
    passInput.type = show ? 'text' : 'password';
    eyeBtn.innerHTML = icon(show ? 'eyeOff' : 'eye');
    eyeBtn.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
    passInput.focus();
  });

  userInput.addEventListener('input', clearError);
  passInput.addEventListener('input', clearError);
  regUser.addEventListener('input', () => {
    // el usuario solo admite minúsculas, números y . _ - (se limpia al escribir)
    regUser.value = regUser.value.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    clearRegError();
  });
  regPass.addEventListener('input', clearRegError);
  regPass2.addEventListener('input', clearRegError);

  root.querySelector('#au-register').addEventListener('click', () => setMode('reg'));
  root.querySelector('#rg-back').addEventListener('click', () => setMode('login'));

  const enter = user => {
    setSession(user);
    if (typeof onOk === 'function') onOk(user);
  };

  /* La nube se conecta sola (en segundo plano, sin bloquear la app). */
  const autoNube = (user, pass) => {
    try {
      const p = conectarAutomatica(user, pass);
      if (p && p.then) p.then(nube => {
        if (nube === 'existe') {
          toast('La nube tiene otra contraseña para esta cuenta: tus datos quedan solo en este dispositivo.', 'warn');
        }
      }).catch(() => {});
    } catch (e) { /* sin nube la app sigue en local */ }
  };

  /* Para el registro: esperamos a la nube (con tope) para detectar cuentas
     ya registradas con otra contraseña. */
  const conNube = (user, pass) => Promise.race([
    Promise.resolve(conectarAutomatica(user, pass)).catch(() => false),
    new Promise(res => setTimeout(() => res(false), 8000))
  ]);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const u = userInput.value.trim();
    const p = passInput.value;
    if (!u) { showError(errBox, form, userInput, 'Escribe tu usuario.'); return; }
    if (!p) { showError(errBox, form, passInput, 'Escribe tu contraseña.'); return; }

    goBtn.disabled = true;
    goBtn.innerHTML = '<span class="spinner"></span><span class="lbl">Comprobando…</span>';
    try {
      const r = await verify(u, p);
      if (!r.ok) { showError(errBox, form, userInput, r.msg); return; }
      enter(r.user);
      autoNube(r.user, p);
    } catch (err) {
      showError(errBox, form, userInput, 'No se pudo comprobar el acceso. Inténtalo de nuevo.');
    } finally {
      goBtn.disabled = false;
      goBtn.innerHTML = '<span class="lbl">Iniciar sesión</span>';
    }
  });

  regForm.addEventListener('submit', async e => {
    e.preventDefault();
    const u = regUser.value.trim();
    const p = regPass.value;
    const p2 = regPass2.value;
    if (!u) { showError(regErrBox, regForm, regUser, 'Escribe tu usuario.'); return; }
    if (p.length < 4) { showError(regErrBox, regForm, regPass, 'La contraseña debe tener al menos 4 caracteres.'); return; }
    if (p !== p2) { showError(regErrBox, regForm, regPass2, 'Las contraseñas no coinciden.'); return; }

    regGoBtn.disabled = true;
    regGoBtn.innerHTML = '<span class="spinner"></span><span class="lbl">Creando…</span>';
    try {
      const r = await createUser(u, p);
      if (!r.ok) { showError(regErrBox, regForm, regUser, r.msg); return; }
      // comprobamos la nube ANTES de entrar: si el usuario ya existe allá con
      // otra contraseña, no creamos una cuenta duplicada.
      regGoBtn.innerHTML = '<span class="spinner"></span><span class="lbl">Conectando…</span>';
      const nube = await conNube(r.user, p);
      if (nube === 'existe') {
        await removeUser(r.user);
        userInput.value = u;
        passInput.value = '';
        setMode('login');
        showError(errBox, form, userInput, 'Ese usuario ya está registrado en la nube con otra contraseña. Inicia sesión con esas credenciales o crea un usuario distinto.');
        return;
      }
      enter(r.user);
    } catch (err) {
      showError(regErrBox, regForm, regUser, 'No se pudo crear el usuario. Inténtalo de nuevo.');
    } finally {
      regGoBtn.disabled = false;
      regGoBtn.innerHTML = '<span class="lbl">Crear usuario</span>';
    }
  });

  setTimeout(() => userInput.focus(), 60);
}
