// Режим методиста: вход «только просмотр». Сервер (METHODIST_ACTIONS в Code.gs) отдаёт обезличенные данные
// («Студент N») и отклоняет любые пишущие действия; здесь — вход, вкладки и скрытие кнопок правки.
import { h } from '../util/dom.js';
import { passwordField } from '../ui/login.js';

const KEY = 'nl:methodist';
export const METHODIST_TABS = ['journal', 'stats', 'summary', 'analysis', 'attendance'];
export const METHODIST_ACTIONS = ['adminJournal', 'adminStats', 'adminTaskAnalysis', 'adminAttendance', 'adminLessonSummary', 'adminAccess', 'logout'];

export function isMethodist() {
  try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
}
export function setMethodist(on) {
  try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch (e) { /* хранилище недоступно */ }
}

// Кнопка и форма «Вход методиста» на экране входа администратора.
// enter(token) — сохранить токен и открыть панель; run(btn, err, label, job) — общий обработчик экрана входа.
export function methodistLoginForm(app, { enter, run, back }) {
  const pw = passwordField('Пароль методиста', { name: 'methodistPassword', autocomplete: 'current-password' });
  const err = h('p', { class: 'error', role: 'alert' });
  const btn = h('button', { class: 'btn primary big', type: 'submit' }, 'Войти как методист');
  return h('form', {
    class: 'card form',
    onsubmit: e => {
      e.preventDefault();
      const p = pw.input.value;
      if (!p) { err.textContent = 'Введите пароль'; return; }
      run(btn, err, 'Войти как методист', async () => {
        const r = await app.api.admin('methodistLogin', { password: p });
        pw.input.value = '';
        enter(r);
      });
    },
  }, h('h2', {}, 'Вход методиста'),
  h('p', { class: 'hint' }, 'Только просмотр: журнал, статистика, сводка, анализ заданий и посещаемость. Имена студентов скрыты.'),
  pw.field, err, btn,
  h('button', { class: 'link-btn', type: 'button', onclick: back }, '← Вход администратора'));
}

export const methodistBanner = () => h('div', { class: 'card warn methodist-banner', role: 'status' }, 'Режим методиста: только просмотр. Студенты показаны под номерами.');

// Запрет пишущих действий на клиенте (сервер всё равно проверяет).
export function methodistCall(call) {
  return (action, body) => (METHODIST_ACTIONS.indexOf(action) < 0
    ? Promise.reject(new Error('Недоступно в режиме методиста'))
    : call(action, body));
}

// Прячет органы правки на экранах журнала, сводки и посещаемости (следит за перерисовкой).
export function viewOnly(main) {
  const apply = () => {
    main.querySelectorAll('a.jlink[href]').forEach(a => { a.removeAttribute('href'); });
    main.querySelectorAll('#group-comment').forEach(t => { const s = t.closest('section'); if (s) s.hidden = true; });
    main.querySelectorAll('a[href^="#/admin/board"], a[href^="#/admin/live"]').forEach(a => { a.hidden = true; });
    main.querySelectorAll('button.att-chip').forEach(b => { b.disabled = true; b.setAttribute('aria-label', b.textContent); });
    main.querySelectorAll('button.btn.primary').forEach(b => { if (/^Выгрузить/.test(b.textContent)) b.hidden = true; });
  };
  new MutationObserver(apply).observe(main, { childList: true, subtree: true });
  apply();
}

// Карточка в «Настройках» администратора: пароль методиста.
export function methodistSettingsCard(ctx) {
  const state = h('p', { class: 'hint', role: 'status' }, 'Проверяем…');
  const pw = passwordField('Пароль методиста (не короче 10 символов; пусто — выключить режим)', { name: 'methodistNewPassword', autocomplete: 'new-password' });
  const err = h('p', { class: 'error', role: 'alert' });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Сохранить');
  const show = on => { state.textContent = on ? 'Вход методиста включён.' : 'Вход методиста выключен.'; };
  ctx.call('adminMethodistStatus').then(r => { if (ctx.alive()) show(r.enabled); }).catch(() => { state.textContent = 'Статус недоступен (обновите Code.gs).'; });
  return h('form', {
    class: 'card form',
    onsubmit: async e => {
      e.preventDefault();
      err.textContent = '';
      btn.disabled = true;
      try {
        const r = await ctx.call('adminSetMethodistPassword', { password: pw.input.value });
        pw.input.value = '';
        if (ctx.alive()) show(r.enabled);
      } catch (x) { ctx.fail(x, err); }
      btn.disabled = false;
    },
  }, h('h2', {}, 'Режим методиста'),
  h('p', { class: 'hint' }, 'Методист входит на этой же странице кнопкой «Вход методиста»: видит журнал, статистику, сводку, анализ и посещаемость без имён студентов и без права правки. Смена пароля завершает его сессии.'),
  state, pw.field, err, btn);
}