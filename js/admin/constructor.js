// Конструктор занятий v4: собирает content/<d>/pzNNN.js без ручной правки кода.
// Вкладка «🛠 Конструктор» панели преподавателя. Формат — docs/content-format.md («Формат v4»).
import { h, add } from '../util/dom.js';
import { loadCourse, loadLesson, lessonFile } from '../content.js';
import { DISCIPLINES } from '../config.js';
import { errText } from '../ui/login.js';

const DRAFT_KEY = 'pz-constructor-draft-v1';
const ID_RE = /^[\w-]{1,64}$/;
const AUTO_TYPES = new Set(['single', 'multi', 'fill', 'swipe', 'order', 'match', 'categorize', 'hotspot', 'prompt-builder', 'numeric', 'python', 'terminal']);
const MANUAL_TYPES = new Set(['text', 'dilemma', 'file']);
const ALL_TYPES = [...AUTO_TYPES, ...MANUAL_TYPES];
const FILE_ACCEPT = ['xlsx', 'xls', 'csv', 'py', 'ipynb', 'docx', 'pdf', 'png', 'jpg', 'jpeg', 'txt', 'md', 'zip'];
const BOARD_AT = ['intro', 's1', 's2', 's3', 's4', 's5', 'practice', 'outro'];

// ---------- шаблоны ----------

function blankTask(type) {
  const t = { id: '', type, points: 1, text: '' };
  switch (type) {
    case 'single': return { ...t, options: ['', ''], correct: 0, explain: '' };
    case 'multi': return { ...t, options: ['', ''], correct: [0], explain: '' };
    case 'numeric': return { ...t, answer: 0, tolerance: 0, unit: '', explain: '' };
    case 'fill': return { ...t, template: 'Ответ: {{0}}', blanks: [['']], explain: '' };
    case 'swipe': return { ...t, cards: [{ text: '', answer: true, explain: '' }], explain: '' };
    case 'order': return { ...t, items: ['', ''], explain: '' };
    case 'match': return { ...t, pairs: [['', ''], ['', '']], explain: '' };
    case 'categorize': return { ...t, categories: ['', ''], items: [{ text: '', cat: 0 }], explain: '' };
    case 'hotspot': return { ...t, code: true, lines: ['', ''], correct: [0], explain: '' };
    case 'prompt-builder': return { ...t, blocks: [{ text: '', kind: 'task', good: true, why: '' }], explain: '' };
    case 'numeric2': return t;
    case 'text': return { ...t, points: 4, minLength: 100, rows: 5, placeholder: '', rubric: [''], copy: '' };
    case 'dilemma': return { ...t, points: 4, start: '', reflect: '', minLength: 50, scenes: { start: { text: '', choices: [{ text: '', next: 'end' }] } } };
    case 'python': return { ...t, points: 3, starter: '', solution: '', tests: [{ name: '', code: '' }], packages: [], explain: '' };
    case 'terminal': return { ...t, points: 3, goals: [{ text: '', kind: 'file', path: '' }], solution: [''], explain: '' };
    case 'file': return { ...t, points: 3, accept: ['txt'], maxMb: 1, rubric: [''], note: '' };
    default: return t;
  }
}

function blankLesson(d, n) {
  return {
    discipline: d, number: n, title: '', topic: '', version: 4,
    minutes: { intro: 5, theory: 20, practice: 60, outro: 5 },
    story: { from: 'lena', text: '' },
    career: '', method: 'Проблемное обучение, кейс-метод, работа в командах',
    goal: {
      question: '',
      skills: [
        { text: '', need: true, why: '' },
        { text: '', need: true, why: '' },
        { text: '', need: true, why: '' },
        { text: '', need: true, why: '' },
        { text: '', need: false, why: '' },
      ],
      goal: '',
      tasks: ['', '', ''],
    },
    warmup: [{ id: 'w1', ref: Math.max(1, n - 1), type: 'single', points: 0, text: '', options: ['', ''], correct: 0, explain: '' }],
    lecture: [
      { id: 's1', title: '', body: '', check: [{ id: 'l1', type: 'single', points: 1, text: '', options: ['', ''], correct: 0, explain: '' }] },
      { id: 's2', title: '', body: '', check: [{ id: 'l3', type: 'single', points: 1, text: '', options: ['', ''], correct: 0, explain: '' }] },
      { id: 's3', title: '', body: '', check: [{ id: 'l5', type: 'single', points: 1, text: '', options: ['', ''], correct: 0, explain: '' }] },
      { id: 's4', title: '', body: '', check: [{ id: 'l7', type: 'single', points: 1, text: '', options: ['', ''], correct: 0, explain: '' }] },
      { id: 's5', title: '', body: '', check: [{ id: 'l9', type: 'single', points: 1, text: '', options: ['', ''], correct: 0, explain: '' }] },
    ],
    glossary: [{ term: '', def: '' }],
    cases: [{ id: 'c1', title: '', text: '' }],
    safety: {
      rules: [
        { rule: '', why: '' },
        { rule: '', why: '' },
        { rule: '', why: '', variant: 'phone' },
        { rule: '', why: '', variant: 'pc' },
      ],
      check: [{ id: 'sc1', type: 'single', points: 0, text: '', options: ['', ''], correct: 0, explain: '' }],
    },
    tasks: [],
    board: [{ id: 'b1', at: 'intro', kind: 'poll', text: '', options: ['', ''] }],
    homework: {
      why: '',
      base: { title: '', tasks: [{ id: 'hb1', type: 'single', points: 2, text: '', options: ['', ''], correct: 0, explain: '' }] },
      adv: { title: '', tasks: [{ id: 'ha1', type: 'single', points: 3, text: '', options: ['', ''], correct: 0, explain: '' }] },
    },
  };
}

// ---------- сериализация в pz-файл ----------

const isIdent = k => /^[A-Za-z_$][\w$]*$/.test(k);

function serStr(s, ind) {
  if (!s.includes('\n') && !s.includes('`') && !s.includes('${') && !s.includes('\\')) return JSON.stringify(s);
  const esc = s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  return '`' + esc + '`';
}

function ser(v, ind) {
  const pad = '  '.repeat(ind), padIn = '  '.repeat(ind + 1);
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return serStr(v, ind);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    const simple = v.every(x => x === null || ['number', 'boolean'].includes(typeof x) || (typeof x === 'string' && !x.includes('\n') && x.length <= 40));
    if (simple && v.join('').length < 60) return `[${v.map(x => ser(x, 0)).join(', ')}]`;
    return `[\n${v.map(x => padIn + ser(x, ind + 1)).join(',\n')}\n${pad}]`;
  }
  const keys = Object.keys(v).filter(k => v[k] !== undefined && !(Array.isArray(v[k]) && !v[k].length && !['options', 'correct', 'accept', 'pairs', 'cards', 'items', 'lines', 'tests', 'goals', 'solution', 'blanks', 'blocks', 'categories', 'rules', 'check', 'skills', 'tasks', 'board', 'packages', 'rubric'].includes(k)));
  if (!keys.length) return '{}';
  const items = keys.map(k => `${padIn}${isIdent(k) ? k : JSON.stringify(k)}: ${ser(v[k], ind + 1)}`);
  if (items.join('').length < 60 && !items.some(s => s.includes('\n'))) return `{ ${items.map(s => s.trim()).join(', ')} }`;
  return `{\n${items.join(',\n')}\n${pad}}`;
}

const moduleSource = lesson => `// Собрано в конструкторе ПЗ (#/admin/constructor). Перед публикацией: npm run extract && npm run validate && npm test.
export default ${ser(lesson, 0)};
`;

