// «Защита» случайного студента (B2): чистая логика для доски, «Моего экрана», «Проверки» и «Журнала». Без DOM.
import { allTasks, hasVariants } from '../lesson-model.js';
import { TASK_TYPES } from '../tasks/registry.js';

export const DEFENSE_MAX = 2;
export const DEFENSE_SCORES = [
  { score: 0, label: '0 не смог' },
  { score: 1, label: '1 частично' },
  { score: 2, label: '2 объяснил' },
];

// Список ID уже защищавшихся: добавляет sid без повторов (исходный список не меняется)
export function defenseExcludeAdd(list, sid) {
  const a = Array.isArray(list) ? list.filter(x => typeof x === 'string') : [];
  return typeof sid === 'string' && sid && a.indexOf(sid) < 0 ? a.concat(sid) : a;
}

// Тело запроса boardDefense
export function defenseBody(group, discipline, lesson, done) {
  return { group, discipline, lesson, exclude: (Array.isArray(done) ? done.filter(x => typeof x === 'string') : []).slice(-200) };
}

// Задание защиты в контенте занятия: { n (номер в списке заданий), text, type } или null. Вариант сдачи на доске
// неизвестен, поэтому ищем среди заданий всех вариантов; без файла занятия — null (показываем только ответ).
function findTask(lesson, taskId) {
  if (!lesson || taskId == null) return null;
  const variants = hasVariants(lesson) ? ['pc', 'phone'] : [undefined];
  for (let v = 0; v < variants.length; v++) {
    const list = allTasks(lesson, variants[v]);
    const i = list.findIndex(t => t && String(t.id) === String(taskId));
    if (i >= 0) return { n: i + 1, task: list[i] };
  }
  return null;
}

export function defenseTaskInfo(lesson, taskId) {
  const f = findTask(lesson, taskId);
  return f ? { n: f.n, text: String(f.task.text == null ? '' : f.task.text), type: String(f.task.type || '') } : null;
}

const arr = v => (Array.isArray(v) ? v : []);
const isIdx = (v, n) => Number.isInteger(v) && v >= 0 && v < n;

// Читаемый вид сырого ответа по полям задания; '' — тип не поддержан или ответ не подходит под задание
function rawText(t, raw) {
  const NL = '\n';
  const idxLabel = (list, i) => (isIdx(i, arr(list).length) ? String(list[i]) : '(?)');
  switch (t.type) {
    case 'single': return isIdx(raw, arr(t.options).length) ? `◉ ${t.options[raw]}` : '';
    case 'multi': return arr(raw).length ? arr(t.options).map((o, i) => `${raw.indexOf(i) >= 0 ? '☑' : '☐'} ${o}`).join(NL) : '';
    case 'order': return arr(raw).length ? raw.map((idx, i) => `${i + 1}. ${idxLabel(t.items, idx)}`).join(NL) : '';
    case 'match': return arr(raw).length ? arr(t.pairs).map((p, i) => `${p[0]} → ${isIdx(raw[i], t.pairs.length) ? t.pairs[raw[i]][1] : '—'}`).join(NL) : '';
    case 'categorize': return arr(raw).length ? arr(t.items).map((it, i) => `${it.text} → ${isIdx(raw[i], arr(t.categories).length) ? t.categories[raw[i]] : '—'}`).join(NL) : '';
    case 'swipe': {
      const labels = Object.assign({ true: 'Правда', false: 'Выдумка' }, t.labels);
      return arr(raw).length ? arr(t.cards).map((c, i) => `${c.text} → ${typeof raw[i] === 'boolean' ? labels[raw[i]] : '—'}`).join(NL) : '';
    }
    case 'fill': {
      if (!arr(raw).length || typeof t.template !== 'string') return '';
      return t.template.replace(/\{\{(\d+)\}\}/g, (m, k) => `[${raw[Number(k)] == null || String(raw[Number(k)]).trim() === '' ? '…' : raw[Number(k)]}]`);
    }
    case 'hotspot': return arr(raw).length ? raw.map(i => `${isIdx(i, arr(t.lines).length) ? i + 1 : '?'}: ${idxLabel(t.lines, i)}`).join(NL) : '';
    default: return '';
  }
}

// Ответ студента для показа: { text, fallback }. Порядок: текст из сдачи (texts) -> toText типа задания -> читаемый вид
// по полям задания -> «ответ в карточке работы» (fallback: true).
export function defenseAnswerView(lesson, taskId, raw, text) {
  if (typeof text === 'string' && text.trim()) return { text, fallback: false };
  const f = findTask(lesson, taskId);
  if (f && raw !== undefined && raw !== null) {
    const ty = TASK_TYPES[f.task.type];
    if (ty && typeof ty.toText === 'function') {
      let s = '';
      try { s = String(ty.toText(f.task, raw) == null ? '' : ty.toText(f.task, raw)); } catch (e) { s = ''; }
      if (s.trim()) return { text: s, fallback: false };
    }
    let s = '';
    try { s = rawText(f.task, raw); } catch (e) { s = ''; }
    if (s.trim()) return { text: s, fallback: false };
  }
  return { text: 'Ответ — в карточке работы («Проверка»)', fallback: true };
}

// Подпись задания: «Задание 3» (номер из занятия) или «Задание <id>» без файла занятия
export function defenseTaskTitle(info, taskId) {
  return info ? `Задание ${info.n}` : `Задание ${taskId}`;
}

// «🎲 защита: 2/2»
export function defenseScoreText(score) {
  const s = Number(score);
  return `🎲 защита: ${s >= 0 && s <= DEFENSE_MAX ? s : 0}/${DEFENSE_MAX}`;
}

// Ячейка журнала { sum, max, count } -> «🎲 3/4» ('' — защит не было)
export function defenseJournalText(c) {
  if (!c || !(Number(c.count) > 0)) return '';
  return `🎲 ${Number(c.sum) || 0}/${Number(c.max) || 0}`;
}

// Журнал: защиты студента на ПЗ (ответ adminJournal.defenses) или null
export function defenseJournalCell(defenses, sid, n) {
  if (!defenses || typeof defenses !== 'object') return null;
  const row = Object.prototype.hasOwnProperty.call(defenses, sid) ? defenses[sid] : null;
  return row && Object.prototype.hasOwnProperty.call(row, n) ? row[n] : null;
}

// История защит пары (adminDefenses) -> строки «Имя · Задание 3 · 2/2 · комментарий»
export function defenseHistoryLine(d, lesson) {
  const info = defenseTaskInfo(lesson, d && d.taskId);
  const parts = [d && d.name ? d.name : '', defenseTaskTitle(info, d && d.taskId), `${Number(d && d.score) || 0}/${DEFENSE_MAX}`];
  if (d && d.comment) parts.push(String(d.comment));
  return parts.filter(Boolean).join(' · ');
}

// Оценка выставлена текущей защите? (grade из boardState при names: true)
export function defenseGraded(def) {
  return !!def && !!def.grade && typeof def.grade.score === 'number';
}
