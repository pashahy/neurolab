// Ядро запечатывания: чистые функции без import. Сервер (Code.gs, блок SEAL_CORE) и сборка/клиент считают одним кодом.
// Тело файла встраивается в apps-script/Code.gs (node tools/embed-answer-keys.js), поэтому: никаких import, только
// export function/const; без Object.hasOwn, ??=, ||=, .at(), structuredClone.
//
// Перестановка q: q[j] = канонический индекс элемента, который в опубликованном (запечатанном) задании стоит на месте j.
// Опубликованное пространство ответов — индексы в переставленных списках; каноническое — индексы исходника (по нему считает checkKey).

// Что перемешивается: field — поле-список задания; mode — как устроен ответ.
//   values    — ответ содержит индексы элементов списка (single/multi/order/match/prompt-builder.selected): значения переводятся через q;
//   positions — ответ индексируется позицией элемента (swipe/categorize): out[q[j]] = a[j].
// hotspot, fill, numeric — без перестановки.
export const SHUFFLE = {
  single: { field: 'options', mode: 'values' },
  multi: { field: 'options', mode: 'values' },
  order: { field: 'items', mode: 'values' },
  match: { field: 'pairs', mode: 'values', part: 1 }, // переставляются только правые части пар
  'prompt-builder': { field: 'blocks', mode: 'values' },
  swipe: { field: 'cards', mode: 'positions' },
  categorize: { field: 'items', mode: 'positions' },
};

// индекс элемента опубликованного списка → канонический; всё некорректное → -1 (checkKey даст за это 0)
function idx(q, v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < q.length ? q[v] : -1;
}

// Ответ из опубликованного пространства → в каноническое. key.q — перестановка; без неё ответ не меняется.
// Враждебные ответы не бросают исключений: некорректные элементы заменяются на -1 или undefined.
export function canonAnswer(key, a) {
  const q = key && key.q;
  if (!Array.isArray(q) || !key.type) return a;
  switch (key.type) {
    case 'single': return idx(q, a);
    case 'multi': return Array.isArray(a) ? a.map(v => idx(q, v)).sort((x, y) => x - y) : a;
    case 'order': case 'match': return Array.isArray(a) ? a.map(v => idx(q, v)) : a;
    case 'prompt-builder':
      if (!a || typeof a !== 'object' || !Array.isArray(a.selected)) return a;
      return Object.assign({}, a, { selected: a.selected.map(v => idx(q, v)) });
    case 'swipe': case 'categorize': {
      if (!Array.isArray(a)) return a;
      const out = [];
      for (let j = 0; j < q.length; j++) out[q[j]] = a[j];
      return out;
    }
    default: return a;
  }
}
