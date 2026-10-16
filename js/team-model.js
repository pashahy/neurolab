// B8: «Открытое занятие» — модель командного кейса на стороне студента (без DOM): роли, экраны, перенос ответов команды в черновик,
// состав сдачи кейса координатором. Серверная часть — блок B8 в apps-script/Code.gs (teamState / teamCreate / teamJoin / teamLeave / teamSubmitCase).
import { gradeLesson, submissionAnswers, lessonTexts } from './grading.js';
import { allTasks } from './lesson-model.js';

export const TEAM_POLL_MS = 12000;
export const TEAM_MIN = 2;
export const TEAM_MAX = 4;

// Роли и их обязанности (спецификация § 10): у каждой по 2–3 пункта.
export const TEAM_ROLES = {
  coordinator: {
    icon: '🧭', title: 'Координатор',
    duties: ['Организует обсуждение: даёт слово каждому', 'Вводит ответы команды в задания', 'Сдаёт кейс команды после последнего задания'],
  },
  executor: {
    icon: '🛠', title: 'Исполнитель',
    duties: ['Решает задание и предлагает ответ команде', 'Объясняет, как к нему пришёл'],
  },
  checker: {
    icon: '🔎', title: 'Проверяющий',
    duties: ['Сверяет ответ с условием и критериями до «Проверить»', 'Замечает пропущенные требования', 'Говорит «стоп», если в ответе есть сомнение'],
  },
};
export const JOIN_ROLES = ['executor', 'checker'];

export const roleInfo = role => TEAM_ROLES[role] || null;
export const roleTitle = role => (roleInfo(role) ? roleInfo(role).title : '');
export const roleLabel = role => (roleInfo(role) ? `${roleInfo(role).icon} ${roleInfo(role).title}` : '');

// Задание кейса — задание практики с полем case.
export const isCaseTask = t => !!t && typeof t === 'object' && !!t.case;
export const caseTasks = tasks => (Array.isArray(tasks) ? tasks.filter(isCaseTask) : []);
export const lastCaseIndex = tasks => { let k = -1; (tasks || []).forEach((t, i) => { if (isCaseTask(t)) k = i; }); return k; };

// Код из ввода: четыре цифры или null.
export function parseCode(text) {
  const s = String(text == null ? '' : text).replace(/\s+/g, '');
  return /^\d{4}$/.test(s) ? s : null;
}

// Что показывать на задании кейса:
//  'off'      — командной работы нет (режим выключен, «работаю один», ответ сервера не получен): задание как обычно;
//  'choose'   — «Работаем в команде»: создать, войти по коду или работать одному;
//  'wait'     — участник ждёт, пока координатор сдаст кейс (роль, чек-лист, состав);
//  'work'     — координатор решает кейс; 'done' — кейс сдан, ответы команды.
export function teamScreen(st) {
  if (!st || st.enabled !== true || st.alone === true) return 'off';
  const t = st.team;
  if (!t) return 'choose';
  if (t.submitted) return 'done';
  return t.coordinator ? 'work' : 'wait';
}

// Строки состава: «Фамилия И. — Координатор (вы)».
export function memberLines(team) {
  return (team && Array.isArray(team.members) ? team.members : []).map(m => `${m.name || 'Участник'} — ${roleTitle(m.role)}${m.me ? ' (вы)' : ''}`);
}

export function canJoin(team) { return !!team && !team.submitted && team.members.length < TEAM_MAX; }

// Ответы команды -> черновик участника: задания кейса получают ответ координатора и закрываются. Участнику (не координатору)
// перезаписываются и уже закрытые: свои ответы на кейс сервер не считает. result: { answers, texts, items }.
// Возвращает true, если черновик изменился.
export function applyTeamResult(draft, tasks, result, { coordinator = false } = {}) {
  if (!draft || !result) return false;
  const answers = result.answers && typeof result.answers === 'object' ? result.answers : {};
  let changed = false;
  caseTasks(tasks).forEach(t => {
    if (coordinator && draft.locked[t.id]) return;
    const has = Object.prototype.hasOwnProperty.call(answers, t.id);
    const next = has ? answers[t.id] : null;
    if (JSON.stringify(draft.answers[t.id]) !== JSON.stringify(next) || !draft.locked[t.id]) changed = true;
    draft.answers[t.id] = next;
    draft.locked[t.id] = true;
  });
  return changed;
}

// Все задания кейса закрыты и текущее — последнее из них: координатору пора показывать «Сдать кейс команды».
export function readyToSubmitCase(tasks, draft, index) {
  const cs = caseTasks(tasks);
  return cs.length > 0 && index === lastCaseIndex(tasks) && cs.every(t => draft.locked[t.id]);
}

// Тело teamSubmitCase: баллы заданий кейса по ответам координатора, ответы и тексты только этих заданий.
export function caseSubmission(lesson, draft) {
  const ids = new Set(caseTasks(allTasks(lesson, draft.variant)).map(t => t.id));
  const g = gradeLesson(lesson, draft.answers, draft.variant);
  const answers = submissionAnswers(lesson, draft.answers, draft.variant);
  const texts = lessonTexts(lesson, draft.answers, draft.variant);
  const pick = o => Object.fromEntries(Object.entries(o).filter(([id]) => ids.has(id)));
  return { items: g.items.filter(i => ids.has(i.id)), answers: pick(answers), texts: pick(texts) };
}

// Индекс первого задания после текущего, не относящегося к кейсу (участник идёт дальше, пока координатор решает кейс); -1 — таких нет.
export function nextNonCaseIndex(tasks, from) {
  const list = Array.isArray(tasks) ? tasks : [];
  for (let i = from + 1; i < list.length; i++) if (!isCaseTask(list[i])) return i;
  return -1;
}
