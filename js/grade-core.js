// Ядро оценивания автозаданий: чистые функции без import. Клиент (js/tasks/*.js, js/grading.js) и сервер (Code.gs) считают баллы
// одним и тем же кодом. Тело файла встраивается в apps-script/Code.gs как GRADE_CORE (node tools/embed-answer-keys.js),
// поэтому: никаких import, только export function/const; без Object.hasOwn, ??=, ||=, .at(), structuredClone.
//
// Ключ задания (taskKey) — только данные проверки, без текстов:
//   { id, type, p (баллы, по умолчанию 1), k?, v?: 'pc'|'phone', adv?:1, cs?:1, lec?:1, m?:1 (ручное), c?:1 (python/terminal: балл клиента), n? }
// k по типам: single — correct; multi — correct[]; fill — blanks[][]; swipe — answer[] карточек; order — число items;
// match — число pairs; categorize — cat[] элементов; hotspot — correct[]; prompt-builder — good[] блоков; numeric — { a, t }.

export const round1 = x => Math.round(x * 10 + Number.EPSILON) / 10;
// только примитивы (строка, число, boolean); объект/массив/функция → '' (без вызова их toString/valueOf)
const prim = s => (typeof s === 'string' ? s : typeof s === 'number' || typeof s === 'boolean' ? String(s) : '');
export const norm = s => prim(s).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

const NUM = /^[+-]?\d+(\.\d+)?$/;
// «1 234,5» → 1234.5; всё, что не является десятичным числом целиком, → NaN
export function parseNum(s) {
  const t = prim(s).replace('\u2212', '-').replace(',', '.').replace(/\s/g, '');
  const x = NUM.test(t) ? parseFloat(t) : NaN;
  return Number.isFinite(x) ? x : NaN;
}

const MANUAL_TYPES = ['text', 'file', 'dilemma'];
const pts = t => t.points ?? 1;
const arr = v => (Array.isArray(v) ? v : []);

export function taskKey(t, type) {
  type = type || t.type;
  const key = { id: t.id, type, p: pts(t) };
  if (t.variant) key.v = t.variant;
  if (t.level === 'adv') key.adv = 1;
  if (t.case) key.cs = 1;
  if (MANUAL_TYPES.indexOf(type) >= 0) { key.m = 1; return key; }
  switch (type) {
    case 'single': case 'multi': case 'hotspot': key.k = t.correct; break;
    case 'fill': key.k = t.blanks; break;
    case 'swipe': key.k = arr(t.cards).map(c => c.answer); break;
    case 'order': key.k = arr(t.items).length; break;
    case 'match': key.k = arr(t.pairs).length; break;
    case 'categorize': key.k = arr(t.items).map(it => it.cat); break;
    case 'prompt-builder': key.k = arr(t.blocks).map(b => b.good); break;
    case 'numeric': key.k = { a: t.answer, t: t.tolerance ?? 0 }; break;
    case 'python': key.c = 1; key.n = arr(t.tests).length; break;
    case 'terminal': key.c = 1; key.n = arr(t.goals).length; break;
    default: throw new Error('grade-core: неизвестный тип задания ' + type);
  }
  return key;
}

const clamp = (x, p) => (x > 0 ? (x < p ? x : p) : 0);

function fraction(p, good, total) {
  return { score: total > 0 ? clamp(round1(p * good / total), p) : 0, max: p };
}

