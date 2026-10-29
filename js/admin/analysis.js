import { h } from '../util/dom.js';
import { loadCourse, loadLesson, flatLessons } from '../content.js';
import { errText } from '../ui/login.js';
import { DISC, select, hashQuery, loading, loadError, emptyBox } from './common.js';
import { buildRows, splitHard, HARD_PCT } from './analysis-model.js';

const VARIANT = { pc: 'ПК', phone: 'телефон' };

// все тексты — только текстовые узлы (h экранирует), ответы студентов не попадают в HTML
function wrongList(r) {
  if (r.manual || !r.wrongN) return '';
  if (!r.wrong.length) return h('p', { class: 'hint an-wrong-none' }, `Неверных: ${r.wrongN}. Частые ответы для этого типа задания не собираются.`);
  const shown = r.wrong.reduce((s, w) => s + w.n, 0);
  return h('div', { class: 'an-wrong' },
    h('p', { class: 'hint' }, 'Частые неверные ответы:'),
    h('ul', {}, r.wrong.map(w => h('li', {}, h('span', { class: 'an-ans' }, w.label), h('span', { class: 'an-n' }, `× ${w.n}`)))),
    r.wrongN > shown ? h('p', { class: 'hint' }, `Остальные неверные: ${r.wrongN - shown}`) : '');
}

function taskCard(r) {
  const head = h('div', { class: 'an-head' },
    h('strong', {}, r.name),
    r.split && r.variant ? h('span', { class: 'an-tag' }, VARIANT[r.variant]) : '',
    r.hard ? h('span', { class: 'an-tag hard' }, 'трудное') : '',
    r.manual ? h('span', { class: 'an-tag' }, 'ручная проверка') : '');
  if (r.manual) {
    return h('li', { class: 'an-item' }, head, r.text ? h('p', { class: 'an-text' }, r.text) : '', h('p', { class: 'hint' }, `Сдали: ${r.n}`));
  }
  const p = r.pct === null ? 0 : r.pct;
  return h('li', { class: `an-item${r.hard ? ' is-hard' : ''}` }, head,
    r.text ? h('p', { class: 'an-text' }, r.text) : '',
    h('div', { class: 'an-meter' },
      h('div', { class: 'an-bar', role: 'img', 'aria-label': `Верно ${p}%` }, h('span', { class: 'an-fill', style: `width:${p}%` })),
      h('div', { class: 'an-val' }, `${p}% верно · ${r.right} из ${r.n}`)),
    wrongList(r));
}

const section = (title, hint, list) => h('section', { class: 'card an-block' }, h('h2', {}, title), hint ? h('p', { class: 'hint' }, hint) : '',
  h('ol', { class: 'an-list' }, list.map(taskCard)));

// #/admin/analysis?group=…&d=…&n=…: по каждому заданию ПЗ — доля верных, число ответивших, частые неверные ответы
export async function renderAnalysis(ctx, main) {
  let groups;
  let course;
  try {
    groups = await ctx.groups();
    const qd0 = ctx.query.get('d');
    course = await loadCourse(DISC.some(x => x.id === qd0) ? qd0 : DISC[0].id);
  } catch (e) {
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
  const lessons = flatLessons(course).filter(l => l.ready);
  if (!lessons.length) { main.replaceChildren(emptyBox('В этой дисциплине пока нет готовых занятий.')); return; }
  const qn = Number(ctx.query.get('n'));
  let n = lessons.some(l => l.n === qn) ? qn : null;
  if (n === null) {
    // по умолчанию — последнее занятие, которое уже сдавали
    main.replaceChildren(loading('Определяем занятие…'));
    let stats = null;
    try { stats = await ctx.call('adminStats', { group, discipline: disc }); } catch (e) {
      if (!ctx.alive() || (e && e.handled)) return;
    }
    if (!ctx.alive()) return;
    const done = (stats && Array.isArray(stats.lessons) ? stats.lessons : []).filter(l => l && l.submitted > 0 && lessons.some(x => x.n === l.n)).map(l => l.n);
    n = done.length ? done[done.length - 1] : lessons[0].n;
  }

  const go = (g, d, k) => ctx.go(hashQuery('/admin/analysis', { group: g, d, n: k }));
  const bar = h('div', { class: 'card admin-tools no-print' },
    h('div', { class: 'tools-row' },
      h('label', { class: 'field inline' }, h('span', {}, 'Группа'), select(groups.map(g => ({ value: g, label: g })), group, v => go(v, disc, n))),
      h('label', { class: 'field inline' }, h('span', {}, 'Дисциплина'), select(DISC.map(x => ({ value: x.id, label: x.code })), disc, v => go(group, v, ''))),
      h('label', { class: 'field inline' }, h('span', {}, 'ПЗ'), select(lessons.map(l => ({ value: String(l.n), label: `№${l.n}` })), String(n), v => go(group, disc, v), { 'aria-label': 'Практическое занятие' }))));
  const body = h('div', {}, loading('Анализируем задания…'));
  main.replaceChildren(bar, body);
  const meta = lessons.find(l => l.n === n);

  let d;
  let lesson = null;
  try {
    [d, lesson] = await Promise.all([
      ctx.call('adminTaskAnalysis', { group, discipline: disc, lesson: n }),
      loadLesson(disc, n).catch(() => null), // файла нет — подписи заменяются id
    ]);
  } catch (e) {
    if (!ctx.alive() || (e && e.handled)) return;
    body.replaceChildren(loadError(errText(e), () => ctx.rerender()));
    return;
  }
  if (!ctx.alive()) return;

  const count = Number(d && d.count) || 0;
  const parts = [h('h2', { class: 'sum-title' }, `ПЗ №${n}${meta ? ` «${meta.title}»` : ''}`),
    h('p', { class: 'hint' }, `Последние сдачи студентов группы ${group}: ${count}. «Трудное» — верно меньше ${HARD_PCT}% ответивших.`)];
  const rows = buildRows(d, lesson);
  if (!count || !rows.length) {
    parts.push(emptyBox('По этому занятию пока нет сдач.'));
  } else {
    const { hard, rest } = splitHard(rows);
    if (hard.length) parts.push(section('Трудные задания', 'Начните с них: меньше всего верных ответов.', hard));
    else parts.push(h('div', { class: 'card ok-text', role: 'status' }, 'Трудных заданий нет: везде верно не меньше 40%.'));
    if (rest.length) parts.push(section('Остальные задания', 'В порядке занятия.', rest));
  }
  body.replaceChildren(...parts);
}
