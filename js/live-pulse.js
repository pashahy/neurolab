// Пульс студента для «доски на занятии» (docs/superpowers/specs/2026-10-16-v4-board-queue-a.md): экран ПЗ формата v4 раз в 8 с
// (доска открыта) или 60 с отправляет серверу действие liveState: этап, баллы, «ушёл со страницы», «давно не трогал».
// Уход = только скрытие страницы (visibilitychange/pagehide); blur/focus не считаются; уход короче 3 с не засчитывается.
// Всё молча: офлайн и ошибки сервера на сдачу и баллы не влияют. Лежит отдельным модулем: сайт без версионирования файлов.
import { gradeLesson } from './grading.js';
import { baseTasks, advTasks } from './lesson-v4.js';
import { TASK_TYPES } from './tasks/registry.js';

const FAST_MS = 8000, SLOW_MS = 60000, EXTRA_GAP_MS = 2000, HIDE_GAP_MS = 1000, STAGE_GAP_MS = 1000, STAGE_WATCH_MS = 2000, ACT_THROTTLE_MS = 1000;
const MIN_AWAY_MS = 3000; // уход короче не засчитывается
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

// Накопительный учёт ухода со страницы этого ПЗ на устройстве: { count, ms, since? } в хранилище по ключу (try/catch: может не быть).
export function createAwayTracker(storage, key, now = Date.now) {
  let count = 0, ms = 0, since = null;
  try {
    const raw = storage && storage.getItem(key);
    const o = raw ? JSON.parse(raw) : null;
    if (o && typeof o === 'object') {
      count = clampInt(o.count, MAX_AWAY_COUNT); ms = clampInt(o.ms, MAX_AWAY_MS);
      // уход, начатый до выгрузки вкладки, не теряется: закроется при первом show() после загрузки
      if (typeof o.since === 'number' && Number.isFinite(o.since) && o.since > 0 && o.since <= now()) since = o.since;
    }
  } catch { /* хранилище недоступно или значение испорчено: начинаем с нуля */ }
  const save = () => { try { if (storage) storage.setItem(key, JSON.stringify(since === null ? { count, ms } : { count, ms, since })); } catch { /* не критично */ } };
  return {
    hide() { if (since === null) { since = now(); save(); } },
    // уход короче MIN_AWAY_MS (мигание: шторка, переключатель приложений) не считается ни в счётчик, ни во время
    show() {
      if (since === null) return;
      const dur = Math.max(0, now() - since);
      since = null;
      if (dur < MIN_AWAY_MS) { save(); return; }
      count = Math.min(MAX_AWAY_COUNT, count + 1);
      ms = Math.min(MAX_AWAY_MS, ms + dur);
      save();
    },
    snapshot() {
      const dur = since === null ? 0 : Math.min(MAX_AWAY_MS, Math.max(0, now() - since));
      const on = dur >= MIN_AWAY_MS; // идущий уход входит в итог, когда он уже дольше порога
      return { count: Math.min(MAX_AWAY_COUNT, count + (on ? 1 : 0)), ms: clampInt(ms + (on ? dur : 0), MAX_AWAY_MS) };
    },
  };
}

// Запускает пульс. getState() → { stage, score, max, pc }. active() — экран ещё на месте (иначе пульс сам останавливается).
// Возвращает stop(); у него есть kick() — отправить пульс сразу (после сдачи, когда этап стал 'done').
export function startLivePulse({
  api, d, n, getState, getStage = null, active = () => true, onState = null,
  doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null,
  now = Date.now, setTimer = (f, ms) => setTimeout(f, ms), clearTimer = id => clearTimeout(id),
  storage = (() => { try { return globalThis.localStorage; } catch { return null; } })(),
}) {
  const away = createAwayTracker(storage, `live:away2:${d}:${n}`, now);
  let stopped = false, board = false, lastStage = null;
  let lastSent = -Infinity, lastAct = now(), lastActMark = -Infinity;
  let mainTimer = null, extraTimer = null, watchTimer = null;

  let gone = false; // pagehide без последующего pageshow
  const isHidden = () => !!(doc && doc.hidden) || gone;

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
      lastStage = s.stage;
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

  // внеочередной пульс (уход/возврат/смена этапа): не чаще раза в gap мс; отложенный отправляется с состоянием на момент отправки
  function extra(gap) {
    if (!check()) return;
    const wait = gap - (now() - lastSent);
    if (wait <= 0) {
      if (extraTimer !== null) { clearTimer(extraTimer); extraTimer = null; }
      send();
      return;
    }
    if (extraTimer !== null) return;
    extraTimer = setTimer(() => { extraTimer = null; if (check()) send(); }, wait);
  }

  // Уход шлём сразу (без таймера: в фоне он может не сработать); порог MIN_AWAY_MS — только для счётчика (createAwayTracker),
  // а «нет на месте» на доске показывает не раньше, чем через MIN_AWAY_MS после awaySince. Возврат — не чаще раза в 2 с.
  function onVisibility() {
    if (isHidden()) { away.hide(); extra(HIDE_GAP_MS); } else { away.show(); extra(EXTRA_GAP_MS); }
  }
  const onPageHide = () => { gone = true; away.hide(); extra(HIDE_GAP_MS); };
  const onPageShow = () => { gone = false; onVisibility(); };
  // смена этапа (в т. ч. «сдал») — внеочередной пульс; проверка локальная и дешёвая (только этап, без баллов) раз в STAGE_WATCH_MS
  function watchStage() {
    watchTimer = null;
    if (!check()) return;
    try {
      const st = getStage ? getStage() : getState().stage;
      if (lastStage !== null && st !== lastStage) extra(STAGE_GAP_MS);
    } catch { /* состояние недоступно */ }
    if (!stopped) watchTimer = setTimer(watchStage, STAGE_WATCH_MS);
  }
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
    win.addEventListener('pagehide', onPageHide);
    win.addEventListener('pageshow', onPageShow);
    win.addEventListener('scroll', onAct, { capture: true, passive: true });
  }
  if (isHidden()) away.hide(); else away.show(); // уход, оставшийся от прошлой загрузки страницы, закрываем

  function stop() {
    if (stopped) return;
    stopped = true;
    if (mainTimer !== null) clearTimer(mainTimer);
    if (extraTimer !== null) clearTimer(extraTimer);
    if (watchTimer !== null) clearTimer(watchTimer);
    mainTimer = extraTimer = watchTimer = null;
    if (doc) {
      doc.removeEventListener('visibilitychange', onVisibility);
      for (const e of actDoc) doc.removeEventListener(e, onAct, true);
    }
    if (win) {
      win.removeEventListener('pagehide', onPageHide);
      win.removeEventListener('pageshow', onPageShow);
      win.removeEventListener('scroll', onAct, true);
    }
  }
  stop.kick = () => { if (check()) send(); };

  send();
  watchTimer = setTimer(watchStage, STAGE_WATCH_MS);
  return stop;
}
