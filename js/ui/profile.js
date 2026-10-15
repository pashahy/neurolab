import { h, add } from '../util/dom.js';
import { AVATARS, avatarUrl, defaultAvatar } from '../avatars.js';

// Выбор аватара: сетка 4x6, выбор сохраняется сразу (action setAvatar). Текущий — выбранный на сервере или по умолчанию.
function avatarPicker(app, p) {
  let current = defaultAvatar(p.id);
  const status = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' }, '');
  const big = h('img', { class: 'avatar-big', src: avatarUrl(current), alt: '', width: 96, height: 96 });
  const buttons = AVATARS.map(a => {
    const b = h('button', { type: 'button', class: 'avatar-opt', 'aria-label': a.title, 'aria-pressed': 'false', title: a.title },
      h('img', { src: avatarUrl(a.code), alt: '', width: 64, height: 64, loading: 'lazy' }));
    b.addEventListener('click', () => choose(a.code));
    return { code: a.code, el: b };
  });
  const mark = () => {
    big.setAttribute('src', avatarUrl(current));
    buttons.forEach(x => x.el.setAttribute('aria-pressed', x.code === current ? 'true' : 'false'));
  };
  let busy = false;
  async function choose(code) {
    if (busy || code === current) return;
    busy = true;
    const prev = current;
    current = code;
    mark();
    status.textContent = 'Сохраняю…';
    try {
      const r = await app.api.call('setAvatar', { avatar: code });
      current = r && r.avatar ? r.avatar : code;
      status.textContent = 'Сохранено';
    } catch (e) {
      current = prev;
      status.textContent = 'Не сохранилось, попробуй позже';
    }
    busy = false;
    mark();
  }
  mark();
  // выбранный раньше аватар приходит с сервером; без связи остаётся аватар по умолчанию
  app.api.call('me').then(r => { if (r && r.avatar && !busy) { current = r.avatar; mark(); } }, () => { /* нет связи */ });
  return h('section', { class: 'card avatar-card', 'aria-label': 'Аватар' },
    h('h2', { class: 'avatar-title' }, 'Аватар'),
    h('div', { class: 'avatar-cur' }, big, h('p', { class: 'hint' }, 'Он виден в зале славы песочницы.')),
    h('div', { class: 'avatar-grid' }, buttons.map(x => x.el)),
    status);
}

export function renderProfile(app) {
  const p = app.store.profile();
  const pending = app.submitter.pending();
  const confirmBox = h('div', { class: 'card warn', role: 'alertdialog', 'aria-label': 'Подтверждение выхода' });
  confirmBox.hidden = true;
  const exitBtn = h('button', { class: 'btn big', type: 'button' }, 'Выйти');
  exitBtn.addEventListener('click', () => {
    exitBtn.hidden = true;
    confirmBox.hidden = false;
    confirmBox.replaceChildren(
      h('p', {}, h('strong', {}, 'Выйти из аккаунта?')),
      pending
        ? h('p', {}, `⚠ Не отправлено работ: ${pending}. Они сохранятся на этом телефоне и уйдут, когда вы снова войдёте под своим логином.`)
        : h('p', { class: 'hint' }, 'Ваш прогресс сохранится на этом устройстве: после входа под своим логином всё вернётся.'),
      h('button', { class: 'btn primary big', type: 'button', onclick: () => app.logout() }, 'Да, выйти'),
      h('button', { class: 'btn ghost big', type: 'button', onclick: () => { confirmBox.hidden = true; exitBtn.hidden = false; } }, 'Отмена'));
  });
  const row = (k, v) => h('div', { class: 'kv' }, h('dt', {}, k), h('dd', {}, v || '—'));
  add(app.root,
    h('a', { href: '#/', class: 'back' }, '← Главная'),
    h('h1', { class: 'display' }, 'Профиль'),
    h('dl', { class: 'card profile' }, row('ФИО', p.name), row('Группа', p.group), row('Логин', p.login)),
    avatarPicker(app, p),
    pending ? h('p', { class: 'hint' }, `⏳ Не отправлено работ: ${pending}.`) : '',
    exitBtn, confirmBox);
}
