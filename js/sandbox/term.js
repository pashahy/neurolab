// Песочница: терминал (свободный режим, копия из ПЗ и задача дня).
import { h } from '../util/dom.js';
import { createShell } from '../sim/shell.js';
import { termView } from '../tasks/terminal-ui.js';
import { exportText, historyText, DOWNLOAD_HISTORY_TEXT } from './export.js';
import { mountDailyPanel } from './daily.js';
import { mountPanel, fsSnapshot, changedPaths } from './term-panel.js';

const TAB_TERM_TEXT = 'Терминал';
const TAB_FILES_TEXT = 'Файлы';

export const RESET_TEXT = 'Сброс';
export const RESET_SURE_TEXT = 'Точно сбросить?';
export const RESET_SURE_MS = 3000;
export const FULL_TEXT = '⤢ На весь экран';
export const FULL_EXIT_TEXT = '✕';
export const FROM_NOTE = 'Это копия терминала из задания. Пробуй что хочешь — задание не изменится.';

// opts: { storage, setup?, daily?: { app, d, task, date? } }
//  setup без daily — копия терминала из ПЗ: история не сохраняется (иначе она не совпала бы с обычной оболочкой)
export function mountTerm(container, opts) {
  const { storage, daily, mission } = opts; // mission: { def, panel } — мини-миссия (js/sandbox/mission-view.js)
  const setup = daily ? (daily.task.setup || {}) : mission ? (mission.def.setup || {}) : (opts.setup || {});
  const goals = daily ? daily.task.goals : mission ? mission.def.goals : null;
  const ephemeral = !daily && !mission && !!opts.setup;

  const loadHistory = () => {
    if (mission) return mission.panel.loadHistory();
    if (daily) { const dr = storage.loadDaily(daily.d, daily.task.id); return dr && Array.isArray(dr.history) ? dr.history : []; }
    return ephemeral ? [] : storage.loadTerm().history;
  };
  const save = history => {
    if (mission) mission.panel.saveHistory(history);
    else if (daily) storage.saveDaily(daily.d, daily.task.id, { history });
    else if (!ephemeral) storage.saveTerm({ history });
  };

  document.body.classList.remove('term-lock'); // на случай, если прошлый экран закрылся в полноэкранном режиме

  const viewHost = h('div', { class: 'term-host' });
  const btnExit = h('button', { type: 'button', class: 'btn small term-full-exit', 'aria-label': 'Выйти из полноэкранного режима' }, FULL_EXIT_TEXT);
  const panelHost = h('aside', { class: 'sbx-panel', 'aria-label': 'Файлы и история git' });
  const tabTerm = h('button', { type: 'button', class: 'btn small sbx-tab', 'aria-pressed': 'true' }, TAB_TERM_TEXT);
  const tabFiles = h('button', { type: 'button', class: 'btn small ghost sbx-tab', 'aria-pressed': 'false' }, TAB_FILES_TEXT);
  const split = h('div', { class: 'sbx-split', 'data-tab': 'term' }, viewHost, panelHost);
  const holder = h('div', { class: 'sbx-term' }, btnExit, h('div', { class: 'sbx-tabs' }, tabTerm, tabFiles), split);
  const setTab = name => {
    split.setAttribute('data-tab', name);
    tabTerm.setAttribute('aria-pressed', name === 'term' ? 'true' : 'false');
    tabFiles.setAttribute('aria-pressed', name === 'files' ? 'true' : 'false');
    tabTerm.classList.toggle('ghost', name !== 'term');
    tabFiles.classList.toggle('ghost', name !== 'files');
  };
  tabTerm.addEventListener('click', () => setTab('term'));
  tabFiles.addEventListener('click', () => setTab('files'));

  let view = null;
  let shell = null;
  let snap = null;
  let changed = [];
  const panel = mountPanel(panelHost, { getShell: () => shell, getChanged: () => changed });
  const build = history => {
    shell = createShell(setup);
    snap = fsSnapshot(shell);
    changed = [];
    view = termView({
      shell, goals, history, animate: true,
      onCommand: (c, hist) => {
        save(hist);
        const next = fsSnapshot(shell);
        changed = changedPaths(snap, next);
        snap = next;
        panel.refresh();
        if (mission) mission.panel.check(shell);
      },
    });
    viewHost.replaceChildren(view.el);
    panel.refresh();
    if (mission) mission.panel.check(shell); // история уже выполняет цели — миссия пройдена (значок выдаётся один раз)
  };
  build(loadHistory());

  const btnReset = h('button', { type: 'button', class: 'btn small' }, RESET_TEXT);
  let sureTimer = null;
  const disarm = () => { clearTimeout(sureTimer); sureTimer = null; btnReset.textContent = RESET_TEXT; };
  btnReset.addEventListener('click', () => {
    if (!sureTimer) { btnReset.textContent = RESET_SURE_TEXT; sureTimer = setTimeout(disarm, RESET_SURE_MS); return; }
    disarm();
    save([]);
    build([]);
  });
  const btnDownload = h('button', { type: 'button', class: 'btn small ghost' }, DOWNLOAD_HISTORY_TEXT);
  btnDownload.addEventListener('click', () => exportText('terminal-history.txt', historyText(view.history())));

  // Полный экран: fixed-слой поверх страницы, прокрутка страницы заблокирована; Esc, «✕» и смена маршрута возвращают назад
  let full = false;
  const onKey = e => { if (e.key === 'Escape') setFull(false); };
  const onHash = () => setFull(false);
  // Мягкая клавиатура: слой подгоняется под видимую область (visualViewport), иначе строка ввода уходит под клавиатуру
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  const fit = () => {
    if (!vv) return;
    holder.style.height = `${vv.height}px`;
    holder.style.top = `${vv.offsetTop}px`;
    holder.style.bottom = 'auto';
  };
  function setFull(on) {
    if (on === full) return;
    full = on;
    holder.classList.toggle('term-full', on);
    document.body.classList.toggle('term-lock', on);
    btnFull.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) {
      document.addEventListener('keydown', onKey); window.addEventListener('hashchange', onHash);
      if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); fit(); }
      view.input.focus();
    } else {
      document.removeEventListener('keydown', onKey); window.removeEventListener('hashchange', onHash);
      if (vv) { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); }
      holder.style.height = ''; holder.style.top = ''; holder.style.bottom = '';
    }
  }
  const btnFull = h('button', { type: 'button', class: 'btn small ghost', 'aria-pressed': 'false' }, FULL_TEXT);
  btnFull.addEventListener('click', () => setFull(!full));
  btnExit.addEventListener('click', () => setFull(false));

  const parts = [];
  if (daily) {
    const host = h('div', { class: 'sbx-daily-host' });
    parts.push(host);
    mountDailyPanel(host, { app: daily.app, d: daily.d, task: daily.task, kind: daily.kind || 'term', date: daily.date, source: daily.source, getHistory: () => view.history() });
  }
  if (mission) parts.push(mission.panel.el);
  if (ephemeral) parts.push(h('p', { class: 'hint' }, FROM_NOTE));
  parts.push(holder, h('div', { class: 'row' }, btnFull, btnReset, btnDownload));
  container.append(...parts);
  return { history: () => view.history(), dispose: () => setFull(false) }; // снимает слушатели полноэкранного режима (hashchange/keydown/visualViewport)
}
