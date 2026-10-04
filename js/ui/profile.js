import { h, add } from '../util/dom.js';

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
    pending ? h('p', { class: 'hint' }, `⏳ Не отправлено работ: ${pending}.`) : '',
    exitBtn, confirmBox);
}
