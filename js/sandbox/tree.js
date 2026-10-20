// Дерево навыков песочницы (#/sandbox/tree): карта узлов-тем, челленджи, запуск инструмента в режиме дерева.
// Структура и условия — content/sandbox/tree/<d>.js, состояние (что открыто и решено) — сервер (sandboxTree).
// Чистая часть (без DOM) вынесена наверх и покрыта tests/sandbox-tree-client.test.js.
import { h, add } from '../util/dom.js';
import { sandboxApi } from './api.js';
import { createSandboxStorage } from './storage.js';
import { canUsePrompts } from './access.js';
import { DISCIPLINE_NAMES, CLOSED_TEXT } from './daily.js';
import { mountPy } from './py.js';
import { mountTerm } from './term.js';
import { mountApi } from './api-tool.js';

export const TREE_DISCIPLINES = ['dup01', 'dup03'];
export const TREE_POINTS = 5;
export const TREE_STAR_POINTS = 10;
const ROUTES = { python: 'py', terminal: 'term', docker: 'term', api: 'api', prompt: 'prompt' };
const KIND_TITLE = { python: 'Python', terminal: 'Терминал', docker: 'Docker', api: 'API', prompt: 'Промпт' };

export const challengePoints = ch => (ch && ch.star ? TREE_STAR_POINTS : TREE_POINTS);
export const kindTitle = kind => KIND_TITLE[kind] || '';

// Челленджи узла, видимые группе: prompt — только группам конструктора (как на сервере)
export function visibleChallenges(node, group) {
  const list = node && Array.isArray(node.challenges) ? node.challenges : [];
  return list.filter(c => c.kind !== 'prompt' || canUsePrompts(group));
}

// Прогресс узла: { done, total, ratio, need } — need: сколько решить, чтобы открылись следующие (не меньше половины)
export function nodeProgress(node, solved, group) {
  const vis = visibleChallenges(node, group);
  const set = Array.isArray(solved) ? solved : [];
  const done = vis.filter(c => set.indexOf(c.id) >= 0).length;
  return { done, total: vis.length, ratio: vis.length ? done / vis.length : 0, need: Math.ceil(vis.length / 2) };
}

// Ссылка на инструмент для челленджа в режиме дерева
export function challengeHref(d, ch) {
  return `#/sandbox/${ROUTES[ch.kind] || 'py'}?d=${encodeURIComponent(d)}&task=${encodeURIComponent(ch.id)}&src=tree`;
}

// Почему узел закрыт: текст про первое незавершённое условие
export function lockText(node, tree, states, group) {
  const names = {};
  tree.nodes.forEach(n => { names[n.id] = n; });
  const miss = [];
  (node.after || []).forEach(id => {
    const prev = names[id];
    const st = states[id] || { open: false, solved: [] };
    if (!prev) return;
    const p = nodeProgress(prev, st.solved, group);
    if (!st.open || p.done < p.need) miss.push(`«${prev.title}» (${Math.min(p.done, p.need)} из ${p.need})`);
  });
  return miss.length ? `Закрыто: реши половину челленджей в ${miss.join(' и ')}` : 'Закрыто';
}

// Раскладка графа: слой = длина самого длинного пути от корня; внутри слоя узлы делят ширину поровну.
// -> { width, height, nodes: [{ id, x, y }], edges: [{ from, to, x1, y1, x2, y2 }] }
export function layoutTree(nodes, opts) {
  const o = Object.assign({ width: 340, rowH: 124, top: 48, r: 32 }, opts || {});
  const depth = {};
  nodes.forEach(n => {
    depth[n.id] = (n.after || []).reduce((m, a) => Math.max(m, (depth[a] === undefined ? -1 : depth[a]) + 1), 0);
  });
  const rows = {};
  nodes.forEach(n => { (rows[depth[n.id]] = rows[depth[n.id]] || []).push(n.id); });
  const pos = {};
  Object.keys(rows).forEach(k => {
    const ids = rows[k];
    ids.forEach((id, i) => { pos[id] = { id, x: Math.round(o.width * (i + 1) / (ids.length + 1)), y: o.top + Number(k) * o.rowH }; });
  });
  const edges = [];
  nodes.forEach(n => (n.after || []).forEach(a => {
    if (!pos[a] || !pos[n.id]) return;
    edges.push({ from: a, to: n.id, x1: pos[a].x, y1: pos[a].y + o.r, x2: pos[n.id].x, y2: pos[n.id].y - o.r });
  }));
  const maxY = nodes.reduce((m, n) => Math.max(m, pos[n.id].y), 0);
  return { width: o.width, height: maxY + o.top + o.r, nodes: nodes.map(n => pos[n.id]), edges };
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.keys(attrs || {}).forEach(k => { if (attrs[k] !== null && attrs[k] !== undefined) el.setAttribute(k, String(attrs[k])); });
  children.forEach(c => { if (c) el.append(typeof c === 'string' ? document.createTextNode(c) : c); });
  return el;
}

async function loadPublic(d) {
  if (TREE_DISCIPLINES.indexOf(d) < 0) return null;
  const mod = await import(`../../content/sandbox/tree/${d}.js`);
  return mod.default;
}

