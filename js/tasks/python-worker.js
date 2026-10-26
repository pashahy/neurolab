/* Классический Web Worker: Pyodide + общий обвязчик pyharness.py */
/* global importScripts, loadPyodide */
let ready;
try {
  importScripts('./pyodide-loader.js');
  const siteBase = new URL('../../vendor/pyodide/0.26.4/', self.location.href).href;
  ready = (async () => {
    const { py } = await self.PyodideLoader.load({
      sources: self.PyodideLoader.sources(siteBase),
      importScripts: u => importScripts(u),
      fetch: (u, o) => fetch(u, o),
      loadPyodide: o => loadPyodide(o),
    });
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
    if (Array.isArray(data.packages) && data.packages.length) {
      try {
        await py.loadPackage(data.packages, { messageCallback: text => self.postMessage({ type: 'progress', runId: data.id, stage: 'packages', text: String(text) }) });
      } catch (e) {
        self.postMessage({ type: 'packagesError', id: data.id, error: String((e && e.message) || e) });
        return;
      }
      self.postMessage({ type: 'packages', id: data.id });
    }
    py.globals.set('__job', JSON.stringify({ code: data.code, runs: data.runs }));
    const res = py.runPython('run_all_json(__job)');
    self.postMessage({ id: data.id, results: JSON.parse(res) });
  } catch (e) {
    self.postMessage({ id: data.id, error: String((e && e.message) || e) });
  }
};
