// Песочница: редактор Python (свободный режим и задача дня).
import { h } from '../util/dom.js';
import { runPython, preloadPython } from '../tasks/python-runner.js';
import { pyEditor, pyOutput } from '../tasks/python-ui.js';
import { exportText, DOWNLOAD_PY_TEXT } from './export.js';
import { mountDailyPanel } from './daily.js';

export const PACKAGES = ['pandas', 'numpy'];
export const SAVE_DELAY_MS = 500;
export const LOAD_HINT = 'Выполняется… Первый запуск загружает Python (до 30 секунд).';
export const PKG_HINT = 'Подключаем pandas и numpy — это ещё несколько секунд.';

// opts: { storage, initial?, daily?: { app, d, task, date? } }
//  initial — стартовый код (из ПЗ); в задаче дня код хранится в её черновике, иначе в sandbox:py
export function mountPy(container, opts) {
  const { storage, daily } = opts;
  const saved = storage.loadPy();
  let packages = saved.packages.slice();
  let code;
  if (daily) {
    const dr = storage.loadDaily(daily.d, daily.task.id);
    code = dr && typeof dr.code === 'string' ? dr.code : (daily.task.starter || '');
  } else {
    code = typeof opts.initial === 'string' ? opts.initial : saved.code;
  }

  let timer = null;
  const persist = () => {
    timer = null;
    if (daily) storage.saveDaily(daily.d, daily.task.id, { code });
    else storage.savePy({ code, packages });
  };
  const queueSave = () => { if (timer) clearTimeout(timer); timer = setTimeout(persist, SAVE_DELAY_MS); };
  const flush = () => { if (timer) { clearTimeout(timer); persist(); } };

  const editor = pyEditor({ value: code, onInput: v => { code = v; queueSave(); } });
  const out = pyOutput();
  const status = h('p', { class: 'hint', 'aria-live': 'polite' });
  const bar = h('div', { class: 'sbx-run', 'aria-hidden': 'true', hidden: true });
  const stdinBox = h('textarea', { class: 'sbx-stdin', rows: 2, spellcheck: 'false', autocapitalize: 'off', 'aria-label': 'Данные для input(), по одной строке на каждый вызов' });
  const btnRun = h('button', { type: 'button', class: 'btn primary' }, '▶ Запустить');
  const btnPkg = h('button', { type: 'button', class: 'btn small sbx-pkg', 'aria-pressed': 'false' });
  const drawPkg = () => {
    const on = packages.length > 0;
    btnPkg.setAttribute('aria-pressed', on ? 'true' : 'false');
    btnPkg.textContent = on ? '✓ pandas и numpy подключены' : 'Подключить pandas/numpy';
  };
  drawPkg();
  btnPkg.addEventListener('click', () => {
    packages = packages.length ? [] : PACKAGES.slice();
    drawPkg();
    if (!daily) persist(); else storage.savePy({ code: saved.code, packages });
    status.textContent = packages.length ? 'Подключим при следующем запуске' : '';
  });
  // пакеты общие для свободного режима и задач дня: в задаче дня кода из sandbox:py не трогаем
  const btnDownload = h('button', { type: 'button', class: 'btn small ghost' }, DOWNLOAD_PY_TEXT);
  btnDownload.addEventListener('click', () => exportText('main.py', code));

  let busy = false;
  btnRun.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    btnRun.disabled = true;
    editor.ta.readOnly = true;
    bar.hidden = false;
    out.clear();
    status.textContent = packages.length ? PKG_HINT : LOAD_HINT;
    try {
      const lines = stdinBox.value ? stdinBox.value.split('\n') : [];
      const { results } = await runPython(code, [{ stdin: lines, test: '' }], packages.length ? { packages: packages.slice() } : undefined);
      status.textContent = '';
      out.show(results, { animate: true });
    } catch (e) {
      status.textContent = '';
      out.show([{ ok: false, output: '', error: 'Не получилось запустить. Попробуй ещё раз' }]);
    } finally {
      busy = false;
      btnRun.disabled = false;
      editor.ta.readOnly = false;
      bar.hidden = true;
    }
  });

  preloadPython();
  const parts = [];
  if (daily) {
    const holder = h('div', { class: 'sbx-daily-host' });
    parts.push(holder);
    mountDailyPanel(holder, { app: daily.app, d: daily.d, task: daily.task, kind: 'py', date: daily.date, getCode: () => code });
  }
  parts.push(
    editor.el,
    h('div', { class: 'row' }, btnRun, btnPkg, btnDownload),
    bar,
    h('details', { class: 'sbx-stdin-box' }, h('summary', {}, 'Данные для input()'), stdinBox),
    status, out.el);
  container.append(...parts);
  return { get: () => code, flush };
}
