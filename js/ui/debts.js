import { h } from '../util/dom.js';
import { fetchDebts, debtLabel, openDebtsCount } from '../debts.js';
import { loadCourse, flatLessons } from '../content.js';

// Блок «Отработать» (главная): ПЗ, которые преподаватель отметил как долг, со сроком отработки. Пока идёт запрос,
// нет связи, старый сервер или невыполненных долгов нет — скрыт.
export function debtsCard(app) {
  const list = h('ul', { class: 'debt-list' });
  const card = h('section', { class: 'card warn debts', 'aria-label': 'Отработать' },
    h('h2', { class: 'sec-title' }, 'Отработать'),
    h('p', { class: 'hint' }, 'Занятия, которые нужно сдать к своему сроку. Работа отметится как отработка.'),
    list);
  card.hidden = true;
  fetchDebts(app.api, app.store.profile().login).then(async all => {
    if (!all || !openDebtsCount(all)) return;
    const todo = all.filter(x => !x.done);
    const titles = {};
    for (const d of new Set(todo.map(x => x.d))) {
      try { flatLessons(await loadCourse(d)).forEach(l => { titles[`${d}/${l.n}`] = l.title; }); } catch (e) { /* без названий */ }
    }
    list.replaceChildren(...todo.map(x => {
      const title = titles[`${x.d}/${x.n}`];
      return h('li', { class: `debt-item${x.overdue ? ' overdue' : ''}` },
        h('a', { href: x.href }, `${x.d.slice(-2) === '01' ? 'ДУП.01' : 'ДУП.03'} · ПЗ ${x.n}${title ? '. ' + title : ''}`), ' ',
        h('small', { class: x.overdue ? 'hint deadline overdue' : 'hint deadline' }, `⏰ ${debtLabel(x)}`),
        x.comment ? h('small', { class: 'hint' }, ` — ${x.comment}`) : '');
    }));
    card.hidden = false;
  });
  return card;
}
