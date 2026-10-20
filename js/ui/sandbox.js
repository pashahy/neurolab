// Песочница: хаб (#/sandbox), инструменты py и term.
import { h, add } from '../util/dom.js';
import { sandboxApi } from '../sandbox/api.js';
import { createSandboxStorage } from '../sandbox/storage.js';
import { awardSandboxBadges } from '../sandbox/sbx-extra.js';
import { mountPy } from '../sandbox/py.js';
import { mountTerm } from '../sandbox/term.js';
import { mountApi } from '../sandbox/api-tool.js';
import MISSIONS from '../../content/sandbox/missions.js';
import { createMissionStorage, isUnlocked } from '../sandbox/missions.js';
import { renderChooser, createMissionPanel, MISSIONS_URL, LOCKED_TEXT } from '../sandbox/mission-view.js';
import { streakLabel, freezeLabel } from '../sandbox/streak-view.js';
import { mountArchive } from '../sandbox/archive.js';
import { canUsePrompts } from '../sandbox/access.js';
import { renderTree, renderTreeTool } from '../sandbox/tree.js';
import { renderQuest, renderQuestTool } from '../sandbox/quest.js';
import { cardState, CLOSED_TEXT, NO_TASK_TEXT, DISCIPLINE_NAMES, taskPoints } from '../sandbox/daily.js';

const KINDS = [
  { key: 'python', route: 'py', title: 'Python', tool: 'Python' },
  { key: 'terminal', route: 'term', title: 'Терминал', tool: 'Терминал' },
];

// Третья задача дня (extra): вид задачи -> какой инструмент открывает карточка
const EXTRA_KINDS = {
  prompt: { key: 'extra', route: 'prompt', title: 'Промпт' },
  api: { key: 'extra', route: 'api', title: 'API' },
  docker: { key: 'extra', route: 'term', title: 'Docker' },
};

// Почему игра закрыта: на паре группы — свой текст, иначе ночной
const closedText = today => (today && today.reason === 'lesson' ? 'Игра на паузе, пока идёт пара — инструменты работают' : CLOSED_TEXT);

function taskCard(d, spec, task, today) {
  const st = cardState(task, today);
  const base = { class: `sbx-card ${st}` };
  const head = h('div', { class: 'sbx-card-kind' }, spec.title, task && task.star ? h('span', { class: 'sbx-star', 'aria-label': 'со звёздочкой' }, ' ⭐') : '');
  if (st === 'closed') return h('div', base, head, h('p', { class: 'sbx-card-note' }, closedText(today)));
  if (st === 'none') return h('div', base, head, h('p', { class: 'sbx-card-note' }, NO_TASK_TEXT));
  const href = `#/sandbox/${spec.route}?d=${encodeURIComponent(d)}&task=${encodeURIComponent(task.id)}`;
  if (st === 'solved') return h('a', Object.assign({ href }, base), head, h('div', { class: 'sbx-card-title' }, task.title), h('p', { class: 'sbx-card-note ok' }, '✓ Решена'));
  return h('a', Object.assign({ href }, base), head, h('div', { class: 'sbx-card-title' }, task.title), h('p', { class: 'sbx-card-note' }, `${taskPoints(task)} очков · решать`));
}

function toolLinks(group) {
  return h('nav', { class: 'sbx-tools', 'aria-label': 'Инструменты' },
    h('a', { class: 'btn big primary tree-link', href: '#/sandbox/tree' }, '🌳 Дерево навыков'),
    h('a', { class: 'btn big primary tree-link', href: '#/sandbox/quest' }, '📖 Квест НейроЛаба'),
    h('a', { class: 'btn big', href: '#/sandbox/py' }, 'Python'),
    h('a', { class: 'btn big', href: '#/sandbox/term' }, 'Терминал'),
    h('a', { class: 'btn big', href: '#/sandbox/api' }, 'API/JSON'),
    canUsePrompts(group) ? h('a', { class: 'btn big', href: '#/sandbox/prompt' }, '✍️ Конструктор промптов') : null);
}

