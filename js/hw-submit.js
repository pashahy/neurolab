// ДЗ (формат v4): ключ черновика ДЗ и сборка сдачи ДЗ для очереди отправки.
// Отдельный НОВЫЙ модуль намеренно: у сайта нет версионирования, и в кэше телефона может остаться прежняя копия submit.js
// или store.js без этих имён — именованный импорт отсутствующего имени был бы ошибкой компоновки и положил бы весь сайт
// (tests/busy-text.test.js). submit.js и store.js повторно экспортируют эти имена.

// черновик ДЗ лежит рядом с черновиком занятия, под ключом с суффиксом; этот ключ не бывает ключом ПЗ или прогресса
export const homeworkDraftKey = key => `${key}#hw`;

// ответы на задания ДЗ этого уровня (только id заданий homeworkTasks(lesson, level)); сервер пересчитывает по ним баллы
export function homeworkAnswers(lesson, level, answers) {
  const out = {};
  const src = answers && typeof answers === 'object' ? answers : {};
  const tasks = lesson && lesson.homework && lesson.homework[level] && Array.isArray(lesson.homework[level].tasks) ? lesson.homework[level].tasks : [];
  tasks.forEach(t => { if (t && Object.prototype.hasOwnProperty.call(src, t.id)) out[t.id] = src[t.id]; });
  return out;
}

// Сдача ДЗ (формат v4): отдельная запись очереди kind: 'hw'; level — 'base' | 'adv'. grade — { score, max, items } по заданиям ДЗ.
// Уходит той же очередью, что и сдача занятия (createSubmitter: повторы, busy, hold, статус), действием homeworkSubmit.
export function buildHomeworkSubmission({ profile, discipline, lesson, level, grade, startedAt, answers, now = Date.now(), rnd = Math.random }) {
  if (level !== 'base' && level !== 'adv') throw new Error(`Неверный level ДЗ: ${String(level)}`);
  const sub = {
    id: `${now.toString(36)}-${Math.floor(rnd() * 1e9).toString(36)}`,
    kind: 'hw',
    studentId: profile.id,
    discipline,
    lesson: lesson.number,
    level,
    score: grade.score,
    max: grade.max,
    items: grade.items,
    durationSec: Math.max(0, Math.round((now - (startedAt ?? now)) / 1000)),
    at: new Date(now).toISOString(),
    name: profile.name,
    group: profile.group,
  };
  if (answers !== undefined) sub.answers = homeworkAnswers(lesson, level, answers); // без параметра поля нет (старые вызовы)
  return sub;
}
