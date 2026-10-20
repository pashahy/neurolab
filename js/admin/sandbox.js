// Админка: песочница для преподавателя (#/admin/sandbox, /py, /term, /mission/<id>).
// Все задачи дня и инструменты без начисления очков: студенческой сессии нет, черновики живут в памяти страницы.
import { h } from '../util/dom.js';
import { md } from '../util/text.js';
import { errText } from '../ui/login.js';
import { createStore, memoryStorage } from '../store.js';
import { createSandboxStorage } from '../sandbox/storage.js';
import { mountPy } from '../sandbox/py.js';
import { mountTerm } from '../sandbox/term.js';
import { mountApi } from '../sandbox/api-tool.js';
import { mountPrompt } from '../sandbox/prompt-tool.js';
import { runPython } from '../tasks/python-runner.js';
import { CHARACTERS } from '../../content/story.js';
import MISSIONS from '../../content/sandbox/missions.js';
import { createMissionStorage } from '../sandbox/missions.js';
import { createMissionPanel } from '../sandbox/mission-view.js';

export const PREVIEW_NOTE = 'Режим просмотра: очки не начисляются, ничего не сохраняется.';
export const KIND_TITLES = { python: 'Python', terminal: 'Терминал', prompt: 'Промпт', api: 'API', docker: 'Docker' };
export const DISC_TITLES = { dup01: 'ДУП.01', dup03: 'ДУП.03' };

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** '2026-10-19' -> 'пн, 19.10.2026' (+ ' · сегодня'). */
export function dayLabel(date, today) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date));
  if (!m) return String(date);
  const wd = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return `${wd}, ${m[3]}.${m[2]}.${m[1]}${date === today ? ' · сегодня' : ''}`;
}

/** Номера с нуля -> '№ 3, 5' (с единицы). */
export function numbersText(failed) {
  return `№ ${(failed || []).map(i => Number(i) + 1).join(', ')}`;
}

/** Итог проверки сервера { correct, failed, total } -> { kind: 'ok'|'fail', text }. */
export function checkView(res, kind, runs) {
  if (res && !res.correct && res.score !== undefined) return { kind: 'fail', text: `Оценка промпта ${res.score} из 100, порог ${res.min}. Очки не начислены.` };
  const what = kind === 'python' ? 'случаев' : 'целей';
  const total = Number(res && res.total) || 0;
  const failed = res && Array.isArray(res.failed) ? res.failed : [];
  if (res && res.correct) return { kind: 'ok', text: `Верно: пройдено ${total} из ${total} (${what}). Очки не начислены.` };
  // Python: у упавшего случая с ошибкой выполнения показываем первую строку ошибки рядом с номером
  const errs = [];
  if (kind === 'python' && Array.isArray(runs)) {
    failed.forEach(i => {
      const r = runs[Number(i)];
      const line = r && r.ok === false && typeof r.error === 'string' ? r.error.split('\n').map(x => x.trim()).filter(Boolean)[0] : '';
      if (line) errs.push(`№ ${Number(i) + 1}: ${line.length > 160 ? `${line.slice(0, 160)}…` : line}`);
    });
  }
  return { kind: 'fail', text: `Не пройдено ${failed.length} из ${total}: ${what} ${numbersText(failed)}.${errs.length ? ` Ошибка выполнения — ${errs.join('; ')}.` : ''} Очки не начислены.` };
}

/** Выводы по всем случаям из результатов раннера: нет результата или ошибка — пустая строка. */
export function pythonOutputs(results, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const r = results && results[i];
    out.push(r && r.ok ? String(r.output || '') : '');
  }
  return out;
}

/** Эталон задачи текстом (Python — код, терминал — команды). */
export function referenceText(task) {
  if (!task || task.solution === undefined || task.solution === null) return '';
  const s = task.solution;
  if (Array.isArray(s)) return s.map(x => (x && typeof x === 'object' ? `${x.method} ${x.path}${x.body ? `  ${x.body}` : ''}` : String(x))).join('\n'); // команды или запросы API
  if (typeof s === 'object') return Object.keys(s).map(k => `${k}: ${s[k]}`).join('\n'); // блоки промпта
  return String(s);
}

/** Строки о третьей задаче для преподавателя: блоки, ключевые слова и порог prompt, ответ api. */
export function extraInfo(task) {
  const out = [];
  if (!task) return out;
  if (task.kind === 'prompt' && task.rubric) {
    out.push(`Обязательные блоки: ${(task.rubric.required || []).join(', ') || '—'}`);
    out.push(`Ключевые слова: ${(task.rubric.keywords || []).join(', ') || '—'}`);
    out.push(`Порог оценки: ${task.rubric.min}`);
  }
  if (task.kind === 'api' && typeof task.answer === 'string') out.push(`Ответ: ${task.answer}`);
  return out;
}