async function renderHub(app) {
  const my = app.routeId;
  const me = app.store.profile && app.store.profile();
  const group = me ? me.group : '';
  const body = h('div', { class: 'sbx-hub' }, h('p', { class: 'loading' }, 'Загружаем задачи дня…'));
  add(app.root, h('a', { href: '#/', class: 'back' }, '← Главная'), h('h1', { class: 'display' }, 'Песочница'), body);
  const storage = createSandboxStorage(app.store);
  let today = null;
  try {
    today = await sandboxApi(app.api).today();
  } catch (e) {
    if (app.routeId !== my) return;
    if (e && e.auth) { app.authExpired(); return; }
    body.replaceChildren(h('p', { class: 'hint' }, 'Задачи дня не загрузились — нет связи. Инструменты работают.'), toolLinks(group));
    return;
  }
  if (app.routeId !== my) return;
  if (today.stats) { storage.saveStats(today.stats); awardSandboxBadges(app.store); }
  const parts = [];
  if (!today.closed) {
    parts.push(h('div', { class: 'sbx-streak' },
      h('div', { class: 'sbx-streak-main' }, streakLabel(today)),
      h('div', { class: 'sbx-streak-freeze' }, freezeLabel(today.freeze))));
  } else {
    parts.push(h('p', { class: 'sbx-card-note' }, closedText(today)));
  }
  const ds = today.disciplines || {};
  Object.keys(ds).forEach(d => {
    const pair = ds[d] || {};
    parts.push(h('section', { class: 'sbx-disc' },
      h('h2', { class: 'sbx-disc-title' }, `Задачи дня · ${DISCIPLINE_NAMES[d] || d}`),
      h('div', { class: 'sbx-cards' }, KINDS.map(k => taskCard(d, k, pair[k.key] || null, today))
        .concat(pair.extra && EXTRA_KINDS[pair.extra.kind] ? [taskCard(d, EXTRA_KINDS[pair.extra.kind], pair.extra, today)] : []))));
  });
  parts.push(h('h2', { class: 'sbx-disc-title' }, 'Свободная практика'), toolLinks(group));
  const archiveHost = h('section', { class: 'sbx-archive' });
  parts.push(archiveHost);
  body.replaceChildren(...parts);
  mountArchive(archiveHost, { app, storage });
}

// Терминал без параметров: выбор «Свободный режим» / миссии; ?m=<id> — сама миссия
function mountMissions(app, host, storage, missionId) {
  const mstorage = createMissionStorage(app.store);
  const done = mstorage.loadDone();
  const def = missionId ? MISSIONS.find(m => m.id === missionId) : null;
  if (def && isUnlocked(MISSIONS, done, def.id)) {
    const panel = createMissionPanel({ missions: MISSIONS, def, mstorage, store: app.store });
    host.append(h('a', { href: MISSIONS_URL, class: 'back' }, '← Все миссии'));
    mountTerm(host, { storage, mission: { def, panel } });
    return;
  }
  if (missionId) host.append(h('p', { class: 'hint' }, def ? LOCKED_TEXT : 'Такой миссии нет'));
  const list = h('div', { class: 'sbx-hub' });
  host.append(list);
  renderChooser(list, { missions: MISSIONS, done });
}

const TASK_GONE_TEXT = 'Эта задача дня уже недоступна — открыта свободная практика';
const TASK_OFFLINE_TEXT = 'Задача дня не загрузилась — нет связи. Инструменты работают';

// Инструмент: #/sandbox/py|term; ?d=&task= — задача дня, ?from=1 — данные из ПЗ
async function renderTool(app, route, query) {
  const my = app.routeId;
  const isPy = route === 'py';
  const host = h('div', { class: 'sbx-tool' });
  add(app.root, h('a', { href: '#/sandbox', class: 'back' }, '← Песочница'), h('h1', { class: 'display' }, isPy ? 'Python' : 'Терминал'), host);
  const storage = createSandboxStorage(app.store);
  const q = key => (query && query.get ? query.get(key) : null);
  const d = q('d');
  const taskId = q('task');
  const fromData = q('from') ? storage.takeFrom() : null;
  const notes = [];
  let daily = null;
  if (d && taskId) {
    host.append(h('p', { class: 'loading' }, 'Загружаем задачу…'));
    try {
      const today = await sandboxApi(app.api).today();
      if (app.routeId !== my) return;
      const pair = (today.disciplines && today.disciplines[d]) || {};
      let task = pair[isPy ? 'python' : 'terminal'];
      let kind;
      if (!isPy && (!task || task.id !== taskId) && pair.extra && pair.extra.kind === 'docker' && pair.extra.id === taskId) { task = pair.extra; kind = 'docker'; }
      if (today.closed) notes.push(closedText(today));
      else if (!task || task.id !== taskId) notes.push(TASK_GONE_TEXT);
      else daily = { app, d, task, date: today.date, kind };
    } catch (e) {
      if (app.routeId !== my) return;
      if (e && e.auth) { app.authExpired(); return; }
      notes.push(TASK_OFFLINE_TEXT);
    }
    host.replaceChildren();
  }
  notes.forEach(n => host.append(h('p', { class: 'hint' }, n)));
  if (isPy) {
    mountPy(host, { storage, daily, initial: fromData && fromData.kind === 'python' && typeof fromData.code === 'string' ? fromData.code : undefined });
  } else if (!daily && !d && !fromData && !q('from') && !q('free')) {
    mountMissions(app, host, storage, q('m'));
  } else {
    mountTerm(host, {storage, daily, setup: fromData && fromData.kind === 'terminal' ? (fromData.setup || {}) : undefined });
  }
}

