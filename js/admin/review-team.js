// «Проверка» команды (B8): ссылка на карточку. У студента — по его ID и ID сдачи, у команды — по ID сдачи команды team-…
import { hashQuery } from './common.js';
import { workHref } from './journal.js';

export function reviewHref(q) {
  if (q && q.team) return `#${hashQuery('/admin/work', { team: q.team, d: q.discipline, n: q.lesson, from: 'review' })}`;
  return workHref(q.studentId, q.discipline, q.lesson, { a: q.submissionId, from: 'review' });
}
