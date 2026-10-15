// Песочница: терминал (свободный режим, копия из ПЗ и задача дня).
import { h } from '../util/dom.js';
import { createShell } from '../sim/shell.js';
import { termView } from '../tasks/terminal-ui.js';
import { exportText, historyText, DOWNLOAD_HISTORY_TEXT } from './export.js';
import { mountDailyPanel } from './daily.js';

export const RESET_TEXT = 'Сброс';
export const RESET_SURE_TEXT = 'Точно сбросить?';
export const RESET_SURE_MS = 3000;
export const FROM_NOTE = 'Это копия терминала из задания. Пробуй что хочешь — задание не изменится.';

// opts: { storage, setup?, daily?: { app, d, task, date? } }
//  setup без daily — копия терминала из ПЗ: история не сохраняется (иначе она не совпала бы с обычной оболочкой)
export function mountTerm(container, opts) {
  const { storage, daily } = opts;
  const setup = daily ? (daily.task.setup || {}) : (opts.setup || {});
  const goals = daily ? daily.task.goals : null;
  const ephemeral = !daily && !!opts.setup;

  const loadHistory = () => {
    if (daily) { const dr = storage.loadDaily(daily.d, daily.task.id); return dr && Array.isArray(dr.history) ? dr.history : []; }
    return ephemeral ? [] : storage.loadTerm().history;
  };
  const save = history => {
    if (daily) storage.saveDaily(daily.d, daily.task.id, { history });
    else if (!ephemeral) storage.saveTerm({ history });
  };

  const holder = h('div', { class: 'sbx-term' });
  let view = null;
  const build = history => {
    const shell = createShell(setup);
    view = termView({ shell, goals, history, animate: true, onCommand: (c, hist) => save(hist) });
    holder.replaceChildren(view.el);
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

  const parts = [];
  if (daily) {
    const host = h('div', { class: 'sbx-daily-host' });
    parts.push(host);
    mountDailyPanel(host, { app: daily.app, d: daily.d, task: daily.task, kind: 'term', date: daily.date, getHistory: () => view.history() });
  }
  if (ephemeral) parts.push(h('p', { class: 'hint' }, FROM_NOTE));
  parts.push(holder, h('div', { class: 'row' }, btnReset, btnDownload));
  container.append(...parts);
  return { history: () => view.history() };
}
