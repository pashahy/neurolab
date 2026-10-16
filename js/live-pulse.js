// Пульс студента для «доски на занятии» (docs/superpowers/specs/2026-10-16-v4-board-queue-a.md): экран ПЗ формата v4 раз в 12 с
// (доска открыта) или 60 с отправляет серверу действие liveState: этап, баллы, «ушёл со страницы», «давно не трогал».
// Всё молча: офлайн и ошибки сервера на сдачу и баллы не влияют. Лежит отдельным модулем: сайт без версионирования файлов.
import { gradeLesson } from './grading.js';
import { baseTasks, advTasks } from './lesson-v4.js';
import { TASK_TYPES } from './tasks/registry.js';

const FAST_MS = 12000, SLOW_MS = 60000, EXTRA_GAP_MS = 5000, HIDE_GAP_MS = 1000, ACT_THROTTLE_MS = 1000;
const MAX_AWAY_COUNT = 1000, MAX_AWAY_MS = 86400000, MAX_IDLE_S = 86400, MAX_SCORE = 1000;

const clampInt = (v, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
};

// Этап для доски: вход/цель/разминка/лекция/выбор варианта → 'lecture'; инструктаж → 'safety'; практика, рефлексия и сдача →
// 'base', пока не проверены все базовые (не ⭐) автозадания, затем 'adv' (если в занятии есть ⭐). 'done' ставит вызывающий после сдачи.
export function stageOf(lesson, draft) {
  const st = draft && draft.stage;
  if (st === 'safety') return 'safety';
  if (st !== 'task' && st !== 'reflect' && st !== 'finish') return 'lecture';
  const locked = (draft && draft.locked) || {};
  const open = baseTasks(lesson, draft.variant).some(t => !TASK_TYPES[t.type].manual && !locked[t.id]);
  if (open || !advTasks(lesson, draft.variant).length) return 'base';
  return 'adv';
}

// Автобаллы проверенных заданий (draft.locked) и максимум авто текущего варианта; pc — выбран ПК-вариант.
export function scoreOf(lesson, draft) {
  const d = draft || {};
  const locked = d.locked || {};
  const g = gradeLesson(lesson, d.answers || {}, d.variant);
  const score = g.items.filter(i => !i.manual && locked[i.id]).reduce((s, i) => s + i.score, 0);
  return { score: clampInt(score, MAX_SCORE), max: clampInt(g.max, MAX_SCORE), pc: d.variant === 'pc' };
}

// Накопительный учёт ухода со страницы этого ПЗ на устройстве: { count, ms } в хранилище по ключу (try/catch: может не быть).
export function createAwayTracker(storage, key, now = Date.now) {
  let count = 0, ms = 0, since = null;
  try {
    const raw = storage && storage.getItem(key);
    const o = raw ? JSON.parse(raw) : null;
    if (o && typeof o === 'object') { count = clampInt(o.count, MAX_AWAY_COUNT); ms = clampInt(o.ms, MAX_AWAY_MS); }
  } catch { /* хранилище недоступно или значение испорчено: начинаем с нуля */ }
  const save = () => { try { if (storage) storage.setItem(key, JSON.stringify({ count, ms })); } catch { /* не критично */ } };
  return {
    hide() { if (since !== null) return; since = now(); count = Math.min(MAX_AWAY_COUNT, count + 1); save(); },
    show() { if (since === null) return; ms = Math.min(MAX_AWAY_MS, ms + Math.max(0, now() - since)); since = null; save(); },
    snapshot() { return { count, ms: clampInt(ms + (since === null ? 0 : Math.max(0, now() - since)), MAX_AWAY_MS) }; },
  };
}

