// Новые имена оценки формата v4. Лежат отдельно от js/grading.js: сайт без версионирования файлов, в кэше телефона может быть
// старая копия grading.js, и именованный импорт отсутствующего в ней имени ломает всё приложение.
import { TASK_TYPES } from './tasks/registry.js';
import { round1 } from './util/text.js';
import { gradeLesson } from './grading.js';
import { homeworkTasks, warmupTasks } from './lesson-v4.js';
import { homeworkMark } from './hw-mark.js';

const sum = (arr, f) => round1(arr.reduce((s, i) => s + f(i), 0));

// Оценка ДЗ (формат v4): задания выбранного уровня ('base' | 'adv'); ручных в ДЗ нет, но если они попали, баллов не дают
export function gradeHomework(lesson, level, answers = {}) {
  if (level !== 'base' && level !== 'adv') throw new Error(`Неверный level ДЗ: ${String(level)}`);
  const items = homeworkTasks(lesson, level).map(t => {
    const type = TASK_TYPES[t.type];
    const r = type.check(t, answers[t.id]);
    return { id: t.id, type: t.type, score: r.score, max: r.max, manual: !!type.manual };
  });
  const auto = items.filter(i => !i.manual);
  return { items, score: sum(auto, i => i.score), max: sum(auto, i => i.max) };
}

// Поле v4 сдачи занятия: цель, разминка, инструктаж, рефлексия, ⭐. grade — результат gradeLesson для варианта черновика.
// Баллы разминки: пропущенное или неотвеченное задание — 0 из max. Причина ошибок уходит только если ошибки были.
export function v4Submission(lesson, draft, grade) {
  const answers = draft.answers || {};
  const refl = draft.reflection || {};
  const warmup = {};
  for (const t of warmupTasks(lesson)) {
    const type = TASK_TYPES[t.type];
    if (type.manual) { warmup[t.id] = { score: 0, max: 0 }; continue; }
    const r = type.check(t, answers[t.id] == null ? undefined : answers[t.id]);
    warmup[t.id] = { score: answers[t.id] == null ? 0 : round1(r.score), max: round1(r.max) };
  }
  const hasMistakes = mistakeItems(lesson, answers, draft.variant).length > 0;
  return {
    goal: { chosen: Array.isArray(draft.goal?.chosen) ? draft.goal.chosen : [] },
    warmup,
    safety: { attempts: Number.isInteger(draft.safetyAttempts) ? Math.min(50, Math.max(0, draft.safetyAttempts)) : 0, ok: true }, // сервер принимает 0..50
    reflection: {
      tasks: Array.isArray(refl.tasks) ? refl.tasks : [],
      reason: hasMistakes && Number.isInteger(refl.reason) ? refl.reason : null,
      next: typeof refl.next === 'string' ? refl.next.trim().slice(0, 200) : '',
    },
    adv: { done: !!grade.adv?.done },
  };
}

// Ошибки для рефлексии: автозадания (лекция + практика варианта) с баллом ниже максимума.
// ⭐ без ответа (не начато или пропущено) ошибкой не считается: ⭐ можно пропустить (спецификация § 4.3).
// Базовые и лекционные задания без ответа — ошибка.
export function mistakeItems(lesson, answers = {}, variant) {
  return gradeLesson(lesson, answers, variant).items.filter(i => !i.manual && i.score < i.max && !(i.adv && (answers[i.id] === undefined || answers[i.id] === null)));
}

// «В следующий раз я…»: длина после обрезки пробелов; минимум обязателен, если есть ошибки
export const NEXT_MIN = 10, NEXT_MAX = 200;

// Рефлексия заполнена — условие «Сдать работу» и допуска черновика к стадии 'finish' (draft.js использует тот же предикат):
// все задачи цели оценены (0, 1 или 2), а при ошибках в автозаданиях «В следующий раз…» не короче NEXT_MIN.
export function reflectionFilled(lesson, answers, variant, reflection) {
  const r = reflection && typeof reflection === 'object' ? reflection : {};
  const goalCount = Array.isArray(lesson?.goal?.tasks) ? lesson.goal.tasks.length : 0;
  const tasks = Array.isArray(r.tasks) ? r.tasks : [];
  if (tasks.length !== goalCount || !tasks.every(v => v === 0 || v === 1 || v === 2)) return false;
  if (!mistakeItems(lesson, answers, variant).length) return true;
  return typeof r.next === 'string' && r.next.trim().length >= NEXT_MIN;
}

// Отметка занятия (шкала § 5). Чистая функция без зависимостей: зеркалится на сервере (Code.gs).
// manualPending: ручные ещё не оценены — процент считается только по авто, отметка предварительная.
// hasAdv === false — в занятии нет ⭐, правило ⭐ не применяется.
export function markFor({ score, max, manualScore = 0, manualMax = 0, advDone, hasAdv, manualPending = false }) {
  const num = manualPending ? score : score + manualScore;
  const den = manualPending ? max : max + manualMax;
  const pct = den > 0 ? Math.round(num / den * 1000) / 10 : 0;
  const needAdv = hasAdv !== false;
  let mark = 0;
  if (den > 0) {
    if (pct >= 85 && (!needAdv || advDone)) mark = 5;
    else if (pct >= 70) mark = 4;
    else if (pct >= 50) mark = 3;
  }
  return { mark, pct, preliminary: !!manualPending };
}

// Отметка занятия по результату gradeLesson. Ручные задания на клиенте не оценены, поэтому при их наличии отметка предварительная
// (процент считается по автобаллам); «⭐ выполнено» — по автозаданиям ⭐, ручные ⭐ оценит преподаватель.
export function lessonMark(grade) {
  return markFor({ score: grade.score, max: grade.max, manualScore: 0, manualMax: grade.manualMax, advDone: !!grade.adv?.done, hasAdv: grade.items.some(i => i.adv), manualPending: grade.manualMax > 0 });
}

// Отметка за ДЗ: «5» — только ⭐ ≥ 85 %; «4» — ⭐ ≥ 70 % или базовое ≥ 85 %; «3» — ≥ 50 % (js/hw-mark.js).
export { homeworkMark };

export const MARK_LABEL = { 5: '«5»', 4: '«4»', 3: '«3»', 0: 'нужно доработать' };

