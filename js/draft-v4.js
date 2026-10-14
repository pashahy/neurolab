// Черновик ДЗ формата v4 лежит отдельно от js/draft.js: в кэше телефона может быть старая копия draft.js без этого имени.
import { sigOf } from './draft.js';
import { homeworkTasks } from './lesson-v4.js';

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// Черновик ДЗ формата v4 (store-ключ "<ПЗ>#hw"): { level: 'base' | 'adv' | null, answers, locked, sigs, startedAt }.
// Ответы на задания ДЗ хранятся по id (оба уровня сразу), поэтому смена уровня до сдачи ничего не теряет.
export function repairHomeworkDraft(d, lesson, now = Date.now()) {
  const tasks = [...homeworkTasks(lesson, 'base'), ...homeworkTasks(lesson, 'adv')];
  const sigs = Object.fromEntries(tasks.map(t => [t.id, sigOf(t)]));
  const base = { level: null, answers: {}, locked: {}, sigs, startedAt: now };
  if (!isObj(d) || !isObj(d.sigs)) return base;
  const keep = id => Object.prototype.hasOwnProperty.call(sigs, id) && d.sigs[id] === sigs[id];
  const pick = o => (isObj(o) ? Object.fromEntries(Object.entries(o).filter(([id]) => keep(id))) : {});
  const level = (d.level === 'base' || d.level === 'adv') && homeworkTasks(lesson, d.level).length ? d.level : null;
  return { level, answers: pick(d.answers), locked: pick(d.locked), sigs, startedAt: Number.isFinite(d.startedAt) ? d.startedAt : now };
}
