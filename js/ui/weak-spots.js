import { h } from '../util/dom.js';
import { fetchWeakSpots, taskLabel, taskCaption, triesText } from '../weak-spots.js';
import { loadLesson } from '../content.js';
import { allTasks } from '../lesson-model.js';
import { warmupTasks } from '../lesson-v4.js';

// Блок профиля «Что подтянуть». Пока идёт запрос или нет связи — скрыт; без ошибок — короткая строка.
export function weakSpotsCard(app) {
  const body = h('div', {});
  const card = h('section', { class: 'card', 'aria-label': 'Что подтянуть' },
    h('h2', { class: 'avatar-title' }, 'Что подтянуть'),
    h('p', { class: 'hint' }, 'Задания, где вы чаще всего ошибались в своих сдачах.'),
    body);
  card.hidden = true;
  fetchWeakSpots(app.api).then(list => {
    if (!list) return;
    card.hidden = false;
    if (!list.length) { body.replaceChildren(h('p', {}, 'Ошибок не найдено.')); return; }
    body.replaceChildren(...list.map(l => {
      const ul = h('ul', { class: 'weak-tasks' });
      const li = l.tasks.map(t => {
        const cap = h('span', {}, taskLabel(t.id));
        return { t, cap, el: h('li', {}, cap, ' ', h('small', { class: 'hint' }, `— ${triesText(t)}`)) };
      });
      ul.append(...li.map(x => x.el));
      // тексты заданий из занятия, если оно загрузится; иначе остаются «Задание N»
      loadLesson(l.d, l.n).then(lesson => li.forEach(x => { x.cap.textContent = taskCaption(x.t, lesson, allTasks, warmupTasks); }), () => {});
      return h('div', { class: 'weak-lesson' },
        h('p', {}, h('a', { href: l.href }, `ПЗ ${l.n}${l.title ? '. ' + l.title : ''}`), ' ', h('small', { class: 'hint' }, `ошибок в ${l.errPct}% попыток`)),
        ul);
    }));
  });
  return card;
}
