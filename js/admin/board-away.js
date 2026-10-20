// C1: «нет на месте» показываем не сразу, а когда студент скрыл страницу не меньше AWAY_SHOW_MS (короче — мигание).
// Пульс «ушёл» приходит сразу (сервер хранит время первого hidden-пульса как awaySince), порог — здесь, на показе.
import { tileState } from './board-model.js';

export const AWAY_SHOW_MS = 3000;

// Как tileState, но «away» только при now - awaySince >= AWAY_SHOW_MS (now — время сервера)
export function shownState(s, now) {
  const st = tileState(s, now);
  if (st === 'away' && now - s.awaySince < AWAY_SHOW_MS) return tileState({ ...s, hidden: false }, now);
  return st;
}
