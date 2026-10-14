import { isV2, allTasks, hasVariants, practiceTasks } from './lesson-model.js';
import { V4_STAGES, MISTAKE_REASONS, extraTasks, safetyChecks, isAdv } from './lesson-v4.js';
import { isV4 } from './lesson-v4-model.js';
import { reflectionFilled, NEXT_MAX } from './grading-v4.js';

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// djb2-отпечаток задания: если содержание изменилось, старый ответ к нему не подходит
export const sigOf = t => { const s = JSON.stringify(t); let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

// индекс первого раздела лекции с незакрытым контрольным вопросом (-1, если всё закрыто)
const firstOpenSection = (lecture, locked) => lecture.findIndex(s => s && Array.isArray(s.check) && s.check.some(t => !locked[t.id]));

// Запись ответа задания, которая может прийти позже (например, загрузка файла закончилась):
// не пишет, если задание уже сохранено или пропущено (locked), экран сменился или черновик сдан/очищен (isActive() === false).
// onWrite(a) — после записи (сохранить черновик, обновить кнопки). Возвращает true, если ответ записан.
export function answerWriter(draft, taskId, { isActive = () => true, onWrite = () => {} } = {}) {
  return a => {
    if (!isActive() || !isObj(draft) || !isObj(draft.answers)) return false;
    if (isObj(draft.locked) && draft.locked[taskId]) return false;
    draft.answers[taskId] = a;
    onWrite(a);
    return true;
  };
}

// Приводит сохранённый черновик к безопасному виду для текущей версии занятия.
// v1: {stage: intro|task|finish, index, …}; v2 добавляет stage «lecture» и номер раздела section,
// а у занятия с вариантами практики — stage «choose» и variant ('phone' | 'pc').
export function repairDraft(d, lesson, now = Date.now()) {
  const v2 = isV2(lesson);
  const lecture = Array.isArray(lesson.lecture) ? lesson.lecture : [];
  const withVariants = v2 && hasVariants(lesson);
  const v4 = isV4(lesson);
  // v4: разминка, инструктаж и ДЗ — вне allTasks, но их ответы тоже хранятся в черновике
  const sigs = Object.fromEntries((v4 ? [...allTasks(lesson), ...extraTasks(lesson)] : allTasks(lesson)).map(t => [t.id, sigOf(t)]));
  const goalTasks = v4 && Array.isArray(lesson.goal?.tasks) ? lesson.goal.tasks : [];
  const base = { stage: 'intro', ...(v2 ? { section: 0 } : {}), index: 0, answers: {}, locked: {}, sigs, startedAt: now,
    ...(v4 ? { goal: { chosen: [], done: false }, safetyOk: false, safetyAttempts: 0, safetySeen: [], reflection: { tasks: goalTasks.map(() => null), reason: null, next: '' } } : {}) };
  if (!isObj(d) || !isObj(d.sigs)) return base;
  const keep = id => Object.prototype.hasOwnProperty.call(sigs, id) && d.sigs[id] === sigs[id];
  const pick = o => (isObj(o) ? Object.fromEntries(Object.entries(o).filter(([id]) => keep(id))) : {});
  const variant = withVariants && (d.variant === 'phone' || d.variant === 'pc') ? d.variant : undefined;
  const tasks = practiceTasks(lesson, variant);
  const stages = v4 ? V4_STAGES : v2 ? ['intro', 'lecture', ...(withVariants ? ['choose'] : []), 'task', 'finish'] : ['intro', 'task', 'finish'];
  const out = { ...base,
    stage: stages.includes(d.stage) ? d.stage : 'intro',
    index: Number.isInteger(d.index) && d.index >= 0 && d.index < tasks.length ? d.index : 0,
    answers: pick(d.answers), locked: pick(d.locked),
    startedAt: Number.isFinite(d.startedAt) ? d.startedAt : now };
  if (v4) return repairV4(out, d, lesson, { variant, withVariants, tasks, goalTasks });
  if (v2) {
    const open = firstOpenSection(lecture, out.locked);
    out.section = Number.isInteger(d.section) && d.section >= 0 && d.section < lecture.length ? d.section : 0;
    // раздел нельзя пропустить: до первого незакрытого вопроса лекции, а к выбору варианта и практике — только когда все вопросы закрыты
    const beyondLecture = out.stage === 'choose' || out.stage === 'task' || out.stage === 'finish';
    if (open >= 0 && (out.section > open || beyondLecture)) {
      out.section = open;
      if (beyondLecture) out.stage = 'lecture';
    }
  }
  if (variant) out.variant = variant;
  // практика без выбранного варианта невозможна: сначала выбор
  else if (withVariants && (out.stage === 'task' || out.stage === 'finish')) out.stage = 'choose';
  const firstOpen = tasks.findIndex(t => !out.locked[t.id]);
  if (out.stage === 'finish' && firstOpen >= 0) { out.stage = 'task'; out.index = firstOpen; }
  return out;
}

// Правила v4 поверх v2. Условия проверяются от поздних этапов к ранним, чтобы итоговая стадия была самой ранней из недопустимых.
function repairV4(out, d, lesson, { variant, withVariants, tasks, goalTasks }) {
  const lecture = Array.isArray(lesson.lecture) ? lesson.lecture : [];
  const skills = Array.isArray(lesson.goal?.skills) ? lesson.goal.skills.length : 0;
  const g = isObj(d.goal) ? d.goal : {};
  out.goal = { chosen: [...new Set(Array.isArray(g.chosen) ? g.chosen.filter(i => Number.isInteger(i) && i >= 0 && i < skills) : [])], done: g.done === true };
  // изменилось (или не закрыто) задание инструктажа — допуск к практике не действует
  out.safetyOk = d.safetyOk === true && safetyChecks(lesson).every(t => out.locked[t.id]);
  // варианты, для которых экран правил инструктажа уже показан ('all' — занятие без вариантов)
  out.safetySeen = [...new Set(Array.isArray(d.safetySeen) ? d.safetySeen.filter(k => k === 'phone' || k === 'pc' || k === 'all') : [])];
  // заставка ⭐ уже показана («Начать ⭐» нажато): после перезагрузки не повторяется
  if (d.advIntro === 'seen') out.advIntro = 'seen';
  out.safetyAttempts = Number.isInteger(d.safetyAttempts) && d.safetyAttempts >= 0 ? d.safetyAttempts : 0;
  const r = isObj(d.reflection) ? d.reflection : {};
  out.reflection = {
    tasks: goalTasks.map((_, i) => (Array.isArray(r.tasks) && [0, 1, 2].includes(r.tasks[i]) ? r.tasks[i] : null)),
    reason: Number.isInteger(r.reason) && r.reason >= 0 && r.reason < MISTAKE_REASONS.length ? r.reason : null,
    next: typeof r.next === 'string' ? r.next.slice(0, NEXT_MAX) : '',
  };
  const open = firstOpenSection(lecture, out.locked);
  out.section = Number.isInteger(d.section) && d.section >= 0 && d.section < lecture.length ? d.section : 0;
  if (open >= 0 && out.section > open) out.section = open;
  if (variant) out.variant = variant;
  const reached = st => V4_STAGES.indexOf(out.stage) >= V4_STAGES.indexOf(st);
  // рефлексия: все задачи оценены; «В следующий раз…» обязательно, если есть автозадание с баллом ниже максимума
  if (reached('finish')) {
    if (!reflectionFilled(lesson, out.answers, variant, out.reflection)) out.stage = 'reflect';
  }
  // ⭐ можно пропустить: возвращают к практике только незакрытые базовые задания
  if (reached('reflect')) {
    const firstOpen = tasks.findIndex(t => !isAdv(t) && !out.locked[t.id]);
    if (firstOpen >= 0) { out.stage = 'task'; out.index = firstOpen; }
  }
  if (reached('task') && !out.safetyOk) out.stage = 'safety';
  if (reached('safety') && withVariants && !variant) out.stage = 'choose';
  if (reached('choose') && open >= 0) { out.stage = 'lecture'; out.section = open; }
  if (reached('lecture') && !out.goal.done) out.stage = 'goal';
  return out;
}

