/* Pantalla de acceso: candado local, sin servidor. */

import { icon } from '../icons.js';
import { verify, setSession } from '../auth.js';

export async function render(root, onOk) {
  root.innerHTML = `
    <div class="auth">
      <div class="auth-badge" aria-hidden="true">${icon('dumbbell')}</div>
      <h1 class="auth-title">Nutri Gym</h1>
      <p class="auth-sub">Inicia sesión para ver tus comidas del día</p>

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
      </form>

      <p class="auth-hint">${icon('shield')}<span>Tus datos se guardan solo en este dispositivo. No hay cuenta en internet.</span></p>
    </div>`;

  const form = root.querySelector('#auth-form');
  const userInput = root.querySelector('#au-user');
  const passInput = root.querySelector('#au-pass');
  const errBox = root.querySelector('#au-err');
  const goBtn = root.querySelector('#au-go');
  const eyeBtn = root.querySelector('#au-eye');

  const showError = msg => {
    errBox.innerHTML = `${icon('alert')}<span>${msg}</span>`;
    errBox.classList.remove('hidden');
    form.classList.remove('shake');
    void form.offsetWidth;
    form.classList.add('shake');
    passInput.value = '';
    passInput.focus();
  };
  const clearError = () => errBox.classList.add('hidden');

  eyeBtn.addEventListener('click', () => {
    const show = passInput.type === 'password';
    passInput.type = show ? 'text' : 'password';
    eyeBtn.innerHTML = icon(show ? 'eyeOff' : 'eye');
    eyeBtn.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
    passInput.focus();
  });

  userInput.addEventListener('input', clearError);
  passInput.addEventListener('input', clearError);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const u = userInput.value.trim();
    const p = passInput.value;
    if (!u) { showError('Escribe tu usuario.'); return; }
    if (!p) { showError('Escribe tu contraseña.'); return; }

    goBtn.disabled = true;
    goBtn.innerHTML = '<span class="spinner"></span><span class="lbl">Comprobando…</span>';
    try {
      const r = await verify(u, p);
      if (!r.ok) { showError(r.msg); return; }
      setSession(r.user);
      if (typeof onOk === 'function') onOk(r.user);
    } catch (err) {
      showError('No se pudo comprobar el acceso. Inténtalo de nuevo.');
    } finally {
      goBtn.disabled = false;
      goBtn.innerHTML = '<span class="lbl">Iniciar sesión</span>';
    }
  });

  setTimeout(() => userInput.focus(), 60);
}
