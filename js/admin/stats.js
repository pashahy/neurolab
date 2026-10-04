import { h } from '../util/dom.js';
import { md } from '../util/text.js';
import { loadLesson } from '../content.js';
import { allTasks, hasVariants } from '../lesson-model.js';
import { errText } from '../ui/login.js';
import { DISC, loading, loadError, emptyBox } from './common.js';
import { filterBar } from './journal.js';

// формулировка задания по номеру ПЗ и id из файла занятия (проверочные вопросы лекции v2 тоже ищем)
function findTask(lesson, id) {
  return allTasks(lesson).find(x => x && String(x.id) === String(id)) || null;
}

// #/admin/stats?group=…&d=…: кто не сдал каждое ПЗ, средний процент, самые трудные задания
export async function renderStats(ctx, main) {
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
  const body = h('div', {}, loading('Считаем статистику…'));
  main.replaceChildren(filterBar(ctx, 'stats', groups, group, disc), body);

  let d;
  try { d = await ctx.call('adminStats', { group, discipline: disc }); } catch (e) {
    if (!ctx.alive() || (e && e.handled)) return;
    body.replaceChildren(loadError(errText(e), () => ctx.rerender()));
    return;
  }
  if (!ctx.alive()) return;
  const lessons = Array.isArray(d.lessons) ? d.lessons : [];
  const hard = Array.isArray(d.hardTasks) ? d.hardTasks : [];

  // файлы занятий: для «ПК: N%» (только у занятий с вариантами) и для текстов сложных заданий
  const lessonsCache = {};
  const loadInto = n => loadLesson(disc, Number(n)).then(x => { lessonsCache[n] = x; }, () => { lessonsCache[n] = null; });
  await Promise.all(Array.from(new Set([...lessons.filter(l => l.submitted > 0).map(l => l.n), ...hard.map(x => x.lesson)])).map(loadInto));
  if (!ctx.alive()) return;

  const perLesson = lessons.length ? h('div', { class: 'card' }, h('h2', {}, 'По занятиям'),
    h('div', { class: 'stat-list' }, lessons.map(l => {
      const total = l.submitted + (Array.isArray(l.notSubmitted) ? l.notSubmitted.length : 0);
      const names = Array.isArray(l.notSubmitted) ? l.notSubmitted : [];
      return h('details', { class: 'stat-row' },
        h('summary', {},
          h('strong', {}, `ПЗ ${l.n}`),
          h('span', {}, `сдали ${l.submitted} из ${total}`),
          h('span', { class: 'stat-avg' }, l.avgPct == null ? 'средний —' : `средний ${l.avgPct}%`),
          l.submitted > 0 && hasVariants(lessonsCache[l.n]) ? h('span', { class: 'stat-pc' }, `ПК: ${Math.round(Number(l.pcShare || 0) * 100)}%`) : '',
          names.length ? h('span', { class: 'muted' }, `не сдали: ${names.length}`) : h('span', { class: 'ok-text' }, 'все сдали')),
        names.length ? h('ul', { class: 'stat-names' }, names.map(nm => h('li', {}, nm))) : h('p', { class: 'hint' }, 'Не сдавших нет.'));
    }))) : emptyBox('Занятий для статистики пока нет.');

  const hardBox = h('div', { class: 'card' }, h('h2', {}, 'Сложные задания'),
    hard.length ? h('p', { class: 'hint' }, 'Доля набранных баллов по автозаданиям (лучшие попытки; задания, которые выполнили не меньше трёх студентов).') : '',
    hard.length ? h('ol', { class: 'hard-list' }) : h('p', { class: 'muted' }, 'Пока недостаточно сдач (нужно хотя бы три на задание).'));
  body.replaceChildren(perLesson, hardBox);
  if (!hard.length) return;

  const ol = hardBox.querySelector('ol');
  hard.forEach(x => {
    const t = findTask(lessonsCache[x.lesson], x.taskId);
    ol.append(h('li', { class: 'hard-item' },
      h('div', { class: 'hard-head' }, h('strong', {}, `ПЗ ${x.lesson}`), h('span', { class: 'hard-pct' }, `${x.pct}% баллов`)),
      t && t.text ? h('div', { class: 'task-text', html: md(t.text) }) : h('p', { class: 'muted' }, `Задание ${x.taskId} (текст не найден в файле занятия)`)));
  });
}
