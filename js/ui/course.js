import { h, add } from '../util/dom.js';
import { loadCourse, flatLessons, courseAccess, deadlineInfo, hasTeacherGrades } from '../content.js';
import { lessonKey } from '../store.js';
import { coursePath, routeStop, pathInputs, progressCount } from './course-path.js';

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
  const lessons = flatLessons(course);
  const { isOpen, doneSet } = pathInputs(lessons, acc, app.store, d);
  // состояние каждого ПЗ — та же функция, что и путь на главной, но по всем ПЗ; неготовые — «скоро»
  const path = coursePath(lessons, doneSet, isOpen, Infinity);
  const state = new Map(path.map(s => [s.n, s.state]));
  const now = path.find(s => s.state === 'now');
  const cnt = progressCount(lessons, doneSet, isOpen);
  const w = cnt.total ? Math.round(cnt.done / cnt.total * 100) : 0;
  const num = d.slice(-2);

  const map = h('div', { class: 'course-map' });
  add(app.root, h('div', { class: 'course-layout' },
    h('aside', { class: 'course-head' },
      h('a', { href: '#/', class: 'back' }, '← Главная'),
      h('div', { class: 'course-head-row' },
        h('div', { class: `cover big c${num}`, 'aria-hidden': 'true' }, h('span', {}, num)),
        h('div', { class: 'course-head-text' },
          h('p', { class: 'course-code' }, course.code),
          h('h1', { class: 'display course-name' }, course.short))),
      h('p', { class: 'muted course-full' }, course.title),
      h('div', { class: 'course-stat' },
        h('div', { class: 'progress', role: 'img', 'aria-label': `Сдано ${w}% доступных занятий` }, h('div', { class: 'bar', style: `width:${w}%` })),
        h('p', { class: 'hint' }, `Сдано ${cnt.done} из ${cnt.total} доступных занятий`)),
      now ? h('a', { class: 'btn primary big', href: `#/d/${d}/${now.n}` }, `${app.store.getDraft(lessonKey(d, now.n)) != null ? 'Продолжить' : 'Начать'} ПЗ №${now.n}`) : ''),
    map));

  let current = null;
  for (const s of course.sections) {
    const sec = h('section', { class: 'section' }, h('h2', { class: 'sec-head' }, h('span', { class: 'sec-num' }, `Раздел ${s.n}`), h('span', { class: 'sec-name' }, s.title)));
    for (const t of s.topics) {
      if (!t.lessons.some(l => l.ready)) {
        sec.append(h('div', { class: 'topic soon' }, h('h3', {}, `Тема ${t.id}. ${t.title}`), h('p', { class: 'hint' }, t.lessons.length ? `Занятий: ${t.lessons.length} — скоро` : 'Скоро')));
        continue;
      }
      const route = h('ol', { class: 'route' });
      for (const l of t.lessons) {
        const st = state.get(l.n) || 'soon';
        const key = lessonKey(d, l.n);
        const li = routeStop({ n: l.n, title: l.title, state: st }, {
          d,
          open: isOpen(l.n),
          prog: app.store.progress(key),
          draft: st === 'now' && app.store.getDraft(key) != null,
          deadline: st === 'now' || st === 'open' ? deadlineInfo(acc, l.n) : null,
          graded: hasTeacherGrades(grades, key),
        });
        if (st === 'now') current = li;
        route.append(li);
      }
      sec.append(h('div', { class: 'topic' }, h('h3', {}, `Тема ${t.id}. ${t.title}`), route));
    }
    map.append(sec);
  }
  current?.scrollIntoView({ block: 'center' });
}