// Запускает пульс. getState() → { stage, score, max, pc }. active() — экран ещё на месте (иначе пульс сам останавливается).
// Возвращает stop(); у него есть kick() — отправить пульс сразу (после сдачи, когда этап стал 'done').
export function startLivePulse({
  api, d, n, getState, active = () => true, onState = null,
  doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null,
  now = Date.now, setTimer = (f, ms) => setTimeout(f, ms), clearTimer = id => clearTimeout(id),
  storage = (() => { try { return globalThis.localStorage; } catch { return null; } })(),
}) {
  const away = createAwayTracker(storage, `live:away:${d}:${n}`, now);
  let stopped = false, board = false, blurred = false;
  let lastSent = -Infinity, lastAct = now(), lastActMark = -Infinity;
  let mainTimer = null, extraTimer = null;

  const isHidden = () => !!(doc && doc.hidden) || blurred;

  function send() {
    lastSent = now();
    let body;
    try {
      const s = getState();
      body = {
        d, n, stage: s.stage, hidden: isHidden(),
        idle: clampInt((now() - lastAct) / 1000, MAX_IDLE_S),
        score: clampInt(s.score, MAX_SCORE), max: clampInt(s.max, MAX_SCORE), pc: !!s.pc, away: away.snapshot(),
      };
      if (s.paste !== undefined) body.paste = clampInt(s.paste, 100000); // B3: сумма строк вставок (только «Моему экрану»)
      body.score = Math.min(body.score, body.max); // контракт сервера: score <= max (best из прогресса может быть больше max другого варианта)
    } catch { schedule(); return; }
    Promise.resolve().then(() => api.call('liveState', body)).then(
      res => {
        board = !!(res && res.board);
        if (onState) { try { onState(res); } catch { /* панель вопроса не должна ломать пульс */ } } // B4: item/answered для панели «Вопрос с доски»
      },
      () => { /* офлайн или сервер недоступен: молча */ },
    ).then(() => { if (!stopped) schedule(); });
    schedule();
  }

  function schedule() {
    if (stopped) return;
    if (mainTimer !== null) clearTimer(mainTimer);
    const wait = Math.max(0, (board ? FAST_MS : SLOW_MS) - (now() - lastSent));
    mainTimer = setTimer(tick, wait);
  }

  function tick() {
    mainTimer = null;
    if (!check()) return;
    send();
  }

  // экран сменился: снимаем таймеры и слушатели
  function check() {
    if (stopped) return false;
    let alive = true;
    try { alive = !!active(); } catch { alive = false; }
    if (!alive) { stop(); return false; }
    return true;
  }

  // внеочередной пульс (уход/возврат): не чаще раза в 5 с; отложенный отправляется с состоянием на момент отправки
  function extra() {
    if (!check()) return;
    // уход шлём сразу (отложенный таймер в фоне на телефоне может не сработать); 1 с — склеить blur и visibilitychange
    const wait = (isHidden() ? HIDE_GAP_MS : EXTRA_GAP_MS) - (now() - lastSent);
    if (wait <= 0) {
      if (extraTimer !== null) { clearTimer(extraTimer); extraTimer = null; }
      send();
      return;
    }
    if (extraTimer !== null) return;
    extraTimer = setTimer(() => { extraTimer = null; if (check()) send(); }, wait);
  }

  function onVisibility() {
    if (isHidden()) away.hide(); else away.show();
    extra();
  }
  const onBlur = () => { blurred = true; onVisibility(); };
  const onFocus = () => { blurred = false; onVisibility(); };
  const onAct = () => {
    const t = now();
    if (t - lastActMark >= ACT_THROTTLE_MS) { lastActMark = t; lastAct = t; }
  };

  const actDoc = ['pointerdown', 'keydown', 'input'];
  if (doc) {
    doc.addEventListener('visibilitychange', onVisibility);
    for (const e of actDoc) doc.addEventListener(e, onAct, { capture: true, passive: true });
  }
  if (win) {
    win.addEventListener('blur', onBlur);
    win.addEventListener('focus', onFocus);
    win.addEventListener('scroll', onAct, { capture: true, passive: true });
  }
  if (isHidden()) away.hide();

  function stop() {
    if (stopped) return;
    stopped = true;
    if (mainTimer !== null) clearTimer(mainTimer);
    if (extraTimer !== null) clearTimer(extraTimer);
    mainTimer = extraTimer = null;
    if (doc) {
      doc.removeEventListener('visibilitychange', onVisibility);
      for (const e of actDoc) doc.removeEventListener(e, onAct, true);
    }
    if (win) {
      win.removeEventListener('blur', onBlur);
      win.removeEventListener('focus', onFocus);
      win.removeEventListener('scroll', onAct, true);
    }
  }
  stop.kick = () => { if (check()) send(); };

  send();
  return stop;
}
