// Модель занятия: формат v1 (плоский список tasks) и v2 (лекция с контрольными вопросами + практика).
export const isV2 = lesson => !!lesson && lesson.version === 2;

const arr = v => (Array.isArray(v) ? v : []);

// все задания занятия в порядке прохождения: контрольные вопросы лекции, затем практика
export function allTasks(lesson) {
  if (!lesson) return [];
  if (!isV2(lesson)) return arr(lesson.tasks);
  return [...arr(lesson.lecture).flatMap(s => (s ? arr(s.check) : [])), ...arr(lesson.tasks)];
}

export const wordCount = s => (String(s ?? '').match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) || []).length;

export const WORDS_PER_MIN = 180;

// оценка времени чтения в минутах (не меньше одной)
export const readMinutes = words => Math.max(1, Math.round(words / WORDS_PER_MIN));

export const lectureWords = lesson => arr(lesson?.lecture).reduce((n, s) => n + wordCount(s?.body), 0);

// термины словаря по алфавиту
export const sortedGlossary = lesson => [...arr(lesson?.glossary)].sort((a, b) => String(a.term).localeCompare(String(b.term), 'ru'));
