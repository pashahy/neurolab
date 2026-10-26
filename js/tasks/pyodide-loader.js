/* Загрузчик Pyodide с запасными источниками. Подключается в воркере через importScripts (классический скрипт),
   в тестах выполняется в vm. Порядок: свой сайт (vendor) -> jsDelivr -> unpkg.
   Пишет в self.PyodideLoader; ничего не экспортирует как ES-модуль (совместимость со старым кэшем). */
(function (root) {
  var VERSION = '0.26.4';
  var PROBE_MS = 8000;   // ответ на первый запрос (файл-проба)
  var LOAD_MS = 60000;   // полная инициализация одного источника

  function sources(siteBase) {
    return [
      { name: 'свой сайт', url: siteBase },
      { name: 'jsDelivr', url: 'https://cdn.jsdelivr.net/pyodide/v' + VERSION + '/full/' },
      { name: 'unpkg', url: 'https://unpkg.com/pyodide@' + VERSION + '/' },
    ];
  }

  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('таймаут: ' + label)); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  // env: { importScripts, fetch, loadPyodide() (читает глобал после importScripts), timeouts }
  async function load(env) {
    var list = env.sources;
    var probeMs = env.probeMs || PROBE_MS;
    var loadMs = env.loadMs || LOAD_MS;
    var errors = [];
    for (var i = 0; i < list.length; i++) {
      var src = list[i];
      try {
        var ctl = typeof AbortController === 'function' ? new AbortController() : null;
        var probe = env.fetch(src.url + 'pyodide-lock.json', ctl ? { signal: ctl.signal, cache: 'no-cache' } : undefined)
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r; });
        try { await withTimeout(probe, probeMs, src.name); } catch (e) { if (ctl) ctl.abort(); throw e; }
        env.importScripts(src.url + 'pyodide.js');
        var py = await withTimeout(env.loadPyodide({ indexURL: src.url }), loadMs, src.name);
        return { py: py, source: src };
      } catch (e) {
        errors.push(src.name + ': ' + String((e && e.message) || e));
      }
    }
    var err = new Error('не удалось скачать Python ни с одного источника (' + errors.join('; ') + '). '
      + 'Возможные причины: сеть колледжа или оператора блокирует загрузку, мешает блокировщик рекламы или расширение-фильтр. '
      + 'Отключите блокировщик для этого сайта или попробуйте другую сеть (Wi-Fi или мобильный интернет)');
    err.errors = errors;
    throw err;
  }

  root.PyodideLoader = { load: load, sources: sources, VERSION: VERSION };
})(typeof self !== 'undefined' ? self : globalThis);
