import { h, add } from '../util/dom.js';
import { levelFor, BADGES } from '../gamification.js';
import { loadCourse, flatLessons, courseAccess, isLessonOpen } from '../content.js';
import { DISCIPLINES } from '../config.js';
import { lessonKey } from '../store.js';

export async function renderHome(app) {
  const my = app.routeId;
  const st = app.store.state();
  const p = app.store.profile();
  const lvl = levelFor(st.xp);
  const pct = Math.round(lvl.progress * 100);
  const pending = app.submitter.pending();
  const courses = h('section', { class: 'courses' });
  add(app.root,
    h('section', { class: 'card level-card' },
      h('div', { class: 'hello' }, `Привет, ${p.name.split(' ')[1] || p.name}!`),
      h('div', { class: 'level-title' }, `Уровень ${lvl.index + 1}: ${lvl.title}`),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, h('div', { class: 'bar', style: `width:${pct}%` })),
      h('div', { class: 'hint' }, lvl.next === null ? `${st.xp} XP — максимальный уровень!` : `${st.xp} XP · до уровня «${lvl.nextTitle}» ещё ${lvl.next - st.xp} XP`)),
    pending ? h('section', { class: 'card warn' },
      h('p', {}, `⏳ Не отправлено работ: ${pending}. Они уйдут автоматически, когда появится интернет.`),
      h('button', { class: 'btn small', type: 'button', onclick: async e => { e.target.disabled = true; await app.submitter.flush(); app.rerender(); } }, 'Отправить сейчас')) : '',
    courses);
  const me = app.store.me();
  const shown = DISCIPLINES.filter(d => courseAccess(me, d).visible);
  if (!shown.length) courses.append(h('div', { class: 'card' }, h('p', {}, 'Для вашей группы пока нет открытых дисциплин.'), h('p', { class: 'hint' }, 'Когда преподаватель откроет доступ, они появятся здесь. Обратитесь к преподавателю, если это ошибка.')));
  for (const d of shown) {
    const acc = courseAccess(me, d);
    let c;
    try { c = await loadCourse(d); } catch { c = null; }
    if (app.routeId !== my) return;
    if (!c) {
      courses.append(h('div', { class: 'card course-card' }, h('div', {}, h('div', { class: 'course-title' }, d.toUpperCase().replace('DUP', 'ДУП.')), h('div', { class: 'hint' }, 'не удалось загрузить — проверьте интернет и обновите страницу'))));
      continue;
    }
    const ready = flatLessons(c).filter(l => l.ready && isLessonOpen(acc, l.n));
    const done = ready.filter(l => app.store.progress(lessonKey(d, l.n)));
    const w = ready.length ? Math.round(done.length / ready.length * 100) : 0;
    courses.append(h('a', { class: 'card course-card', href: `#/d/${d}` },
      h('div', { class: 'course-icon', 'aria-hidden': 'true' }, c.icon),
      h('div', {}, h('div', { class: 'course-code' }, c.code), h('div', { class: 'course-title' }, c.short),
        h('div', { class: 'progress small' }, h('div', { class: 'bar', style: `width:${w}%` })),
        h('div', { class: 'hint' }, `Сдано ${done.length} из ${ready.length} доступных занятий`)),
      h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')));
  }
  add(app.root,
    h('section', { class: 'card' }, h('h2', {}, `Значки · ${st.badges.length} из ${BADGES.length}`),
      h('div', { class: 'badges' }, BADGES.map(b => {
        const got = st.badges.includes(b.id);
        return h('div', { class: `badge ${got ? 'got' : ''}` }, h('div', { class: 'badge-icon', 'aria-hidden': 'true' }, got ? b.icon : '🔒'), h('div', { class: 'badge-title' }, b.title), h('div', { class: 'badge-desc' }, b.desc));
      }))),
    h('nav', { class: 'home-links' },
      h('a', { class: 'btn', href: '#/rating' }, '🏆 Рейтинг группы'),
      h('a', { class: 'btn ghost', href: '#/profile' }, `👤 ${p.name}, ${p.group}`)));
}
