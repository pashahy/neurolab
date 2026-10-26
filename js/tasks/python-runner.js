const LOAD_MS = 90000;
const PKG_MS = 120000;
const PKG_MSG = 'Не хватило интернета, чтобы скачать pandas (~10 МБ). Попробуй через Wi-Fi.';
const EXEC_MS = 10000;
const LOAD_MSG = 'Python не успел загрузиться. Проверьте интернет и нажмите ещё раз.';
const LOOP_MSG = 'Программа выполняется слишком долго — возможно, бесконечный цикл. Проверьте условие цикла.';

let worker = null;
let warm = false;
let seq = 0;
const pending = new Map(); // id -> { resolve, runs, worker, timer }

const failAll = (runs, msg) => runs.map(() => ({ ok: false, output: '', error: msg }));

function finish(id, res) {
  const p = pending.get(id);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(id);
  p.resolve(res);
}

// pkgFail: true — пакеты точно не скачались (ошибка воркера); иначе — по таймауту, если Python уже был готов.
function kill(w, msg, pkgFail) {
  const wasWarm = worker === w && warm;
  w.terminate();
  if (worker === w) { worker = null; warm = false; }
  for (const [id, p] of [...pending]) {
    if (p.worker !== w) continue;
    const bad = p.pkgs && (pkgFail === true || (pkgFail === undefined && wasWarm));
    finish(id, bad ? { results: failAll(p.runs, PKG_MSG), packagesFailed: true } : { results: failAll(p.runs, msg) });
  }
}

function arm(id, ms, msg) {
  const p = pending.get(id);
  if (!p) return;
  clearTimeout(p.timer);
  p.timer = setTimeout(() => kill(p.worker, msg), ms);
}

function getWorker() {
  if (worker) return worker;
  const w = new Worker(new URL('./python-worker.js', import.meta.url));
  worker = w;
  warm = false;
  w.addEventListener('message', ({ data }) => {
    if (data.type === 'ready') {
      if (worker === w) warm = true;
      for (const [id, p] of pending) if (p.worker === w) { if (p.pkgs) { if (p.onProgress) p.onProgress('packages'); } else arm(id, EXEC_MS, LOOP_MSG); }
      return;
    }
    if (data.type === 'loadError') { kill(w, `Не удалось загрузить Python: ${data.error}.`); return; }
    // этапы загрузки пакетов; поле runId (не id): старый раннер из кэша такие сообщения молча пропускает
    if (data.type === 'progress') { const p = pending.get(data.runId); if (p && p.onProgress) p.onProgress(data.stage, data.text); return; }
    if (data.type === 'packagesError') { if (pending.has(data.id)) kill(w, PKG_MSG, true); return; }
    if (data.type === 'packages') { const p = pending.get(data.id); if (p) { p.pkgs = false; p.pkgsOk = true; arm(data.id, EXEC_MS, LOOP_MSG); } return; }
    if (!pending.has(data.id)) return;
    if (data.error) { kill(w, `Не удалось запустить Python: ${data.error}`); return; }
    const p = pending.get(data.id);
    finish(data.id, { results: p && p.hasPackages ? hintMissing(data.results) : data.results, packagesOk: !!(p && p.pkgsOk) });
  });
  w.addEventListener('error', () => kill(w, 'Не удалось загрузить Python. Проверьте интернет.', false));
  return w;
}

// Старый воркер из кэша телефона поле packages игнорирует: pandas/numpy не найдены -> понятная подсказка.
const MISSING_MSG = 'Обнови страницу, чтобы подключить pandas';
const hintMissing = results => (Array.isArray(results) ? results.map(r => (r && typeof r.error === 'string' && /ModuleNotFoundError/.test(r.error) && /pandas|numpy/.test(r.error) ? Object.assign({}, r, { error: MISSING_MSG }) : r)) : results);

export const preloadPython = () => void getWorker();

export function runPython(code, runs, opts) {
  const packages = opts && Array.isArray(opts.packages) && opts.packages.length ? opts.packages : null;
  const w = getWorker();
  const id = ++seq;
  return new Promise(resolve => {
    const onProgress = opts && typeof opts.onProgress === 'function' ? opts.onProgress : null;
    pending.set(id, { resolve, runs, worker: w, timer: null, pkgs: !!packages, hasPackages: !!packages, onProgress });
    if (onProgress && !(warm && !packages)) onProgress(warm ? 'packages' : 'python');
    // загрузка пакетов идёт по таймауту загрузки, а не выполнения: после неё воркер шлёт { type: 'packages' }
    if (warm && !packages) arm(id, EXEC_MS, LOOP_MSG); else arm(id, packages ? PKG_MS : LOAD_MS, LOAD_MSG);
    const msg = { id, code, runs };
    if (packages) msg.packages = packages;
    w.postMessage(msg);
  });
}
