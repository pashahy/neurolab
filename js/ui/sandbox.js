// Песочница: хаб (#/sandbox), инструменты py и term.
import { h, add } from '../util/dom.js';
import { sandboxApi } from '../sandbox/api.js';
import { createSandboxStorage } from '../sandbox/storage.js';
import { awardSandboxBadges } from '../sandbox/sbx-extra.js';
import { mountPy } from '../sandbox/py.js';
import { mountTerm } from '../sandbox/term.js';
import { streakLabel, freezeLabel } from '../sandbox/streak-view.js';
import { cardState, CLOSED_TEXT, NO_TASK_TEXT, DISCIPLINE_NAMES, taskPoints } from '../sandbox/daily.js';

const KINDS = [
  { key: 'python', route: 'py', title: 'Python', tool: 'Python' },
  { key: 'terminal', route: 'term', title: 'Терминал', tool: 'Терминал' },
];

function taskCard(d, spec, task, today) {
  const st = cardState(task, today);
  const base = { class: `sbx-card ${st}` };
  const head = h('div', { class: 'sbx-card-kind' }, spec.title, task && task.star ? h('span', { class: 'sbx-star', 'aria-label': 'со звёздочкой' }, ' ⭐') : '');
  if (st === 'closed') return h('div', base, head, h('p', { class: 'sbx-card-note' }, CLOSED_TEXT));
  if (st === 'none') return h('div', base, head, h('p', { class: 'sbx-card-note' }, NO_TASK_TEXT));
  const href = `#/sandbox/${spec.route}?d=${encodeURIComponent(d)}&task=${encodeURIComponent(task.id)}`;
  if (st === 'solved') return h('a', Object.assign({ href }, base), head, h('div', { class: 'sbx-card-title' }, task.title), h('p', { class: 'sbx-card-note ok' }, '✓ Решена'));
  return h('a', Object.assign({ href }, base), head, h('div', { class: 'sbx-card-title' }, task.title), h('p', { class: 'sbx-card-note' }, `${taskPoints(task)} очков · решать`));
}

function toolLinks() {
  return h('nav', { class: 'sbx-tools', 'aria-label': 'Инструменты' },
    h('a', { class: 'btn big', href: '#/sandbox/py' }, 'Python'),
    h('a', { class: 'btn big', href: '#/sandbox/term' }, 'Терминал'));
}

async function renderHub(app) {
  const my = app.routeId;
  const body = h('div', { class: 'sbx-hub' }, h('p', { class: 'loading' }, 'Загружаем задачи дня…'));
  add(app.root, h('a', { href: '#/', class: 'back' }, '← Главная'), h('h1', { class: 'display' }, 'Песочница'), body);
  const storage = createSandboxStorage(app.store);
  let today = null;
  try {
    today = await sandboxApi(app.api).today();
  } catch (e) {
    if (app.routeId !== my) return;
    if (e && e.auth) { app.authExpired(); return; }
    body.replaceChildren(h('p', { class: 'hint' }, 'Задачи дня не загрузились — нет связи. Инструменты работают.'), toolLinks());
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
    parts.push(h('p', { class: 'sbx-card-note' }, CLOSED_TEXT));
  }
  const ds = today.disciplines || {};
  Object.keys(ds).forEach(d => {
    const pair = ds[d] || {};
    parts.push(h('section', { class: 'sbx-disc' },
      h('h2', { class: 'sbx-disc-title' }, `Задачи дня · ${DISCIPLINE_NAMES[d] || d}`),
      h('div', { class: 'sbx-cards' }, KINDS.map(k => taskCard(d, k, pair[k.key] || null, today)))));
  });
  parts.push(h('h2', { class: 'sbx-disc-title' }, 'Свободная практика'), toolLinks());
  body.replaceChildren(...parts);
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
      const task = pair[isPy ? 'python' : 'terminal'];
      if (today.closed) notes.push(CLOSED_TEXT);
      else if (!task || task.id !== taskId) notes.push(TASK_GONE_TEXT);
      else daily = { app, d, task, date: today.date };
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
  } else {
    mountTerm(host, { storage, daily, setup: fromData && fromData.kind === 'terminal' ? (fromData.setup || {}) : undefined });
  }
}

export async function renderSandbox(app, parts, query) {
  const sub = parts && parts[0];
  if (sub === 'py' || sub === 'term') return renderTool(app, sub, query);
  return renderHub(app);
}
