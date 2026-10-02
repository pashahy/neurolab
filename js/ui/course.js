import { h, add } from '../util/dom.js';
import { loadCourse, isLessonOpen, courseAccess, deadlineInfo, hasTeacherGrades } from '../content.js';
import { lessonKey } from '../store.js';

const SUB = { done: pct => `Сдано · лучший результат ${pct}%`, open: () => 'Доступно', locked: () => 'Закрыто преподавателем', soon: () => 'Скоро' };

export async function renderCourse(app, d) {
  const my = app.routeId;
  let course;
  try { course = await loadCourse(d); } catch {
    add(app.root, h('div', { class: 'card' }, h('p', {}, 'Дисциплина не найдена.'), h('a', { class: 'btn', href: '#/' }, 'На главную')));
    return;
  }
  if (app.routeId !== my) return;
  const acc = courseAccess(app.store.me(), d);
  if (!acc.visible) {
    add(app.root, h('a', { href: '#/', class: 'back' }, '← Главная'), h('div', { class: 'card' }, h('p', {}, '🔒 Эта дисциплина недоступна для вашей группы.'), h('p', { class: 'hint' }, 'Когда преподаватель откроет доступ, она появится на главной.'), h('a', { class: 'btn', href: '#/' }, 'На главную')));
    return;
  }
  const grades = app.store.grades();
  let firstTodo = null;
  add(app.root, h('a', { href: '#/', class: 'back' }, '← Главная'), h('h1', {}, `${course.icon} ${course.code} · ${course.short}`), h('p', { class: 'muted' }, course.title));
  for (const s of course.sections) {
    const sec = h('section', { class: 'section' }, h('h2', {}, `Раздел ${s.n}. ${s.title}`));
    for (const t of s.topics) {
      if (!t.lessons.some(l => l.ready)) {
        sec.append(h('div', { class: 'topic soon' }, h('h3', {}, `Тема ${t.id}. ${t.title}`), h('p', { class: 'hint' }, t.lessons.length ? `Занятий: ${t.lessons.length} — скоро` : 'Скоро')));
        continue;
      }
      const path = h('ol', { class: 'path' });
      t.lessons.forEach((l, i) => {
        const prog = app.store.progress(lessonKey(d, l.n));
        const state = !l.ready ? 'soon' : !isLessonOpen(acc, l.n) ? 'locked' : prog ? 'done' : 'open';
        const pct = prog?.max ? Math.round(prog.best / prog.max * 100) : 0;
        const dl = state === 'open' ? deadlineInfo(acc, l.n) : null;
        const graded = hasTeacherGrades(grades, lessonKey(d, l.n));
        const inner = [
          h('span', { class: 'node', 'aria-hidden': 'true' }, state === 'done' ? '✓' : state === 'locked' ? '🔒' : String(l.n)),
          h('span', { class: 'node-text' }, h('span', { class: 'node-title' }, `ПЗ №${l.n}. ${l.title}`), h('span', { class: 'node-sub' }, SUB[state](pct)),
            dl ? h('span', { class: `node-sub deadline${dl.overdue ? ' overdue' : ''}` }, dl.overdue ? '⏰ срок прошёл, можно сдать с отметкой' : `⏰ Срок: до ${dl.label}`) : ''),
          graded ? h('span', { class: 'node-grade', role: 'img', 'aria-label': 'Есть оценка преподавателя', title: 'Есть оценка преподавателя' }, '💬') : '',
        ];
        const item = state === 'open' || state === 'done'
          ? h('a', { class: `node-link ${state}`, href: `#/d/${d}/${l.n}` }, inner)
          : h('div', { class: `node-link ${state}`, 'aria-disabled': 'true' }, inner);
        const li = h('li', { class: `step ${i % 2 ? 'right' : 'left'}` }, item);
        if (state === 'open' && !firstTodo) firstTodo = li;
        path.append(li);
      });
      sec.append(h('div', { class: 'topic' }, h('h3', {}, `Тема ${t.id}. ${t.title}`), path));
    }
    app.root.append(sec);
  }
  firstTodo?.scrollIntoView({ block: 'center' });
}
