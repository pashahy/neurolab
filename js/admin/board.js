import { h } from '../util/dom.js';
import { loadCourse, flatLessons, loadLesson } from '../content.js';
import { md } from '../util/text.js';
import { avatarUrl, defaultAvatar } from '../avatars.js';
import { frameClass } from '../sandbox/cosmetics.js';
import { errText } from '../ui/login.js';
import { DISC, select, hashQuery } from './common.js';
import { GOAL_BONUS, goalShouldCall, goalBarText, goalMarkPct } from './board-goal.js';
import { defenseBody, defenseExcludeAdd, defenseTaskInfo, defenseTaskTitle, defenseAnswerView } from './board-defense.js';
import { createIaView, createIaSwitch, boardMode, nextPref, isStaleReply } from './board-ia-view.js';
import { hallOverlay } from './board-hall.js';
import { phaseControl } from './board-phase.js';
import { createOutroPanel } from './board-outro.js';
import { teamsOverlay } from './board-teams.js';
import { shownState } from './board-away.js';
import { createAbsentCtl, presentOf, withAbsent } from './board-absent.js';
import { stageLabel, fmtClock, clockOffset, awayElapsed, countPresent, countDone, gridCols } from './board-model.js';

export const POLL_MS = 5000;
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
  const defenseBtn = h('button', { class: 'board-defense-btn', type: 'button' }, '🎲 Защита');
  const hallBtn = h('button', { class: 'board-defense-btn board-hall-btn', type: 'button' }, '🏆 Зал славы');
  const teamsBtn = h('button', { class: 'board-defense-btn board-hall-btn', type: 'button' }, '👥 Команды');
  const status = h('span', { class: 'board-status', role: 'status' });
  const link = `${SHORT_LINK}${d}/${n}`;
  const head = h('header', { class: 'board-head' },
    h('h1', { class: 'board-title' }, `ПЗ №${n}`, title ? h('span', {}, ` «${title}»`) : ''),
    h('div', { class: 'board-meta' },
      h('label', { class: 'board-group' }, h('span', {}, 'Группа'),
        select(groups.map(g => ({ value: g, label: g })), group, v => ctx.go(hashQuery(`/admin/board/${d}/${n}`, { group: v })), { 'aria-label': 'Группа' })),
      h('a', { class: 'board-link', href: `https://${link}`, target: '_blank', rel: 'noopener' }, link),
      countEl,
      defenseBtn,
      hallBtn,
      h('button', { class: 'board-ia', type: 'button', onclick: () => setOutro(true) }, '🏁 Итог пары'),
      teamsBtn,
      h('a', { class: 'board-live', href: `#${hashQuery(`/admin/live/${d}/${n}`, { group })}` }, 'Мой экран'),
      status));
  const phaseCtl = phaseControl(ctx, { group, d, n, alive });
  head.append(phaseCtl.el);
  const grid = h('div', { class: 'board-grid', role: 'list' });
  const doneText = h('span', { class: 'board-done-text' });
  const doneFill = h('span', { class: 'board-done-fill' });
  const doneMark = h('span', { class: 'board-done-mark' });
  const foot = h('footer', { class: 'board-foot' }, doneText, h('div', { class: 'board-done-bar', 'aria-hidden': 'true' }, doneFill, doneMark));
  const celebrate = h('div', { class: 'board-goal-pop', role: 'status', hidden: true }, `🎉 Цель группы достигнута! +${GOAL_BONUS} к рейтингу каждому сдавшему`);
  // C2: интерактив активен — доска сама показывает вопрос и результаты (управление — на «Моём экране»)
  const live = createIaView({ call: ctx.call, ref: { group, discipline: d, lesson: n }, onAct: () => { iaActAt = Date.now(); }, onStop: () => { iaItem = null; lastStarted = null; iaPref = 'question'; syncPane(); } });
  const iaSwitch = createIaSwitch(m => { iaPref = m; syncPane(); });
  head.insertBefore(iaSwitch.el, head.querySelector('.board-meta').nextSibling);
  const livePane = h('div', { class: 'board-ia-pane', hidden: true }, live.el);
  let iaActAt = 0, lastStarted = null, iaPref = 'question', iaItem = null;
  // B6: «Итог пары» — вместо сетки; обновляется раз в 60 с, пока открыт
  const outro = createOutroPanel({ call: ctx.call, ref: { group, discipline: d, lesson: n }, alive: () => alive() });
  const outroPane = h('div', { class: 'board-ia-pane', hidden: true }, outro.el);
  function setOutro(open) { outroPane.hidden = !open; livePane.hidden = true; grid.hidden = open; if (open) outro.open(); else outro.close(); }
  function syncPane() {
    const q = boardMode(iaItem, iaPref) === 'question';
    outro.close(); outroPane.hidden = true; livePane.hidden = !q; grid.hidden = q;
    iaSwitch.update(iaItem, boardMode(iaItem, iaPref));
  }
  outro.onToTiles(() => { iaPref = 'tiles'; syncPane(); });
  let lastData = null;
  const absent = createAbsentCtl({ call: ctx.call, ref: { group, discipline: d, lesson: n }, onChange: (id, f) => { if (lastData) apply(withAbsent(lastData, id, f), Date.now()); }, onError: t => { status.textContent = t; } });
  const boardEl = h('div', { class: 'board' }, head, grid, livePane, outroPane, foot, celebrate);
  root.replaceChildren(boardEl);
  foot.prepend(absent.strip.el); // C1: полоса «Отсутствуют: N»
  setupDefense();
  hallOverlay(ctx, { group, alive, host: boardEl, button: hallBtn }); // B7: «Зал славы»
  teamsOverlay(ctx, { group, d, n, alive, host: boardEl, button: teamsBtn }); // B8: «Команды» («Открытое занятие»)

  let students = [];
  let offset = 0;
  const tiles = new Map(); // id -> { el, stage, score, timer, badge, state }
  let ids = '';
  const goal = { reached: false, seen: false, lastAt: null, lastDone: null, busy: false };

  function showGoal() {
    celebrate.hidden = false;
    setTimeout(() => { celebrate.hidden = true; }, 7000);
  }

  // Цель группы: сервер проверяет «Ответы» и начисляет бонус; по пульсам — только повод вызвать
  function checkGoal(dn, clientNow) {
    const call = { done: dn.x, active: dn.y, reached: goal.reached, lastAt: goal.lastAt, lastDone: goal.lastDone, now: clientNow };
    if (goal.busy || !goalShouldCall(call)) return;
    goal.busy = true;
    goal.lastAt = clientNow;
    goal.lastDone = dn.x;
    ctx.call('boardGoal', { group, discipline: d, lesson: n }).then(r => {
      if (!alive() || !r || r.ok === false) return;
      if (r.reached && !goal.reached) { goal.reached = true; showGoal(); }
    }, () => { /* повтор через 30 с при следующем опросе */ }).then(() => { goal.busy = false; });
  }

  // 🎲 «Защита»: случайный сдавший студент (аватар, без имени), условие задания и его ответ
  function setupDefense() {
    let lesson = null;
    loadLesson(d, n).then(l => { lesson = l; }, () => { /* без файла занятия показываем только ответ */ });
    let done = [];
    let busy = false;
    const pic = h('img', { class: 'defense-avatar', alt: '', width: '256', height: '256', draggable: 'false' });
    const task = h('div', { class: 'defense-task-title' });
    const text = h('div', { class: 'defense-text' });
    const answerLabel = h('div', { class: 'defense-answer-label' }, 'Ответ студента');
    const answer = h('pre', { class: 'defense-answer' });
    const note = h('p', { class: 'defense-note', role: 'status' });
    const again = h('button', { class: 'defense-btn primary', type: 'button' }, 'Ещё 🎲');
    const close = h('button', { class: 'defense-btn', type: 'button' }, 'Закрыть');
    const box = h('div', { class: 'defense-box', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Защита' },
      h('div', { class: 'defense-main' }, pic, h('div', { class: 'defense-body' }, task, text, answerLabel, answer)),
      note, h('div', { class: 'defense-actions' }, again, close));
    const overlay = h('div', { class: 'defense-overlay', hidden: true }, box);
    boardEl.append(overlay);
    function show(def) {
      const empty = !def;
      pic.hidden = empty;
      task.hidden = text.hidden = answerLabel.hidden = answer.hidden = empty;
      note.textContent = empty ? 'Пока никто не сдал: защищать некого.' : '';
      if (empty) return;
      pic.src = avatarUrl(def.avatar || defaultAvatar(def.studentId || ''));
      pic.className = ('defense-avatar ' + frameClass(def.frame)).trim();
      const info = defenseTaskInfo(lesson, def.taskId);
      task.textContent = defenseTaskTitle(info, def.taskId);
      text.replaceChildren(...(info && info.text ? [h('div', { html: md(info.text) })] : []));
      text.hidden = !(info && info.text);
      answer.textContent = defenseAnswerView(lesson, def.taskId, def.raw, def.answer).text;
    }
    async function roll() {
      if (busy) return;
      busy = true;
      again.disabled = defenseBtn.disabled = true;
      note.textContent = 'Выбираем…';
      try {
        const r = await ctx.call('boardDefense', defenseBody(group, d, n, done));
        if (!alive()) return;
        const def = r && r.defense ? r.defense : null;
        if (def) done = defenseExcludeAdd(r.restarted ? [] : done, def.studentId);
        overlay.hidden = false;
        show(def);
        close.focus();
      } catch (e) {
        if (!alive()) return;
        overlay.hidden = false;
        show(null);
        note.textContent = e && e.handled ? '' : 'Не получилось выбрать: ' + errText(e);
      } finally {
        busy = false;
        again.disabled = defenseBtn.disabled = false;
      }
    }
    defenseBtn.addEventListener('click', roll);
    again.addEventListener('click', roll);
    close.addEventListener('click', () => { overlay.hidden = true; defenseBtn.focus(); });
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') close.click(); });
  }

  function build(list) {
    grid.replaceChildren();
    tiles.clear();
    list.forEach(s => {
      const img = h('img', { class: ('tile-avatar ' + frameClass(s.frame)).trim(), src: avatarUrl(s.avatar || defaultAvatar(s.id)), alt: '', width: '256', height: '256', draggable: 'false' });
      const stage = h('div', { class: 'tile-stage' });
      const score = h('div', { class: 'tile-score' });
      const timer = h('div', { class: 'tile-timer' });
      const badge = h('div', { class: 'tile-badge', 'aria-hidden': 'true' });
      const el = h('div', { class: 'tile', role: 'listitem' }, badge, h('div', { class: 'tile-pic' }, img), s.title ? h('div', { class: 'tile-title' }, String(s.title)) : null, stage, score, timer, absent.tileButton(s.id));
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
      const state = shownState(s, now);
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
    lastData = data;
    const all = Array.isArray(data.students) ? data.students : [];
    students = presentOf(all); // C1: отсутствующие — в полосе внизу, не в плитках и не в счёте
    absent.strip.update(all);
    const key = students.map(s => s.id).join('|');
    if (key !== ids) { ids = key; build(students); }
    status.textContent = '';
    const p = countPresent(students, data.now);
    const dn = countDone(students);
    countEl.textContent = `На занятии ${p.x} из ${p.y}`;
    doneText.textContent = goalBarText(dn.x, dn.y);
    doneFill.style.width = `${dn.y ? Math.round(dn.x / dn.y * 100) : 0}%`;
    doneMark.style.left = `${goalMarkPct(dn.y)}%`;
    // достижение уже известно серверу (перезагрузка доски) — без анимации
    if (!goal.seen) { goal.seen = true; if (data.goal && data.goal.reached) goal.reached = true; }
    else if (data.goal && data.goal.reached && !goal.reached) { goal.reached = true; showGoal(); }
    boardEl.classList.toggle('goal-reached', goal.reached);
    checkGoal(dn, clientNow);
    phaseCtl.update(data.phase, data.now, clientNow);
    paint(clientNow);
    if (isStaleReply(reqAt, iaActAt)) return; // опрос ушёл до «Показать ответ»/«Завершить» — старый вопрос не возвращаем
    live.update(data);
    const it = data.item || null;
    const np = nextPref(lastStarted, it, iaPref);
    const changed = (!!it !== !!iaItem) || np.started !== lastStarted || np.pref !== iaPref;
    lastStarted = np.started; iaPref = np.pref; iaItem = it;
    if (changed) syncPane(); // запущен/завершён вопрос — доска сама переключается
  }

  let first = true, reqAt = 0;
  startPoll({
    alive,
    load: () => { const t0 = Date.now(); return ctx.call('boardState', { group, discipline: d, lesson: n }).then(r => { reqAt = t0; return r; }); },
    apply: (data, now) => { first = false; apply(data, now); },
    onError: e => {
      if (e && e.handled) return;
      if (first) { root.replaceChildren(errBox(ctx, e)); return; }
      status.textContent = 'нет связи';
    },
  });
  startTicker(alive, () => { paint(Date.now()); phaseCtl.tick(Date.now()); }, cleanup);
}
