import { isV2, allTasks } from './lesson-model.js';

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// djb2-отпечаток задания: если содержание изменилось, старый ответ к нему не подходит
export const sigOf = t => { const s = JSON.stringify(t); let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

// индекс первого раздела лекции с незакрытым контрольным вопросом (-1, если всё закрыто)
const firstOpenSection = (lecture, locked) => lecture.findIndex(s => s && Array.isArray(s.check) && s.check.some(t => !locked[t.id]));

// Приводит сохранённый черновик к безопасному виду для текущей версии занятия.
// v1: {stage: intro|task|finish, index, …}; v2 добавляет stage «lecture» и номер раздела section.
export function repairDraft(d, lesson, now = Date.now()) {
  const v2 = isV2(lesson);
  const tasks = Array.isArray(lesson.tasks) ? lesson.tasks : [];
  const lecture = Array.isArray(lesson.lecture) ? lesson.lecture : [];
  const sigs = Object.fromEntries(allTasks(lesson).map(t => [t.id, sigOf(t)]));
  const base = { stage: 'intro', ...(v2 ? { section: 0 } : {}), index: 0, answers: {}, locked: {}, sigs, startedAt: now };
  if (!isObj(d) || !isObj(d.sigs)) return base;
  const keep = id => Object.prototype.hasOwnProperty.call(sigs, id) && d.sigs[id] === sigs[id];
  const pick = o => (isObj(o) ? Object.fromEntries(Object.entries(o).filter(([id]) => keep(id))) : {});
  const out = { ...base,
    stage: (v2 ? ['intro', 'lecture', 'task', 'finish'] : ['intro', 'task', 'finish']).includes(d.stage) ? d.stage : 'intro',
    index: Number.isInteger(d.index) && d.index >= 0 && d.index < tasks.length ? d.index : 0,
    answers: pick(d.answers), locked: pick(d.locked),
    startedAt: Number.isFinite(d.startedAt) ? d.startedAt : now };
  if (v2) {
    const open = firstOpenSection(lecture, out.locked);
    out.section = Number.isInteger(d.section) && d.section >= 0 && d.section < lecture.length ? d.section : 0;
    // раздел нельзя пропустить: до первого незакрытого вопроса лекции, а к практике — только когда все вопросы закрыты
    if (open >= 0 && (out.section > open || out.stage === 'task' || out.stage === 'finish')) {
      out.section = open;
      if (out.stage === 'task' || out.stage === 'finish') out.stage = 'lecture';
    }
  }
  const firstOpen = tasks.findIndex(t => !out.locked[t.id]);
  if (out.stage === 'finish' && firstOpen >= 0) { out.stage = 'task'; out.index = firstOpen; }
  return out;
}