/** Название вида: для третьей задачи — по её kind. */
export function kindTitle(item) {
  return KIND_TITLES[item.kind === 'extra' ? item.task.kind : item.kind] || item.kind;
}

/** Задачи дня, сгруппированные для показа: [{ d, kind, task }] без пустых. */
export function dayTasks(day) {
  const out = [];
  Object.keys((day && day.disciplines) || {}).forEach(d => {
    ['python', 'terminal', 'extra'].forEach(kind => {
      const task = day.disciplines[d][kind];
      if (task) out.push({ d, kind, task });
    });
  });
  return out;
}

function previewStorage() {
  return createSandboxStorage(createStore(memoryStorage()));
}

function backLink() {
  return h('p', {}, h('a', { href: '#/admin/sandbox', class: 'back' }, '← Песочница'));
}

function toolLinks() {
  return h('div', { class: 'row' },
    h('a', { class: 'btn', href: '#/admin/sandbox/py' }, 'Python'),
    h('a', { class: 'btn', href: '#/admin/sandbox/term' }, 'Терминал'));
}

function missionsList() {
  return h('ul', { class: 'list-plain' }, MISSIONS.map(m =>
    h('li', {}, h('a', { href: `#/admin/sandbox/mission/${encodeURIComponent(m.id)}` }, m.title))));
}

// Инструмент задачи в режиме просмотра + кнопка «Проверить (без очков)».
function mountTaskPreview(ctx, host, { d, date, kind, task }) {
  const storage = previewStorage();
  const toolHost = h('div', { class: 'sbx-tool' });
  const result = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn primary', type: 'button' }, 'Проверить (без очков)');
  let tool;
  let answerIn = null;
  let dead = false; // просмотр закрыт или заменён: результат уже запущенного Python игнорируем
  if (kind === 'python') tool = mountPy(toolHost, { storage, initial: task.starter || '' });
  else if (kind === 'extra' && task.kind === 'prompt') tool = mountPrompt(toolHost, { storage, group: 'ИИ112-26' });
  else if (kind === 'extra' && task.kind === 'api') {
    tool = mountApi(toolHost, { storage, setup: task.setup || {} });
    if (typeof task.answer === 'string') { answerIn = h('input', { type: 'text', 'aria-label': 'Ответ', placeholder: 'Ответ на вопрос задачи', maxlength: '200' }); toolHost.append(answerIn); }
  } else tool = mountTerm(toolHost, { storage, setup: task.setup || {} });
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    result.className = 'hint';
    result.textContent = 'Проверяем…';
    try {
      let payload;
      let runResults = null;
      if (kind === 'python') {
        const runs = task.cases.map(c => ({ stdin: c.stdin }));
        const pk = storage.loadPy().packages;
        const run = await runPython(tool.get(), runs, pk.length ? { packages: pk } : undefined);
        if (dead) return;
        runResults = run.results;
        payload = { outputs: pythonOutputs(run.results, runs.length) };
      } else if (kind === 'extra' && task.kind === 'prompt') {
        payload = { blocks: tool.blocks() };
      } else if (kind === 'extra' && task.kind === 'api') {
        payload = { history: tool.state.history.map(e => ({ method: e.method, path: e.path, body: e.body })), answer: answerIn ? answerIn.value : undefined };
      } else {
        payload = { history: tool.history().slice(-200).map(c => String(c).slice(0, 500)) };
      }
      const res = await ctx.call('adminSandboxCheck', { d, date, kind, payload });
      if (dead || !ctx.alive()) return;
      const v = checkView(res, kind, runResults);
      result.className = v.kind === 'ok' ? 'ok-text' : 'error';
      result.textContent = v.text;
    } catch (e) {
      if (dead || !ctx.alive() || (e && e.handled)) return;
      result.className = 'error';
      result.textContent = errText(e);
    } finally { btn.disabled = false; }
  });
  host.replaceChildren(h('p', { class: 'hint' }, PREVIEW_NOTE), toolHost, h('div', { class: 'row' }, btn), result);
  // Закрытие просмотра: поздние результаты игнорируются, слушатели инструмента (терминал на весь экран) снимаются
  return function dispose() {
    dead = true;
    if (tool && typeof tool.dispose === 'function') { try { tool.dispose(); } catch (e) { /* инструмент уже снят */ } }
  };
}

