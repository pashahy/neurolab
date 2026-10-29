import { h, add } from '../util/dom.js';
import { BADGES, levelFor } from '../gamification.js';
import { loadCourse, flatLessons } from '../content.js';
import { DISCIPLINES } from '../config.js';
import { buildPortfolio, fmtDate, ballsText } from '../portfolio.js';

const DISC_NAMES = { dup01: 'ДУП.01', dup03: 'ДУП.03' };

async function lessonTitles() {
  const titles = {};
  for (const d of DISCIPLINES) {
    try { flatLessons(await loadCourse(d)).forEach(l => { titles[`${d}/${l.n}`] = l.title; }); } catch (e) { /* дисциплина не загрузилась */ }
  }
  return titles;
}

export async function renderPortfolio(app) {
  const my = app.routeId;
  const p = app.store.profile() || {};
  const body = h('div', { class: 'pf-body' });
  const status = h('p', { class: 'hint pf-noprint', role: 'status', 'aria-live': 'polite' }, '');
  const printBtn = h('button', { class: 'btn primary big', type: 'button' }, 'Сохранить в PDF');
  printBtn.addEventListener('click', () => window.print());
  add(app.root,
    h('div', { class: 'pf-noprint' }, h('a', { href: '#/profile', class: 'back' }, '← Профиль')),
    h('h1', { class: 'display' }, 'Портфолио'),
    h('div', { class: 'pf-noprint pf-actions' }, printBtn,
      h('p', { class: 'hint' }, 'В окне печати выберите «Сохранить как PDF».')),
    status, body);

  status.textContent = 'Загружаю…';
  const titles = await lessonTitles();
  if (app.routeId !== my) return;
  const draw = () => {
    const st = app.store.state();
    const pf = buildPortfolio({ progress: st.progress, hw: st.hw, grades: st.grades }, titles);
    const lvl = levelFor(Number(st.xp) || 0);
    const got = BADGES.filter(b => (st.badges || []).includes(b.id));
    body.replaceChildren(
      h('section', { class: 'card pf-head' },
        h('h2', { class: 'pf-name' }, p.name || '—'),
        h('p', {}, 'Группа: ', h('strong', {}, p.group || '—')),
        h('p', { class: 'hint' }, `Уровень: ${lvl.title} · ${Number(st.xp) || 0} XP`),
        h('p', { class: 'hint' }, 'Дата: ' + fmtDate(new Date()))),
      h('section', { class: 'card pf-sum' },
        h('h2', {}, 'Итоги'),
        h('p', {}, `Сдано занятий: ${pf.done}, средний результат: ${pf.avg} %`),
        h('ul', { class: 'pf-list' }, Object.keys(pf.byDiscipline).sort().map(d =>
          h('li', {}, `${DISC_NAMES[d] || d}: сдано ${pf.byDiscipline[d].done}, средний результат ${pf.byDiscipline[d].avg} %`)))),
      h('section', { class: 'card pf-best' },
        h('h2', {}, 'Лучшие работы'),
        pf.best.length
          ? h('ol', { class: 'pf-list' }, pf.best.map(w => h('li', { class: 'pf-work' },
            h('strong', {}, `${DISC_NAMES[w.d] || w.d}, ПЗ ${w.n}. ${w.title}`),
            h('div', { class: 'hint' }, [
              w.at ? fmtDate(w.at) : '',
              `${w.best} из ${w.max} (${w.percent} %)${w.perfect ? ' · без ошибок' : ''}`,
              w.teacher !== null ? `ручная проверка: ${ballsText(w.teacher)}` : '',
              w.hwMark ? `Домашнее задание: ${w.hwMark}` : '',
            ].filter(Boolean).join(' · ')))))
          : h('p', { class: 'hint' }, 'Пока нет сданных занятий.')),
      h('section', { class: 'card pf-badges' },
        h('h2', {}, 'Значки'),
        got.length
          ? h('ul', { class: 'pf-list' }, got.map(b => h('li', {}, `${b.icon} ${b.title} — ${b.desc}`)))
          : h('p', { class: 'hint' }, 'Значков пока нет.')));
  };
  draw();
  // со связью освежаем оценки и прогресс; без связи остаются локальные данные
  status.textContent = 'Обновляю данные…';
  const jobs = [];
  if (typeof app.syncProgress === 'function') jobs.push(Promise.resolve(app.syncProgress({ force: true })).catch(() => false));
  jobs.push(Promise.resolve().then(() => app.api.myGrades()).then(g => { app.store.setGrades(g); return true; }).catch(e => (e && e.auth ? true : 'offline')));
  Promise.all(jobs).then(r => {
    if (app.routeId !== my) return;
    status.textContent = r.indexOf('offline') >= 0 ? 'Нет связи — показаны сохранённые данные' : '';
    try { draw(); } catch (e) { console.error(e); }
  });
}
