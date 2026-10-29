// Service worker НейроЛаба. Классический скрипт (не модуль).
// BUILD подставляет tools/publish.sh (хэш коммита); в разработке остаётся 'dev'.
// Правило: обновления сайта не ломаем — HTML/JS/CSS/контент идут «сеть сначала» (таймаут 4 с, потом кэш),
// «сначала кэш» — только fonts и icons; vendor не кэшируем. Чужие origin и не-GET не трогаем.
const BUILD = '8ce512f';
const CACHE = 'neurolab-' + BUILD;
const NET_TIMEOUT = 4000;
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png',
  'css/app.css', 'css/admin.css', 'css/board.css', 'css/sandbox.css', 'css/team.css', 'css/themes.css',
  'js/app.js', 'js/config.js', 'js/store.js', 'js/api.js', 'js/submit.js', 'js/util/dom.js',
  'fonts/onest-cyrillic-wght.woff2',
];

// Чистое решение «что делать с запросом»: 'skip' | 'cache-first' | 'network-first'.
function strategyFor(url, method, origin) {
  if (method !== 'GET') return 'skip';
  var u;
  try { u = new URL(url); } catch (e) { return 'skip'; }
  if (u.origin !== origin) return 'skip';
  if (/\/vendor\//.test(u.pathname)) return 'skip'; // Pyodide ~49 МБ: пусть держит HTTP-кэш
  if (/\/(fonts|icons)\//.test(u.pathname)) return 'cache-first';
  return 'network-first';
}

function fetchWithTimeout(req, ms) {
  return new Promise(function (resolve, reject) {
    var done = false;
    var t = setTimeout(function () { if (!done) { done = true; reject(new Error('timeout')); } }, ms);
    fetch(req).then(function (r) { if (!done) { done = true; clearTimeout(t); resolve(r); } },
      function (e) { if (!done) { done = true; clearTimeout(t); reject(e); } });
  });
}

function put(key, res) {
  var copy = res.clone();
  caches.open(CACHE).then(function (c) { return c.put(key, copy); }).catch(function () {});
}

function store(req, res) {
  if (!res || !res.ok || res.status !== 200) return;
  put(req, res);
}

// Оболочка (index.html) — только text/html для пути на «/» или «index.html».
function storeShell(req, res) {
  if (!res || !res.ok || res.status !== 200) return;
  var path = new URL(req.url).pathname;
  var type = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
  if (!/(\/|index\.html)$/.test(path) || type.indexOf('text/html') !== 0) return;
  put('index.html', res);
}

function networkFirst(req) {
  if (req.mode === 'navigate') {
    // Только навигация откатывается на кэш по таймауту.
    return fetchWithTimeout(req, NET_TIMEOUT).then(function (res) {
      storeShell(req, res);
      return res;
    }).catch(function () {
      return caches.match('index.html').then(function (hit) {
        if (hit) return hit;
        return fetch(req);
      });
    });
  }
  // js/css/content: кэш только при ошибке сети; медленную сеть ждём (иначе смесь версий модулей).
  return fetch(req).then(function (res) {
    store(req, res);
    return res;
  }, function (err) {
    return caches.match(req).then(function (hit) {
      if (hit) return hit;
      throw err;
    });
  });
}
function cacheFirst(req) {
  return caches.match(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) { store(req, res); return res; });
  });
}

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (p) {
      return c.add(new Request(p, { cache: 'reload' })).catch(function () {});
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('neurolab-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  var s = strategyFor(req.url, req.method, self.location.origin);
  if (s === 'skip') return;
  e.respondWith(s === 'cache-first' ? cacheFirst(req) : networkFirst(req));
});