function taskCard(ctx, date, item, state) {
  const { d, kind, task } = item;
  const open = h('div', { class: 'sbx-admin-tool' });
  const btnOpen = h('button', { class: 'btn small', type: 'button' }, 'Открыть в инструменте');
  btnOpen.addEventListener('click', () => {
    if (state.open && state.open !== open) { if (state.dispose) state.dispose(); state.dispose = null; state.open.replaceChildren(); }
    if (open.firstChild) { if (state.dispose) state.dispose(); state.dispose = null; open.replaceChildren(); state.open = null; return; }
    state.open = open;
    state.dispose = mountTaskPreview(ctx, open, { d, date, kind, task });
  });
  const hints = Array.isArray(task.hints) ? task.hints : [];
  const ref = referenceText(task);
  return h('section', { class: 'card' },
    h('h3', {}, `${DISC_TITLES[d] || d} · ${kindTitle(item)}${task.star ? ' ⭐' : ''} · ${task.title}`),
    h('div', { class: 'sbx-task-text', html: md(task.text || '') }),
    extraInfo(task).length ? h('ul', {}, extraInfo(task).map(x => h('li', {}, x))) : '',
    (kind === 'terminal' || kind === 'extra') && Array.isArray(task.goals)
      ? h('ul', {}, task.goals.map(g => h('li', {}, String(g.text || `${g.kind} ${g.path || ''}`)))) : '',
    hints.length ? h('details', {}, h('summary', {}, `Подсказки (${hints.length})`), h('ol', {}, hints.map(t => h('li', {}, String(t))))) : '',
    task.explain ? h('details', {}, h('summary', {}, 'Разбор'), h('div', { html: md(String(task.explain)) })) : '',
    ref ? h('details', {}, h('summary', {}, 'Эталон'), h('pre', { class: 'code' }, ref)) : '',
    h('div', { class: 'row' }, btnOpen), open);
}

async function renderList(ctx, main) {
  const r = await ctx.call('adminSandboxDays');
  if (!ctx.alive()) return;
  const state = { open: null };
  const days = Array.isArray(r.days) ? r.days : [];
  main.replaceChildren(
    h('div', { class: 'card' },
      h('h2', {}, 'Песочница'),
      h('p', { class: 'hint' }, `${PREVIEW_NOTE} Дни: сегодня ± 14.`),
      h('h3', {}, 'Свободные инструменты'), toolLinks(),
      h('h3', {}, 'Дерево навыков'), h('p', {}, h('a', { class: 'btn', href: '#/admin/sandbox/tree' }, 'Дерево с эталонами')),
      h('h3', {}, 'Квест'), h('p', {}, h('a', { class: 'btn', href: '#/admin/sandbox/quest' }, 'Квест с эталонами')),
      h('h3', {}, 'Миссии терминала'), missionsList()),
    ...(days.length ? days.map(day => h('section', { class: 'sbx-admin-day' },
      h('h2', {}, dayLabel(day.date, r.today)),
      dayTasks(day).map(item => taskCard(ctx, day.date, item, state))))
      : [h('p', { class: 'hint' }, 'В этом диапазоне задач дня нет.')]));
}

function renderFree(main, kind) {
  const host = h('div', { class: 'sbx-tool' });
  main.replaceChildren(backLink(), h('h2', {}, kind === 'py' ? 'Python' : 'Терминал'), h('p', { class: 'hint' }, PREVIEW_NOTE), host);
  const storage = previewStorage();
  if (kind === 'py') mountPy(host, { storage });
  else mountTerm(host, { storage });
}

function renderMission(main, id) {
  const def = MISSIONS.find(m => m.id === id);
  if (!def) { main.replaceChildren(backLink(), h('p', { class: 'hint' }, 'Такой миссии нет')); return; }
  const store = createStore(memoryStorage());
  const panel = createMissionPanel({ missions: MISSIONS, def, mstorage: createMissionStorage(store), store });
  const host = h('div', { class: 'sbx-tool' });
  main.replaceChildren(backLink(), h('p', { class: 'hint' }, PREVIEW_NOTE), host);
  mountTerm(host, { storage: createSandboxStorage(store), mission: { def, panel } });
}

