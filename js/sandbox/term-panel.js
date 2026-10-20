// Песочница: панель файлов и мини-граф git рядом с терминалом.
// Чистая часть (treeOf, gitGraph, changedPaths, fileText) не трогает DOM; mountPanel рисует.
import { h } from '../util/dom.js';
import { HOME } from '../sim/shell.js';

export const PANEL_TITLE_FILES = 'Файлы';
export const PANEL_TITLE_GIT = 'История git';
export const PANEL_EMPTY_FILE = 'Нажми на файл — увидишь его содержимое.';
export const PANEL_EMPTY_CONTENT = '(файл пустой)';
export const PANEL_NO_REPO = 'Здесь пока нет репозитория. Создай его командой git init.';
export const PANEL_NO_COMMITS = 'Коммитов пока нет.';
export const PANEL_MAX_COMMITS = 30;
export const PANEL_HILITE_MS = 2000;

const stateOf = shell => (shell && shell.state) || shell;
const baseName = p => p.slice(p.lastIndexOf('/') + 1);

// Дерево от домашней папки: { name, path, dir, size?, children? }
export function treeOf(shell) {
  const sh = stateOf(shell);
  const kids = new Map();
  for (const [p, v] of sh.fs) {
    if (p === HOME || !p.startsWith(`${HOME}/`)) continue;
    const parent = p.slice(0, p.lastIndexOf('/'));
    if (!kids.has(parent)) kids.set(parent, []);
    kids.get(parent).push([p, v]);
  }
  const build = (path, name, entry) => {
    const node = { name, path, dir: !!entry.dir };
    if (entry.dir) {
      node.children = (kids.get(path) || [])
        .map(([p, v]) => build(p, baseName(p), v))
        .sort((a, b) => (a.dir === b.dir ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : a.dir ? -1 : 1));
    } else node.size = String(entry.content == null ? '' : entry.content).length;
    return node;
  };
  return build(HOME, '~', { dir: true });
}

// Снимок файловой системы: путь → содержимое (null для папки)
export function fsSnapshot(shell) {
  const out = {};
  for (const [p, v] of stateOf(shell).fs) out[p] = v.dir ? null : String(v.content == null ? '' : v.content);
  return out;
}

// Пути, появившиеся или изменившиеся между двумя снимками
export function changedPaths(before, after) {
  const out = [];
  for (const p of Object.keys(after)) {
    if (!Object.prototype.hasOwnProperty.call(before, p) || before[p] !== after[p]) out.push(p);
  }
  return out.sort();
}

export function fileText(shell, path) {
  const e = stateOf(shell).fs.get(path);
  if (!e || e.dir) return null;
  return String(e.content == null ? '' : e.content);
}

// Граф: коммиты сверху вниз (новые выше), lane — дорожка ветки; null, если репозитория рядом нет
export function gitGraph(shell) {
  const sh = stateOf(shell);
  const r = sh.repo;
  if (!r) return null;
  const gd = `${r.root === '/' ? '' : r.root}/.git`;
  const g = sh.fs.get(gd);
  if (!g || !g.dir) return null;
  if (!(sh.cwd === r.root || sh.cwd.startsWith(`${r.root}/`))) return null;

  const names = Object.keys(r.branches).filter(b => r.branches[b] !== null && r.branches[b] !== undefined);
  const laneOf = new Map();
  const branchesAt = new Map();
  names.forEach((b, i) => {
    const tip = r.branches[b];
    if (!branchesAt.has(tip)) branchesAt.set(tip, []);
    branchesAt.get(tip).push(b);
    for (let c = tip; c !== null && c !== undefined; c = r.commits[c].parent) if (!laneOf.has(c)) laneOf.set(c, i);
  });
  const idxs = [...laneOf.keys()].sort((a, b) => b - a);
  const shown = idxs.slice(0, PANEL_MAX_COMMITS);
  const headTip = r.branches[r.head];
  const commits = shown.map(i => ({
    hash: r.commits[i].id,
    msg: r.commits[i].msg,
    branches: branchesAt.get(i) || [],
    head: i === headTip,
    lane: laneOf.get(i),
    parent: r.commits[i].parent === null || r.commits[i].parent === undefined ? null : r.commits[r.commits[i].parent].id,
  }));
  return { commits, lanes: Math.max(1, names.length), total: idxs.length, head: r.head };
}

const SVGNS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs, text) {
  const el = document.createElementNS(SVGNS, tag);
  for (const k of Object.keys(attrs || {})) el.setAttribute(k, String(attrs[k]));
  if (text !== undefined) el.textContent = text;
  return el;
}

