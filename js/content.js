import { DISCIPLINES } from './config.js';

const cache = {};

export const lessonFile = n => `pz${String(n).padStart(3, '0')}.js`;

export async function loadCourse(id) {
  if (!DISCIPLINES.includes(id)) throw new Error(`Неизвестная дисциплина: ${id}`);
  if (!cache[id]) cache[id] = (await import(`../content/${id}/index.js`)).default;
  return cache[id];
}

export async function loadLesson(id, n) {
  if (!DISCIPLINES.includes(id) || !Number.isInteger(n) || n < 1) throw new Error('Неверный адрес занятия');
  return (await import(`../content/${id}/${lessonFile(n)}`)).default;
}

export function flatLessons(course) {
  return course.sections.flatMap(s => s.topics.flatMap(t => t.lessons.map(l => ({ ...l, topic: t, section: s }))));
}

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Доступ группы к дисциплине из ответа `me`: {visible, open: 'all'|number[], deadlines: {n: 'ГГГГ-ММ-ДД'}}.
// Без `me` доступ неизвестен — всё закрыто (экраны не рисуются, пока me не получен); если `me` есть, но про
// дисциплину нет данных, ничего не скрываем — окончательно решает сервер.
export function courseAccess(me, discipline) {
  if (!me || typeof me !== 'object') return { visible: false, open: [], deadlines: {} };
  const a = me.access && typeof me.access === 'object' && own(me.access, discipline) ? me.access[discipline] : null;
  if (!a || typeof a !== 'object') return { visible: true, open: 'all', deadlines: {} };
  return {
    visible: a.visible !== false,
    open: Array.isArray(a.open) ? a.open : 'all',
    deadlines: a.deadlines && typeof a.deadlines === 'object' && !Array.isArray(a.deadlines) ? a.deadlines : {},
  };
}

export function isLessonOpen(access, n) {
  if (!access || !access.visible) return false;
  return access.open === 'all' || (Array.isArray(access.open) && access.open.includes(n));
}

const pad2 = v => String(v).padStart(2, '0');
export const localDay = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// срок сдачи ПЗ: null или {date, label: 'ДД.ММ', overdue}; срок действует весь указанный день включительно
export function deadlineInfo(access, n, today = localDay()) {
  const raw = access && access.deadlines && own(access.deadlines, String(n)) ? access.deadlines[String(n)] : null;
  const m = typeof raw === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw) : null;
  if (!m) return null;
  return { date: raw, label: `${m[3]}.${m[2]}`, overdue: today > raw };
}

// оценка преподавателя по заданию: {score, comment} или null
export function teacherGrade(grades, key, taskId) {
  const g = grades && own(grades, key) ? grades[key] : null;
  const it = g && g.items && own(g.items, taskId) ? g.items[taskId] : null;
  return it && typeof it === 'object' && Number.isFinite(Number(it.score)) ? { score: Number(it.score), comment: typeof it.comment === 'string' ? it.comment : '' } : null;
}

export const hasTeacherGrades = (grades, key) => !!(grades && own(grades, key) && grades[key].items && Object.keys(grades[key].items).length);
