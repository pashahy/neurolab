// Цель группы (B1): чистая логика порога для доски. Без DOM; времена в мс.
export const GOAL_SHARE = 0.8;
export const GOAL_BONUS = 10;
export const GOAL_CALL_MS = 30000; // boardGoal — не чаще раза в 30 с

const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);

// Сколько сдавших нужно: ceil(0.8 × активных)
export function goalNeed(active) {
  const a = Math.floor(num(active));
  return a > 0 ? Math.ceil(GOAL_SHARE * a - 1e-9) : 0;
}

export function goalReachedByPulse(done, active) {
  return num(active) > 0 && num(done) >= goalNeed(active);
}

export const GOAL_FALLBACK_MS = 180000; // пульсы порог не показывают — всё равно проверяем раз в 3 мин

// Пора ли вызывать boardGoal. st: { done, active (по пульсам), reached (по серверу), lastAt (мс последнего вызова),
// lastDone (сдавших по пульсам на момент прошлого вызова; null — вызовов ещё не было), now }.
// Порог по пульсам: первый раз — сразу, после достижения — когда сдавших по пульсам стало больше, чем при прошлом вызове.
// Без порога по пульсам (старый клиент студента) — раз в GOAL_FALLBACK_MS.
export function goalShouldCall({ done, active, reached, lastAt, lastDone, now }) {
  const since = lastAt == null ? Infinity : num(now) - num(lastAt);
  if (goalReachedByPulse(done, active)) {
    if (since < GOAL_CALL_MS) return false;
    if (!reached) return true;
    return lastDone == null || num(done) > num(lastDone);
  }
  return since >= GOAL_FALLBACK_MS;
}

// Строка полосы внизу доски
export function goalBarText(done, active) {
  return `Сдали ${num(done)} из ${num(active)} · цель ${goalNeed(active)} (80 %)`;
}

// Положение маркера порога на полосе, %
export function goalMarkPct(active) {
  const a = num(active);
  return a > 0 ? Math.round(goalNeed(a) / a * 100) : 80;
}

// «Мой экран»: строка о цели
export function goalLine(done, active, goal) {
  const need = goalNeed(active);
  const base = `Цель: ${need} из ${num(active)} (80 %), сдали ${num(done)}`;
  if (goal && goal.reached) {
    const n = num(goal.n);
    return `${base}. Цель достигнута, бонус начислен ${n} студентам`;
  }
  return base;
}
