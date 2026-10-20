// Оценка качества промпта без нейросети. Чистая функция, без импортов:
// копия встраивается в apps-script/Code.gs (tools/embed-sandbox.js) — сервер считает ту же оценку.
// promptScore(blocks, rubric?) → { score 0..100, checks: [{ id, ok, text }] }
//   blocks = { role, context, task, format, limits, examples } — строки; лишние поля (order) игнорируются.
//   rubric = { required: ['role', ...], keywords: ['слово', ...], min } — min сравнивает вызывающий код.

const VAGUE = [
  'что-нибудь', 'как-нибудь', 'где-нибудь', 'какой-нибудь', 'какую-нибудь', 'какие-нибудь', 'кто-нибудь', 'чем-нибудь',
  'что-то там', 'как-то так', 'всякое', 'всякие', 'разное', 'и так далее', 'и тому подобное', 'и прочее', 'и всё такое', 'и все такое',
];
const ABBR_RE = /и\s*т\.\s*[дпе]\./;
const POLITE = ['пожалуйста', 'будьте добры', 'будь добр', 'не могли бы', 'не мог бы', 'не могла бы', 'прошу', 'заранее спасибо', 'спасибо', 'извините', 'извини'];
const SHORT_RE = /(^|[^а-яё])(кратк|коротк|лаконичн|в двух словах|одним предложением)/;
const LONG_RE = /(^|[^а-яё])(подробн|развёрнут|развернут|детальн|максимально полн|как можно больше)/;
const NUM_RE = /\d|(^|[^а-яё])(один|одн[аоуи]|дв[аеуо]|три|четыре|пять|шесть|семь|восемь|девять|десять)(?![а-яё])/;

const WEIGHTS = { role: 8, context: 8, task: 12, 'task-len': 10, format: 10, concrete: 10, limits: 8, consistent: 10, example: 8, vague: 10, polite: 6 };
const RUBRIC_WEIGHT = 15;

const str = v => (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim();
const low = s => s.toLowerCase();

function countOf(text, list) {
  let n = 0;
  list.forEach(w => { let i = text.indexOf(w); while (i >= 0) { n++; i = text.indexOf(w, i + w.length); } });
  return n;
}

function findVague(text) {
  const out = [];
  VAGUE.forEach(w => { if (text.indexOf(w) >= 0) out.push(w); });
  const m = ABBR_RE.exec(text);
  if (m) out.push('и т. д.');
  return out;
}

// Пример подходит к формату: проверяем только то, что можно проверить без нейросети
function exampleFits(format, example) {
  const f = low(format);
  const e = example;
  if (/таблиц/.test(f)) return e.indexOf('|') >= 0 || e.indexOf('\t') >= 0;
  if (/json|джейсон/.test(f)) return /[{[]/.test(e);
  if (/список|пункт|маркир|перечисл|шаг/.test(f)) return /(^|\n|\s)([-*•–—]|\d+[.)])\s/.test(example) || e.indexOf(';') >= 0 || e.indexOf('\n') >= 0;
  return true;
}

export function promptScore(blocks, rubric) {
  const b = blocks && typeof blocks === 'object' ? blocks : {};
  const role = str(b.role), context = str(b.context), task = str(b.task), format = str(b.format), limits = str(b.limits);
  const examples = typeof b.examples === 'string' ? b.examples.trim() : '';
  const all = low([role, context, task, format, limits, examples].join(' \n '));
  const words = task ? task.split(' ').length : 0;
  const checks = [];
  const add = (id, weight, ok, good, bad) => checks.push({ id, ok: !!ok, text: ok ? good : bad, weight });

  add('role', WEIGHTS.role, role.length >= 4, 'Роль задана — нейросеть знает, кем быть', 'Добавь роль: «Ты — …», чтобы нейросеть выбрала нужный стиль');
  add('context', WEIGHTS.context, context.length >= 10, 'Контекст есть — ответ будет под твою ситуацию', 'Добавь контекст: для кого это и зачем, иначе ответ выйдет общим');
  add('task', WEIGHTS.task, task.length >= 5, 'Задача написана', 'Заполни задачу — что именно нужно сделать');
  add('task-len', WEIGHTS['task-len'], task.length >= 25 && words >= 5, 'Задача сформулирована развёрнуто', 'Задача слишком короткая: опиши действие и предмет хотя бы в пяти словах');
  add('format', WEIGHTS.format, format.length >= 5, 'Формат ответа указан', 'Укажи формат ответа: список, таблица, абзацы');
  add('concrete', WEIGHTS.concrete, NUM_RE.test(low(format + ' ' + limits)), 'Есть числа или объём — ответ будет нужной длины', 'Добавь конкретики: сколько пунктов, слов или абзацев');
  add('limits', WEIGHTS.limits, limits.length >= 5, 'Ограничения заданы', 'Добавь ограничения: чего не делать, какой тон, какой объём');
  const rules = low([task, format, limits].join(' '));
  const clash = (SHORT_RE.test(rules) && LONG_RE.test(rules)) || (/на\s*[«"]?ты(?![а-яё])/.test(rules) && /на\s*[«"]?вы(?![а-яё])/.test(rules));
  const real = task.length > 0; // «бесплатные» проверки считаются, только когда есть задача
  add('consistent', WEIGHTS.consistent, real && !clash, 'Ограничения не спорят друг с другом', real ? 'Ограничения противоречат: «кратко» и «подробно» (или «ты» и «вы») вместе' : 'Сначала заполни задачу');
  const fits = !examples || !format || exampleFits(format, examples);
  add('example', WEIGHTS.example, real && fits, examples ? 'Пример совпадает с форматом' : 'Пример не обязателен — для простой задачи хватит и без него', real ? 'Пример не похож на формат: если просишь таблицу или список, пример должен быть таким же' : 'Сначала заполни задачу');
  const vague = findVague(all);
  add('vague', WEIGHTS.vague, real && vague.length === 0, 'Размытых слов нет', real ? `Убери размытое: «${vague.join('», «')}» — напиши, что именно имеешь в виду` : 'Сначала заполни задачу');
  add('polite', WEIGHTS.polite, real && countOf(all, POLITE) <= 1, 'Вежливость в меру', real ? 'Слишком много «пожалуйста» и «спасибо» — нейросети хватит чёткой задачи' : 'Сначала заполни задачу');

  const r = rubric && typeof rubric === 'object' ? rubric : null;
  if (r && Array.isArray(r.required) && r.required.length) {
    const miss = r.required.filter(k => !str(b[k]));
    add('rubric-required', RUBRIC_WEIGHT, miss.length === 0, 'Все нужные блоки заполнены', 'Заполни блоки: ' + miss.join(', '));
  }
  if (r && Array.isArray(r.keywords) && r.keywords.length) {
    const miss = r.keywords.filter(k => all.indexOf(low(String(k))) < 0);
    add('rubric-keywords', RUBRIC_WEIGHT, miss.length === 0, 'Все ключевые слова на месте', 'В промпте не хватает: ' + miss.join(', '));
  }

  let total = 0, got = 0;
  checks.forEach(c => { total += c.weight; if (c.ok) got += c.weight; });
  let score = total ? Math.round((got * 100) / total) : 0;
  if (!real) score = 0; // без задачи промпта нет
  if (clash && score > 75) score = 75; // противоречие в ограничениях не даёт «отлично»
  return { score, checks: checks.map(c => ({ id: c.id, ok: c.ok, text: c.text })) };
}
