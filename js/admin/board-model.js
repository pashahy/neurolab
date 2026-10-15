// Модель плиток доски: чистые функции (без DOM). Времена в мс; now — серверные.
export const IDLE_MS = 180000; // видима страница, но нет действий 3 мин -> 💤
export const PRESENT_MS = 3 * 3600 * 1000; // «на занятии»: пульс за последние 3 часа

const STAGES = { lecture: 'лекция', safety: 'инструктаж', base: 'база', adv: '⭐', done: 'сдал' };
export const stageLabel = stage => (Object.prototype.hasOwnProperty.call(STAGES, stage) ? STAGES[stage] : 'не зашёл');

const isNum = v => typeof v === 'number' && isFinite(v);

// 'none' | 'done' | 'away' | 'idle' | 'active'
export function tileState(s, now) {
  if (!s || !s.stage || s.stage === 'none') return 'none';
  if (s.stage === 'done') return 'done';
  if (s.hidden && !s.pc && isNum(s.awaySince)) return 'away';
  if (!s.hidden && isNum(s.lastAct) && now - s.lastAct >= IDLE_MS) return 'idle';
  return 'active';
}

export function fmtClock(ms) {
  const t = isNum(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

// Поправка часов: прибавьте к Date.now() клиента, чтобы получить время сервера.
export const clockOffset = (serverNow, clientNow) => serverNow - clientNow;

// Сколько мс студент «нет на месте» (awaySince — время сервера)
export function awayElapsed(awaySince, offset, clientNow) {
  if (!isNum(awaySince)) return 0;
  return Math.max(0, clientNow + offset - awaySince);
}

export function countPresent(list, now) {
  const a = Array.isArray(list) ? list : [];
  return { x: a.filter(s => s && isNum(s.seen) && now - s.seen <= PRESENT_MS).length, y: a.length };
}

export function countDone(list) {
  const a = Array.isArray(list) ? list : [];
  return { x: a.filter(s => s && s.stage === 'done').length, y: a.length };
}

// число столбцов сетки: 16:9-доска, до 30 плиток без прокрутки (не более 5 рядов)
export function gridCols(n) {
  if (!(n > 1)) return 1;
  return Math.max(1, Math.min(8, Math.ceil(Math.sqrt(n * 1.6))));
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// «уходил 3 раза, всего 1:05»; пусто, если не уходил
export function awaySignal(s) {
  const c = s && isNum(s.awayCount) ? s.awayCount : 0;
  if (c <= 0) return '';
  return `уходил ${c} ${plural(c, 'раз', 'раза', 'раз')}, всего ${fmtClock(s.awayMs)}`;
}
