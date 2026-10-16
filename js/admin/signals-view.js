// Сигналы B3 для преподавателя: «Мой экран» и карточка работы. Чистые функции (без DOM). На доске не используются никогда.
import { fmtClock } from './board-model.js';

export const SIGNALS_NOTE = 'Сигналы — повод присмотреться, не доказательство: студент мог вставить свой же код или уйти по делу.';
export const SUSPICIOUS_TEXT = '⚡ подозрительно быстро';

const isNum = v => typeof v === 'number' && isFinite(v);
const plural = (n, one, few, many) => {
  const m = Math.abs(n) % 100, k = m % 10;
  return m > 10 && m < 20 ? many : k === 1 ? one : k >= 2 && k <= 4 ? few : many;
};

export const pasteText = n => `📋 вставлено ${n} ${plural(n, 'строка', 'строки', 'строк')}`;
export const awayText = a => `уходил ${a.count} ${plural(a.count, 'раз', 'раза', 'раз')}, всего ${fmtClock(a.ms)}`;

// «Мой экран»: сигналы студента из boardState (names: true), кроме «уходил…» (его показывает awaySignal доски).
export function liveSignals(s) {
  const out = [];
  if (s && isNum(s.paste) && s.paste > 0) out.push(pasteText(s.paste));
  if (s && s.suspicious === true) out.push(SUSPICIOUS_TEXT);
  return out;
}

// Карточка работы: строки сигналов сдачи (v4.signals) и флаг suspicious. labelOf(id) -> подпись задания для вставок.
export function workSignals(signals, suspicious, labelOf = id => id) {
  const out = [];
  const sig = signals && typeof signals === 'object' ? signals : null;
  if (sig && sig.paste && typeof sig.paste === 'object') {
    const ids = Object.keys(sig.paste).filter(id => isNum(sig.paste[id]) && sig.paste[id] > 0);
    const total = ids.reduce((s, id) => s + sig.paste[id], 0);
    if (total > 0) out.push(`${pasteText(total)}${ids.length > 1 || labelOf(ids[0]) !== ids[0] ? ` (${ids.map(id => `${labelOf(id)}: ${sig.paste[id]}`).join(', ')})` : ''}`);
  }
  if (sig && sig.away && isNum(sig.away.count) && sig.away.count > 0) out.push(awayText(sig.away));
  if (suspicious === true) out.push(`${SUSPICIOUS_TEXT}: идеальный автобалл быстрее 3 минут или больше 5 попыток за день`);
  return out;
}
