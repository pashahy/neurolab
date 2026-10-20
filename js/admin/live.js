import { h } from '../util/dom.js';
import { loadCourse, flatLessons } from '../content.js';
import { avatarUrl, defaultAvatar } from '../avatars.js';
import { frameClass } from '../sandbox/cosmetics.js';
import { errText } from '../ui/login.js';
import { DISC, select, hashQuery, loading, loadError, emptyBox } from './common.js';
import { stageLabel, fmtClock, clockOffset, awayElapsed, countPresent, countDone, awaySignal } from './board-model.js';
import { goalLine } from './board-goal.js';
import { startPoll, startTicker } from './board.js';
import { liveSignals } from './signals-view.js';
import { phaseControl } from './board-phase.js';
import { defensePanel } from './live-defense.js';
import { createLivePanel } from './board-live.js';
import { hallPanel } from './board-hall.js';
import { createCommentForm } from './board-outro.js';
import { teamsPanel } from './board-teams.js';
import { shownState } from './board-away.js';
import { createAbsentCtl, presentOf, withAbsent } from './board-absent.js';

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
  const goalEl = h('p', { class: 'live-goal' });
  const status = h('p', { class: 'hint', role: 'status' });
  const phaseCtl = phaseControl(ctx, { group, d, n, alive: ctx.alive });
  const defensePart = defensePanel(ctx, { group, d, n }); // B2: «Защита сейчас»
  const hallPart = hallPanel(ctx, { group, names: true, alive: ctx.alive }); // B7: «Зал славы» с именами
  const teamsPart = teamsPanel(ctx, { group, d, n, names: true, alive: ctx.alive }); // B8: «Команды» с именами
  const list = h('ul', { class: 'live-list' }, h('li', {}, loading('Загружаем…')));
  // B4: те же кнопки управления интерактивами, что и на доске — с телефона
  const live = createLivePanel({ call: ctx.call, ref: { group, discipline: d, lesson: n }, variant: 'phone' });
  main.replaceChildren(
    h('div', { class: 'card admin-tools no-print' },
      h('h2', {}, `Мой экран: ПЗ №${n}${title ? ` «${title}»` : ''}`),
      h('div', { class: 'tools-row' },
        h('label', { class: 'field inline' }, h('span', {}, 'Группа'),
          select(groups.map(g => ({ value: g, label: g })), group, v => ctx.go(hashQuery(`/admin/live/${d}/${n}`, { group: v })), { 'aria-label': 'Группа' })),
        h('a', { class: 'btn small', href: `#${hashQuery(`/admin/board/${d}/${n}`, { group })}`, target: '_blank', rel: 'noopener' }, '📺 Доска')),
      countEl, goalEl, status),
    h('div', { class: 'card no-print' }, phaseCtl.el),
    defensePart.el,
    h('div', { class: 'card no-print' }, live.el),
    h('details', { class: 'live-hall', ontoggle: e => { if (e.target.open) hallPart.open(); else hallPart.close(); } }, h('summary', {}, '🏆 Зал славы'), hallPart.el),
    h('div', { class: 'card no-print' }, createCommentForm({ call: ctx.call, ref: { group, discipline: d, lesson: n }, alive: ctx.alive })), // B6: комментарий группе -> «Итог пары» на доске
    h('details', { class: 'live-hall', ontoggle: e => { if (e.target.open) teamsPart.open(); else teamsPart.close(); } }, h('summary', {}, '👥 Команды'), teamsPart.el),
    list,
    h('p', { class: 'hint live-note' }, 'Сигналы — повод присмотреться, не доказательство: студент мог уйти по делу или потерять связь.'));

  let students = [];
  let lastData = null;
  const absent = createAbsentCtl({ call: ctx.call, ref: { group, discipline: d, lesson: n }, onChange: (id, f) => { if (lastData) apply(withAbsent(lastData, id, f), Date.now()); }, onError: t => { status.textContent = t; } });
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
      const abs = absent.rowButton(s.id);
      const el = h('li', { class: 'live-row' },
        h('img', { class: ('live-avatar ' + frameClass(s.frame)).trim(), src: avatarUrl(s.avatar || defaultAvatar(s.id)), alt: '', width: '56', height: '56' }),
        h('div', { class: 'live-body' }, name, h('div', { class: 'live-line' }, stage, score), state, sig), abs.el);
      list.append(el);
      rows.set(s.id, { el, stage, score, state, sig, abs });
    });
  }

  function paint(clientNow) {
    const now = clientNow + offset;
    students.forEach(s => {
      const r = rows.get(s.id);
      if (!r) return;
      const st = shownState(s, now);
      r.el.className = `live-row live-${st}`;
      r.stage.textContent = stageLabel(s.stage);
      r.score.textContent = st === 'none' ? '' : `${s.score == null ? 0 : s.score}/${s.max == null ? 0 : s.max}`;
      r.state.textContent = st === 'away' ? `нет на месте ${fmtClock(awayElapsed(s.awaySince, offset, clientNow))}` : STATE_TEXT[st];
      r.sig.textContent = [awaySignal(s), ...liveSignals(s)].filter(Boolean).join(' · ');
      r.abs.set(s.absent);
      if (s.absent) { r.el.className = 'live-row live-absent'; r.state.textContent = 'нет на паре'; r.score.textContent = ''; }
    });
  }

  function apply(data, clientNow) {
    offset = clockOffset(data.now, clientNow);
    lastData = data;
    students = Array.isArray(data.students) ? data.students : [];
    const key = students.map(s => s.id).join('|');
    if (key !== ids) { ids = key; build(); }
    if (!students.length) list.replaceChildren(h('li', {}, emptyBox('В группе нет активных студентов.')));
    status.textContent = '';
    const act = presentOf(students); // C1: без отсутствующих
    const p = countPresent(act, data.now);
    const dn = countDone(act);
    goalEl.textContent = goalLine(dn.x, dn.y, data.goal);
    countEl.textContent = `На занятии ${p.x} из ${p.y} · сдали ${dn.x} из ${dn.y}`;
    defensePart.update(data.defense || null);
    phaseCtl.update(data.phase, data.now, clientNow);
    paint(clientNow);
    live.update(data);
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
  startTicker(ctx.alive, () => { paint(Date.now()); phaseCtl.tick(Date.now()); });
}
