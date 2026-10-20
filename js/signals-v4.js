// Сигналы занятия v4 (B3): вставки в редактор Python и уходы со страницы. Не запрещаем и не наказываем — только считаем,
// чтобы преподаватель увидел «повод присмотреться» на «Моём экране» и в «Проверке». Доске сигналы не уходят.
const MAX_LINES = 100000, MAX_TASKS = 50, MAX_AWAY_COUNT = 1000, MAX_AWAY_MS = 86400000;
const ID_RE = /^[\w-]{1,64}$/;

const clampInt = (v, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
};

// Строк во вставленном тексте: пустой или из одних пробелов/переводов строк — 0; завершающий перевод строки новой строки не добавляет.
export function countPasteLines(text) {
  const s = typeof text === 'string' ? text : '';
  if (!s.trim()) return 0;
  return Math.min(MAX_LINES, s.replace(/(\r\n|\r|\n)+$/, '').split(/\r\n|\r|\n/).length);
}

// Накопительный счёт по заданиям: новый объект { <taskId>: строк }; вставка без строк или чужой id ничего не меняет.
export function addPaste(paste, taskId, text) {
  const cur = paste && typeof paste === 'object' && !Array.isArray(paste) ? paste : {};
  const n = countPasteLines(text);
  if (!n || !ID_RE.test(String(taskId))) return cur;
  const out = Object.assign({}, cur);
  out[taskId] = Math.min(MAX_LINES, clampInt(cur[taskId], MAX_LINES) + n);
  return out;
}

export const pasteTotal = paste => (paste && typeof paste === 'object'
  ? Math.min(MAX_LINES, Object.keys(paste).reduce((s, k) => s + clampInt(paste[k], MAX_LINES), 0)) : 0);

// Черновик из хранилища: только допустимые id (keep(id)) и целые 1..100000, не больше 50 заданий.
export function cleanPaste(raw, keep = () => true) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const id of Object.keys(raw)) {
    if (Object.keys(out).length >= MAX_TASKS) break;
    const n = clampInt(raw[id], MAX_LINES);
    if (n > 0 && ID_RE.test(id) && keep(id)) out[id] = n;
  }
  return out;
}

// Учёт ухода js/live-pulse.js лежит в хранилище по ключу live:away2:<d>:<n> как { count, ms }.
export function readAway(storage, d, n) {
  try {
    const raw = storage && storage.getItem(`live:away2:${d}:${n}`);
    const o = raw ? JSON.parse(raw) : null;
    if (o && typeof o === 'object') return { count: clampInt(o.count, MAX_AWAY_COUNT), ms: clampInt(o.ms, MAX_AWAY_MS) };
  } catch { /* хранилище недоступно или значение испорчено */ }
  return { count: 0, ms: 0 };
}

// Поле v4.signals сдачи: { paste: { <taskId>: строк }, away: { count, ms } }.
export function buildSignals(draft, storage, d, n) {
  return { paste: cleanPaste(draft && draft.paste), away: readAway(storage, d, n) };
}

// Обработчик события paste: отдаёт колбэку вставленный текст. Вставку НЕ запрещает (preventDefault не вызывается), сбои глотает.
export function handlePaste(e, cb) {
  try {
    const text = e && e.clipboardData && typeof e.clipboardData.getData === 'function' ? e.clipboardData.getData('text') : '';
    if (text && typeof cb === 'function') cb(text);
  } catch { /* учёт сигналов не должен мешать вводу */ }
}