// Третья задача дня для инструментов api и prompt: ?d=&task= -> { daily?, notes, stale? } (stale — экран уже сменился, ничего не рисовать)
async function loadExtraDaily(app, my, query, kind) {
  const q = key => (query && query.get ? query.get(key) : null);
  const d = q('d');
  const taskId = q('task');
  if (!d || !taskId) return { notes: [] };
  try {
    const today = await sandboxApi(app.api).today();
    if (app.routeId !== my) return { stale: true, notes: [] };
    if (today.closed) return { notes: [closedText(today)] };
    const task = ((today.disciplines && today.disciplines[d]) || {}).extra;
    if (!task || task.id !== taskId || task.kind !== kind) return { notes: [TASK_GONE_TEXT] };
    return { daily: { app, d, task, date: today.date }, notes: [] };
  } catch (e) {
    if (app.routeId !== my) return { stale: true, notes: [] };
    if (e && e.auth) { app.authExpired(); return { stale: true, notes: [] }; }
    return { notes: [TASK_OFFLINE_TEXT] };
  }
}

// Инструмент «API/JSON»: #/sandbox/api; ?d=&task= — задача дня вида api
async function renderApiTool(app, query) {
  const my = app.routeId;
  const host = h('div', { class: 'sbx-tool' });
  add(app.root, h('a', { href: '#/sandbox', class: 'back' }, '← Песочница'), h('h1', { class: 'display' }, 'API/JSON'), host);
  const hasTask = !!(query && query.get && query.get('task'));
  if (!hasTask) { mountApi(host, { storage: createSandboxStorage(app.store) }); return; } // свободный режим — сразу, без сети
  host.append(h('p', { class: 'loading' }, 'Загружаем задачу…'));
  const r = await loadExtraDaily(app, my, query, 'api');
  if (r.stale) return;
  host.replaceChildren(...r.notes.map(n => h('p', { class: 'hint' }, n)));
  mountApi(host, { storage: createSandboxStorage(app.store), daily: r.daily, setup: r.daily ? r.daily.task.setup : undefined });
}

async function renderPromptTool(app, query) {
  const my = app.routeId;
  const me = app.store.profile && app.store.profile();
  const { mountPrompt } = await import('../sandbox/prompt-tool.js');
  const host = h('div', { class: 'sbx-tool' });
  add(app.root, h('a', { href: '#/sandbox', class: 'back' }, '← Песочница'), h('h1', { class: 'display' }, 'Конструктор промптов'), host);
  const hasTask = !!(query && query.get && query.get('task'));
  if (hasTask) host.append(h('p', { class: 'loading' }, 'Загружаем задачу…'));
  const r = await loadExtraDaily(app, my, query, 'prompt');
  if (r.stale) return;
  host.replaceChildren(...r.notes.map(n => h('p', { class: 'hint' }, n)));
  mountPrompt(host, { storage: createSandboxStorage(app.store), group: me ? me.group : '', daily: r.daily });
}

export async function renderSandbox(app, parts, query) {
  const sub = parts && parts[0];
  if (sub === 'tree') return renderTree(app, query);
  if (sub === 'quest') return renderQuest(app, query);
  if ((sub === 'py' || sub === 'term' || sub === 'api') && query && query.get && query.get('src') === 'quest') return renderQuestTool(app, sub, query);
  if ((sub === 'py' || sub === 'term' || sub === 'api' || sub === 'prompt') && query && query.get && query.get('src') === 'tree') return renderTreeTool(app, sub, query);
  if (sub === 'api') return renderApiTool(app, query);
  if (sub === 'prompt') return renderPromptTool(app, query);
  if (sub === 'py' || sub === 'term') return renderTool(app, sub, query);
  return renderHub(app);
}
