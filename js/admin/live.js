import { h } from '../util/dom.js';
import { loadCourse, flatLessons } from '../content.js';
import { avatarUrl, defaultAvatar } from '../avatars.js';
import { errText } from '../ui/login.js';
import { DISC, select, hashQuery, loading, loadError, emptyBox } from './common.js';
import { tileState, stageLabel, fmtClock, clockOffset, awayElapsed, countPresent, countDone, awaySignal } from './board-model.js';
import { startPoll, startTicker } from './board.js';

const STATE_TEXT = { none: '', away: 'нет на месте', idle: '💤 не активен', done: 'сдал', active: '' };

// #/admin/live/<d>/<n>?group=…: «Мой экран» — состояние студентов с именами, вёрстка под телефон
export async function renderLive(ctx, main) {
  const parts = ctx.parts || [];
  const d = DISC.some(x => x.id === parts[1]) ? parts[1] : '';
  const n = Number(parts[2]);
  if (!d || !Number.isInteger(n) || n < 1) { ctx.go('/admin/summary'); return; }
  let groups;
  let title = '';
  try {
    groups = await ctx.groups();
    try {
      const meta = flatLessons(await loadCourse(d)).find(l => l.n === n);
      title = meta ? meta.title : '';
    } catch (e) { /* название необязательно */ }
  } catch (e) {
    if (!ctx.alive() || (e && e.handled)) return;
    main.replaceChildren(loadError(errText(e), () => ctx.rerender()));
    return;
  }
  if (!ctx.alive()) return;
  if (!groups.length) { main.replaceChildren(emptyBox('Групп пока нет: добавьте студентов на вкладке «Студенты».')); return; }
  const qg = ctx.query.get('group');
  const group = groups.indexOf(qg) >= 0 ? qg : groups[0];

  const countEl = h('p', { class: 'live-count' });
  const status = h('p', { class: 'hint', role: 'status' });
  const list = h('ul', { class: 'live-list' }, h('li', {}, loading('Загружаем…')));
  main.replaceChildren(
    h('div', { class: 'card admin-tools no-print' },
      h('h2', {}, `Мой экран: ПЗ №${n}${title ? ` «${title}»` : ''}`),
      h('div', { class: 'tools-row' },
        h('label', { class: 'field inline' }, h('span', {}, 'Группа'),
          select(groups.map(g => ({ value: g, label: g })), group, v => ctx.go(hashQuery(`/admin/live/${d}/${n}`, { group: v })), { 'aria-label': 'Группа' })),
        h('a', { class: 'btn small', href: `#${hashQuery(`/admin/board/${d}/${n}`, { group })}`, target: '_blank', rel: 'noopener' }, '📺 Доска')),
      countEl, status),
    list,
    h('p', { class: 'hint live-note' }, 'Сигналы — повод присмотреться, не доказательство: студент мог уйти по делу или потерять связь.'));

  let students = [];
  let offset = 0;
  const rows = new Map();
  let ids = '';

  function build() {
    list.replaceChildren();
    rows.clear();
    students.forEach(s => {
      const name = h('div', { class: 'live-name' }, s.name || s.id);
      const stage = h('span', { class: 'live-stage' });
      const score = h('span', { class: 'live-score' });
      const state = h('div', { class: 'live-state' });
      const sig = h('div', { class: 'live-signal' });
      const el = h('li', { class: 'live-row' },
        h('img', { class: 'live-avatar', src: avatarUrl(s.avatar || defaultAvatar(s.id)), alt: '', width: '56', height: '56' }),
        h('div', { class: 'live-body' }, name, h('div', { class: 'live-line' }, stage, score), state, sig));
      list.append(el);
      rows.set(s.id, { el, stage, score, state, sig });
    });
  }

  function paint(clientNow) {
    const now = clientNow + offset;
    students.forEach(s => {
      const r = rows.get(s.id);
      if (!r) return;
      const st = tileState(s, now);
      r.el.className = `live-row live-${st}`;
      r.stage.textContent = stageLabel(s.stage);
      r.score.textContent = st === 'none' ? '' : `${s.score == null ? 0 : s.score}/${s.max == null ? 0 : s.max}`;
      r.state.textContent = st === 'away' ? `нет на месте ${fmtClock(awayElapsed(s.awaySince, offset, clientNow))}` : STATE_TEXT[st];
      r.sig.textContent = awaySignal(s);
    });
  }

  function apply(data, clientNow) {
    offset = clockOffset(data.now, clientNow);
    students = Array.isArray(data.students) ? data.students : [];
    const key = students.map(s => s.id).join('|');
    if (key !== ids) { ids = key; build(); }
    if (!students.length) list.replaceChildren(h('li', {}, emptyBox('В группе нет активных студентов.')));
    status.textContent = '';
    const p = countPresent(students, data.now);
    const dn = countDone(students);
    countEl.textContent = `На занятии ${p.x} из ${p.y} · сдали ${dn.x} из ${dn.y}`;
    paint(clientNow);
  }

  let first = true;
  startPoll({
    alive: ctx.alive,
    load: () => ctx.call('boardState', { group, discipline: d, lesson: n, names: true }),
    apply: (data, now) => { first = false; apply(data, now); },
    onError: e => {
      if (e && e.handled) return;
      if (first) { list.replaceChildren(h('li', {}, loadError(errText(e), () => ctx.rerender()))); return; }
      status.textContent = 'Нет связи, показаны последние данные.';
    },
  });
  startTicker(ctx.alive, () => paint(Date.now()));
}
