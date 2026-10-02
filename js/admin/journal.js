import { h } from '../util/dom.js';
import { DISC, select, hashQuery, loading, loadError, emptyBox } from './common.js';
import { errText } from '../ui/login.js';

const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

export function workHref(studentId, d, n, extra) {
  return `#${hashQuery('/admin/work', Object.assign({ student: studentId, d, n }, extra || {}))}`;
}

// Выбор группы и дисциплины: значения хранятся в адресе (#/admin/<screen>?group=…&d=…)
export function filterBar(ctx, screen, groups, group, disc) {
  const go = (g, d) => ctx.go(hashQuery(`/admin/${screen}`, { group: g, d }));
  return h('div', { class: 'card admin-tools no-print' },
    h('div', { class: 'tools-row' },
      h('label', { class: 'field inline' }, h('span', {}, 'Группа'), select(groups.map(g => ({ value: g, label: g })), group, v => go(v, disc))),
      h('label', { class: 'field inline' }, h('span', {}, 'Дисциплина'), select(DISC.map(x => ({ value: x.id, label: x.code })), disc, v => go(group, v)))));
}

export async function renderJournal(ctx, main) {
  let groups;
  try { groups = await ctx.groups(); } catch (e) {
    if (!ctx.alive() || (e && e.handled)) return;
    main.replaceChildren(loadError(errText(e), () => ctx.rerender()));
    return;
  }
  if (!ctx.alive()) return;
  if (!groups.length) { main.replaceChildren(emptyBox('Групп пока нет: добавьте студентов на вкладке «Студенты».')); return; }
  const qg = ctx.query.get('group');
  const group = groups.indexOf(qg) >= 0 ? qg : groups[0];
  const qd = ctx.query.get('d');
  const disc = DISC.some(x => x.id === qd) ? qd : DISC[0].id;
  const bar = filterBar(ctx, 'journal', groups, group, disc);
  const body = h('div', {}, loading('Загружаем журнал…'));
  main.replaceChildren(bar, body);

  let d;
  try { d = await ctx.call('adminJournal', { group, discipline: disc }); } catch (e) {
    if (!ctx.alive() || (e && e.handled)) return;
    body.replaceChildren(loadError(errText(e), () => ctx.rerender()));
    return;
  }
  if (!ctx.alive()) return;
  const students = Array.isArray(d.students) ? d.students : [];
  const lessons = Array.isArray(d.lessons) ? d.lessons : [];
  if (!students.length) { body.replaceChildren(emptyBox('В этой группе пока нет студентов.')); return; }
  if (!lessons.length) { body.replaceChildren(emptyBox('Сдач по этой дисциплине пока нет.')); return; }

  const cell = (s, n) => {
    const c = own(d.cells, s.id) && own(d.cells[s.id], n) ? d.cells[s.id][n] : null;
    if (!c) return h('td', { class: 'jcell empty' }, h('span', { class: 'jdash', 'aria-label': 'не сдано' }, '–'));
    const pct = c.max > 0 ? `${Math.round(c.best / c.max * 100)}%` : '—';
    const marks = [c.manual === 'pending' ? '⏳' : '', c.manual === 'graded' ? '💬' : '', c.late ? '⏰' : ''].filter(Boolean).join('');
    const note = [`автобалл ${c.best} из ${c.max}`, c.manual === 'pending' ? 'ждёт ручной проверки' : '', c.manual === 'graded' ? `оценено вручную: ${c.manualScore}` : '', c.late ? 'после срока' : '', `попыток: ${c.attempts}`].filter(Boolean).join(', ');
    return h('td', { class: 'jcell' }, h('a', { class: `jlink${c.late ? ' late' : ''}`, href: workHref(s.id, disc, n), title: note, 'aria-label': `${s.name}, ПЗ ${n}: ${note}` },
      h('span', { class: 'jpct' }, pct), marks ? h('span', { class: 'jmarks', 'aria-hidden': 'true' }, marks) : ''));
  };

  body.replaceChildren(
    h('p', { class: 'hint' }, '% — лучший автоматический балл; ⏳ ждёт ручной проверки; 💬 оценено преподавателем; ⏰ сдано после срока. Нажмите на ячейку — откроется работа.'),
    h('div', { class: 'journal-wrap', tabindex: '0', role: 'region', 'aria-label': 'Журнал: прокручивается по горизонтали' },
      h('table', { class: 'journal' },
        h('thead', {}, h('tr', {}, h('th', { class: 'jname' }, 'Студент'), lessons.map(n => h('th', { class: 'jh' }, `ПЗ ${n}`)))),
        h('tbody', {}, students.map(s => h('tr', {}, h('th', { class: 'jname', scope: 'row' }, s.name), lessons.map(n => cell(s, n))))))));
}