// Дерево навыков целиком, с секретами (эталоны, скрытые случаи, оценка): только для преподавателя
async function renderTreeAdmin(ctx, main) {
  const r = await ctx.call('adminSandboxTree');
  if (!ctx.alive()) return;
  const trees = (r && r.trees) || {};
  const secretText = ch => {
    const nl = '\n';
    if (ch.kind === 'python') return 'Случаев: ' + (Array.isArray(ch.cases) ? ch.cases.length : 0) + nl + nl + (ch.solution || '');
    if (ch.kind === 'prompt') return 'Порог ' + (ch.rubric ? ch.rubric.min : '?') + ', ключевые слова: ' + (ch.rubric && ch.rubric.keywords ? ch.rubric.keywords.join(', ') : '') + nl + nl + JSON.stringify(ch.solution, null, 2);
    if (ch.kind === 'api') return (typeof ch.answer === 'string' ? 'Ответ: ' + ch.answer + nl + nl : '') + JSON.stringify(ch.solution, null, 2);
    return Array.isArray(ch.solution) ? ch.solution.join(nl) : '';
  };
  const chCard = ch => h('section', { class: 'card' },
    h('h4', {}, `${ch.kind} · ${ch.star ? '⭐ 10' : '5'} очков · ${ch.title} (${ch.id})`),
    h('div', { class: 'sbx-task-text', html: md(ch.text || '') }),
    Array.isArray(ch.goals) ? h('ul', {}, ch.goals.map(g => h('li', {}, String(g.text || g.kind)))) : '',
    ch.explain ? h('details', {}, h('summary', {}, 'Разбор'), h('div', { html: md(String(ch.explain)) })) : '',
    h('details', {}, h('summary', {}, 'Эталон'), h('pre', { class: 'code' }, secretText(ch))));
  const parts = Object.keys(trees).map(d => h('section', {},
    h('h2', {}, DISC_TITLES[d] || d),
    trees[d].nodes.map(n => h('div', { class: 'card' },
      h('h3', {}, `${n.icon} ${n.title}`),
      h('p', { class: 'hint' }, `Тема ${n.topic}. ${n.after.length ? 'Открывается после: ' + n.after.join(', ') + ' (решить не меньше половины).' : 'Первый узел, открыт сразу.'}`),
      n.challenges.map(chCard)))));
  main.replaceChildren(backLink(), h('h2', {}, 'Дерево навыков'), h('p', { class: 'hint' }, 'Условия, эталоны и скрытые случаи. Очки не начисляются.'), ...(parts.length ? parts : [h('p', { class: 'hint' }, 'Дерева нет.')]));
}

// Квест НейроЛаба целиком, с секретами (эталоны, скрытые случаи, подсказки): только для преподавателя
async function renderQuestAdmin(ctx, main) {
  const r = await ctx.call('adminSandboxQuest');
  if (!ctx.alive()) return;
  const quest = (r && r.quest) || [];
  const nl = '\n';
  const secretText = st => {
    if (st.kind === 'python') return 'Случаев: ' + (Array.isArray(st.cases) ? st.cases.length : 0) + nl + nl + (st.solution || '');
    if (st.kind === 'api') return (typeof st.answer === 'string' ? 'Ответ: ' + st.answer + nl + nl : '') + JSON.stringify(st.solution, null, 2);
    return Array.isArray(st.solution) ? st.solution.join(nl) : '';
  };
  const stepCard = st => h('section', { class: 'card' },
    h('h4', {}, st.kind + ' · ' + st.title + ' (' + st.id + ')'),
    h('div', { class: 'sbx-task-text', html: md(st.text || '') }),
    Array.isArray(st.goals) ? h('ul', {}, st.goals.map(g => h('li', {}, String(g.text || g.kind)))) : '',
    Array.isArray(st.hints) ? h('details', {}, h('summary', {}, 'Подсказки'), h('ol', {}, st.hints.map(x => h('li', {}, String(x))))) : '',
    st.explain ? h('details', {}, h('summary', {}, 'Разбор'), h('div', { html: md(String(st.explain)) })) : '',
    h('details', {}, h('summary', {}, 'Эталон'), h('pre', { class: 'code' }, secretText(st))));
  const parts = quest.map(c => h('section', { class: 'card' },
    h('h3', {}, 'Глава ' + c.id + ' · ' + c.title),
    h('p', { class: 'hint' }, 'Очки за главу: ' + c.points + ' (одна строка quest' + c.id + ' после последнего шага). Открывается, когда пройдены все шаги предыдущей главы.'),
    h('ul', {}, (c.story || []).map(l => {
      const who = Object.prototype.hasOwnProperty.call(CHARACTERS, l.who) ? CHARACTERS[l.who] : null;
      return h('li', {}, (who ? who.avatar + ' ' + who.name : String(l.who)) + ': ' + l.text);
    })),
    c.steps.map(stepCard)));
  main.replaceChildren(backLink(), h('h2', {}, 'Квест НейроЛаба'), h('p', { class: 'hint' }, 'Условия, эталоны и скрытые случаи. Квест общий для обеих дисциплин, без заданий-промптов. Очки не начисляются.'), ...(parts.length ? parts : [h('p', { class: 'hint' }, 'Квеста нет.')]));
}

export async function renderAdminSandbox(ctx, main) {
  const sub = ctx.parts[1] || '';
  if (sub === 'tree') { await renderTreeAdmin(ctx, main); return; }
  if (sub === 'quest') { await renderQuestAdmin(ctx, main); return; }
  if (sub === 'py' || sub === 'term') { renderFree(main, sub); return; }
  if (sub === 'mission') { renderMission(main, decodeURIComponent(ctx.parts[2] || '')); return; }
  await renderList(ctx, main);
}