// { score, max } автозадания по ключу; ручные и c:1 (python/terminal) — 0 (их балл решает вызывающий)
export function checkKey(key, a) {
  const p = key.p;
  const k = key.k;
  if (key.m || key.c) return { score: 0, max: p };
  switch (key.type) {
    case 'single': return { score: a === k ? p : 0, max: p };
    case 'multi': {
      const ok = Array.isArray(a) && a.length === k.length && k.every(i => a.includes(i));
      return { score: ok ? p : 0, max: p };
    }
    case 'fill': {
      const good = k.filter((acc, i) => Array.isArray(a) && acc.map(norm).includes(norm(a[i]))).length;
      return fraction(p, good, k.length);
    }
    case 'swipe': return fraction(p, k.filter((ans, i) => Array.isArray(a) && a[i] === ans).length, k.length);
    case 'order': case 'match': return fraction(p, Array.isArray(a) ? a.slice(0, k).filter((v, i) => v === i).length : 0, k); // только позиции 0..k-1
    case 'categorize': return fraction(p, k.filter((cat, i) => Array.isArray(a) && a[i] === cat).length, k.length);
    case 'hotspot': {
      const sel = new Set(Array.isArray(a) ? a : []);
      const hits = k.filter(i => sel.has(i)).length;
      const fp = Array.from(sel).filter(i => !k.includes(i)).length;
      return fraction(p, Math.max(0, hits - fp), k.length);
    }
    case 'prompt-builder': {
      const sel = Array.isArray(a && a.selected) ? a.selected : [];
      // индексы блоков: целые числа внутри диапазона, каждый блок один раз
      const uniq = Array.from(new Set(sel.filter(i => typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < k.length)));
      const good = uniq.filter(i => k[i] === true).length;
      const bad = uniq.filter(i => k[i] === false).length;
      return fraction(p, Math.max(0, good - bad), k.filter(g => g).length);
    }
    case 'numeric': {
      const x = parseNum(a);
      const ok = Number.isFinite(x) && Math.abs(x - k.a) <= (k.t ?? 0) + 1e-9;
      return { score: ok ? p : 0, max: p };
    }
    default: throw new Error('grade-core: неизвестный тип ключа ' + key.type);
  }
}

const sum = (list, f) => round1(list.reduce((s, i) => s + f(i), 0));

// балл python/terminal: от клиента по id (первое вхождение), в пределах 0..max, иначе 0
function clientScore(clientItems, key) {
  const list = Array.isArray(clientItems) ? clientItems : [];
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    if (it && typeof it === 'object' && it.id === key.id) {
      const x = typeof it.score === 'number' || typeof it.score === 'string' ? Number(it.score) : NaN;
      return Number.isFinite(x) ? round1(Math.min(key.p, Math.max(0, x))) : 0;
    }
  }
  return 0;
}

function gradeKey(key, answers, clientItems) {
  const r = key.c ? { score: clientScore(clientItems, key), max: key.p } : checkKey(key, answers[key.id]);
  return { id: key.id, type: key.type, score: clamp(r.score, key.p), max: r.max, manual: !!key.m };
}

// L = { pv?, tasks }; повторяет js/grading.js gradeLesson. variant учитывается, только если у занятия есть варианты (pv).
export function gradeLessonKeys(L, answers, variant, clientItems) {
  const ans = answers && typeof answers === 'object' ? answers : {};
  const keys = arr(L && L.tasks).filter(key => key.lec || !(variant && L.pv) || !key.v || key.v === variant);
  const items = keys.map(key => {
    const item = gradeKey(key, ans, clientItems);
    if (key.adv) item.adv = true;
    return item;
  });
  const auto = items.filter(i => !i.manual);
  const advItems = items.filter(i => i.adv);
  return {
    items,
    score: sum(auto, i => i.score),
    max: sum(auto, i => i.max),
    manualMax: sum(items.filter(i => i.manual), i => i.max),
    perfectTypes: Array.from(new Set(auto.filter(i => i.max > 0 && i.score === i.max).map(i => i.type))),
    adv: {
      max: sum(advItems.filter(i => !i.manual), i => i.max),
      manualMax: sum(advItems.filter(i => i.manual), i => i.max),
      done: advItems.some(i => !i.manual && i.max > 0 && i.score === i.max),
    },
  };
}

// list — ключи ДЗ одного уровня (hw.base или hw.adv); повторяет js/grading-v4.js gradeHomework
export function gradeHomeworkKeys(list, answers, clientItems) {
  const ans = answers && typeof answers === 'object' ? answers : {};
  const items = arr(list).map(key => gradeKey(key, ans, clientItems));
  const auto = items.filter(i => !i.manual);
  return { items, score: sum(auto, i => i.score), max: sum(auto, i => i.max) };
}
