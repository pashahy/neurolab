import { h } from '../util/dom.js';
import { loadCourse, flatLessons } from '../content.js';
import { avatarUrl, defaultAvatar } from '../avatars.js';
import { errText } from '../ui/login.js';
import { DISC, select, hashQuery } from './common.js';
import { tileState, stageLabel, fmtClock, clockOffset, awayElapsed, countPresent, countDone, gridCols } from './board-model.js';

export const POLL_MS = 12000;
export const SHORT_LINK = 'pashahy.github.io/neurolab/#/d/';

// Опрос раз в POLL_MS, пока вкладка видима и маршрут жив; ошибки идут в onError, опрос продолжается.
export function startPoll({ alive, load, apply, onError }) {
  let timer = null;
  let running = false;
  function stop() { clearTimeout(timer); document.removeEventListener('visibilitychange', onVis); }
  function schedule() { clearTimeout(timer); if (alive()) timer = setTimeout(run, POLL_MS); else stop(); }
  async function run() {
    clearTimeout(timer);
    if (!alive()) { stop(); return; }
    if (document.hidden) { schedule(); return; }
    if (running) return;
    running = true;
    try {
      const data = await load();
      if (alive()) apply(data, Date.now());
    } catch (e) {
      if (alive() && onError) onError(e);
    }
    running = false;
    schedule();
  }
  function onVis() { if (!document.hidden && alive()) run(); }
  document.addEventListener('visibilitychange', onVis);
  run();
  return stop;
}

// Тик раз в секунду, пока маршрут жив (fn вызывается и в последний раз после смерти маршрута: onDead)
export function startTicker(alive, fn, onDead) {
  const id = setInterval(() => {
    if (alive()) { if (!document.hidden) fn(); return; }
    clearInterval(id);
    if (onDead) onDead();
  }, 1000);
  return () => clearInterval(id);
}

function errBox(ctx, e) {
  return h('div', { class: 'board-msg' }, errText(e), h('button', { class: 'btn primary', type: 'button', onclick: () => ctx.rerender() }, 'Повторить'));
}

let boardSeq = 0;

