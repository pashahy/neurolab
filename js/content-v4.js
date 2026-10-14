// Положение занятия в курсе (для v4). Лежит отдельно от js/content.js: в кэше телефона может быть старая копия content.js без этого имени.
import { flatLessons } from './content.js';

// Где занятие в курсе: раздел, тема, номер среди всех ПЗ дисциплины и соседние ПЗ.
// Для демо (курса нет) и неизвестного номера — null.
export function lessonPlace(course, n) {
  if (!course || !Array.isArray(course.sections)) return null;
  const all = flatLessons(course);
  const i = all.findIndex(l => l.n === n);
  if (i < 0) return null;
  const l = all[i];
  const nb = x => (x ? { n: x.n, title: x.title } : null);
  return {
    section: { n: l.section.n, title: l.section.title },
    topic: { id: l.topic.id, title: l.topic.title },
    index: i + 1,
    total: all.length,
    prev: nb(all[i - 1]),
    next: nb(all[i + 1]),
  };
}
