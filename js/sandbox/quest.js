// Квест НейроЛаба (#/sandbox/quest): главы с персонажами, шаги-задания в инструментах песочницы, очки за главу.
// История и условия — content/sandbox/quest/<n>.js, состояние (что открыто и решено) — сервер (sandboxQuest).
// Чистая часть (без DOM) вынесена наверх и покрыта tests/sandbox-quest-client.test.js.
// Квест общий для обеих дисциплин и без заданий вида prompt.
import { h, add } from '../util/dom.js';
import { sandboxApi } from './api.js';
import { createSandboxStorage } from './storage.js';
import { CLOSED_TEXT } from './daily.js';
import { mountPy } from './py.js';
import { mountTerm } from './term.js';
import { mountApi } from './api-tool.js';
import { CHARACTERS } from '../../content/story.js';

export const QUEST_ROUTES = { python: 'py', terminal: 'term', docker: 'term', api: 'api' };
const KIND_TITLE = { python: 'Python', terminal: 'Терминал', docker: 'Docker', api: 'API' };
const TOOL_TITLES = { py: 'Python', term: 'Терминал', api: 'API/JSON' };
const MAX_CHAPTERS = 20; // страховка от бесконечного перебора файлов глав

export const questKindTitle = kind => KIND_TITLE[kind] || '';

// Ссылка на инструмент для шага в режиме квеста
export function questStepHref(d, step) {
  return `#/sandbox/${QUEST_ROUTES[step.kind] || 'py'}?d=${encodeURIComponent(d)}&task=${encodeURIComponent(step.id)}&src=quest`;
}

// Номер главы из id шага вида q<n>-…: число или 0
export function chapterOfStep(stepId) {
  const m = /^q(\d{1,2})-/.exec(String(stepId || ''));
  return m ? Number(m[1]) : 0;
}

// Персонаж по ключу: { name, role, avatar } (неизвестный — безликий рассказчик)
export function speaker(who) {
  const c = who && Object.prototype.hasOwnProperty.call(CHARACTERS, who) ? CHARACTERS[who] : null;
  return c ? { name: c.name, role: c.role, avatar: c.avatar } : { name: 'НейроЛаб', role: '', avatar: '💬' };
}

// Состояние сервера -> { [id главы]: { id, open, done, steps: [{ id, solved }] } }
export function chapterStates(reply) {
  const out = {};
  ((reply && reply.chapters) || []).forEach(c => { out[c.id] = c; });
  return out;
}

// Прогресс главы: { done, total, ratio } по публичной главе и её состоянию
export function chapterProgress(chapter, state) {
  const total = chapter && Array.isArray(chapter.steps) ? chapter.steps.length : 0;
  const solved = state && Array.isArray(state.steps) ? state.steps.filter(s => s.solved).map(s => s.id) : [];
  const done = chapter && Array.isArray(chapter.steps) ? chapter.steps.filter(s => solved.indexOf(s.id) >= 0).length : 0;
  return { done, total, ratio: total ? done / total : 0 };
}

// Решён ли шаг по состоянию главы
export function stepSolved(state, stepId) {
  return !!(state && Array.isArray(state.steps) && state.steps.some(s => s.id === stepId && s.solved));
}

// Почему глава закрыта
export function lockText(chapter, prev) {
  return prev ? `Закрыто: пройди все шаги главы ${prev.id} «${prev.title}»` : 'Закрыто';
}

// Строка прогресса: «2 из 3 шагов · 30 очков за главу»
export function progressText(chapter, state) {
  const p = chapterProgress(chapter, state);
  return state && state.done ? `Глава пройдена · ${chapter.points} очков получены` : `${p.done} из ${p.total} шагов · ${chapter.points} очков за главу`;
}

// Какую главу показывать первой (текущую): первая открытая и не пройденная, иначе последняя пройденная; индекс или -1
export function currentIndex(chapters, states) {
  for (let i = 0; i < chapters.length; i++) {
    const st = states[chapters[i].id];
    if (st && st.open && !st.done) return i;
  }
  return chapters.length ? chapters.length - 1 : -1;
}

async function loadChapter(n) {
  try { return (await import(`../../content/sandbox/quest/${n}.js`)).default; } catch (e) { return null; }
}

