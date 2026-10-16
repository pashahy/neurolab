// B5: ход занятия — этапы с таймером. Чистая логика (без DOM), общая для доски, «Моего экрана» и плашки студента. Времена в мс.
export const PHASES = ['intro', 'lecture', 'practice', 'outro'];
export const PHASE_LABEL = { intro: 'Вход', lecture: 'Лекция', practice: 'Практика', outro: 'Итоги' };
export const PHASE_DEFAULT_MIN = { intro: 5, lecture: 20, practice: 60, outro: 5 };
export const PHASE_MAX_MIN = 180;

const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);

// Минуты этапов занятия: lesson.minutes { intro, theory, practice, outro } → { intro, lecture, practice, outro }; нет — по умолчанию.
export function lessonPhaseMinutes(lesson) {
  const m = lesson && lesson.minutes && typeof lesson.minutes === 'object' ? lesson.minutes : {};
  const pick = (v, def) => (typeof v === 'number' && isFinite(v) && v >= 1 && v <= PHASE_MAX_MIN ? Math.round(v) : def);
  return {
    intro: pick(m.intro, PHASE_DEFAULT_MIN.intro), lecture: pick(m.theory, PHASE_DEFAULT_MIN.lecture),
    practice: pick(m.practice, PHASE_DEFAULT_MIN.practice), outro: pick(m.outro, PHASE_DEFAULT_MIN.outro),
  };
}

// Соседний этап: dir +1 / -1. Из «Итогов» вперёд и из «Входа» назад — null (занятие не идёт). Из null вперёд — «Вход», назад — null.
export function stepPhase(cur, dir) {
  const i = PHASES.indexOf(cur);
  if (i < 0) return dir > 0 ? PHASES[0] : null;
  const j = i + (dir > 0 ? 1 : -1);
  return j >= 0 && j < PHASES.length ? PHASES[j] : null;
}

// Проверка записи этапа с сервера: { phase, startedAt, pausedAt?, pausedMs?, minutes } или null.
export function normPhase(p) {
  if (!p || typeof p !== 'object' || PHASES.indexOf(p.phase) < 0 || typeof p.startedAt !== 'number') return null;
  const minutes = typeof p.minutes === 'number' && p.minutes >= 1 ? p.minutes : PHASE_DEFAULT_MIN[p.phase];
  return { phase: p.phase, startedAt: p.startedAt, pausedAt: typeof p.pausedAt === 'number' ? p.pausedAt : null, pausedMs: Math.max(0, num(p.pausedMs)), minutes };
}

// Разница серверных и локальных часов: серверное «сейчас» = локальное + offset
export const phaseOffset = (serverNow, localNow) => (typeof serverNow === 'number' && isFinite(serverNow) ? serverNow - localNow : 0);

// Сколько прошло на этапе (без пауз), мс; serverNow — серверное время (локальное + offset)
export function phaseElapsedMs(p, serverNow) {
  const q = normPhase(p);
  if (!q) return 0;
  const end = q.pausedAt != null ? q.pausedAt : serverNow;
  return Math.max(0, end - q.startedAt - q.pausedMs);
}

// Осталось до конца этапа, мс; после нуля — отрицательное (перебор)
export function phaseRemainingMs(p, serverNow) {
  const q = normPhase(p);
  return q ? q.minutes * 60000 - phaseElapsedMs(q, serverNow) : 0;
}

// «23:05» до нуля, затем «+1:05» (перебор не останавливается)
export function timerText(remainingMs) {
  const r = num(remainingMs);
  const s = r >= 0 ? Math.ceil(r / 1000) : Math.floor(-r / 1000);
  const mm = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `${r < 0 ? '+' : ''}${mm}:${ss}`;
}

export const PHASE_STALE_MS = 30 * 60000; // этап просрочен больше чем на 30 мин — плашку не показываем

// Строка плашки студента: «Группа сейчас: Практика · осталось 23 мин»; null — этап не идёт
export function studentPhaseText(p, serverNow, short = false) {
  const q = normPhase(p);
  if (!q) return null;
  const head = short ? PHASE_LABEL[q.phase] : `Группа сейчас: ${PHASE_LABEL[q.phase]}`;
  if (q.pausedAt != null) return `${head} · пауза`;
  const r = phaseRemainingMs(q, serverNow);
  if (r < -PHASE_STALE_MS) return null;
  if (r <= 0) return `${head} · время вышло`;
  return `${head} · ${short ? 'ещё' : 'осталось'} ${Math.ceil(r / 60000)} мин`;
}