export function renderGraph(graph) {
  const ROW = 36, LANE = 18, PAD = 12;
  const n = graph.commits.length;
  const textX = PAD * 2 + graph.lanes * LANE;
  const W = 340;
  const root = svg('svg', { class: 'tp-graph', viewBox: `0 0 ${W} ${Math.max(1, n) * ROW + 8}`, role: 'img', 'aria-label': `История git: ${n} коммитов` });
  const y = i => 20 + i * ROW;
  const x = lane => PAD + lane * LANE;
  const rowOf = new Map(graph.commits.map((c, i) => [c.hash, i]));
  graph.commits.forEach((c, i) => {
    if (c.parent !== null && rowOf.has(c.parent)) {
      const j = rowOf.get(c.parent);
      const p = graph.commits[j];
      root.append(svg('line', { x1: x(c.lane), y1: y(i), x2: x(p.lane), y2: y(j), class: `tp-edge tp-l${p.lane % 6}` }));
    }
  });
  graph.commits.forEach((c, i) => {
    root.append(svg('circle', { cx: x(c.lane), cy: y(i), r: c.head ? 7 : 5, class: `tp-dot tp-l${c.lane % 6}${c.head ? ' tp-head' : ''}` }));
    const labels = c.branches.map(b => b).concat(c.head ? ['HEAD'] : []);
    let line = `${c.hash}  ${c.msg.length > 28 ? `${c.msg.slice(0, 27)}…` : c.msg}`;
    root.append(svg('text', { x: textX, y: y(i) - 2, class: 'tp-msg' }, line));
    if (labels.length) root.append(svg('text', { x: textX, y: y(i) + 12, class: 'tp-ref' }, labels.join(' · ')));
  });
  return root;
}

// getShell() → текущий шелл; getChanged() → пути, изменённые последней командой
export function mountPanel(container, { getShell, getChanged }) {
  const open = new Set([HOME]);
  let selected = null;
  let hiliteTimer = null;
  let hilite = new Set();
  const treeBox = h('div', { class: 'tp-tree', role: 'tree' });
  const viewer = h('pre', { class: 'tp-file' }, PANEL_EMPTY_FILE);
  const graphBox = h('div', { class: 'tp-git' });
  container.classList.add('term-panel');
  container.append(
    h('h3', { class: 'tp-h' }, PANEL_TITLE_FILES), treeBox, viewer,
    h('h3', { class: 'tp-h' }, PANEL_TITLE_GIT), graphBox,
  );

  function row(node, depth) {
    const isOpen = node.dir && open.has(node.path);
    const label = node.dir ? `${isOpen ? '▾' : '▸'} ${node.name}${node.path === HOME ? '' : '/'}` : `${node.name}  (${node.size} б)`;
    const cls = `tp-row${node.dir ? ' dir' : ' file'}${hilite.has(node.path) ? ' changed' : ''}${selected === node.path ? ' sel' : ''}`;
    const btn = h('button', { type: 'button', class: cls, style: `padding-left:${8 + depth * 14}px`, role: 'treeitem', 'aria-expanded': node.dir ? String(isOpen) : null }, label);
    btn.addEventListener('click', () => {
      if (node.dir) { if (open.has(node.path)) open.delete(node.path); else open.add(node.path); }
      else selected = node.path;
      draw();
    });
    const out = [btn];
    if (isOpen) for (const ch of node.children) out.push(...row(ch, depth + 1));
    return out;
  }

  function draw() {
    const shell = getShell();
    treeBox.replaceChildren(...row(treeOf(shell), 0));
    const txt = selected ? fileText(shell, selected) : null;
    viewer.textContent = selected && txt !== null ? (txt === '' ? PANEL_EMPTY_CONTENT : txt) : PANEL_EMPTY_FILE;
    const g = gitGraph(shell);
    if (!g) graphBox.replaceChildren(h('p', { class: 'hint' }, PANEL_NO_REPO));
    else if (!g.commits.length) graphBox.replaceChildren(h('p', { class: 'hint' }, PANEL_NO_COMMITS));
    else graphBox.replaceChildren(renderGraph(g), ...(g.total > g.commits.length ? [h('p', { class: 'hint' }, `Показаны последние ${g.commits.length} из ${g.total}.`)] : []));
  }

  function refresh() {
    const changed = (getChanged && getChanged()) || [];
    hilite = new Set(changed);
    for (const p of changed) { // раскрыть папки, где что-то изменилось
      for (let i = p.indexOf('/', 1); i !== -1; i = p.indexOf('/', i + 1)) if (p.slice(0, i).startsWith(HOME)) open.add(p.slice(0, i));
    }
    if (selected && !stateOf(getShell()).fs.has(selected)) selected = null;
    draw();
    clearTimeout(hiliteTimer);
    if (hilite.size) hiliteTimer = setTimeout(() => { hilite = new Set(); draw(); }, PANEL_HILITE_MS);
  }
  if (getShell()) draw();
  return { refresh };
}
