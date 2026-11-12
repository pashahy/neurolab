// Local Python results are a preview. Only server-confirmed points enter progress/XP.
import { round1 } from './util/text.js';

export function confirmedGrade(grade) {
  if (!grade || !Array.isArray(grade.items) || !grade.items.some(i => i.type === 'python')) return grade;
  const items = grade.items.map(i => i.type === 'python' ? { ...i, score: 0 } : i);
  const auto = items.filter(i => !i.manual);
  return { ...grade, items, score: round1(auto.reduce((sum, i) => sum + i.score, 0)),
    perfectTypes: Array.from(new Set(auto.filter(i => i.max > 0 && i.score === i.max).map(i => i.type))),
    ...(grade.adv ? { adv: { ...grade.adv, done: auto.some(i => i.adv && i.max > 0 && i.score === i.max) } } : {}) };
}
