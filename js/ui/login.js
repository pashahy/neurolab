import { h, add } from '../util/dom.js';
import { COMPANY } from '../../content/story.js';

export const NET_ERROR = 'Нет связи с сервером. Проверьте интернет';
// ошибка сервера показывается как есть; сбой сети — понятным текстом
export const errText = e => (e && e.network ? NET_ERROR : (e && e.message) || 'Не удалось выполнить запрос. Попробуйте ещё раз');

export function passwordField(label, { name, autocomplete }) {
  const input = h('input', { name, type: 'password', required: true, autocomplete, autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false' });
  const toggle = h('button', {
    class: 'btn small pw-toggle', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Показать пароль',
    onclick: () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Скрыть' : 'Показать';
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
    },
  }, 'Показать');
  return { input, field: h('label', { class: 'field' }, h('span', {}, label), h('div', { class: 'pw-row' }, input, toggle)) };
}

// Экран входа и (при первом входе по одноразовому паролю) выбор своего пароля.
export function renderLogin(app, { next }) {
  const box = h('div', { class: 'login-box' });
  add(app.root,
    h('div', { class: 'login-head' },
      h('div', { class: 'login-logo', 'aria-hidden': 'true' }, '🧠'),
      h('h1', {}, COMPANY.name),
      h('p', { class: 'muted' }, 'Практикум ДУП.01 / ДУП.03. Войдите под своим логином.')),
    app.flash ? h('div', { class: 'card warn', role: 'status' }, app.flash) : '',
    box);

  // выполняет запрос, блокируя кнопку; ошибки выводит в err
  async function run(btn, err, label, job) {
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Подождите…';
    try {
      await job();
    } catch (e) {
      err.textContent = errText(e);
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  function showLogin(prefill) {
    const login = h('input', { name: 'login', required: true, autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', value: prefill || '' });
    const pw = passwordField('Пароль', { name: 'password', autocomplete: 'current-password' });
    const err = h('p', { class: 'error', role: 'alert' });
    const btn = h('button', { class: 'btn primary big', type: 'submit' }, 'Войти');
    box.replaceChildren(h('form', {
      class: 'card form',
      onsubmit: e => {
        e.preventDefault();
        const l = login.value.trim();
        const p = pw.input.value;
        if (!l || !p) { err.textContent = 'Введите логин и пароль'; return; }
        run(btn, err, 'Войти', async () => {
          const r = await app.api.login(l, p);
          if (r.needNewPassword) { showNewPassword(l, p); return; }
          await app.finishLogin(r, next);
        });
      },
    },
    h('label', { class: 'field' }, h('span', {}, 'Логин'), login),
    pw.field, err, btn,
    h('p', { class: 'hint' }, 'Логин и одноразовый пароль выдаёт преподаватель. Забыли пароль — обратитесь к нему.')));
  }

  function showNewPassword(loginValue, oneTime) {
    const a = passwordField('Новый пароль', { name: 'newPassword', autocomplete: 'new-password' });
    const b = passwordField('Повторите пароль', { name: 'newPassword2', autocomplete: 'new-password' });
    const err = h('p', { class: 'error', role: 'alert' });
    const btn = h('button', { class: 'btn primary big', type: 'submit' }, 'Сохранить и войти');
    box.replaceChildren(h('form', {
      class: 'card form',
      onsubmit: e => {
        e.preventDefault();
        const p1 = a.input.value;
        if (p1.length < 6) { err.textContent = 'Пароль не короче 6 символов'; return; }
        if (p1 !== b.input.value) { err.textContent = 'Пароли не совпадают'; return; }
        if (p1 === oneTime) { err.textContent = 'Новый пароль должен отличаться от одноразового'; return; }
        run(btn, err, 'Сохранить и войти', async () => {
          const r = await app.api.setPassword(loginValue, oneTime, p1);
          await app.finishLogin(r, next);
        });
      },
    },
    h('h2', {}, 'Придумайте пароль'),
    h('p', {}, 'Это ваш первый вход. Одноразовый пароль больше не понадобится — задайте свой.'),
    a.field, b.field,
    h('p', { class: 'hint' }, 'Пароль не короче 6 символов. Запомните его: вход потребуется на каждом новом устройстве.'),
    err, btn,
    h('button', { class: 'link-btn', type: 'button', onclick: () => showLogin(loginValue) }, '← Назад ко входу')));
  }

  showLogin('');
}
