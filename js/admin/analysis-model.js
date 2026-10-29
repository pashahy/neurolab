// Анализ заданий: чистая логика вкладки «Анализ» (ответ adminTaskAnalysis -> строки для показа). Без DOM.
import { allTasks } from '../lesson-model.js';
import { taskLabel } from './summary.js';

export const HARD_PCT = 40; // «трудное»: верно меньше 40%
export const HARD_MIN_N = 3; // и ответили хотя бы трое (в группе меньше — все ответившие)

const arr = v => (Array.isArray(v) ? v : []);
const cnt = v => (typeof v === 'number' && isFinite(v) && v > 0 ? Math.floor(v) : 0);
const clip = (s, n = 120) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };

// доля верных, целые проценты; null, если ответивших нет
export function pctRight(t) {
  const n = cnt(t && t.n);
  return n ? Math.max(0, Math.min(100, Math.round(cnt(t.right) / n * 100))) : null;
}

export function isHard(t, count) {
  if (!t || t.manual) return false;
  const p = pctRight(t);
  return p !== null && p < HARD_PCT && cnt(t.n) >= Math.min(HARD_MIN_N, Math.max(1, cnt(count)));
}

// ключ неверного ответа (см. answerKey_ на сервере) -> понятная подпись по заданию из файла занятия
export function answerLabel(task, type, key) {
  const k = String(key == null ? '' : key);
  const nums = /^\d+(,\d+)*$/.test(k) ? k.split(',').map(Number) : null;
  const pick = (list, i) => (Array.isArray(list) && i < list.length ? clip(list[i], 80) : `№${i + 1}`);
  if (nums && task && (type === 'single' || type === 'multi')) return nums.map(i => pick(task.options, i)).join('; ');
  if (nums && task && type === 'hotspot') return nums.map(i => pick(task.lines, i)).join('; ');
  return clip(k, 80);
}

// Строки таблицы по ответу сервера и файлу занятия (lesson может быть null).
// Порядок строк — как в занятии; задания, которых нет в файле, — в конце в порядке ответа.
export function buildRows(data, lesson) {
  const count = cnt(data && data.count);
  const order = new Map();
  allTasks(lesson).forEach((t, i) => { if (t && !order.has(String(t.id))) order.set(String(t.id), i); });
  const rows = arr(data && data.tasks).filter(t => t && typeof t.id === 'string').map((t, pos) => {
    const lab = taskLabel(lesson, t.id);
    const task = lesson ? (allTasks(lesson, t.variant).find(x => x && String(x.id) === t.id) || null) : null;
    const wrong = arr(t.wrong).filter(w => w && cnt(w.n)).map(w => ({ label: answerLabel(task, t.type, w.a), n: cnt(w.n) }));
    return {
      id: t.id, type: String(t.type || ''), variant: t.variant === 'pc' || t.variant === 'phone' ? t.variant : null, split: !!t.split,
      name: lab.name, text: lab.text, manual: !!t.manual, n: cnt(t.n), right: cnt(t.right), wrongN: cnt(t.wrongN),
      pct: t.manual ? null : pctRight(t), hard: isHard(t, count), wrong,
      ord: order.has(t.id) ? order.get(t.id) : 1e6 + pos,
    };
  });
  rows.sort((a, b) => a.ord - b.ord);
  return rows;
}

// трудные (по возрастанию доли верных) и остальные (в порядке занятия)
export function splitHard(rows) {
  const hard = rows.filter(r => r.hard).sort((a, b) => (a.pct - b.pct) || (a.ord - b.ord));
  return { hard, rest: rows.filter(r => !r.hard) };
}
