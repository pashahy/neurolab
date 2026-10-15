import { h } from '../util/dom.js';
import { loadCourse, loadLesson, flatLessons } from '../content.js';
import { allTasks } from '../lesson-model.js';
import { warmupTasks, safetyChecks, homeworkTasks, MISTAKE_REASONS } from '../lesson-v4.js';
import { errText } from '../ui/login.js';
import { DISC, select, hashQuery, loading, loadError, emptyBox } from './common.js';

export const COMMENT_LIMIT = 1000; // как GROUP_COMMENT_LIMIT на сервере (после обрезки пробелов)
const LEVELS = ['умею', 'частично', 'пока нет']; // порядок счётчиков reflection.tasks[k]: [умею, частично, пока нет]
const ATTEMPTS = ['1 попытка', '2 попытки', '3 и больше'];
const REFLECT_CLASS = ['ok', 'part', 'bad'];

const arr = v => (Array.isArray(v) ? v : []);
const num = v => (typeof v === 'number' && isFinite(v) && v > 0 ? v : 0);
const sum = a => a.reduce((s, x) => s + num(x), 0);
const plain = s => String(s == null ? '' : s).replace(/[*_`#>|]/g, '').replace(/\s+/g, ' ').trim();
const snippet = (s, n = 90) => { const p = plain(s); return p.length > n ? `${p.slice(0, n - 1).trimEnd()}…` : p; };
const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(100, Math.round(a / b * 100))) : 0);

// Есть ли в сводке данные этапов v4. Сервер «старый формат» отдельно не помечает: пустые счётчики этапов — значит, ни одна сдача
// не несла поля v4 (сдача без v4 входит в count и в mistakes, больше ни во что).
export function hasStageData(d) {
  const r = d && d.reflection ? d.reflection : {};
  return Object.keys(d && d.warmup ? d.warmup : {}).length > 0
    || arr(d && d.goal && d.goal.chosen).length > 0
    || sum(arr(d && d.safety && d.safety.attempts)) > 0
    || arr(r.tasks).some(t => sum(arr(t)) > 0)
    || sum(arr(r.reasons)) > 0
    || arr(r.next).length > 0;
}

// Название задания в «Частых ошибках»: «Вопрос лекции k» / «Задание k» / «⭐ k» / «Разминка k» / «Инструктаж k» / «ДЗ баз. k» / «ДЗ ⭐ k»
// по файлу занятия; нет в файле — сам id
export function taskLabel(lesson, id) {
  if (!lesson) return { name: id, text: '' };
  const extra = [['Разминка', warmupTasks(lesson)], ['Инструктаж', safetyChecks(lesson)], ['ДЗ баз.', homeworkTasks(lesson, 'base')], ['ДЗ ⭐', homeworkTasks(lesson, 'adv')]];
  for (const [name, list] of extra) {
    const i = list.findIndex(t => t && t.id === id);
    if (i >= 0) return { name: `${name} ${i + 1}`, text: snippet(list[i].text) };
  }
  const lec = arr(lesson.lecture).flatMap(s => (s ? arr(s.check) : []));
  const li = lec.findIndex(t => t && t.id === id);
  if (li >= 0) return { name: `Вопрос лекции ${li + 1}`, text: snippet(lec[li].text) };
  const practice = arr(lesson.tasks);
  const base = practice.filter(t => t && t.level !== 'adv');
  const star = practice.filter(t => t && t.level === 'adv');
  const bi = base.findIndex(t => t.id === id);
  if (bi >= 0) return { name: `Задание ${bi + 1}`, text: snippet(base[bi].text) };
  const si = star.findIndex(t => t.id === id);
  if (si >= 0) return { name: `⭐ ${si + 1}`, text: snippet(star[si].text) };
  const t = allTasks(lesson).find(x => x && x.id === id);
  return t ? { name: id, text: snippet(t.text) } : { name: id, text: '' };
}

// строка «подпись — полоса — число»; fraction 0..1
function barRow(label, fraction, value, { tag, cls } = {}) {
  const w = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return h('li', { class: `sum-row${cls ? ` ${cls}` : ''}` },
    h('div', { class: 'sum-label' }, label, tag ? h('span', { class: 'sum-tag' }, tag) : ''),
    h('div', { class: 'sum-bar', role: 'img', 'aria-label': `${value}` }, h('span', { class: 'sum-fill', style: `width:${w}%` })),
    h('div', { class: 'sum-value' }, value));
}

const block = (title, hint, ...content) => h('section', { class: 'card sum-block' }, h('h2', {}, title), hint ? h('p', { class: 'hint' }, hint) : '', content);

function warmupBlock(d, lesson) {
  const byId = new Map(warmupTasks(lesson).map((t, i) => [t && t.id, { t, i }]));
  const ids = Object.keys(d.warmup || {}).sort((a, b) => (byId.has(a) ? byId.get(a).i : 1e6) - (byId.has(b) ? byId.get(b).i : 1e6) || (a < b ? -1 : 1));
  if (!ids.length) return block('Разминка', '', h('p', { class: 'muted' }, 'Данных пока нет.'));
  return block('Разминка', 'Сколько студентов набрали за вопрос полный балл (по последней сдаче каждого).',
    h('ul', { class: 'sum-list' }, ids.map(id => {
      const w = d.warmup[id] || {};
      const right = num(w.right);
      const total = num(w.total);
      const t = byId.has(id) ? byId.get(id).t : null;
      return barRow(t && t.text ? snippet(t.text) : id, total ? right / total : 0, `${right} из ${total} верно`);
    })));
}

function goalBlock(d, lesson, students) {
  const skills = arr(lesson && lesson.goal && lesson.goal.skills);
  const chosen = arr(d.goal && d.goal.chosen);
  const rows = Math.max(skills.length, chosen.length);
  if (!rows) return block('Цели', '', h('p', { class: 'muted' }, 'Данных пока нет.'));
  const items = [];
  for (let i = 0; i < rows; i++) {
    const s = skills[i];
    const n = num(chosen[i]);
    const notNeeded = !!s && s.need === false;
    items.push(barRow(s && s.text ? snippet(s.text, 110) : `Умение ${i + 1}`, students ? n / students : 0, `${n} из ${students}`,
      { tag: notNeeded ? 'не нужно' : '', cls: notNeeded ? 'extra' : '' }));
  }
  return block('Цели', 'Какие умения студенты отметили в начале занятия. «Не нужно» — умения, которые для задачи не требуются.', h('ul', { class: 'sum-list' }, items));
}

function safetyBlock(d) {
  const a = arr(d.safety && d.safety.attempts);
  const total = sum(a);
  if (!total) return block('Инструктаж', '', h('p', { class: 'muted' }, 'Данных пока нет.'));
  return block('Инструктаж', 'Сколько попыток понадобилось, чтобы пройти проверку по ОТ/ТБ.',
    h('ul', { class: 'sum-list' }, ATTEMPTS.map((label, i) => barRow(label, num(a[i]) / total, `${num(a[i])} из ${total}`))));
}

function reflectionBlock(d, lesson) {
  const r = d.reflection || {};
  const tasks = arr(r.tasks);
  const goalTasks = arr(lesson && lesson.goal && lesson.goal.tasks);
  const reasons = arr(r.reasons);
  const rTotal = sum(reasons);
  const parts = [];
  if (tasks.length) {
    parts.push(h('h3', {}, 'Задачи цели'),
      h('ul', { class: 'sum-list' }, tasks.map((t, k) => {
        const c = LEVELS.map((_, i) => num(arr(t)[i]));
        const total = sum(c);
        return h('li', { class: 'sum-row sum-refl' },
          h('div', { class: 'sum-label' }, goalTasks[k] ? snippet(goalTasks[k], 110) : `Задача ${k + 1}`),
          h('div', { class: 'sum-stack', role: 'img', 'aria-label': LEVELS.map((l, i) => `${l}: ${c[i]}`).join(', ') },
            c.map((v, i) => (v ? h('span', { class: `sum-seg ${REFLECT_CLASS[i]}`, style: `width:${pct(v, total)}%` }) : ''))),
          h('div', { class: 'sum-counts' }, LEVELS.map((l, i) => h('span', { class: `sum-count ${REFLECT_CLASS[i]}` }, `${l} ${c[i]}`))));
      })));
  }
  if (rTotal) {
    parts.push(h('h3', {}, 'Что подвело'),
      h('ul', { class: 'sum-list' }, MISTAKE_REASONS.map((label, i) => barRow(label, num(reasons[i]) / rTotal, `${num(reasons[i])} из ${rTotal}`))));
  }
  if (!parts.length) parts.push(h('p', { class: 'muted' }, 'Данных пока нет.'));
  return block('Рефлексия', 'Как студенты оценили свои умения по задачам цели: умею, частично, пока нет.', parts);
}

// фразы студентов — только текстовые узлы, без имён
function nextBlock(d) {
  const next = arr(d.reflection && d.reflection.next).filter(x => typeof x === 'string' && x.trim());
  return block('В следующий раз я…', 'Фразы студентов без фамилий, новые сверху.',
    next.length ? h('ul', { class: 'sum-next' }, next.map(x => h('li', {}, x))) : h('p', { class: 'muted' }, 'Пока никто не написал.'));
}

function mistakesBlock(d, lesson) {
  const list = arr(d.mistakes).filter(m => m && typeof m.id === 'string');
  if (!list.length) return block('Частые ошибки', '', h('p', { class: 'muted' }, 'Пока недостаточно данных.'));
  return block('Частые ошибки', 'Автозадания с наименьшей долей набранных баллов (последние сдачи студентов).',
    h('ol', { class: 'sum-list sum-mistakes' }, list.map(m => {
      const t = taskLabel(lesson, m.id);
      const p = num(m.avgPct);
      return barRow(h('span', {}, h('strong', {}, t.name), t.text ? ` · ${t.text}` : ''), p / 100, `${p}% баллов`);
    })));
}

// «Комментарий группе»: до 1000 символов, пустой текст удаляет комментарий; ошибки (в том числе «запустите setup()») показываются как есть
function commentBlock(ctx, ref, initial) {
  let saved = String(initial || '').trim();
  const area = h('textarea', { id: 'group-comment', rows: '4', class: 'sum-comment', value: initial || '', 'aria-describedby': 'group-comment-count' });
  const counter = h('span', { id: 'group-comment-count', class: 'hint' });
  const status = h('p', { class: 'hint sum-status', role: 'status' });
  const err = h('p', { class: 'error', role: 'alert' });
  const btn = h('button', { class: 'btn primary', type: 'button' }, 'Сохранить');
  const len = () => area.value.trim().length;
  const refresh = () => {
    const n = len();
    counter.textContent = `${n} / ${COMMENT_LIMIT}`;
    counter.classList.toggle('over', n > COMMENT_LIMIT);
    btn.disabled = n > COMMENT_LIMIT || area.value.trim() === saved;
  };
  area.addEventListener('input', () => { status.textContent = ''; err.textContent = ''; refresh(); });
  btn.addEventListener('click', async () => {
    const text = area.value.trim();
    if (text.length > COMMENT_LIMIT) return;
    btn.disabled = true;
    err.textContent = '';
    status.textContent = 'Сохраняем…';
    try {
      await ctx.guard(() => ctx.app.api.adminGroupComment({ group: ref.group, discipline: ref.discipline, lesson: ref.lesson, text }));
      if (!ctx.alive()) return;
      saved = text;
      area.value = text;
      status.textContent = text ? 'Сохранено. Студенты группы увидят комментарий на странице занятия.' : 'Комментарий удалён.';
    } catch (e) {
      status.textContent = '';
      ctx.fail(e, err);
    } finally {
      if (ctx.alive()) refresh();
    }
  });
  refresh();
  return block('Комментарий группе', 'Его увидят все студенты группы на первом экране занятия и после сдачи. Пустое поле удаляет комментарий.',
    h('label', { class: 'field', for: 'group-comment' }, h('span', {}, `Комментарий для группы ${ref.group}, ПЗ ${ref.lesson}`), area),
    h('div', { class: 'sum-comment-foot' }, counter, btn), status, err);
}

// #/admin/summary?group=…&d=…&n=…: сводка этапов занятия по группе и комментарий группе
export async function renderSummary(ctx, main) {
  let groups;
  let course;
  try {
    groups = await ctx.groups();
    const qd0 = ctx.query.get('d');
    course = await loadCourse(DISC.some(x => x.id === qd0) ? qd0 : DISC[0].id);
  } catch (e) {
    if (!ctx.alive() || (e && e.handled)) return;
    main.replaceChildren(loadError(errText(e), () => ctx.rerender()));
    return;
  }
  if (!ctx.alive()) return;
  if (!groups.length) { main.replaceChildren(emptyBox('Групп пока нет: добавьте студентов на вкладке «Студенты».')); return; }
  const qg = ctx.query.get('group');
  const group = groups.indexOf(qg) >= 0 ? qg : groups[0];
  const qd = ctx.query.get('d');
  const disc = DISC.some(x => x.id === qd) ? qd : DISC[0].id;
  const lessons = flatLessons(course).filter(l => l.ready);
  if (!lessons.length) { main.replaceChildren(emptyBox('В этой дисциплине пока нет готовых занятий.')); return; }
  const qn = Number(ctx.query.get('n'));
  let n = lessons.some(l => l.n === qn) ? qn : null;
  let defaultError = '';
  if (n === null) {
    // по умолчанию — последнее занятие, которое уже сдавали; нет статистики — первое готовое
    main.replaceChildren(loading('Определяем занятие…'));
    let stats = null;
    try { stats = await ctx.call('adminStats', { group, discipline: disc }); } catch (e) {
      if (!ctx.alive() || (e && e.handled)) return;
      defaultError = `Не удалось определить последнее занятие (${errText(e)}). Показано первое; выберите ПЗ вручную.`;
    }
    if (!ctx.alive()) return;
    const done = arr(stats && stats.lessons).filter(l => l && l.submitted > 0 && lessons.some(x => x.n === l.n)).map(l => l.n);
    n = done.length ? done[done.length - 1] : lessons[0].n;
  }

  const go = (g, d, k) => ctx.go(hashQuery('/admin/summary', { group: g, d, n: k }));
  const bar = h('div', { class: 'card admin-tools no-print' },
    h('div', { class: 'tools-row' },
      h('label', { class: 'field inline' }, h('span', {}, 'Группа'), select(groups.map(g => ({ value: g, label: g })), group, v => go(v, disc, n))),
      h('label', { class: 'field inline' }, h('span', {}, 'Дисциплина'), select(DISC.map(x => ({ value: x.id, label: x.code })), disc, v => go(group, v, ''))),
      h('label', { class: 'field inline' }, h('span', {}, 'ПЗ'), select(lessons.map(l => ({ value: String(l.n), label: `№${l.n}` })), String(n), v => go(group, disc, v), { 'aria-label': 'Практическое занятие' })),
      h('a', { class: 'btn small', href: `#${hashQuery(`/admin/board/${disc}/${n}`, { group })}`, target: '_blank', rel: 'noopener' }, '📺 Доска'),
      h('a', { class: 'btn small', href: `#${hashQuery(`/admin/live/${disc}/${n}`, { group })}` }, 'Мой экран')));
  const body = h('div', {}, loading('Собираем сводку…'));
  main.replaceChildren(bar, defaultError ? h('p', { class: 'error', role: 'alert' }, defaultError) : '', body);
  const meta = lessons.find(l => l.n === n);

  let d;
  let lesson = null;
  try {
    [d, lesson] = await Promise.all([
      ctx.guard(() => ctx.app.api.adminLessonSummary({ group, discipline: disc, lesson: n })),
      loadLesson(disc, n).catch(() => null), // файла нет — подписи заменяются номерами и id
    ]);
  } catch (e) {
    if (!ctx.alive() || (e && e.handled)) return;
    body.replaceChildren(loadError(errText(e), () => ctx.rerender()));
    return;
  }
  if (!ctx.alive()) return;

  const count = num(d.count);
  const stage = hasStageData(d);
  const students = sum(arr(d.safety && d.safety.attempts)) || count; // сдавших с данными v4
  const parts = [h('h2', { class: 'sum-title' }, `ПЗ №${n}${meta ? ` «${meta.title}»` : ''}`),
    h('p', { class: 'hint' }, `Последние сдачи студентов группы ${group}: ${count}.`)];
  if (!count) {
    parts.push(emptyBox('По этому занятию пока нет сдач.'));
  } else if (!stage) {
    parts.push(h('div', { class: 'card warn', role: 'status' }, 'Для этого занятия сводка этапов недоступна (старый формат)'));
  } else {
    parts.push(warmupBlock(d, lesson), goalBlock(d, lesson, students), safetyBlock(d), reflectionBlock(d, lesson), nextBlock(d));
  }
  if (count) parts.push(mistakesBlock(d, lesson));
  parts.push(commentBlock(ctx, { group, discipline: disc, lesson: n }, d.comment));
  body.replaceChildren(...parts);
}
