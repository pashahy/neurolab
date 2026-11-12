// Запечатывание заданий: sealTask убирает ключи и раскрывающие пояснения (они уходят на сервер), переставляет списки по q;
// restoreTask возвращает исходное задание по ключам, пришедшим с сервера. Без import из браузерных модулей (работает и в сборке, и в клиенте).
//
// pub — задание для сайта: без ключей, pub.sl = 1 (что-то убрано), pub.sg = подпись исходного задания (djb2, как sigOf в js/draft.js),
// у fill pub.bn = число пропусков. x — убранные поля в КАНОНИЧЕСКОМ виде (списки в порядке исходника), короткие имена:
//   e — explain (любой тип); c — correct (single, multi, hotspot) / cat[] (categorize); b — blanks (fill); a — answer (numeric) / answer[] карточек (swipe);
//   t — tolerance (numeric); ce — explain[] карточек swipe; g — good[] (prompt-builder); w — why[] блоков; n — notes (hotspot); s — solution (python, terminal).
import { SHUFFLE } from './seal-core.js';

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const arr = v => (Array.isArray(v) ? v : []);
const clone = v => JSON.parse(JSON.stringify(v));

// djb2-подпись задания — тот же алгоритм, что sigOf в js/draft.js (тест сверяет)
export const sealSig = t => { const s = JSON.stringify(t); let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

// Поля верхнего уровня, которые убираются целиком: тип → [поле, короткое имя в x]
export const STRIP = {
  single: [['correct', 'c']],
  multi: [['correct', 'c']],
  fill: [['blanks', 'b']],
  numeric: [['answer', 'a'], ['tolerance', 't']],
  hotspot: [['correct', 'c'], ['notes', 'n']],
  python: [['solution', 's']],
  terminal: [['solution', 's']],
};
// Вложенные поля элементов списка: тип → { список, поля: [[поле элемента, имя в x]] }
const NESTED = {
  swipe: { list: 'cards', fields: [['answer', 'a'], ['explain', 'ce']] },
  categorize: { list: 'items', fields: [['cat', 'c']] },
  'prompt-builder': { list: 'blocks', fields: [['good', 'g'], ['why', 'w']] },
};

const isTask = t => isObj(t) && typeof t.type === 'string';

// Применить перестановку: pub.list[j] = orig.list[q[j]]; у match — только правые части пар
function permute(t, sh, q) {
  const list = t[sh.field];
  if (!Array.isArray(list) || list.length !== q.length) return;
  t[sh.field] = list.map((_, j) => (sh.part === undefined ? list[q[j]] : [list[j][0], list[q[j]][sh.part]]));
}

// Обратная перестановка: orig.list[q[j]] = pub.list[j]
function unpermute(t, sh, q) {
  const list = t[sh.field];
  if (!Array.isArray(list) || list.length !== q.length) return;
  const out = list.map(it => (sh.part === undefined ? undefined : [it[0], undefined]));
  list.forEach((it, j) => { if (sh.part === undefined) out[q[j]] = it; else out[q[j]][sh.part] = it[sh.part]; });
  t[sh.field] = out;
}

// → { pub, x }. q — перестановка из tools/seal-content.js (для типов из SHUFFLE при длине списка ≥ 2), без неё списки не переставляются.
export function sealTask(t, q) {
  if (!isTask(t)) return { pub: t, x: {} };
  const sg = sealSig(t);
  const pub = clone(t);
  const x = {};
  let removed = false;
  if (own(pub, 'explain')) { x.e = pub.explain; delete pub.explain; removed = true; }
  arr(STRIP[pub.type]).forEach(([f, s]) => { if (own(pub, f)) { x[s] = pub[f]; delete pub[f]; removed = true; } });
  if (pub.type === 'fill' && Array.isArray(t.blanks)) pub.bn = t.blanks.length;
  const nes = NESTED[pub.type];
  if (nes && Array.isArray(pub[nes.list])) {
    nes.fields.forEach(([f, s]) => {
      if (!pub[nes.list].some(it => isObj(it) && own(it, f))) return;
      x[s] = pub[nes.list].map(it => (isObj(it) && own(it, f) ? it[f] : null));
      pub[nes.list].forEach(it => { if (isObj(it)) delete it[f]; });
      removed = true;
    });
  }
  const sh = SHUFFLE[pub.type];
  if (sh && Array.isArray(q)) permute(pub, sh, q);
  // переставленный список без убранных полей — тоже запечатан: локальная проверка по опубликованному порядку неверна
  if (removed || (sh && Array.isArray(q))) pub.sl = 1;
  // sg — djb2 исходного задания (с ключами): перебором не найти, только если в x есть длинный текст (пояснение);
  // иначе подпись запечатанного вида (черновик до выпуска для такого задания сбросится)
  pub.sg = typeof x.e === 'string' && x.e.trim().length >= 20 ? sg : sealSig(pub);
  return { pub, x };
}

// Восстановление ИСХОДНОГО задания (мутирует pub и возвращает его). rv = { q?, x? }; sl и bn удаляются, sg остаётся
// (по нему черновик узнаёт задание и после восстановления: JSON восстановленного объекта может отличаться порядком полей).
export function restoreTask(pub, rv) {
  if (!isTask(pub)) return pub;
  const x = rv && isObj(rv.x) ? rv.x : {};
  const q = rv && Array.isArray(rv.q) ? rv.q : null;
  const sh = SHUFFLE[pub.type];
  if (sh && q) unpermute(pub, sh, q);
  const nes = NESTED[pub.type];
  if (nes && Array.isArray(pub[nes.list])) {
    nes.fields.forEach(([f, s]) => {
      if (!Array.isArray(x[s])) return;
      pub[nes.list].forEach((it, i) => { if (isObj(it) && x[s][i] !== null && x[s][i] !== undefined) it[f] = x[s][i]; });
    });
  }
  arr(STRIP[pub.type]).forEach(([f, s]) => { if (own(x, s)) pub[f] = x[s]; });
  if (own(x, 'e')) pub.explain = x.e;
  delete pub.sl;
  delete pub.bn;
  return pub;
}

// Списки с заданиями занятия (массивы, элементы заменяются на месте): контрольные вопросы лекции, практика, разминка,
// проверки инструктажа, ДЗ обоих уровней. Цели (goal.tasks) — строки, не задания.
export function taskLists(lesson) {
  if (!isObj(lesson)) return [];
  const out = [];
  arr(lesson.lecture).forEach(s => { if (isObj(s) && Array.isArray(s.check)) out.push(s.check); });
  [lesson.tasks, lesson.warmup, lesson.safety && lesson.safety.check,
    lesson.homework && lesson.homework.base && lesson.homework.base.tasks,
    lesson.homework && lesson.homework.adv && lesson.homework.adv.tasks].forEach(l => { if (Array.isArray(l)) out.push(l); });
  return out;
}

// Запечатанная копия занятия и ключи по id заданий: { lesson, keys: { [id]: { q?, x? } } }.
// qFor(id, len, type) → перестановка или null (задаёт tools/seal-content.js). Поле board (интерактивы доски со своими ключами)
// студенческому сайту не нужно: сервер берёт интерактивы из content/board.json (tools/build-board.js) — из копии убирается.
export function sealLesson(lesson, { qFor } = {}) {
  const out = clone(lesson);
  delete out.board;
  const keys = {};
  const seen = {};
  taskLists(out).forEach(list => list.forEach((t, i) => {
    if (!isTask(t)) return;
    if (own(seen, t.id)) throw new Error(`seal: id задания «${t.id}» повторяется в занятии`);
    const sh = SHUFFLE[t.type];
    const len = sh && Array.isArray(t[sh.field]) ? t[sh.field].length : 0;
    const q = sh && len >= 2 && qFor ? qFor(t.id, len, t.type) : null;
    const r = sealTask(t, q);
    list[i] = r.pub;
    const k = {};
    if (q) k.q = q;
    if (Object.keys(r.x).length) k.x = r.x;
    seen[t.id] = 1;
    if (k.q || k.x) keys[t.id] = k;
  }));
  return { lesson: out, keys };
}

// Обратное к canonAnswer: каноническое задание ответа → опубликованное (нужно тестам и проверке «как у ученика»)
export function publishAnswer(key, a) {
  const q = key && key.q;
  if (!Array.isArray(q) || !key.type) return a;
  const inv = [];
  q.forEach((c, j) => { inv[c] = j; });
  const one = v => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < q.length ? inv[v] : v);
  switch (key.type) {
    case 'single': return one(a);
    case 'multi': case 'order': case 'match': return Array.isArray(a) ? a.map(one) : a;
    case 'prompt-builder': return isObj(a) && Array.isArray(a.selected) ? Object.assign({}, a, { selected: a.selected.map(one) }) : a;
    case 'swipe': case 'categorize': return Array.isArray(a) ? q.map(c => a[c]) : a;
    default: return a;
  }
}

// Обратное: по ключам восстановить все задания занятия на месте (клиент после ответа сервера делает это точечно через restoreTask)
export function restoreLesson(lesson, keys) {
  taskLists(lesson).forEach(list => list.forEach(t => { if (isTask(t) && keys && keys[t.id]) restoreTask(t, keys[t.id]); }));
  return lesson;
}
