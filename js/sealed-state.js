// Состояние запечатанных заданий в черновике (этап 2 защиты оценок): что раскрыто, что ждёт проверки, в каком пространстве лежат ответы.
// Поля черновика (занятия и ДЗ):
//   sp:1       — черновик уже в «запечатанном» формате (ответы незакрытых заданий — в опубликованном пространстве индексов);
//   rv[id]     — { s, m, q?, x }: ответ сервера (балл, максимум, перестановка и убранные поля) — по нему задание восстанавливается;
//   pend[id]   — ждёт проверки на сервере: 1 — нужен ключ для оценки, 2 — «мягкое» (python/terminal/ручное: балл на клиенте, ждём только пояснение);
//   cn[id]     — ответ уже в каноническом пространстве (после раскрытия; у черновиков до выпуска — закрытые ответы перемешанных заданий).
// Инвариант: ответ задания каноничен, если задание восстановлено (есть rv) или у него нет перестановки; до раскрытия — в опубликованном пространстве.
import { restoreTask, taskLists } from './seal-model.js';
import { canonAnswer, SHUFFLE } from './seal-core.js';
import { isSealedLesson } from './sealed-content.js';
import { TASK_TYPES } from './tasks/registry.js';

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// Типы, чей балл считает клиент или ручные: ключ для оценки не нужен (от сервера ждём только пояснение и эталон)
export const SOFT_TYPES = ['text', 'file', 'dilemma'];

// у задания убраны ключи или пояснение (оно ещё не раскрыто)
export const isSealedTask = t => !!t && t.sl === 1;
// не раскрыто, и без ключа его не оценить
export const needsKey = t => isSealedTask(t) && SOFT_TYPES.indexOf(t.type) < 0;

// id → задание по всем спискам занятия (лекция, практика, разминка, инструктаж, ДЗ)
const indexMemo = new WeakMap();
export function taskIndex(lesson) {
  if (!lesson || typeof lesson !== 'object') return {};
  if (!indexMemo.has(lesson)) {
    const m = {};
    taskLists(lesson).forEach(l => l.forEach(t => { if (t && typeof t === 'object' && typeof t.id === 'string') m[t.id] = t; }));
    indexMemo.set(lesson, m);
  }
  return indexMemo.get(lesson);
}

// Баллы, пришедшие с сервера (первая проверка): по объекту задания, чтобы gradeLesson видел их без черновика
const scores = new WeakMap();
export const setTaskScore = (t, s, m) => { if (isObj(t)) scores.set(t, { s, m }); };

// Первая оценка сервера ограничивает балл сверху; другой неверный ответ не наследует её баллы. repeatable используется только
// учебным инструктажем без баллов: после раскрытия ключа исправленный ответ проверяется заново.
export function checkTask(t, a, { repeatable = false } = {}) {
  const type = TASK_TYPES[t.type];
  if (needsKey(t)) return { score: 0, max: t.points == null ? 1 : t.points };
  const o = scores.get(t);
  if (o && !repeatable && !type.manual && a !== undefined && a !== null) {
    const current = type.check(t, a);
    return { score: Math.min(o.s, current.score), max: o.m };
  }
  return type.check(t, a);
}

// Применить ответ сервера к заданию и черновику: восстановить задание, перевести ответ в каноническое, запомнить rv.
// res: { id, score, max, rv: { q?, x? } }. Возвращает true, если применено.
export function applyReveal(D, t, res) {
  if (!isObj(D) || !t || !res) return false;
  if (res.hidden === true) {
    if (!isObj(D.rv)) D.rv = {};
    D.rv[t.id] = { hidden: true };
    if (isObj(D.pend)) delete D.pend[t.id];
    return true;
  }
  const rvIn = isObj(res.rv) ? res.rv : {};
  const rv = { s: Number(res.score) || 0, m: Number(res.max) || 0 };
  if (Array.isArray(rvIn.q)) rv.q = rvIn.q;
  if (isObj(rvIn.x)) rv.x = rvIn.x;
  if (!isObj(D.cn)) D.cn = {};
  if (!isObj(D.rv)) D.rv = {};
  const a = isObj(D.answers) ? D.answers[t.id] : undefined;
  if (!D.cn[t.id] && a !== undefined && a !== null) D.answers[t.id] = canonAnswer({ type: t.type, q: rv.q }, a);
  D.cn[t.id] = 1;
  D.rv[t.id] = rv;
  if (isObj(D.pend)) delete D.pend[t.id];
  restoreTask(t, rv);
  setTaskScore(t, rv.s, rv.m);
  return true;
}

// При открытии: задания с rv в черновике восстанавливаются сразу (до отрисовки и до repairDraft, чьи проверки смотрят на ключи).
// Подпись черновика (sigs) должна совпасть с подписью задания (sg), иначе занятие изменилось и ключи устарели.
export function restoreDraftTasks(lesson, D) {
  if (!isObj(D) || !isObj(D.rv)) return 0;
  const idx = taskIndex(lesson);
  const sigs = isObj(D.sigs) ? D.sigs : {};
  let n = 0;
  Object.keys(D.rv).forEach(id => {
    const t = idx[id];
    const rv = D.rv[id];
    if (rv && rv.hidden) return;
    if (!t || !isObj(rv) || !isSealedTask(t)) return;
    if (own(sigs, id) && sigs[id] !== t.sg) return;
    restoreTask(t, rv);
    setTaskScore(t, rv.s, rv.m);
    n++;
  });
  return n;
}

// Сколько заданий ждут проверки (с ключом для оценки)
export function pendingCount(D) {
  if (!isObj(D) || !isObj(D.pend)) return 0;
  return Object.keys(D.pend).filter(id => D.pend[id] === 1).length;
}

// Черновик до выпуска (без sp) на запечатанном занятии: закрытые ответы перемешиваемых заданий каноничны (cn, разбор запросом с c:1),
// незакрытые ответы таких заданий относились к другому порядку списка — сбрасываются. Затем sp = 1. Мутирует D.
export function migrateLegacyDraft(lesson, D) {
  if (!isObj(D) || D.sp === 1 || !isSealedLesson(lesson)) return D;
  const idx = taskIndex(lesson);
  if (!isObj(D.cn)) D.cn = {};
  Object.keys(isObj(D.answers) ? D.answers : {}).forEach(id => {
    const t = idx[id];
    if (!t || !isSealedTask(t) || !SHUFFLE[t.type]) return;
    if (D.locked && D.locked[id]) D.cn[id] = 1;
    else delete D.answers[id];
  });
  D.sp = 1;
  return D;
}

// cn для сдачи: id ответов, которые уже в каноническом пространстве (только из переданных ответов)
export function canonIds(D, answers) {
  if (!isObj(D) || !isObj(D.cn) || !isObj(answers)) return [];
  return Object.keys(D.cn).filter(id => D.cn[id] && own(answers, id));
}