async function loadChapters(ids) {
  const out = [];
  for (const id of ids) { const c = await loadChapter(id); if (c) out.push(c); }
  return out;
}

const closedText = r => (r && r.reason === 'lesson' ? 'Игра на паузе, пока идёт пара — инструменты работают' : CLOSED_TEXT);

function strip(chapter) {
  return h('div', { class: 'quest-strip' }, (chapter.story || []).map((line, i) => {
    const who = speaker(line.who);
    return h('div', { class: `quest-line${i % 2 ? ' right' : ''}` },
      h('span', { class: 'quest-ava', 'aria-hidden': 'true' }, who.avatar),
      h('div', { class: 'quest-bubble' }, h('span', { class: 'quest-who' }, who.role ? `${who.name}, ${who.role}` : who.name), h('p', { class: 'quest-say' }, line.text)));
  }));
}

function stepCard(d, step, state, closed) {
  const solved = stepSolved(state, step.id);
  const head = h('div', { class: 'tree-ch-head' },
    h('span', { class: 'sbx-pill' }, questKindTitle(step.kind)),
    step.star ? h('span', { class: 'sbx-star', 'aria-label': 'со звёздочкой' }, '⭐') : null);
  const body = [head, h('div', { class: 'sbx-card-title' }, step.title), solved ? h('p', { class: 'sbx-card-note ok' }, '✓ Пройден') : null];
  if (closed) return h('div', { class: 'sbx-card closed' }, body);
  return h('a', { class: `sbx-card${solved ? ' solved' : ''}`, href: questStepHref(d, step) }, body);
}

function chapterBlock(d, chapter, prev, state, closed) {
  const st = state || { open: false, done: false, steps: [] };
  const p = chapterProgress(chapter, st);
  const cls = `quest-chapter${st.done ? ' done' : st.open ? '' : ' locked'}`;
  const head = h('div', { class: 'quest-head' },
    h('h2', { class: 'quest-title' }, `Глава ${chapter.id} · ${chapter.title}`),
    h('span', { class: 'quest-pill' }, st.open ? `${p.done} из ${p.total}` : '🔒'));
  if (!st.open) return h('section', { class: cls }, head, h('p', { class: 'sbx-card-note' }, lockText(chapter, prev)));
  return h('section', { class: cls }, head,
    h('div', { class: 'quest-bar', role: 'img', 'aria-label': progressText(chapter, st) }, h('div', { class: 'quest-bar-fill', style: `width:${Math.round(p.ratio * 100)}%` })),
    h('p', { class: 'hint' }, progressText(chapter, st)),
    strip(chapter),
    h('div', { class: 'sbx-cards' }, chapter.steps.map(s => stepCard(d, s, st, closed))),
    st.done ? h('p', { class: 'quest-done-note' }, '🎉 Глава пройдена') : null);
}

