import { TASK_TYPES } from './tasks/registry.js';
import { round1 } from './util/text.js';
import { allTasks } from './lesson-model.js';

export function gradeLesson(lesson, answers = {}) {
  const items = allTasks(lesson).map(t => {
    const type = TASK_TYPES[t.type];
    const r = type.check(t, answers[t.id]);
    return { id: t.id, type: t.type, score: r.score, max: r.max, manual: !!type.manual };
  });
  const auto = items.filter(i => !i.manual);
  const sum = (arr, f) => round1(arr.reduce((s, i) => s + f(i), 0));
  return {
    items,
    score: sum(auto, i => i.score),
    max: sum(auto, i => i.max),
    manualMax: sum(items.filter(i => i.manual), i => i.max),
    perfectTypes: [...new Set(auto.filter(i => i.max > 0 && i.score === i.max).map(i => i.type))],
  };
}

export function lessonTexts(lesson, answers = {}) {
  const out = {};
  for (const t of allTasks(lesson)) {
    const type = TASK_TYPES[t.type];
    if (type.toText && answers[t.id] != null) out[t.id] = type.toText(t, answers[t.id]);
  }
  return out;
}