// ---------- клиентская проверка (основные правила v4; финальный шлюз — npm run validate) ----------

const words = s => String(s || '').replace(/[`*#>|]/g, ' ').split(/\s+/).filter(Boolean).length;
const isAuto = t => AUTO_TYPES.has(t.type);
const taskPoints = t => Number(t.points) || 0;

function checkTask(t, where, errors) {
  const w = `${where} (${t.id || 'без id'})`;
  if (!t.id || !ID_RE.test(t.id)) errors.push(`${w}: id — латиница/цифры/_/-, 1–64 символа`);
  if (!ALL_TYPES.includes(t.type)) errors.push(`${w}: неизвестный тип «${t.type}»`);
  if (!String(t.text || '').trim() && t.type !== 'dilemma') errors.push(`${w}: пустая формулировка text`);
  const opts = t.options || [];
  if (t.type === 'single' || t.type === 'multi') {
    if (opts.length < 2 || opts.some(o => !String(o).trim())) errors.push(`${w}: нужно ≥ 2 непустых варианта`);
    if (t.type === 'single' && !(Number.isInteger(t.correct) && t.correct >= 0 && t.correct < opts.length)) errors.push(`${w}: correct вне диапазона вариантов`);
    if (t.type === 'multi' && !(Array.isArray(t.correct) && t.correct.length && t.correct.every(i => Number.isInteger(i) && i >= 0 && i < opts.length))) errors.push(`${w}: correct — непустой массив индексов вариантов`);
  }
  if (t.type === 'numeric' && !Number.isFinite(Number(t.answer))) errors.push(`${w}: answer — число`);
  if (t.type === 'fill') {
    const n = (String(t.template || '').match(/\{\{\d+\}\}/g) || []).length;
    if (!n || !Array.isArray(t.blanks) || t.blanks.length !== n) errors.push(`${w}: число blanks (${(t.blanks || []).length}) не совпадает с числом {{N}} в template (${n})`);
  }
  if (t.type === 'swipe' && !(Array.isArray(t.cards) && t.cards.length >= 2 && t.cards.every(c => String(c.text || '').trim() && typeof c.answer === 'boolean'))) errors.push(`${w}: нужно ≥ 2 карточки с text и answer true/false`);
  if (t.type === 'order' && !(Array.isArray(t.items) && t.items.length >= 2 && t.items.every(i => String(i).trim()))) errors.push(`${w}: items — ≥ 2 непустых строк в правильном порядке`);
  if (t.type === 'match' && !(Array.isArray(t.pairs) && t.pairs.length >= 2 && t.pairs.every(p => p[0].trim() && p[1].trim()))) errors.push(`${w}: pairs — ≥ 2 пары непустых строк`);
  if (t.type === 'categorize' && !(Array.isArray(t.categories) && t.categories.length >= 2 && Array.isArray(t.items) && t.items.length && t.items.every(i => String(i.text || '').trim() && Number.isInteger(i.cat) && i.cat >= 0 && i.cat < t.categories.length))) errors.push(`${w}: categories ≥ 2, у items — text и cat в диапазоне`);
  if (t.type === 'hotspot' && !(Array.isArray(t.lines) && t.lines.length >= 2 && Array.isArray(t.correct) && t.correct.length && t.correct.every(i => Number.isInteger(i) && i >= 0 && i < t.lines.length))) errors.push(`${w}: lines ≥ 2, correct — индексы строк`);
  if (t.type === 'python') {
    if (!String(t.starter || '').trim()) errors.push(`${w}: пустой starter`);
    if (!String(t.solution || '').trim()) errors.push(`${w}: пустой solution (валидатор прогоняет эталон)`);
    if (!Array.isArray(t.tests) || !t.tests.length || t.tests.some(x => !String(x.name || '').trim() || !String(x.code || '').includes('assert'))) errors.push(`${w}: ≥ 1 теста с именем и assert`);
    if (String(t.starter) === String(t.solution)) errors.push(`${w}: starter совпадает с solution — стартер не должен проходить тесты`);
    if (Array.isArray(t.packages) && t.packages.some(p => !/^[\w-]+$/.test(p))) errors.push(`${w}: packages — имена пакетов (numpy)`);
  }
  if (t.type === 'terminal' && !(Array.isArray(t.goals) && t.goals.length && Array.isArray(t.solution) && t.solution.length)) errors.push(`${w}: нужны goals и solution`);
  if (t.type === 'text' && !(Number(t.minLength) >= 10)) errors.push(`${w}: minLength ≥ 10`);
  if (t.type === 'file') {
    if (!Array.isArray(t.accept) || !t.accept.length || t.accept.some(a => !FILE_ACCEPT.includes(a))) errors.push(`${w}: accept — расширения из белого списка (${FILE_ACCEPT.join(', ')})`);
    if (taskPoints(t) < 3 || taskPoints(t) > 5) errors.push(`${w}: points для file — 3–5`);
    if (t.variant !== 'pc') errors.push(`${w}: file допустим только в ПК-варианте (variant: 'pc')`);
  }
}

function validateLessonV4(ls) {
  const errors = [], warnings = [];
  if (!ls.title.trim()) errors.push('Пустое название (title) — дословно из index.js');
  if (!ls.topic.trim()) errors.push('Пустая тема (topic)');
  if (ls.version !== 4) errors.push('version должен быть 4');
  const m = ls.minutes;
  const sum = ['intro', 'theory', 'practice', 'outro'].every(k => Number(m[k]) > 0) ? m.intro + m.theory + m.practice + m.outro : -1;
  if (sum !== 90) errors.push(`Минуты: 4 положительных числа, сумма ровно 90 (сейчас ${sum})`);
  if (!ls.career.trim() || !ls.method.trim()) errors.push('Заполните career и method');
  if (!ls.story.text.trim()) errors.push('Пустая вводная story.text');

  const g = ls.goal;
  if (g.skills.length < 5 || g.skills.length > 6) errors.push(`Умений 5–6 (сейчас ${g.skills.length})`);
  const noNeed = g.skills.filter(s => s.need === false).length;
  if (noNeed < 1 || noNeed > 2) errors.push(`Лишних умений (need: нет) должно быть 1–2 (сейчас ${noNeed})`);
  g.skills.forEach((s, i) => { if (!s.text.trim() || !s.why.trim()) errors.push(`Умение ${i + 1}: заполните text и why`); });
  if (!g.goal.trim()) errors.push('Пустая цель (goal.goal)');
  if (g.tasks.filter(t => t.trim()).length < 3) errors.push('Задачи занятия: 3–4 непустые (goal.tasks)');

  // id по всему занятию
  const seen = new Map();
  const reg = (t, where) => { if (t.id) { if (seen.has(t.id)) errors.push(`id «${t.id}» повторяется (${seen.get(t.id)} и ${where})`); else seen.set(t.id, where); } };

  ls.warmup.forEach((t, i) => {
    reg(t, `разминка ${i + 1}`); checkTask(t, `Разминка w${i + 1}`, errors);
    if (!isAuto(t)) errors.push(`Разминка ${t.id}: только автопроверяемые типы`);
    if (!Number.isInteger(t.ref) || t.ref < 1 || t.ref >= ls.number) errors.push(`Разминка ${t.id}: ref — номер прошлого ПЗ (1…${ls.number - 1})`);
    if (t.variant || t.level) errors.push(`Разминка ${t.id}: variant/level недопустимы`);
  });
  if (ls.warmup.length < 3 || ls.warmup.length > 4) errors.push(`Разминка: 3–4 задания (сейчас ${ls.warmup.length})`);

  if (ls.lecture.length < 4 || ls.lecture.length > 5) errors.push(`Лекция: 4–5 разделов (сейчас ${ls.lecture.length})`);
  let lectureWords = 0;
  ls.lecture.forEach((s, i) => {
    lectureWords += words(s.body);
    if (!s.id || !s.title.trim() || !s.body.trim()) errors.push(`Раздел ${i + 1}: нужны id, title, body`);
    if (!s.check.length || s.check.length > 2) errors.push(`Раздел ${s.id || i + 1}: 1–2 контрольных вопроса`);
    s.check.forEach(t => { reg(t, `лекция ${s.id}`); checkTask(t, `Лекция ${s.id}`, errors); if (!isAuto(t)) errors.push(`Лекция ${s.id}: вопросы только автопроверяемые`); if (t.variant) errors.push(`Лекция ${s.id}: у вопросов нет variant`); });
  });
  if (lectureWords < 1000) errors.push(`Лекция короткая: ${lectureWords} слов (минимум 1000)`);
  else if (lectureWords < 1400 || lectureWords > 2400) warnings.push(`Лекция ${lectureWords} слов — целевой объём 1400–2400`);

  if (ls.glossary.length < 6 || ls.glossary.length > 12) errors.push(`Глоссарий: 6–12 терминов (сейчас ${ls.glossary.length})`);
  const lectureText = ls.lecture.map(s => s.body).join('\n').toLowerCase();
  ls.glossary.forEach(t => {
    if (!t.term.trim() || !t.def.trim()) errors.push('Глоссарий: пустой term или def');
    else if (!lectureText.includes(t.term.toLowerCase())) warnings.push(`Термин «${t.term}» не встречается в тексте лекции дословно`);
  });

  if (!ls.cases.length) errors.push('Нужен хотя бы один кейс (cases)');
  const caseIds = new Set(ls.cases.map(c => c.id));

  ls.safety.rules.forEach((r, i) => { if (!r.rule.trim() || !r.why.trim()) errors.push(`Инструктаж: правило ${i + 1} — заполните rule и why`); });
  const hasVariants = ls.tasks.some(t => t.variant === 'pc');
  for (const v of hasVariants ? ['phone', 'pc'] : [null]) {
    const total = ls.safety.rules.filter(r => !r.variant || r.variant === v).length;
    if (total < 3 || total > 4) errors.push(`Инструктаж: для варианта ${v || 'общего'} получается ${total} правил (нужно 3–4)`);
  }
  ls.safety.check.forEach(t => { reg(t, 'инструктаж'); checkTask(t, 'Инструктаж', errors); if (!['single', 'multi', 'swipe'].includes(t.type)) errors.push(`Инструктаж ${t.id}: только single/multi/swipe`); });
  if (!ls.safety.check.length || ls.safety.check.length > 2) errors.push('Инструктаж: 1–2 проверочных вопроса');

  // практика
  ls.tasks.forEach(t => { reg(t, 'практика'); checkTask(t, 'Практика', errors); if (t.case && !caseIds.has(t.case)) errors.push(`Практика ${t.id}: case «${t.case}» не существует`); });
  const firstAdv = ls.tasks.findIndex(t => t.level === 'adv');
  if (firstAdv >= 0 && ls.tasks.slice(0, firstAdv).some(t => t.level === 'adv') === false && ls.tasks.slice(firstAdv).some(t => t.level !== 'adv')) errors.push('⭐-задания должны идти после всей базы');
  const variantTasks = v => ls.tasks.filter(t => !t.variant || t.variant === v);
  const variants = hasVariants ? ['phone', 'pc'] : ['phone'];
  for (const v of variants) {
    const label = hasVariants ? `[вариант ${v === 'phone' ? 'телефон' : 'ПК'}] ` : '';
    const all = variantTasks(v);
    const base = all.filter(t => t.level !== 'adv');
    const adv = all.filter(t => t.level === 'adv');
    if (base.length < 10 || base.length > 12) errors.push(`${label}база: 10–12 заданий (сейчас ${base.length})`);
    if (new Set(base.map(t => t.type)).size < 5) errors.push(`${label}база: ≥ 5 разных типов`);
    if (base.filter(t => MANUAL_TYPES.has(t.type)).length < 2) errors.push(`${label}база: ≥ 2 ручных задания (text/dilemma/file)`);
    if (adv.length < 2 || adv.length > 3) errors.push(`${label}⭐: 2–3 задания (сейчас ${adv.length})`);
    if (!adv.some(isAuto)) errors.push(`${label}⭐: ≥ 1 автопроверяемое`);
    const basePts = base.reduce((s, t) => s + taskPoints(t), 0);
    const advPts = adv.reduce((s, t) => s + taskPoints(t), 0);
    if (basePts + advPts > 0) {
      const share = advPts / (basePts + advPts);
      if (share < 0.10 || share > 0.35) errors.push(`${label}⭐ — ${Math.round(share * 100)} % баллов практики (допустимо 15–25 %)`);
      else if (share < 0.15 || share > 0.25) warnings.push(`${label}⭐ — ${Math.round(share * 100)} % баллов практики (цель 15–25 %)`);
    }
  }
  if (hasVariants) {
    if (ls.tasks.filter(t => t.variant === 'pc').length < 2) errors.push('ПК-вариант: ≥ 2 задания с variant pc');
    for (const lev of ['base', 'adv']) {
      const sum = (v, auto) => variantTasks(v).filter(t => (lev === 'adv') === (t.level === 'adv') && (auto ? isAuto(t) : MANUAL_TYPES.has(t.type))).reduce((s, t) => s + taskPoints(t), 0);
      for (const auto of [true, false]) {
        if (sum('phone', auto) !== sum('pc', auto)) errors.push(`Варианты: сумма баллов ${lev === 'adv' ? '⭐' : 'базы'} (${auto ? 'авто' : 'ручные'}) различается: телефон ${sum('phone', auto)} ≠ ПК ${sum('pc', auto)}`);
      }
    }
    if (!ls.tasks.some(t => t.variant === 'pc' && (t.type === 'file' || t.type === 'python' || (t.type === 'text' && t.copy)))) warnings.push('Среди ПК-заданий нет file/python/text с copy');
  }
  ls.tasks.forEach(t => { if (t.level && t.level !== 'adv') errors.push(`Практика ${t.id}: level только 'adv'`); });
  // кейс: 3–5 подряд, без ⭐
  const caseGroups = {};
  ls.tasks.forEach((t, i) => { if (t.case) (caseGroups[t.case] = caseGroups[t.case] || []).push(i); });
  for (const [cid, idx] of Object.entries(caseGroups)) {
    if (idx.length < 3) errors.push(`Кейс ${cid}: меньше 3 заданий`);
    if (idx.length > 5) warnings.push(`Кейс ${cid}: больше 5 заданий`);
    if (idx.some((p, j) => j > 0 && p !== idx[j - 1] + 1)) errors.push(`Кейс ${cid}: задания должны идти подряд`);
    if (idx.some(i => ls.tasks[i].level === 'adv')) errors.push(`Кейс ${cid}: внутри кейса не бывает ⭐`);
  }

  // доска
  if (ls.board.length < 2 || ls.board.length > 3) errors.push(`Доска: 2–3 интерактива (сейчас ${ls.board.length})`);
  ls.board.forEach(b => {
    reg(b, 'доска');
    if (!b.text.trim()) errors.push(`Доска ${b.id}: пустой text`);
    if (!['poll', 'bug', 'cloud'].includes(b.kind)) errors.push(`Доска ${b.id}: kind — poll/bug/cloud`);
    if (!BOARD_AT.includes(b.at)) errors.push(`Доска ${b.id}: at — из ${BOARD_AT.join(', ')}`);
    if (/^s(\d)$/.test(b.at) && Number(b.at.slice(1)) > ls.lecture.length) errors.push(`Доска ${b.id}: at=${b.at}, а разделов лекции ${ls.lecture.length}`);
    if (b.kind === 'poll') {
      if (!Array.isArray(b.options) || b.options.length < 2 || b.options.length > 6) errors.push(`Доска ${b.id}: poll — 2–6 вариантов`);
      else if (b.correct !== undefined && !(Number.isInteger(b.correct) && b.correct >= 0 && b.correct < b.options.length)) errors.push(`Доска ${b.id}: correct вне диапазона`);
    }
    if (b.kind === 'bug' && !(Array.isArray(b.lines) && b.lines.length >= 2 && Array.isArray(b.correct) && b.correct.length && b.correct.length <= 2)) errors.push(`Доска ${b.id}: bug — ≥ 2 строк, 1–2 верных индекса`);
  });

  // ДЗ
  const hw = ls.homework;
  if (!hw.why.trim()) errors.push('ДЗ: пустое why («Зачем это нужно»)');
  for (const lvl of ['base', 'adv']) {
    const part = hw[lvl];
    if (!part.title.trim()) errors.push(`ДЗ ${lvl}: пустой title`);
    if (!part.tasks.length || part.tasks.length > 3) errors.push(`ДЗ ${lvl}: 1–3 задания`);
    part.tasks.forEach(t => { reg(t, `ДЗ ${lvl}`); checkTask(t, `ДЗ ${lvl}`, errors); if (!isAuto(t)) errors.push(`ДЗ ${lvl} ${t.id}: только автопроверяемые`); if (t.variant || t.level) errors.push(`ДЗ ${lvl} ${t.id}: variant/level недопустимы`); });
  }
  return { errors, warnings };
}

// ---------- помощники форм ----------

function strField(label, obj, key, { rows = 0, hint = '', placeholder = '' } = {}) {
  const input = rows > 0
    ? h('textarea', { rows: String(rows), value: obj[key] ?? '', placeholder, oninput: e => { obj[key] = e.target.value; } })
    : h('input', { value: obj[key] ?? '', placeholder, oninput: e => { obj[key] = e.target.value; } });
  return h('label', { class: 'field' }, h('span', {}, label), input, hint ? h('small', { class: 'hint' }, hint) : '');
}

function numField(label, obj, key, { min = '', step = 'any' } = {}) {
  return h('label', { class: 'field' }, h('span', {}, label),
    h('input', { type: 'number', value: String(obj[key] ?? 0), min: String(min), step, oninput: e => { obj[key] = Number(e.target.value); } }));
}

function boolField(label, obj, key) {
  const cb = h('input', { type: 'checkbox', onchange: e => { obj[key] = e.target.checked; } });
  if (obj[key]) cb.checked = true;
  return h('label', { class: 'field inline' }, cb, h('span', {}, label));
}

function selectField(label, obj, key, options, { allowEmpty = '' } = {}) {
  const sel = h('select', {
    onchange: e => {
      const v = e.target.value;
      if (v === '__none__') delete obj[key];
      else obj[key] = v;
    },
  });
  if (allowEmpty) sel.append(h('option', { value: '__none__' }, allowEmpty));
  for (const o of options) sel.append(h('option', { value: o }, o));
  sel.value = obj[key] ?? (allowEmpty ? '__none__' : options[0]);
  return h('label', { class: 'field inline' }, h('span', {}, label), sel);
}

// список строк: options, items, rubric, accept, goal.tasks, lines, solution...
function stringListEditor(label, arr, { rows = 0, addLabel = '+ Добавить', onChange } = {}) {
  const box = h('div', { class: 'pz-list' });
  const rebuild = () => {
    box.replaceChildren(...arr.map((s, i) => h('div', { class: 'pz-list-row' },
      rows > 0
        ? h('textarea', { rows: String(rows), value: s, oninput: e => { arr[i] = e.target.value; } })
        : h('input', { value: s, oninput: e => { arr[i] = e.target.value; } }),
      h('button', { class: 'btn small', type: 'button', title: 'Удалить', onclick: () => { arr.splice(i, 1); rebuild(); onChange?.(); } }, '✕'))),
      h('button', { class: 'btn small', type: 'button', onclick: () => { arr.push(''); rebuild(); onChange?.(); } }, addLabel));
  };
  rebuild();
  return h('div', { class: 'field' }, h('span', { class: 'pz-list-label' }, label), box);
}

// список объектов по простой схеме полей: [[key, label, opts]]
function objectListEditor(label, arr, fields, makeItem, onChange, plural = `${label}ы`) {
  const box = h('div', { class: 'pz-list' });
  const rebuild = () => {
    box.replaceChildren(...arr.map((item, i) => h('div', { class: 'pz-list-obj' },
      h('div', { class: 'row pz-list-obj-head' },
        h('strong', {}, `${label} ${i + 1}`),
        h('button', { class: 'btn small', type: 'button', onclick: () => { arr.splice(i, 1); rebuild(); onChange?.(); } }, '✕')),
      fields.map(([key, lab, opts = {}]) => {
        if (opts.type === 'bool') return boolField(lab, item, key);
        if (opts.type === 'num') return numField(lab, item, key, opts);
        if (opts.type === 'select') return selectField(lab, item, key, opts.options, opts);
        return strField(lab, item, key, opts);
      }))),
      h('button', { class: 'btn small', type: 'button', onclick: () => { arr.push(makeItem()); rebuild(); onChange?.(); } }, '+ Добавить'));
  };
  rebuild();
  return h('div', { class: 'field' }, h('span', { class: 'pz-list-label' }, plural), box);
}

// список пар [[l, r], ...] — редактирует массив на месте
function pairListEditor(label, pairs) {
  const box = h('div', { class: 'pz-list' });
  const rebuild = () => {
    box.replaceChildren(...pairs.map((p, i) => h('div', { class: 'pz-list-row' },
      h('input', { value: p[0], placeholder: 'Слева', oninput: e => { p[0] = e.target.value; } }),
      h('input', { value: p[1], placeholder: 'Справа', oninput: e => { p[1] = e.target.value; } }),
      h('button', { class: 'btn small', type: 'button', onclick: () => { pairs.splice(i, 1); rebuild(); } }, '✕'))),
      h('button', { class: 'btn small', type: 'button', onclick: () => { pairs.push(['', '']); rebuild(); } }, '+ Пара'));
  };
  rebuild();
  return h('div', { class: 'field' }, h('span', { class: 'pz-list-label' }, label), box);
}

// blanks: [[ответ, синоним], ...] — каждая строка «ответ | синоним | …»
function blanksEditor(blanks) {
  const box = h('div', { class: 'pz-list' });
  const rebuild = () => {
    box.replaceChildren(...blanks.map((b, i) => {
      if (!Array.isArray(b)) blanks[i] = b = [String(b ?? '')];
      return h('div', { class: 'pz-list-row' },
        h('input', {
          value: b.join(' | '), placeholder: `Пропуск {{${i}}}: верный ответ | синоним`,
          oninput: e => { blanks[i] = e.target.value.split('|').map(s => s.trim()).filter(Boolean); },
        }),
        h('button', { class: 'btn small', type: 'button', onclick: () => { blanks.splice(i, 1); rebuild(); } }, '✕'));
    }),
      h('button', { class: 'btn small', type: 'button', onclick: () => { blanks.push(['']); rebuild(); } }, '+ Пропуск'));
  };
  rebuild();
  return h('div', { class: 'field' }, h('span', { class: 'pz-list-label' }, 'Пропуски (порядок = номерам {{N}} в шаблоне)'), box);
}

// пакеты python (numpy): строка «a, b» <-> массив
function packagesField(t) {
  const cur = () => (Array.isArray(t.packages) ? t.packages : []).join(', ');
  return h('label', { class: 'field' }, h('span', {}, 'Пакеты через запятую'),
    h('input', {
      value: cur(), placeholder: 'numpy',
      oninput: e => {
        const pkgs = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
        if (pkgs.length) t.packages = pkgs; else delete t.packages;
      },
    }),
    h('small', { class: 'hint' }, 'Пусто — чистый Python. Для numpy-заданий: numpy'));
}

// ---------- форма задания ----------

function taskForm(t, { rerender, showVariant = false, showLevel = false, showCase = null, showRef = false }) {
  const head = h('div', { class: 'row' },
    strField('id', t, 'id', { placeholder: 't1' }),
    h('label', { class: 'field' }, h('span', {}, 'Тип'),
      h('select', {
        onchange: e => {
          const keep = { id: t.id, points: t.points, text: t.text, explain: t.explain, variant: t.variant, level: t.level, case: t.case, ref: t.ref, packages: t.packages };
          const fresh = blankTask(e.target.value);
          for (const k of Object.keys(t)) delete t[k];
          Object.assign(t, fresh, Object.fromEntries(Object.entries(keep).filter(([, v]) => v !== undefined)));
          rerender();
        },
      }, ALL_TYPES.map(tp => h('option', { value: tp, selected: tp === t.type ? '' : null }, tp)))),
    numField('Баллы', t, 'points', { min: '0', step: '1' }));
  if (showRef) head.append(numField('ref (№ прошлого ПЗ)', t, 'ref', { min: '1', step: '1' }));
  if (showVariant) head.append(selectField('Вариант', t, 'variant', ['phone', 'pc'], { allowEmpty: 'общее' }));
  if (showLevel) head.append(selectField('Уровень', t, 'level', ['adv'], { allowEmpty: 'база' }));
  if (showCase) head.append(selectField('Кейс', t, 'case', showCase, { allowEmpty: 'без кейса' }));

  const parts = [head, strField('Формулировка (markdown)', t, 'text', { rows: 3 })];
  switch (t.type) {
    case 'single':
    case 'multi':
      parts.push(stringListEditor('Варианты ответа', t.options));
      if (t.type === 'single') parts.push(numField('Индекс верного (с нуля)', t, 'correct', { min: '0', step: '1' }));
      else parts.push(idxField('Индексы верных', t, 'correct'));
      break;
    case 'numeric':
      parts.push(numField('Ответ (число)', t, 'answer'), numField('Допуск (tolerance)', t, 'tolerance'), strField('Единицы (unit)', t, 'unit'));
      break;
    case 'fill':
      parts.push(strField('Шаблон с {{0}}, {{1}}…', t, 'template', { rows: 2 }));
      if (!Array.isArray(t.blanks)) t.blanks = [['']];
      parts.push(blanksEditor(t.blanks));
      break;
    case 'swipe':
      parts.push(objectListEditor('Карточка', t.cards, [['text', 'Текст', { rows: 2 }], ['answer', 'Верно?', { type: 'bool' }], ['explain', 'Пояснение', {}]], () => ({ text: '', answer: true, explain: '' }), undefined, 'Карточки'));
      break;
    case 'order':
      parts.push(stringListEditor('Элементы в правильном порядке', t.items));
      break;
    case 'match':
      if (!Array.isArray(t.pairs)) t.pairs = [['', '']];
      parts.push(pairListEditor('Пары (правые значения не повторяются)', t.pairs));
      break;
    case 'categorize':
      parts.push(stringListEditor('Категории', t.categories));
      parts.push(objectListEditor('Элемент', t.items, [['text', 'Текст', {}], ['cat', 'Индекс категории (с нуля)', { type: 'num', min: '0', step: '1' }]], () => ({ text: '', cat: 0 })));
      break;
    case 'hotspot':
      parts.push(stringListEditor('Строки кода/текста', t.lines, { rows: 1 }));
      parts.push(idxField('Индексы ошибочных строк', t, 'correct'));
      break;
    case 'prompt-builder':
      parts.push(objectListEditor('Блок', t.blocks, [['text', 'Текст', {}], ['kind', 'kind', { type: 'select', options: ['role', 'context', 'task', 'format', 'constraints', 'examples', 'steps'] }], ['good', 'Хороший?', { type: 'bool' }], ['why', 'Почему', {}]], () => ({ text: '', kind: 'task', good: true, why: '' })));
      break;
    case 'text':
      parts.push(numField('minLength', t, 'minLength', { min: '10', step: '10' }), numField('rows', t, 'rows', { min: '3', step: '1' }), strField('placeholder', t, 'placeholder'), strField('copy (запрос для нейросети)', t, 'copy', { rows: 2 }));
      if (Array.isArray(t.rubric)) parts.push(stringListEditor('Критерии для преподавателя', t.rubric));
      break;
    case 'dilemma':
      parts.push(strField('Стартовая сцена (start)', t, 'start', { rows: 2 }), strField('Вопрос рефлексии (reflect)', t, 'reflect', { rows: 2 }), jsonField('Сцены (JSON)', t, 'scenes'));
      break;
    case 'python':
      parts.push(strField('Стартовый код (starter)', t, 'starter', { rows: 5 }));
      parts.push(strField('Эталон (solution)', t, 'solution', { rows: 5 }));
      if (!Array.isArray(t.tests)) t.tests = [];
      parts.push(objectListEditor('Тест', t.tests, [['name', 'Название', {}], ['code', 'Код (с assert)', { rows: 4 }]], () => ({ name: '', code: '' })));
      parts.push(packagesField(t));
      break;
    case 'terminal':
      parts.push(objectListEditor('Цель', t.goals, [['text', 'Текст', {}], ['kind', 'kind', { type: 'select', options: ['dir', 'file', 'noFile', 'cwd', 'gitInit', 'config', 'commits', 'commitMessage', 'tracked', 'staged', 'clean', 'branch', 'onBranch', 'used', 'env'] }], ['path', 'path', {}], ['key', 'key', {}], ['value', 'value', {}], ['contains', 'contains', {}], ['min', 'min', { type: 'num' }], ['name', 'name', {}], ['cmd', 'cmd', {}]], () => ({ text: '', kind: 'file', path: '' }), undefined, 'Цели'));
      parts.push(stringListEditor('Решение: команды (по одной в строке)', t.solution));
      break;
    case 'file':
      if (!Array.isArray(t.accept)) t.accept = ['txt'];
      parts.push(stringListEditor('Расширения (accept)', t.accept));
      parts.push(numField('maxMb', t, 'maxMb', { min: '1', step: '1' }), strField('note (как сохранить файл)', t, 'note', { rows: 2 }));
      if (Array.isArray(t.rubric)) parts.push(stringListEditor('Критерии', t.rubric));
      break;
    default:
      break;
  }
  if (t.type !== 'dilemma') parts.push(strField('Пояснение после проверки (explain)', t, 'explain', { rows: 2 }));
  return h('div', { class: 'pz-task-form' }, parts);
}

// индексы через запятую <-> массив чисел
function idxField(label, t, key) {
  const proxy = `__${key}Str`;
  t[proxy] = (t[key] || []).join(', ');
  return h('label', { class: 'field' }, h('span', {}, label),
    h('input', {
      value: t[proxy],
      oninput: e => {
        t[proxy] = e.target.value;
        t[key] = e.target.value.split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n >= 0);
      },
    }),
    h('small', { class: 'hint' }, 'Через запятую, с нуля: напр. 0, 2'));
}

// JSON-поле (сложные структуры: dilemma.scenes)
function jsonField(label, obj, key) {
  const err = h('small', { class: 'error' });
  return h('label', { class: 'field' }, h('span', {}, label),
    h('textarea', {
      rows: '6', value: JSON.stringify(obj[key], null, 2),
      onchange: e => {
        try { obj[key] = JSON.parse(e.target.value); err.textContent = ''; }
        catch (x) { err.textContent = `JSON: ${x.message}`; }
      },
    }), err);
}

// нормализация полей перед проверкой/экспортом
function finalizeTask(t) {
  for (const k of Object.keys(t)) if (k.startsWith('__')) delete t[k];
  if (t.type === 'python' && Array.isArray(t.packages) && !t.packages.length) delete t.packages;
  if (t.points === 1) delete t.points; // дефолт
  if (t.type === 'numeric' && !t.tolerance) delete t.tolerance;
  if (t.type === 'text' || t.type === 'file') {
    if (Array.isArray(t.rubric) && !t.rubric.filter(r => r.trim()).length) delete t.rubric;
    if (t.type === 'text' && !t.copy?.trim()) delete t.copy;
    if (t.type === 'file' && !t.note?.trim()) delete t.note;
  }
  if ('explain' in t && !String(t.explain || '').trim()) delete t.explain;
  return t;
}

// ---------- редактор списка заданий ----------

function taskListEditor(title, arr, opts) {
  const { rerender } = opts;
  const wrap = h('div', { class: 'pz-tasks' });
  arr.forEach((t, i) => {
    const det = h('details', { class: 'pz-task card' },
      h('summary', {}, h('span', { class: 'pz-task-sum' }, `${i + 1}. `, h('code', {}, t.id || '?'), ` — ${t.type}${t.level === 'adv' ? ' ⭐' : ''}${t.variant ? ` · ${t.variant === 'pc' ? '💻' : '📱'}` : ''}${t.case ? ` · кейс ${t.case}` : ''} · ${taskPoints(t)} б.`)),
      h('div', { class: 'row pz-task-ops' },
        h('button', { class: 'btn small', type: 'button', disabled: i === 0, onclick: () => { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; rerender(); } }, '↑'),
        h('button', { class: 'btn small', type: 'button', disabled: i === arr.length - 1, onclick: () => { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; rerender(); } }, '↓'),
        h('button', { class: 'btn small', type: 'button', onclick: () => { arr.splice(i + 1, 0, JSON.parse(JSON.stringify(t))); arr[i + 1].id = `${t.id}-copy`; rerender(); } }, '⧉'),
        h('button', { class: 'btn small', type: 'button', onclick: () => { if (confirm(`Удалить задание ${t.id}?`)) { arr.splice(i, 1); rerender(); } } }, '✕')),
      taskForm(t, opts));
    wrap.append(det);
  });
  const typeSel = h('select', {}, ALL_TYPES.map(tp => h('option', { value: tp }, tp)));
  const addBtn = h('button', {
    class: 'btn', type: 'button',
    onclick: () => { arr.push(blankTask(typeSel.value)); rerender(); },
  }, '+ Добавить задание');
  return h('section', { class: 'card pz-block' }, h('h2', {}, title), wrap, h('div', { class: 'row' }, typeSel, addBtn));
}

// ---------- главный экран ----------

export function renderConstructor(ctx, main) {
  let lesson = null;
  let report = null; // {errors, warnings} после «Проверить»

  // восстановить черновик
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) lesson = JSON.parse(raw);
  } catch { /* игнорируем битый черновик */ }

  const saveDraft = () => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(lesson)); } catch { /* переполнено — не страшно */ } };
  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* пусто */ } };

  function rerender() {
    if (lesson) saveDraft();
    main.replaceChildren(build());
  }

  function build() {
    if (!lesson) return startScreen();
    return editorScreen();
  }

  function startScreen() {
    const dSel = h('select', {}, DISCIPLINES.map(d => h('option', { value: d }, d.toUpperCase().replace('DUP', 'ДУП.'))));
    const nInp = h('input', { type: 'number', min: '1', step: '1', value: '1', style: 'width:90px' });
    const err = h('p', { class: 'error', role: 'alert' });
    return h('div', { class: 'pz-con' },
      h('div', { class: 'card' },
        h('h2', {}, '🛠 Конструктор практических занятий (v4)'),
        h('p', { class: 'hint' }, 'Собирает файл занятия без ручной правки кода: формы по блокам (цели, разминка, лекция, инструктаж, практика, доска, ДЗ), проверка основных правил формата и выгрузка готового pz-файла.'),
        h('h3', {}, 'Новое занятие'),
        h('div', { class: 'row' }, dSel, h('label', { class: 'field inline' }, h('span', {}, '№ ПЗ'), nInp)),
        h('button', { class: 'btn primary', type: 'button', onclick: () => { lesson = blankLesson(dSel.value, Number(nInp.value) || 1); rerender(); } }, 'Создать заготовку')),
      h('div', { class: 'card' },
        h('h3', {}, 'Открыть существующее'),
        h('p', { class: 'hint' }, 'Загрузить опубликованное занятие для правки (копия в памяти, сайт не меняется).'),
        h('div', { class: 'row' },
          h('button', {
            class: 'btn', type: 'button',
            onclick: async () => {
              err.textContent = '';
              try {
                const d = dSel.value, n = Number(nInp.value) || 1;
                const [loaded] = await Promise.all([loadLesson(d, n)]);
                lesson = JSON.parse(JSON.stringify(loaded));
                rerender();
              } catch (e) { ctx.fail(e, err); }
            },
          }, 'Загрузить с сайта'),
          h('label', { class: 'btn' }, 'Из файла…', h('input', {
            type: 'file', accept: '.js', style: 'display:none',
            onchange: async e => {
              const f = e.target.files[0];
              if (!f) return;
              err.textContent = '';
              try {
                const text = await f.text();
                const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
                const mod = await import(url);
                URL.revokeObjectURL(url);
                lesson = mod.default;
                rerender();
              } catch (x) { err.textContent = errText(x); }
            },
          }))),
        err),
      h('div', { class: 'card' },
        h('h3', {}, 'Как внедрить результат'),
        h('ol', {},
          h('li', {}, 'Скачайте файл и положите его в ', h('code', {}, 'content/<дисциплина>/pz0NN.js')),
          h('li', {}, 'В ', h('code', {}, 'content/<дисциплина>/index.js'), ' у своего номера поставьте ', h('code', {}, 'ready: true')),
          h('li', {}, 'Прогоните ', h('code', {}, 'npm run extract'), ', ', h('code', {}, 'npm run validate'), ' (0 ошибок), ', h('code', {}, 'npm test')),
          h('li', {}, 'Пройдите занятие в браузере на ширине 375 px (превью: откройте маршрут занятия) — все задания правильно и одно неверно'),
          h('li', {}, 'Коммит и публикация — как обычно'))));
  }

  function block(title, ...children) {
    return h('details', { class: 'card pz-block', open: '' }, h('summary', {}, h('strong', {}, title)), ...children);
  }

  function editorScreen() {
    const ls = lesson;
    const box = h('div', { class: 'pz-con' });

    // панель управления
    const reportBox = h('div');
    box.append(h('div', { class: 'card pz-toolbar' },
      h('div', { class: 'row' },
        h('strong', {}, `${ls.discipline.toUpperCase().replace('DUP', 'ДУП.')} · ПЗ №${ls.number} · ${lessonFile(ls.number)}`),
        h('button', { class: 'btn primary', type: 'button', onclick: doCheck }, 'Проверить'),
        h('button', { class: 'btn', type: 'button', onclick: doDownload }, '⬇ Скачать файл'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { if (confirm('Закрыть редактор? Черновик сохранится в браузере.')) { lesson = null; rerender(); } } }, 'К началу'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { if (confirm('Удалить черновик из браузера?')) { clearDraft(); lesson = null; rerender(); } } }, 'Сбросить черновик')),
      reportBox));
    if (report) renderReport(reportBox);

    // метаданные
    box.append(block('Метаданные и ход занятия',
      h('div', { class: 'row' },
        strField('Название (дословно из index.js)', ls, 'title'),
        strField('Тема (id из index.js, напр. 2.6)', ls, 'topic')),
      h('div', { class: 'row' },
        numField('Вход (мин)', ls.minutes, 'intro', { min: '1', step: '1' }),
        numField('Лекция (мин)', ls.minutes, 'theory', { min: '1', step: '1' }),
        numField('Практика (мин)', ls.minutes, 'practice', { min: '1', step: '1' }),
        numField('Итоги (мин)', ls.minutes, 'outro', { min: '1', step: '1' }),
        h('span', { class: 'hint' }, `Сумма: ${ls.minutes.intro + ls.minutes.theory + ls.minutes.practice + ls.minutes.outro} / 90`)),
      strField('Вводная от персонажа (story.text)', ls.story, 'text', { rows: 3 }),
      strField('Персонаж (story.from)', ls.story, 'from', { hint: 'Из content/story.js: lena, max, …' }),
      strField('Зачем в профессии (career)', ls, 'career', { rows: 2 }),
      strField('Технология и формы (method)', ls, 'method')));

    // цели
    box.append(block('Целеполагание',
      objectListEditor('Умение', ls.goal.skills, [['text', 'Действие («умею…»)', {}], ['need', 'Нужно для задачи?', { type: 'bool' }], ['why', 'Почему нужно/не нужно', { rows: 2 }]], () => ({ text: '', need: true, why: '' }), undefined, 'Умения'),
      strField('Цель занятия (одно предложение)', ls.goal, 'goal', { rows: 2 }),
      stringListEditor('Задачи занятия (3–4, по ним студент оценит себя)', ls.goal.tasks)));

    // разминка
    box.append(block('Разминка (3–4 задания по прошлым ПЗ)', (() => {
      const w = h('div');
      ls.warmup.forEach((t, i) => {
        w.append(h('details', { class: 'pz-task card' },
          h('summary', {}, h('span', { class: 'pz-task-sum' }, `w${i + 1}: `, h('code', {}, t.id || '?'), ` — ${t.type} · ref ПЗ №${t.ref ?? '?'}`)),
          h('div', { class: 'row pz-task-ops' }, h('button', { class: 'btn small', type: 'button', onclick: () => { ls.warmup.splice(i, 1); rerender(); } }, '✕')),
          taskForm(t, { rerender, showRef: true })));
      });
      const sel = h('select', {}, [...AUTO_TYPES].map(tp => h('option', { value: tp }, tp)));
      w.append(h('div', { class: 'row' }, sel, h('button', { class: 'btn', type: 'button', onclick: () => { const t = blankTask(sel.value); t.id = `w${ls.warmup.length + 1}`; t.ref = Math.max(1, ls.number - 1); ls.warmup.push(t); rerender(); } }, '+ Задание разминки')));
      return w;
    })()));

    // лекция
    box.append(block('Лекция (4–5 разделов, 1400–2400 слов)', (() => {
      const w = h('div');
      w.append(h('p', { class: 'hint' }, `Сейчас слов: ${ls.lecture.reduce((s, x) => s + words(x.body), 0)}`));
      ls.lecture.forEach((s, i) => {
        w.append(h('details', { class: 'pz-task card' },
          h('summary', {}, h('strong', {}, `${s.id || i + 1}. ${s.title || '…'}`), h('span', { class: 'hint' }, ` ${words(s.body)} слов · вопросов: ${s.check.length}`)),
          h('div', { class: 'row pz-task-ops' },
            h('button', { class: 'btn small', type: 'button', disabled: i === 0, onclick: () => { [ls.lecture[i - 1], ls.lecture[i]] = [ls.lecture[i], ls.lecture[i - 1]]; ls.lecture.forEach((x, j) => { x.id = `s${j + 1}`; }); rerender(); } }, '↑'),
            h('button', { class: 'btn small', type: 'button', onclick: () => { if (confirm('Удалить раздел?')) { ls.lecture.splice(i, 1); ls.lecture.forEach((x, j) => { x.id = `s${j + 1}`; }); rerender(); } } }, '✕')),
          strField('id раздела', s, 'id'),
          strField('Заголовок', s, 'title'),
          strField('Текст раздела (markdown: **термин**, > 💡 Пример, > ⚠️ Типичная ошибка)', s, 'body', { rows: 10 }),
          h('h4', {}, 'Контрольные вопросы (1–2, авто)'),
          (() => {
            const cw = h('div');
            s.check.forEach((t, j) => {
              cw.append(h('details', { class: 'pz-task card' },
                h('summary', {}, h('span', { class: 'pz-task-sum' }, h('code', {}, t.id || '?'), ` — ${t.type}`)),
                h('div', { class: 'row pz-task-ops' }, h('button', { class: 'btn small', type: 'button', onclick: () => { s.check.splice(j, 1); rerender(); } }, '✕')),
                taskForm(t, { rerender })));
            });
            const sel = h('select', {}, [...AUTO_TYPES].map(tp => h('option', { value: tp }, tp)));
            cw.append(h('div', { class: 'row' }, sel, h('button', { class: 'btn small', type: 'button', onclick: () => { s.check.push(blankTask(sel.value)); rerender(); } }, '+ Вопрос')));
            return cw;
          })()));
      });
      w.append(h('button', { class: 'btn', type: 'button', onclick: () => { ls.lecture.push({ id: `s${ls.lecture.length + 1}`, title: '', body: '', check: [blankTask('single')] }); rerender(); } }, '+ Раздел'));
      return w;
    })()));

    // глоссарий и кейсы
    box.append(block('Глоссарий (6–12; term должен встречаться в лекции дословно)',
      objectListEditor('Термин', ls.glossary, [['term', 'Термин', {}], ['def', 'Определение', { rows: 2 }]], () => ({ term: '', def: '' }))));
    box.append(block('Кейсы (для командных заданий практики)',
      objectListEditor('Кейс', ls.cases, [['id', 'id', {}], ['title', 'Название', {}], ['text', 'Текст (markdown)', { rows: 3 }]], () => ({ id: `c${ls.cases.length + 1}`, title: '', text: '' }))));

    // инструктаж
    box.append(block('Инструктаж ОТ/ТБ',
      objectListEditor('Правило', ls.safety.rules, [['rule', 'Правило', { rows: 2 }], ['why', 'Почему (механизм последствия)', { rows: 2 }], ['variant', 'Только для варианта', { type: 'select', options: ['phone', 'pc'], allowEmpty: 'общее' }]], () => ({ rule: '', why: '' }), undefined, 'Правила'),
      h('h4', {}, 'Проверочные вопросы (1–2, single/multi/swipe — спрашивают причину)'),
      (() => {
        const w = h('div');
        ls.safety.check.forEach((t, j) => {
          w.append(h('details', { class: 'pz-task card' },
            h('summary', {}, h('span', { class: 'pz-task-sum' }, h('code', {}, t.id || '?'), ` — ${t.type}`)),
            h('div', { class: 'row pz-task-ops' }, h('button', { class: 'btn small', type: 'button', onclick: () => { ls.safety.check.splice(j, 1); rerender(); } }, '✕')),
            taskForm(t, { rerender })));
        });
        const sel = h('select', {}, ['single', 'multi', 'swipe'].map(tp => h('option', { value: tp }, tp)));
        w.append(h('div', { class: 'row' }, sel, h('button', { class: 'btn small', type: 'button', onclick: () => { ls.safety.check.push(blankTask(sel.value)); rerender(); } }, '+ Вопрос')));
        return w;
      })()));

    // практика
    box.append(taskListEditor('Практика: база (10–12) затем ⭐ (2–3)', ls.tasks, { rerender, showVariant: true, showLevel: true, showCase: ls.cases.map(c => c.id) }));

    // доска
    box.append(block('Доска (2–3 интерактива для преподавателя)', (() => {
      const w = h('div');
      ls.board.forEach((b, i) => {
        const f = h('div', { class: 'pz-task card' },
          h('div', { class: 'row' },
            strField('id', b, 'id'),
            selectField('Когда (at)', b, 'at', BOARD_AT),
            h('label', { class: 'field' }, h('span', {}, 'Вид'), h('select', { onchange: e => { const keep = { id: b.id, at: b.at, text: b.text }; const fresh = { poll: { kind: 'poll', options: ['', ''] }, bug: { kind: 'bug', lines: ['', ''], correct: [0] }, cloud: { kind: 'cloud', placeholder: '' } }[e.target.value]; for (const k of Object.keys(b)) delete b[k]; Object.assign(b, fresh, keep); rerender(); } }, ['poll', 'bug', 'cloud'].map(k => h('option', { value: k, selected: k === b.kind ? '' : null }, k)))),
            h('button', { class: 'btn small', type: 'button', onclick: () => { ls.board.splice(i, 1); rerender(); } }, '✕')),
          strField('Текст/вопрос', b, 'text', { rows: 2 }));
        if (b.kind === 'poll') {
          f.append(stringListEditor('Варианты (2–6)', b.options));
          f.append(h('label', { class: 'field' }, h('span', {}, 'Индекс верного (квиз; пусто — просто опрос)'),
            h('input', { type: 'number', min: '0', step: '1', value: b.correct === undefined ? '' : String(b.correct), oninput: e => { if (e.target.value === '') delete b.correct; else b.correct = Number(e.target.value); } })));
        }
        if (b.kind === 'bug') { f.append(stringListEditor('Строки', b.lines)); f.append(idxField('Индексы строк с ошибкой (1–2)', b, 'correct')); }
        if (b.kind === 'cloud') f.append(strField('placeholder', b, 'placeholder'));
        w.append(f);
      });
      w.append(h('button', { class: 'btn', type: 'button', onclick: () => { ls.board.push({ id: `b${ls.board.length + 1}`, at: 'practice', kind: 'poll', text: '', options: ['', ''] }); rerender(); } }, '+ Интерактив'));
      return w;
    })()));

    // ДЗ
    box.append(block('Домашнее задание',
      strField('Зачем это нужно (why, markdown)', ls.homework, 'why', { rows: 3 }),
      h('h4', {}, 'Базовое'),
      strField('Название', ls.homework.base, 'title'),
      hwTasks(ls.homework.base.tasks, 'hb'),
      h('h4', {}, '⭐ Творческое'),
      strField('Название', ls.homework.adv, 'title'),
      hwTasks(ls.homework.adv.tasks, 'ha')));

    // инструкция
    box.append(h('div', { class: 'card' },
      h('h3', {}, 'После скачивания'),
      h('ol', {},
        h('li', {}, `Положите файл в `, h('code', {}, `content/${ls.discipline}/${lessonFile(ls.number)}`)),
        h('li', {}, 'В index.js дисциплины у номера ', h('code', {}, String(ls.number)), ' поставьте ', h('code', {}, 'ready: true')),
        h('li', {}, h('code', {}, 'npm run extract && npm run validate && npm test'), ' — финальная проверка (в т. ч. прогон эталонов python)'),
        h('li', {}, 'Пройдите занятие в браузере (375 px и оба варианта практики)'),
        h('li', {}, 'Коммит и публикация — по обычной процедуре'))));

    return box;
  }

  function hwTasks(arr, prefix) {
    const w = h('div');
    arr.forEach((t, j) => {
      w.append(h('details', { class: 'pz-task card' },
        h('summary', {}, h('span', { class: 'pz-task-sum' }, h('code', {}, t.id || '?'), ` — ${t.type}`)),
        h('div', { class: 'row pz-task-ops' }, h('button', { class: 'btn small', type: 'button', onclick: () => { arr.splice(j, 1); rerender(); } }, '✕')),
        taskForm(t, { rerender })));
    });
    const sel = h('select', {}, [...AUTO_TYPES].map(tp => h('option', { value: tp }, tp)));
    w.append(h('div', { class: 'row' }, sel, h('button', { class: 'btn small', type: 'button', onclick: () => { const t = blankTask(sel.value); t.id = `${prefix}${arr.length + 1}`; arr.push(t); rerender(); } }, '+ Задание ДЗ')));
    return w;
  }

  function finalizeAll() {
    const all = [
      ...lesson.warmup,
      ...lesson.lecture.flatMap(s => s.check),
      ...lesson.safety.check,
      ...lesson.tasks,
      ...lesson.homework.base.tasks,
      ...lesson.homework.adv.tasks,
    ];
    all.forEach(finalizeTask);
  }

  function doCheck() {
    finalizeAll();
    report = validateLessonV4(lesson);
    saveDraft();
    rerender();
    main.querySelector('.pz-toolbar')?.scrollIntoView({ block: 'start' });
  }

  function doDownload() {
    finalizeAll();
    report = validateLessonV4(lesson);
    saveDraft();
    if (report.errors.length && !confirm(`Есть ${report.errors.length} ошибок проверки — скачать всё равно?`)) { rerender(); return; }
    const src = moduleSource(lesson);
    const a = h('a', { href: URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), download: lessonFile(lesson.number) });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    rerender();
  }

  function renderReport(box) {
    if (!report) return;
    const { errors, warnings } = report;
    box.replaceChildren(errors.length
      ? h('div', { class: 'card warn pz-report' }, h('strong', {}, `Ошибки (${errors.length}):`), h('ul', {}, errors.map(e => h('li', {}, e))))
      : h('p', { class: 'ok-text' }, 'Ошибок нет ✓'),
    warnings.length
      ? h('div', { class: 'card pz-report' }, h('strong', {}, `Предупреждения (${warnings.length}):`), h('ul', {}, warnings.map(e => h('li', {}, e))))
      : '');
  }

  main.replaceChildren(build());
}
