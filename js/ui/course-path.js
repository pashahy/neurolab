import { h } from '../util/dom.js';
import { isLessonOpen } from '../content.js';
import { lessonKey } from '../store.js';

// Путь курса: состояния ПЗ для главной (окно из нескольких ПЗ) и карты курса (все ПЗ).
// lessons — [{n, title, ready}] в порядке курса; doneSet — Set сданных номеров; isOpen(n) — открыто ли ПЗ группе.
// Состояния: 'done' — сдано, 'now' — первое открытое несданное, 'open' — открыто, 'locked' — закрыто преподавателем.
// Сданное ПЗ остаётся 'done', даже если преподаватель его потом закрыл: сдача не пропадает
// (ссылку на такое ПЗ routeStop не ставит — занятие откроется, только когда доступ вернут).
export function coursePath(lessons, doneSet, isOpen, limit = 3) {
  let now = -1;
  const all = lessons.filter(l => l.ready).map((l, i) => {
    let state = doneSet.has(l.n) ? 'done' : !isOpen(l.n) ? 'locked' : 'open';
    if (state === 'open' && now < 0) { state = 'now'; now = i; }
    return { n: l.n, title: l.title, state };
  });
  // опора окна: последнее сданное перед текущим (если текущее при этом попадает в окно), иначе текущее;
  // без текущего окно заканчивается последним сданным
  let lastDone = -1;
  for (let i = (now < 0 ? all.length : now) - 1; i >= 0; i--) if (all[i].state === 'done') { lastDone = i; break; }
  const anchor = now >= 0
    ? (lastDone >= 0 ? Math.max(lastDone, now - limit + 1) : now)
    : (lastDone >= 0 ? lastDone - limit + 1 : 0);
  const start = Math.max(0, Math.min(anchor, all.length - limit));
  return all.slice(start, start + limit);
}

// Входные данные пути для дисциплины d: isOpen(n) по доступу группы и Set сданных готовых ПЗ (по локальному прогрессу).
export function pathInputs(lessons, acc, store, d) {
  const isOpen = n => isLessonOpen(acc, n);
  const doneSet = new Set(lessons.filter(l => l.ready && store.progress(lessonKey(d, l.n))).map(l => l.n));
  return { isOpen, doneSet };
}

// Счёт «сдано X из Y» для главной и карты курса: Y — готовые ПЗ, которые открыты или уже сданы, X — сданные среди них.
export function progressCount(lessons, doneSet, isOpen) {
  let done = 0, total = 0;
  for (const l of lessons) {
    if (!l.ready) continue;
    const isDone = doneSet.has(l.n);
    if (!isDone && !isOpen(l.n)) continue;
    total++;
    if (isDone) done++;
  }
  return { done, total };
}

// Серия: сколько ПЗ сдано подряд прямо перед текущим (или в конце пути, если текущего нет).
export function doneStreak(path) {
  const now = path.findIndex(s => s.state === 'now');
  let k = 0;
  for (let i = (now < 0 ? path.length : now) - 1; i >= 0 && path[i].state === 'done'; i--) k++;
  return k;
}

const SUB = {
  done: pct => `Сдано · лучший результат ${pct}%`,
  now: (pct, draft) => (draft ? 'Начато · продолжите с того же места' : 'Следующее занятие'),
  open: () => 'Доступно',
  locked: () => 'Закрыто преподавателем',
  soon: () => 'Скоро',
};
const MARK = { done: '✓', locked: '🔒' };

// Остановка маршрута (общая для главной и карты курса). stop — {n, title, state};
// ctx — {d, open, prog, draft, deadline, graded}; open — открыто ли ПЗ группе (сданное, но закрытое — без ссылки).
export function routeStop(stop, { d, open = true, prog = null, draft = false, deadline = null, graded = false }) {
  const { n, title, state } = stop;
  const pct = prog && prog.max ? Math.round(prog.best / prog.max * 100) : 0;
  const inner = [
    h('span', { class: 'stop-dot', 'aria-hidden': 'true' }, MARK[state] || ''),
    h('span', { class: 'stop-text' },
      h('span', { class: 'stop-title' }, `ПЗ №${n}. ${title}`),
      h('span', { class: 'stop-sub' }, SUB[state](pct, draft)),
      state === 'done' && !open ? h('span', { class: 'stop-sub' }, '🔒 закрыто преподавателем') : '',
      deadline ? h('span', { class: `stop-sub deadline${deadline.overdue ? ' overdue' : ''}` }, deadline.overdue ? '⏰ срок прошёл, можно сдать с отметкой' : `⏰ Срок: до ${deadline.label}`) : ''),
    graded ? h('span', { class: 'node-grade', role: 'img', 'aria-label': 'Есть оценка преподавателя', title: 'Есть оценка преподавателя' }, '💬') : '',
  ];
  const link = state === 'open' || state === 'now' || (state === 'done' && open);
  return h('li', { class: `stop is-${state}` }, link
    ? h('a', { class: 'stop-link', href: `#/d/${d}/${n}`, 'aria-current': state === 'now' ? 'step' : null }, inner)
    : h('div', { class: 'stop-link', 'aria-disabled': 'true' }, inner));
}
