// Модель занятия: формат v1 (плоский список tasks) и v2 (лекция с контрольными вопросами + практика).
export const isV2 = lesson => !!lesson && lesson.version === 2;

const arr = v => (Array.isArray(v) ? v : []);

// есть ли у занятия практика с вариантом «ПК» (у остальных заданий — общих или телефонных — variant необязателен)
export const hasVariants = lesson => arr(lesson?.tasks).some(t => !!t && t.variant === 'pc');

// задания практики выбранного варианта: общие (без variant) и с t.variant === variant, в порядке файла;
// без вариантов у занятия или без variant — вся практика
export function practiceTasks(lesson, variant) {
  const tasks = arr(lesson?.tasks);
  if (!variant || !hasVariants(lesson)) return tasks;
  return tasks.filter(t => t && (!t.variant || t.variant === variant));
}

// вариант сдачи, записанной без поля variant (старая сдача занятия, у которого потом появились варианты):
// есть id задания ПК — 'pc', иначе 'phone'; у занятия без вариантов — undefined
export function inferVariant(lesson, itemIds) {
  if (!hasVariants(lesson)) return undefined;
  const ids = new Set(arr(itemIds));
  return arr(lesson.tasks).some(t => t && t.variant === 'pc' && ids.has(t.id)) ? 'pc' : 'phone';
}

// все задания занятия в порядке прохождения: контрольные вопросы лекции, затем практика (варианта, если он указан)
export function allTasks(lesson, variant) {
  if (!lesson) return [];
  if (!isV2(lesson)) return arr(lesson.tasks);
  return [...arr(lesson.lecture).flatMap(s => (s ? arr(s.check) : [])), ...practiceTasks(lesson, variant)];
}

export const wordCount = s => (String(s ?? '').match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) || []).length;

export const WORDS_PER_MIN = 180;

// оценка времени чтения в минутах (не меньше одной)
export const readMinutes = words => Math.max(1, Math.round(words / WORDS_PER_MIN));

export const lectureWords = lesson => arr(lesson?.lecture).reduce((n, s) => n + wordCount(s?.body), 0);

// термины словаря по алфавиту
export const sortedGlossary = lesson => [...arr(lesson?.glossary)].sort((a, b) => String(a.term).localeCompare(String(b.term), 'ru'));
