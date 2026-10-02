const LOAD_MS = 90000;
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

function kill(w, msg) {
  w.terminate();
  if (worker === w) { worker = null; warm = false; }
  for (const [id, p] of [...pending]) if (p.worker === w) finish(id, { results: failAll(p.runs, msg) });
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
      for (const [id, p] of pending) if (p.worker === w) arm(id, EXEC_MS, LOOP_MSG);
      return;
    }
    if (data.type === 'loadError') { kill(w, `Не удалось загрузить Python: ${data.error}. Проверьте интернет.`); return; }
    if (!pending.has(data.id)) return;
    if (data.error) { kill(w, `Не удалось запустить Python: ${data.error}`); return; }
    finish(data.id, { results: data.results });
  });
  w.addEventListener('error', () => kill(w, 'Не удалось загрузить Python. Проверьте интернет.'));
  return w;
}

export const preloadPython = () => void getWorker();

export function runPython(code, runs) {
  const w = getWorker();
  const id = ++seq;
  return new Promise(resolve => {
    pending.set(id, { resolve, runs, worker: w, timer: null });
    if (warm) arm(id, EXEC_MS, LOOP_MSG); else arm(id, LOAD_MS, LOAD_MSG);
    w.postMessage({ id, code, runs });
  });
}
