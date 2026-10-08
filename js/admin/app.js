import { h, add } from '../util/dom.js';
import { passwordField, errText } from '../ui/login.js';
import { loading } from './common.js';
import { renderStudents } from './students.js';
import { renderCards } from './cards.js';
import { renderJournal } from './journal.js';
import { renderReview, renderWork } from './review.js';
import { renderAccess } from './access.js';
import { renderStats } from './stats.js';
import { renderSettings } from './settings.js';

const TABS = [
  { id: 'students', label: 'Студенты', render: renderStudents },
  { id: 'journal', label: 'Журнал', render: renderJournal },
  { id: 'review', label: 'Проверка', render: renderReview },
  { id: 'access', label: 'Доступ', render: renderAccess },
  { id: 'stats', label: 'Статистика', render: renderStats },
  { id: 'settings', label: 'Настройки', render: renderSettings },
];
const ADMIN_PASSWORD_MIN = 10;

// Админ-панель: #/admin, #/admin/students|journal|review|access|stats|settings, #/admin/cards, #/admin/work.
// Не требует студенческой сессии; пароль администратора нигде не сохраняется, хранится только токен.
export function renderAdmin(app, parts, query) {
  const my = app.routeId;
  const alive = () => app.routeId === my;
  const token = app.store.adminToken();
  const sub = parts[0] || '';
  if (!token) { renderAdminLogin(app, alive); return; }
  if (!sub) { location.replace('#/admin/students'); return; }

  let groupsPromise = null;
  const ctx = {
    app, query, alive,
    // запрос от имени администратора; при {auth:true} токен стирается и открывается форма входа
    call: (action, body) => ctx.guard(() => app.api.admin(action, body || {})),
    // то же для готовых методов api (api.adminFileUrl и т. п.): job() -> Promise
    async guard(job) {
      try {
        return await job();
      } catch (e) {
        if (e && e.auth) {
          app.store.clearAdminToken();
          app.adminFlash = 'Сессия администратора закончилась. Войдите снова';
          e.handled = true;
          if (alive()) app.go('/admin');
        }
        throw e;
      }
    },
    // группы: из листа «Доступ» (студенты + строки доступа)
    groups() {
      if (!groupsPromise) {
        groupsPromise = ctx.call('adminAccess').then(d => (Array.isArray(d.groups) ? d.groups : []).map(String));
        groupsPromise.catch(() => { groupsPromise = null; });
      }
      return groupsPromise;
    },
    // показать ошибку в элементе, если экран ещё актуален и это не выход на форму входа
    fail(e, el) {
      if (!alive() || (e && e.handled)) return;
      el.textContent = errText(e);
    },
    go: p => app.go(p),
    rerender: () => app.rerender(),
  };

  const extra = {
    cards: { id: 'students', render: renderCards },
    work: { id: query.get('from') === 'review' ? 'review' : 'journal', render: renderWork },
  };
  const page = TABS.find(t => t.id === sub) || (Object.prototype.hasOwnProperty.call(extra, sub) ? extra[sub] : null);
  if (!page) { location.replace('#/admin/students'); return; }

  const main = h('div', { class: 'admin-main' }, loading());
  app.root.append(adminHead(app, ctx, page.id), main);
  ctx.main = main;
  return Promise.resolve(page.render(ctx, main)).catch(e => {
    if (!alive() || (e && e.handled)) return;
    console.error(e);
    main.replaceChildren(h('div', { class: 'card' }, h('p', { class: 'error', role: 'alert' }, errText(e)),
      h('button', { class: 'btn primary', type: 'button', onclick: () => app.rerender() }, 'Повторить')));
  });
}

function adminHead(app, ctx, active) {
  const pwBox = h('div');
  const toggle = h('button', {
    class: 'btn small', type: 'button', 'aria-expanded': 'false',
    onclick: () => {
      const open = !pwBox.firstChild;
      toggle.setAttribute('aria-expanded', String(open));
      if (open) pwBox.append(changePasswordForm(ctx, () => { pwBox.replaceChildren(); toggle.setAttribute('aria-expanded', 'false'); }));
      else pwBox.replaceChildren();
    },
  }, 'Сменить пароль');
  const logout = h('button', {
    class: 'btn small', type: 'button',
    onclick: () => {
      app.api.admin('logout').catch(() => {}); // токен подставляется сразу; без сети выходим локально
      app.store.clearAdminToken();
      app.adminFlash = '';
      app.go('/admin');
    },
  }, 'Выйти');
  return h('header', { class: 'admin-head no-print' },
    h('div', { class: 'admin-bar' }, h('h1', {}, 'Панель преподавателя'), h('div', { class: 'admin-actions' }, toggle, logout)),
    pwBox,
    h('nav', { class: 'admin-tabs', 'aria-label': 'Разделы панели' },
      TABS.map(t => h('a', { class: `admin-tab${t.id === active ? ' active' : ''}`, href: `#/admin/${t.id}`, 'aria-current': t.id === active ? 'page' : null }, t.label))));
}