// Экран #/sandbox/quest
export async function renderQuest(app, query) {
  const my = app.routeId;
  const note = h('p', { class: 'hint', role: 'status' });
  const host = h('div', { class: 'quest' });
  add(app.root, h('a', { href: '#/sandbox', class: 'back' }, '← Песочница'), h('h1', { class: 'display' }, 'Квест НейроЛаба'),
    h('p', { class: 'hint' }, 'Проходи шаги в инструментах песочницы. Когда пройдены все шаги главы, ты получаешь очки за главу и открывается следующая.'),
    note, host);
  host.append(h('p', { class: 'loading' }, 'Загружаем квест…'));
  let reply = null;
  try { reply = await sandboxApi(app.api).quest(); } catch (e) {
    if (app.routeId !== my) return;
    if (e && e.auth) { app.authExpired(); return; }
    host.replaceChildren();
    note.textContent = 'Состояние квеста не загрузилось — нет связи';
    return;
  }
  if (app.routeId !== my) return;
  if (!reply || reply.ok === false) {
    host.replaceChildren();
    note.textContent = reply && reply.error === 'not visible' ? 'Квест тебе пока недоступен' : 'Квест сейчас недоступен';
    return;
  }
  const states = chapterStates(reply);
  const ids = Object.keys(states).map(Number).sort((a, b) => a - b).slice(0, MAX_CHAPTERS);
  const chapters = await loadChapters(ids);
  if (app.routeId !== my) return;
  const closed = !!reply.closed;
  if (closed) note.textContent = closedText(reply);
  if (!chapters.length) { host.replaceChildren(); note.textContent = 'Глав пока нет'; return; }
  const cur = currentIndex(chapters, states);
  host.replaceChildren(...chapters.map((c, i) => chapterBlock(reply.d, c, i ? chapters[i - 1] : null, states[c.id], closed)));
  const target = host.children[cur];
  if (target && target.scrollIntoView && !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

const GONE = 'Этот шаг квеста недоступен';
const LOCKED = 'Эта глава ещё закрыта — пройди все шаги предыдущей';
const OFFLINE = 'Состояние квеста не загрузилось — нет связи. Инструмент работает как свободный';

// Поздравление после главы под панелью сдачи (по событию quest-step от панели задачи)
function winCard(detail) {
  const who = speaker('neuron');
  return h('div', { class: 'quest-win', role: 'status' },
    h('div', { class: 'quest-line' },
      h('span', { class: 'quest-ava', 'aria-hidden': 'true' }, who.avatar),
      h('div', { class: 'quest-bubble' }, h('span', { class: 'quest-who' }, who.name), h('p', { class: 'quest-say' }, `Глава ${detail.chapter.id} пройдена! Ты получаешь ${detail.chapter.points} очков.`))),
    h('a', { class: 'btn primary big', href: '#/sandbox/quest' }, 'К квесту'));
}

// Инструмент в режиме квеста: #/sandbox/<py|term|api>?d=&task=&src=quest
export async function renderQuestTool(app, sub, query) {
  const my = app.routeId;
  const q = key => (query && query.get ? query.get(key) : null);
  const d = q('d');
  const taskId = q('task');
  const host = h('div', { class: 'sbx-tool' });
  add(app.root, h('a', { href: '#/sandbox/quest', class: 'back' }, '← Квест НейроЛаба'), h('h1', { class: 'display' }, TOOL_TITLES[sub] || 'Шаг квеста'), host);
  host.append(h('p', { class: 'loading' }, 'Загружаем шаг…'));
  const notes = [];
  let daily = null;
  let task = null;
  try {
    const chapter = await loadChapter(chapterOfStep(taskId));
    task = chapter ? chapter.steps.filter(s => s.id === taskId)[0] || null : null;
    if (!task || QUEST_ROUTES[task.kind] !== sub) { task = null; notes.push(GONE); }
    else {
      const reply = await sandboxApi(app.api).quest();
      if (app.routeId !== my) return;
      const st = chapterStates(reply)[chapter.id];
      if (!reply || reply.ok === false) notes.push(GONE);
      else if (!st || !st.open) notes.push(LOCKED);
      else if (reply.closed) notes.push(closedText(reply));
      else if (stepSolved(st, taskId)) notes.push('Этот шаг уже пройден');
      else daily = { app, d: d || reply.d, task, date: '', source: 'quest', kind: task.kind === 'docker' ? 'docker' : undefined };
    }
  } catch (e) {
    if (app.routeId !== my) return;
    if (e && e.auth) { app.authExpired(); return; }
    notes.push(OFFLINE);
  }
  if (app.routeId !== my) return;
  host.replaceChildren(...notes.map(n => h('p', { class: 'hint' }, n)));
  if (!task) return;
  host.addEventListener('quest-step', ev => {
    const det = ev.detail || {};
    if (det.chapter) host.append(winCard(det));
    else if (det.ok && !det.already) host.append(h('p', { class: 'quest-done-note' }, 'Шаг пройден! Вернись к квесту за следующим.'), h('a', { class: 'btn big', href: '#/sandbox/quest' }, 'К квесту'));
  });
  const storage = createSandboxStorage(app.store);
  if (sub === 'py') mountPy(host, { storage, daily });
  else if (sub === 'term') mountTerm(host, { storage, daily, setup: daily ? undefined : (task.setup || {}) });
  else mountApi(host, { storage, daily, setup: task.setup });
}
