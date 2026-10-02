import { h } from '../util/dom.js';
import { select, hashQuery, loadError } from './common.js';
import { errText } from '../ui/login.js';

const PER_PAGE = 8; // карточек на лист A4
const ST_NEW = 'новый';

// Адрес сайта для карточек: без хеша и параметров
export const siteUrl = () => `${location.origin}${location.pathname}`;

export function card(s, url) {
  return h('div', { class: 'pcard' },
    h('div', { class: 'pcard-brand' }, 'НейроЛаб · вход'),
    h('div', { class: 'pcard-name' }, s.name),
    h('div', { class: 'pcard-group' }, `Группа ${s.group}`),
    h('div', { class: 'pcard-line' }, h('span', {}, 'Сайт'), h('strong', { class: 'pcard-url' }, url)),
    h('div', { class: 'pcard-line' }, h('span', {}, 'Логин'), h('strong', { class: 'mono' }, s.login)),
    h('div', { class: 'pcard-line' }, h('span', {}, 'Одноразовый пароль'), h('strong', { class: 'mono pcard-pw' }, s.oneTime)),
    h('div', { class: 'pcard-note' }, 'При первом входе придумайте свой пароль'));
}

// #/admin/cards?group=…: карточки входа только для студентов со статусом «новый»; печать — через браузер
export async function renderCards(ctx, main) {
  const group = ctx.query.get('group') || '';
  let d;
  try { d = await ctx.call('adminStudents'); } catch (e) {
    if (!ctx.alive() || (e && e.handled)) return;
    main.replaceChildren(loadError(errText(e), () => ctx.rerender()));
    return;
  }
  if (!ctx.alive()) return;
  const all = (Array.isArray(d.students) ? d.students : []).filter(s => s.status === ST_NEW && s.oneTime);
  const groups = Array.from(new Set(all.map(s => s.group))).sort();
  const shown = all.filter(s => !group || s.group === group);
  const url = siteUrl();

  const pages = [];
  for (let i = 0; i < shown.length; i += PER_PAGE) pages.push(shown.slice(i, i + PER_PAGE));

  main.replaceChildren(
    h('div', { class: 'card admin-tools no-print' },
      h('h2', {}, 'Карточки входа'),
      h('div', { class: 'tools-row' },
        h('label', { class: 'field inline' }, h('span', {}, 'Группа'),
          select([{ value: '', label: 'Все группы' }].concat(groups.map(g => ({ value: g, label: g }))), group, v => ctx.go(hashQuery('/admin/cards', { group: v })))),
        h('div', { class: 'tools-count' }, `Карточек: ${shown.length}`)),
      h('p', { class: 'hint' }, 'Только студенты со статусом «новый» (ещё не задали свой пароль). После первого входа одноразовый пароль перестаёт действовать. Печать — на A4, по 8 карточек на лист.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', type: 'button', disabled: !shown.length, onclick: () => window.print() }, '🖨 Печать'),
        h('a', { class: 'btn', href: '#/admin/students' }, '← К студентам'))),
    shown.length
      ? h('div', { class: 'cards-sheet' }, pages.map(p => h('section', { class: 'cards-page' }, p.map(s => card(s, url)))))
      : h('div', { class: 'card muted no-print' }, 'Нет студентов со статусом «новый» в выбранной группе.'));
}