function statesOf(reply) {
  const out = {};
  ((reply && reply.nodes) || []).forEach(n => { out[n.id] = n; });
  return out;
}

function challengeRow(d, ch, st, node, closed) {
  const solved = st.solved.indexOf(ch.id) >= 0;
  const head = h('div', { class: 'tree-ch-head' },
    h('span', { class: 'sbx-pill' }, kindTitle(ch.kind)),
    ch.star ? h('span', { class: 'sbx-star' }, '⭐') : null,
    h('span', { class: 'tree-ch-pts' }, `${challengePoints(ch)} очков`));
  const body = [head, h('div', { class: 'sbx-card-title' }, ch.title), solved ? h('p', { class: 'sbx-card-note ok' }, '✓ Решён') : null];
  if (!st.open) return h('div', { class: 'sbx-card closed' }, body);
  return h('a', { class: `sbx-card${solved ? ' solved' : ''}`, href: challengeHref(d, ch) }, body);
}

// Экран #/sandbox/tree?d=
export async function renderTree(app, query) {
  const my = app.routeId;
  const me = app.store.profile && app.store.profile();
  const group = me ? me.group : '';
  const q = key => (query && query.get ? query.get(key) : null);
  let d = TREE_DISCIPLINES.indexOf(q('d')) >= 0 ? q('d') : TREE_DISCIPLINES[0];
  const tabs = h('div', { class: 'tree-tabs', role: 'tablist', 'aria-label': 'Дисциплина' });
  const note = h('p', { class: 'hint', role: 'status' });
  const mapHost = h('div', { class: 'tree-map' });
  const detail = h('div', { class: 'tree-detail', 'aria-live': 'polite' });
  add(app.root, h('a', { href: '#/sandbox', class: 'back' }, '← Песочница'), h('h1', { class: 'display' }, 'Дерево навыков'),
    h('p', { class: 'hint' }, 'Решай челленджи — открываются следующие темы. За челлендж 5 очков, со звёздочкой 10.'),
    tabs, note, mapHost, detail);
  const api = sandboxApi(app.api);
  let selected = null;

  async function show(disc) {
    d = disc;
    selected = null;
    tabs.replaceChildren(...TREE_DISCIPLINES.map(x => h('button', {
      type: 'button', role: 'tab', class: `btn small${x === d ? ' primary' : ''}`, 'aria-selected': String(x === d),
      onclick: () => { if (x !== d) show(x); },
    }, DISCIPLINE_NAMES[x] || x)));
    detail.replaceChildren();
    note.textContent = '';
    mapHost.replaceChildren(h('p', { class: 'loading' }, 'Загружаем карту…'));
    const tree = await loadPublic(d);
    let reply = null;
    let failure = '';
    try { reply = await api.tree(d); } catch (e) {
      if (app.routeId !== my) return;
      if (e && e.auth) { app.authExpired(); return; }
      failure = 'Состояние не загрузилось — нет связи';
    }
    if (app.routeId !== my || d !== disc) return;
    if (reply && reply.ok === false) failure = reply.error === 'not visible' ? 'Эта дисциплина тебе пока недоступна' : 'Дерево сейчас недоступно';
    if (!tree || failure) { mapHost.replaceChildren(); note.textContent = failure || 'Дерева нет'; return; }
    const closed = !!(reply && reply.closed);
    if (closed) note.textContent = reply.reason === 'lesson' ? 'Игра на паузе, пока идёт пара — инструменты работают' : CLOSED_TEXT;
    draw(tree, statesOf(reply), closed);
  }

  function draw(tree, states, closed) {
    const lay = layoutTree(tree.nodes);
    const posOf = {};
    lay.nodes.forEach(p => { posOf[p.id] = p; });
    const R = 32;
    const C = 2 * Math.PI * (R - 4);
    const root = svg('svg', { viewBox: `0 0 ${lay.width} ${lay.height}`, width: '100%', class: 'tree-svg', role: 'group', 'aria-label': 'Карта навыков' });
    lay.edges.forEach(e => {
      const my = (e.y1 + e.y2) / 2;
      const open = states[e.to] && states[e.to].open;
      root.append(svg('path', { d: `M${e.x1} ${e.y1} C${e.x1} ${my} ${e.x2} ${my} ${e.x2} ${e.y2}`, class: `tree-edge${open ? ' open' : ''}`, fill: 'none' }));
    });
    tree.nodes.forEach(n => {
      const p = posOf[n.id];
      const st = states[n.id] || { open: false, solved: [] };
      const pr = nodeProgress(n, st.solved, group);
      const g = svg('g', { class: `tree-node${st.open ? ' open' : ' locked'}${pr.total && pr.done === pr.total ? ' done' : ''}${selected === n.id ? ' sel' : ''}`, transform: `translate(${p.x} ${p.y})`, role: 'button', tabindex: '0', 'aria-label': `${n.title}: решено ${pr.done} из ${pr.total}${st.open ? '' : ', закрыто'}` });
      g.append(svg('circle', { r: R, class: 'tree-disc' }));
      g.append(svg('circle', { r: R - 4, class: 'tree-ring-bg', fill: 'none' }));
      g.append(svg('circle', { r: R - 4, class: 'tree-ring', fill: 'none', transform: 'rotate(-90)', 'stroke-dasharray': `${(C * pr.ratio).toFixed(1)} ${C.toFixed(1)}` }));
      g.append(svg('text', { class: 'tree-icon', 'text-anchor': 'middle', y: '8' }, st.open ? n.icon : '🔒'));
      g.append(svg('text', { class: 'tree-label', 'text-anchor': 'middle', y: R + 18 }, n.title.length > 24 ? n.title.slice(0, 23) + '…' : n.title));
      g.append(svg('text', { class: 'tree-count', 'text-anchor': 'middle', y: R + 33 }, `${pr.done} из ${pr.total}`));
      const pick = () => { selected = n.id; draw(tree, states, closed); openDetail(tree, n, st, states, closed); };
      g.addEventListener('click', pick);
      g.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } });
      root.append(g);
    });
    mapHost.replaceChildren(root);
    if (selected) {
      const n = tree.nodes.filter(x => x.id === selected)[0];
      if (n) openDetail(tree, n, states[n.id] || { open: false, solved: [] }, states, closed);
    }
  }

  function openDetail(tree, n, st, states, closed) {
    const pr = nodeProgress(n, st.solved, group);
    const parts = [h('h2', { class: 'sbx-disc-title' }, `${n.icon} ${n.title}`),
      h('p', { class: 'hint' }, `Решено ${pr.done} из ${pr.total}. Чтобы открыть следующие темы, нужно ${pr.need}.`)];
    if (!st.open) parts.push(h('p', { class: 'sbx-card-note' }, lockText(n, tree, states, group)));
    parts.push(h('div', { class: 'sbx-cards' }, visibleChallenges(n, group).map(ch => challengeRow(d, ch, st, n, closed))));
    detail.replaceChildren(h('section', { class: 'sbx-disc' }, parts));
    if (!reduced() && detail.scrollIntoView) detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  await show(d);
}