function changePasswordForm(ctx, close) {
  const oldP = passwordField('Текущий пароль', { name: 'oldPassword', autocomplete: 'current-password' });
  const a = passwordField(`Новый пароль (не короче ${ADMIN_PASSWORD_MIN} символов)`, { name: 'newPassword', autocomplete: 'new-password' });
  const b = passwordField('Повторите новый пароль', { name: 'newPassword2', autocomplete: 'new-password' });
  const err = h('p', { class: 'error', role: 'alert' });
  const ok = h('p', { class: 'ok-text', role: 'status' });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Сменить пароль');
  return h('form', {
    class: 'card form',
    onsubmit: async e => {
      e.preventDefault();
      err.textContent = ''; ok.textContent = '';
      if (a.input.value.length < ADMIN_PASSWORD_MIN) { err.textContent = `Новый пароль — не короче ${ADMIN_PASSWORD_MIN} символов`; return; }
      if (a.input.value !== b.input.value) { err.textContent = 'Новые пароли не совпадают'; return; }
      btn.disabled = true;
      try {
        await ctx.call('adminChangePassword', { oldPassword: oldP.input.value, newPassword: a.input.value });
        oldP.input.value = ''; a.input.value = ''; b.input.value = '';
        ok.textContent = 'Пароль изменён. На других устройствах придётся войти заново.';
        setTimeout(() => { if (ctx.alive()) close(); }, 2500);
      } catch (x) { ctx.fail(x, err); btn.disabled = false; }
    },
  }, h('h2', {}, 'Смена пароля'), oldP.field, a.field, b.field, err, ok,
  h('div', { class: 'row' }, btn, h('button', { class: 'btn', type: 'button', onclick: close }, 'Отмена')));
}

// Форма входа и первичной настройки (код из листа «Доступ»)
function renderAdminLogin(app, alive) {
  const box = h('div', { class: 'login-box' });
  add(app.root,
    h('div', { class: 'login-head' },
      h('div', { class: 'login-logo', 'aria-hidden': 'true' }, '🧑‍🏫'),
      h('h1', {}, 'Панель преподавателя'),
      h('p', { class: 'muted' }, 'Вход по паролю администратора.')),
    app.adminFlash ? h('div', { class: 'card warn', role: 'status' }, app.adminFlash) : '',
    box);

  async function run(btn, err, label, job) {
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Подождите…';
    try { await job(); } catch (e) {
      if (!alive()) return;
      err.textContent = errText(e);
      btn.disabled = false;
      btn.textContent = label;
    }
  }
  const enter = r => {
    if (!alive()) return;
    app.store.setAdminToken(r.token);
    app.adminFlash = '';
    app.rerender();
  };

  function showLogin() {
    const pw = passwordField('Пароль администратора', { name: 'adminPassword', autocomplete: 'current-password' });
    const err = h('p', { class: 'error', role: 'alert' });
    const btn = h('button', { class: 'btn primary big', type: 'submit' }, 'Войти');
    box.replaceChildren(h('form', {
      class: 'card form',
      onsubmit: e => {
        e.preventDefault();
        const p = pw.input.value;
        if (!p) { err.textContent = 'Введите пароль'; return; }
        run(btn, err, 'Войти', async () => {
          const r = await app.api.admin('adminLogin', { password: p });
          pw.input.value = ''; // пароль нигде не храним
          enter(r);
        });
      },
    }, pw.field, err, btn,
    h('button', { class: 'link-btn', type: 'button', onclick: showSetup }, 'Первый вход')));
  }

  function showSetup() {
    const code = h('input', { name: 'setupCode', required: true, autocomplete: 'off', autocapitalize: 'characters', autocorrect: 'off', spellcheck: 'false' });
    const a = passwordField(`Новый пароль (не короче ${ADMIN_PASSWORD_MIN} символов)`, { name: 'newAdminPassword', autocomplete: 'new-password' });
    const b = passwordField('Повторите пароль', { name: 'newAdminPassword2', autocomplete: 'new-password' });
    const err = h('p', { class: 'error', role: 'alert' });
    const btn = h('button', { class: 'btn primary big', type: 'submit' }, 'Создать пароль и войти');
    box.replaceChildren(h('form', {
      class: 'card form',
      onsubmit: e => {
        e.preventDefault();
        const c = code.value.trim();
        if (!c) { err.textContent = 'Введите код из таблицы'; return; }
        if (a.input.value.length < ADMIN_PASSWORD_MIN) { err.textContent = `Пароль — не короче ${ADMIN_PASSWORD_MIN} символов`; return; }
        if (a.input.value !== b.input.value) { err.textContent = 'Пароли не совпадают'; return; }
        run(btn, err, 'Создать пароль и войти', async () => {
          const r = await app.api.admin('adminSetup', { setupCode: c, password: a.input.value });
          a.input.value = ''; b.input.value = '';
          enter(r);
        });
      },
    }, h('h2', {}, 'Первый вход'),
    h('p', { class: 'hint' }, 'Откройте Google-таблицу, лист «Доступ», ячейку G1 — там код первого входа. После создания пароля код стирается.'),
    h('label', { class: 'field' }, h('span', {}, 'Код из таблицы (лист «Доступ», ячейка G1)'), code),
    a.field, b.field, err, btn,
    h('button', { class: 'link-btn', type: 'button', onclick: showLogin }, '← Назад ко входу')));
  }

  showLogin();
}
