// Модель занятия формата v4: уровни практики (база и ⭐), разминка, инструктаж, ДЗ, минуты этапов.
// Контрольные вопросы лекции и практика — в lesson-model.js (allTasks); здесь всё остальное.
import { practiceTasks, wordCount, readMinutes } from './lesson-model.js';

const arr = v => (Array.isArray(v) ? v : []);

export const V4_STAGES = ['intro', 'goal', 'warmup', 'lecture', 'choose', 'safety', 'task', 'reflect', 'finish'];

// причины ошибок в рефлексии: порядок фиксирован (в сдачу уходит индекс)
export const MISTAKE_REASONS = ['невнимательно прочитал условие', 'не до конца понял тему', 'ошибка в вычислениях или коде', 'не хватило времени', 'другое'];

export const isAdv = t => t?.level === 'adv';

// базовая практика и ⭐ варианта: части practiceTasks в порядке файла
export const baseTasks = (lesson, variant) => practiceTasks(lesson, variant).filter(t => t && !isAdv(t));
export const advTasks = (lesson, variant) => practiceTasks(lesson, variant).filter(t => t && isAdv(t));

// порядок практики v4: сначала базовые, затем ⭐ (в файле ⭐ идут в конце, так что индекс совпадает с practiceTasks)
export const practiceV4 = (lesson, variant) => [...baseTasks(lesson, variant), ...advTasks(lesson, variant)];

// заставка перед ⭐: индекс указывает на первое ⭐ задание, а студент ещё не нажал «Начать ⭐» (draft.advIntro !== 'seen')
export const advIntroNeeded = (tasks, index, advIntro) => advIntro !== 'seen' && isAdv(tasks[index]) && tasks.findIndex(isAdv) === index;

export const warmupTasks = lesson => arr(lesson?.warmup);
export const safetyChecks = lesson => arr(lesson?.safety?.check);

// правила инструктажа: общие + правила выбранного варианта (без варианта — только общие)
export const safetyRules = (lesson, variant) => arr(lesson?.safety?.rules).filter(r => r && (!r.variant || r.variant === variant));

// Есть ли у варианта правила, которых студент ещё не видел (draft.safetySeen: варианты, для которых экран правил показан).
// Общие правила видны с любым вариантом, поэтому «увиденные» — объединение правил по всем показанным вариантам.
export function hasUnseenRules(lesson, draft, variant) {
  const seen = new Set((Array.isArray(draft?.safetySeen) ? draft.safetySeen : []).flatMap(k => safetyRules(lesson, k === 'all' ? undefined : k)));
  return safetyRules(lesson, variant).some(r => !seen.has(r));
}

// задания ДЗ выбранного уровня: 'base' | 'adv'
export const homeworkTasks = (lesson, level) => arr(lesson?.homework?.[level === 'adv' ? 'adv' : 'base']?.tasks);

// ДЗ: попыток на ПЗ (любого уровня) и есть ли оно в занятии
export const HW_MAX_ATTEMPTS = 3;
export const hasHomework = lesson => homeworkTasks(lesson, 'base').length > 0 || homeworkTasks(lesson, 'adv').length > 0;

// задания вне allTasks (разминка, инструктаж, ДЗ обоих уровней): нужны отпечаткам черновика
export const extraTasks = lesson => [...warmupTasks(lesson), ...safetyChecks(lesson), ...homeworkTasks(lesson, 'base'), ...homeworkTasks(lesson, 'adv')];

// плановые минуты этапа по lesson.minutes
const STAGE_KEY = { intro: 'intro', goal: 'intro', warmup: 'intro', lecture: 'theory', choose: 'practice', safety: 'practice', task: 'practice', reflect: 'outro', finish: 'outro' };
export function stageMinutes(lesson, stage) {
  const key = STAGE_KEY[stage];
  const m = key ? lesson?.minutes?.[key] : undefined;
  return typeof m === 'number' ? m : 0;
}

// строка этапа в шапке занятия: «Вход · ≈ 5 мин», «Лекция · раздел 2 из 5 · ≈ 4 мин», «Практика · база», «⭐ Повышенный уровень», «Итоги · ≈ 5 мин»
// opts: { section — номер раздела лекции (с нуля), adv — текущее задание практики ⭐ }
export function stageLabel(lesson, stage, { section = 0, adv = false } = {}) {
  const mins = m => (m > 0 ? ` · ≈ ${m} мин` : '');
  if (stage === 'lecture') {
    const secs = arr(lesson?.lecture);
    const k = Number.isInteger(section) && section >= 0 && section < secs.length ? section : 0;
    return `Лекция${secs.length ? ` · раздел ${k + 1} из ${secs.length}${mins(readMinutes(wordCount(secs[k]?.body)))}` : mins(stageMinutes(lesson, 'lecture'))}`;
  }
  if (stage === 'task') return adv ? '⭐ Повышенный уровень' : 'Практика · база';
  if (stage === 'choose' || stage === 'safety') return `Практика${mins(stageMinutes(lesson, stage))}`;
  if (stage === 'reflect' || stage === 'finish') return `Итоги${mins(stageMinutes(lesson, stage))}`;
  return `Вход${mins(stageMinutes(lesson, 'intro'))}`;
}
