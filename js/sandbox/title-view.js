// Титул студента по опыту и полоса до следующего (профиль). Уровни — LEVELS из js/gamification.js; сервер считает то же (levelTitleOf_).
import { levelFor } from '../gamification.js';

// -> { title, nextTitle|null, percent 0..100, left (опыта до следующего или 0), text }
export function titleView(xp) {
  const x = Number(xp) > 0 ? Number(xp) : 0;
  const lv = levelFor(x);
  const left = lv.next === null ? 0 : lv.next - x;
  return {
    title: lv.title,
    nextTitle: lv.nextTitle,
    percent: Math.round(Math.min(1, Math.max(0, lv.progress)) * 100),
    left,
    text: lv.nextTitle ? `До титула «${lv.nextTitle}» — ещё ${left} опыта` : 'Высший титул — дальше только практика',
  };
}
