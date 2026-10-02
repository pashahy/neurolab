/* Классический Web Worker: Pyodide + общий обвязчик pyharness.py */
/* global importScripts, loadPyodide */
let ready;
try {
  importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js');
  ready = (async () => {
    const py = await loadPyodide();
    const src = await (await fetch('./pyharness.py')).text();
    py.runPython(src);
    return py;
  })();
} catch (e) {
  ready = Promise.reject(e);
}
ready.then(
  () => self.postMessage({ type: 'ready' }),
  e => self.postMessage({ type: 'loadError', error: String((e && e.message) || e) }),
);

self.onmessage = async ({ data }) => {
  try {
    const py = await ready;
    py.globals.set('__job', JSON.stringify({ code: data.code, runs: data.runs }));
    const res = py.runPython('run_all_json(__job)');
    self.postMessage({ id: data.id, results: JSON.parse(res) });
  } catch (e) {
    self.postMessage({ id: data.id, error: String((e && e.message) || e) });
  }
};