// #/admin/board/<d>/<n>?group=…: полноэкранная тёмная доска для проектора, без имён
export async function renderBoard(ctx) {
  const parts = ctx.parts || [];
  const d = DISC.some(x => x.id === parts[1]) ? parts[1] : '';
  const n = Number(parts[2]);
  const root = ctx.app.root;
  if (!d || !Number.isInteger(n) || n < 1) { ctx.go('/admin/summary'); return; }

  const me = String(++boardSeq);
  document.body.dataset.boardId = me;
  document.body.classList.add('board-mode');
  const alive = () => ctx.alive() && document.body.dataset.boardId === me;
  const cleanup = () => {
    window.removeEventListener('hashchange', cleanup);
    if (document.body.dataset.boardId === me) { document.body.classList.remove('board-mode'); delete document.body.dataset.boardId; }
  };
  window.addEventListener('hashchange', cleanup);

  root.replaceChildren(h('p', { class: 'board-msg' }, 'Загружаем доску…'));
  let groups;
  let title = '';
  try {
    groups = await ctx.groups();
    try {
      const meta = flatLessons(await loadCourse(d)).find(l => l.n === n);
      title = meta ? meta.title : '';
    } catch (e) { /* название необязательно */ }
  } catch (e) {
    if (!ctx.alive() || (e && e.handled)) { cleanup(); return; }
    root.replaceChildren(errBox(ctx, e));
    return;
  }
  if (!alive()) return;
  if (!groups.length) { root.replaceChildren(h('p', { class: 'board-msg' }, 'Групп пока нет.')); return; }
  const qg = ctx.query.get('group');
  const group = groups.indexOf(qg) >= 0 ? qg : groups[0];

  const countEl = h('span', { class: 'board-count' });
  const status = h('span', { class: 'board-status', role: 'status' });
  const link = `${SHORT_LINK}${d}/${n}`;
  const head = h('header', { class: 'board-head' },
    h('h1', { class: 'board-title' }, `ПЗ №${n}`, title ? h('span', {}, ` «${title}»`) : ''),
    h('div', { class: 'board-meta' },
      h('label', { class: 'board-group' }, h('span', {}, 'Группа'),
        select(groups.map(g => ({ value: g, label: g })), group, v => ctx.go(hashQuery(`/admin/board/${d}/${n}`, { group: v })), { 'aria-label': 'Группа' })),
      h('a', { class: 'board-link', href: `https://${link}`, target: '_blank', rel: 'noopener' }, link),
      countEl,
      h('a', { class: 'board-live', href: `#${hashQuery(`/admin/live/${d}/${n}`, { group })}` }, 'Мой экран'),
      status));
  const grid = h('div', { class: 'board-grid', role: 'list' });
  const doneText = h('span', { class: 'board-done-text' });
  const doneFill = h('span', { class: 'board-done-fill' });
  const foot = h('footer', { class: 'board-foot' }, doneText, h('div', { class: 'board-done-bar', 'aria-hidden': 'true' }, doneFill));
  const boardEl = h('div', { class: 'board' }, head, grid, foot);
  root.replaceChildren(boardEl);

  let students = [];
  let offset = 0;
  const tiles = new Map(); // id -> { el, stage, score, timer, badge, state }
  let ids = '';

  function build(list) {
    grid.replaceChildren();
    tiles.clear();
    list.forEach(s => {
      const img = h('img', { class: 'tile-avatar', src: avatarUrl(s.avatar || defaultAvatar(s.id)), alt: '', width: '256', height: '256', draggable: 'false' });
      const stage = h('div', { class: 'tile-stage' });
      const score = h('div', { class: 'tile-score' });
      const timer = h('div', { class: 'tile-timer' });
      const badge = h('div', { class: 'tile-badge', 'aria-hidden': 'true' });
      const el = h('div', { class: 'tile', role: 'listitem' }, badge, h('div', { class: 'tile-pic' }, img), stage, score, timer);
      grid.append(el);
      tiles.set(s.id, { el, stage, score, timer, badge, state: '' });
    });
    const cols = gridCols(list.length);
    grid.style.setProperty('--cols', String(cols));
    grid.style.setProperty('--rows', String(Math.max(1, Math.ceil(list.length / cols))));
  }

  function paint(clientNow) {
    const now = clientNow + offset;
    students.forEach(s => {
      const t = tiles.get(s.id);
      if (!t) return;
      const state = tileState(s, now);
      if (t.state !== state) {
        const firstPaint = t.state === '';
        const justDone = state === 'done' && !firstPaint;
        t.el.className = `tile tile-${state}${justDone ? ' tile-just' : ''}`;
        if (justDone) setTimeout(() => t.el.classList.remove('tile-just'), 1800);
        t.state = state;
        t.badge.textContent = state === 'idle' ? '💤' : state === 'done' ? '✓' : '';
      }
      t.stage.textContent = stageLabel(s.stage);
      t.score.textContent = state === 'none' ? '' : `${s.score == null ? 0 : s.score}/${s.max == null ? 0 : s.max}`;
      t.timer.textContent = state === 'away' ? `нет на месте ${fmtClock(awayElapsed(s.awaySince, offset, clientNow))}` : '';
    });
  }

  function apply(data, clientNow) {
    if (boardEl.parentNode !== root) root.replaceChildren(boardEl); // после ошибки первого опроса опрос продолжается: вернуть доску
    offset = clockOffset(data.now, clientNow);
    students = Array.isArray(data.students) ? data.students : [];
    const key = students.map(s => s.id).join('|');
    if (key !== ids) { ids = key; build(students); }
    status.textContent = '';
    const p = countPresent(students, data.now);
    const dn = countDone(students);
    countEl.textContent = `На занятии ${p.x} из ${p.y}`;
    doneText.textContent = `Сдали ${dn.x} из ${dn.y}`;
    doneFill.style.width = `${dn.y ? Math.round(dn.x / dn.y * 100) : 0}%`;
    paint(clientNow);
  }

  let first = true;
  startPoll({
    alive,
    load: () => ctx.call('boardState', { group, discipline: d, lesson: n }),
    apply: (data, now) => { first = false; apply(data, now); },
    onError: e => {
      if (e && e.handled) return;
      if (first) { root.replaceChildren(errBox(ctx, e)); return; }
      status.textContent = 'нет связи';
    },
  });
  startTicker(alive, () => paint(Date.now()), cleanup);
}