const TOOL_TITLES = { py: 'Python', term: 'Терминал', api: 'API/JSON', prompt: 'Конструктор промптов' };
const GONE = 'Этот челлендж недоступен';
const LOCKED = 'Этот узел ещё закрыт — реши половину челленджей в предыдущих темах';
const OFFLINE = 'Состояние дерева не загрузилось — нет связи. Инструмент работает как свободный';

// Инструмент в режиме дерева: #/sandbox/<py|term|api|prompt>?d=&task=&src=tree
export async function renderTreeTool(app, sub, query) {
  const my = app.routeId;
  const me = app.store.profile && app.store.profile();
  const group = me ? me.group : '';
  const q = key => (query && query.get ? query.get(key) : null);
  const d = q('d');
  const taskId = q('task');
  const host = h('div', { class: 'sbx-tool' });
  add(app.root, h('a', { href: `#/sandbox/tree?d=${encodeURIComponent(d || '')}`, class: 'back' }, '← Дерево навыков'), h('h1', { class: 'display' }, TOOL_TITLES[sub] || 'Челлендж'), host);
  host.append(h('p', { class: 'loading' }, 'Загружаем челлендж…'));
  const notes = [];
  let daily = null;
  let task = null;
  try {
    const tree = await loadPublic(d);
    const node = tree ? tree.nodes.filter(n => visibleChallenges(n, group).some(c => c.id === taskId))[0] : null;
    task = node ? visibleChallenges(node, group).filter(c => c.id === taskId)[0] : null;
    if (!task || ROUTES[task.kind] !== sub) { task = null; notes.push(GONE); }
    else {
      const reply = await sandboxApi(app.api).tree(d);
      if (app.routeId !== my) return;
      const st = statesOf(reply)[node.id];
      if (reply && reply.ok === false) notes.push(GONE);
      else if (!st || !st.open) notes.push(LOCKED);
      else if (reply.closed) notes.push(reply.reason === 'lesson' ? 'Игра на паузе, пока идёт пара — инструменты работают' : CLOSED_TEXT);
      else if (st.solved.indexOf(taskId) >= 0) notes.push('Этот челлендж уже решён — очки начислены');
      else daily = { app, d, task, date: '', source: 'tree', kind: task.kind === 'docker' ? 'docker' : undefined };
    }
  } catch (e) {
    if (app.routeId !== my) return;
    if (e && e.auth) { app.authExpired(); return; }
    notes.push(OFFLINE);
  }
  if (app.routeId !== my) return;
  host.replaceChildren(...notes.map(n => h('p', { class: 'hint' }, n)));
  if (!task) return;
  const storage = createSandboxStorage(app.store);
  if (sub === 'py') mountPy(host, { storage, daily });
  else if (sub === 'term') mountTerm(host, { storage, daily, setup: daily ? undefined : (task.setup || {}) });
  else if (sub === 'api') mountApi(host, { storage, daily, setup: task.setup });
  else {
    const { mountPrompt } = await import('./prompt-tool.js');
    mountPrompt(host, { storage, group, daily });
  }
}
