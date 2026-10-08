import { h, add } from '../util/dom.js';
import { levelFor, BADGES } from '../gamification.js';
import { loadCourse, flatLessons, courseAccess, deadlineInfo } from '../content.js';
import { DISCIPLINES } from '../config.js';
import { lessonKey } from '../store.js';
import { LIMIT_TEXT, holdText } from '../submit.js';
import { coursePath, doneStreak, routeStop, pathInputs, progressCount } from './course-path.js';

const plural = (n, [one, few, many]) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

export async function renderHome(app) {
  const my = app.routeId;
  const st = app.store.state();
  const p = app.store.profile();
  const lvl = levelFor(st.xp);
  const pct = Math.round(lvl.progress * 100);
  const pending = app.submitter.pending();
  const first = p.name.split(' ')[1] || p.name;
  const streak = h('div', { class: 'hero-streak' });
  const courses = h('div', { class: 'courses' });
  const paths = h('div', { class: 'paths' });
  add(app.root,
    h('div', { class: 'home-top' },
      h('section', { class: 'hero', 'aria-labelledby': 'hello' },
        h('p', { class: 'hero-meta' }, `${p.group} · уровень ${lvl.index + 1}: ${lvl.title}`),
        h('h1', { class: 'display hero-hello', id: 'hello' }, 'Привет, ', h('br'), h('span', { class: 'grad-text' }, `${first}!`)),
        h('div', { class: 'xp' },
          h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Опыт до следующего уровня', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, h('div', { class: 'bar', style: `width:${pct}%` })),
          h('span', { class: 'xp-num' }, lvl.next === null ? `${st.xp} XP` : `${st.xp} / ${lvl.next} XP`)),
        h('p', { class: 'hint' }, lvl.next === null ? 'Максимальный уровень!' : `До уровня «${lvl.nextTitle}» ещё ${lvl.next - st.xp} XP`),
        streak),
      h('section', { class: 'home-courses', 'aria-labelledby': 'my-courses' },
        h('h2', { class: 'sec-title', id: 'my-courses' }, 'Мои курсы'),
        pending && app.submitter.limited() ? h('div', { class: 'card warn' },
          h('p', {}, `⏳ Не отправлено работ: ${pending}. ${LIMIT_TEXT}.`)) : '',
        pending && !app.submitter.limited() ? h('div', { class: 'card warn' },
          h('p', {}, `⏳ Не отправлено работ: ${pending}. Они уйдут автоматически, когда появится интернет.`),
          app.submitter.held().map(reason => h('p', { class: 'hint' }, `${holdText(reason)}.`)),
          h('button', { class: 'btn small', type: 'button', onclick: async e => { e.target.disabled = true; await app.submitter.flush({ manual: true }); app.rerender(); } }, 'Отправить сейчас')) : '',
        courses)),
    h('section', { class: 'home-paths', 'aria-labelledby': 'course-path' },
      h('h2', { class: 'sec-title', id: 'course-path' }, 'Путь курса'),
      paths));
  const me = app.store.me();
  const shown = DISCIPLINES.filter(d => courseAccess(me, d).visible);
  if (!shown.length) {
    courses.append(h('div', { class: 'card' }, h('p', {}, 'Для вашей группы пока нет открытых дисциплин.'), h('p', { class: 'hint' }, 'Когда преподаватель откроет доступ, они появятся здесь. Обратитесь к преподавателю, если это ошибка.')));
    paths.closest('section').hidden = true;
  }
  let best = 0;
  for (const d of shown) {
    const acc = courseAccess(me, d);
    let c;
    try { c = await loadCourse(d); } catch { c = null; }
    if (app.routeId !== my) return;
    const num = d.slice(-2);
    if (!c) {
      courses.append(h('div', { class: 'card course-card' }, h('div', { class: `cover c${num}`, 'aria-hidden': 'true' }, h('span', {}, num)),
        h('div', { class: 'course-info' }, h('div', { class: 'course-title' }, d.toUpperCase().replace('DUP', 'ДУП.')), h('div', { class: 'hint' }, 'Не удалось загрузить — проверьте интернет и обновите страницу'))));
      continue;
    }
    const lessons = flatLessons(c);
    const { isOpen, doneSet } = pathInputs(lessons, acc, app.store, d);
    const cnt = progressCount(lessons, doneSet, isOpen);
    const w = cnt.total ? Math.round(cnt.done / cnt.total * 100) : 0;
    courses.append(h('a', { class: 'card course-card', href: `#/d/${d}` },
      h('div', { class: `cover c${num}`, 'aria-hidden': 'true' }, h('span', {}, num)),
      h('div', { class: 'course-info' },
        h('div', { class: 'course-title' }, c.short),
        h('div', { class: 'course-code' }, `${c.code} · сдано ${cnt.done} из ${cnt.total}`),
        h('div', { class: 'progress small', role: 'img', 'aria-label': `Сдано ${w}% доступных занятий` }, h('div', { class: 'bar', style: `width:${w}%` }))),
      h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')));
    best = Math.max(best, doneStreak(coursePath(lessons, doneSet, isOpen, Infinity)));
    const trail = coursePath(lessons, doneSet, isOpen, 3);
    paths.append(h('div', { class: 'path-group' },
      h('div', { class: 'path-head' },
        h('h3', {}, `${c.code} · ${c.short}`),
        h('a', { class: 'path-all', href: `#/d/${d}` }, 'Вся карта')),
      trail.length
        ? h('ol', { class: 'route' }, trail.map(s => routeStop(s, {
          d,
          open: isOpen(s.n),
          prog: app.store.progress(lessonKey(d, s.n)),
          draft: s.state === 'now' && app.store.getDraft(lessonKey(d, s.n)) != null,
          deadline: s.state === 'now' || s.state === 'open' ? deadlineInfo(acc, s.n) : null,
        })))
        : h('p', { class: 'hint' }, 'Занятия скоро появятся.')));
  }
  if (best >= 2) streak.append(h('span', { class: 'pill' }, `🔥 ${best} ${plural(best, ['занятие', 'занятия', 'занятий'])} подряд`));
  add(app.root,
    h('section', { class: 'home-badges', 'aria-labelledby': 'badges-title' },
      h('h2', { class: 'sec-title', id: 'badges-title' }, 'Значки ', h('span', { class: 'sec-count' }, `${st.badges.length} из ${BADGES.length}`)),
      h('div', { class: 'badges' }, BADGES.map(b => {
        const got = st.badges.includes(b.id);
        return h('div', { class: `badge ${got ? 'got' : ''}` }, h('div', { class: 'badge-icon', 'aria-hidden': 'true' }, got ? b.icon : '🔒'), h('div', { class: 'badge-title' }, b.title), h('div', { class: 'badge-desc' }, b.desc));
      }))),
    h('nav', { class: 'home-links', 'aria-label': 'Ещё' },
      h('a', { class: 'btn', href: '#/rating' }, '🏆 Рейтинг группы'),
      h('a', { class: 'btn ghost', href: '#/profile' }, `👤 ${p.name}, ${p.group}`)));
}
