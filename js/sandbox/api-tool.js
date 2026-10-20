// Песочница: инструмент «API/JSON» — учебный сервер (js/sim/api-server.js), редактор запроса и разбор JSON.
// Весь пользовательский текст и JSON выводятся текстовыми узлами.
import { h } from '../util/dom.js';
import { createApi, API_HISTORY_MAX, API_BODY_MAX } from '../sim/api-server.js';
import { mountDailyPanel } from './daily.js';

export const ROOT_NAME = 'data';
export const HISTORY_MAX = API_HISTORY_MAX;
export const LIMIT_TEXT = `Лимит ${HISTORY_MAX} запросов — нажми «Сбросить сервер»`;
export const SHOWN_MAX = 200;
export const API_PATH_MAX = 300;
export const PATH_LONG_TEXT = `Адрес длиннее ${API_PATH_MAX} символов — сократи его`;
export const METHODS = ['GET', 'POST', 'PUT', 'DELETE'];
export const EXAMPLES = [
  { label: 'Все задачи', method: 'GET', path: '/tasks' },
  { label: 'Только невыполненные', method: 'GET', path: '/tasks?done=false' },
  { label: 'Погода', method: 'GET', path: '/weather?city=Москва' },
  { label: 'Новая задача', method: 'POST', path: '/tasks', body: '{\n  "title": "Купить хлеб"\n}' },
  { label: 'Отметить сделанной', method: 'PUT', path: '/tasks/2', body: '{\n  "done": true\n}' },
  { label: 'Удалить', method: 'DELETE', path: '/tasks/3' },
];
export const EMPTY_PATH_TEXT = 'Впиши адрес, например /users';
export const RESET_TEXT = 'Сбросить сервер';
export const RESET_SURE_TEXT = 'Точно сбросить?';
export const RESET_SURE_MS = 3000;
export const JSON_OK_TEXT = 'JSON в порядке';
export const JSON_HINT = 'Вставь JSON, потом нажми на любое поле — покажу путь к нему.';
export const PICK_HINT = 'Нажми на поле, чтобы увидеть путь';
export const HISTORY_EMPTY_TEXT = 'Запросов пока нет';

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// ---------- чистые части ----------

// Путь к полю: segs = ['items', 2, 'name'] -> data.items[2].name
export function pathLabel(segs, root = ROOT_NAME) {
  let out = root;
  for (const s of segs) out += typeof s === 'number' ? `[${s}]` : IDENT.test(s) ? `.${s}` : `[${JSON.stringify(s)}]`;
  return out;
}

// Разбор текста: { ok, value } | { ok: false, message, pos, line, col }
export function parseJsonText(text) {
  const src = String(text);
  if (src.trim() === '') return { ok: false, empty: true, message: 'Тут пусто — впиши JSON' };
  try {
    return { ok: true, value: JSON.parse(src) };
  } catch (e) {
    const msg = String((e && e.message) || '');
    let pos = null;
    const mp = /position (\d+)/.exec(msg);
    if (mp) pos = Number(mp[1]);
    let line = null;
    let col = null;
    const ml = /line (\d+) column (\d+)/.exec(msg);
    if (ml) { line = Number(ml[1]); col = Number(ml[2]); if (pos === null) pos = lineColToPos(src, line, col); }
    if (pos !== null && line === null) { const lc = posToLineCol(src, pos); line = lc.line; col = lc.col; }
    const where = line !== null ? ` — строка ${line}, символ ${col}` : '';
    return { ok: false, message: `Ошибка в JSON${where}. Проверь кавычки, запятые и скобки`, pos, line, col };
  }
}

export function posToLineCol(src, pos) {
  const before = src.slice(0, pos).split('\n');
  return { line: before.length, col: before[before.length - 1].length + 1 };
}
function lineColToPos(src, line, col) {
  const lines = src.split('\n');
  let pos = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
  return pos + col - 1;
}

export const prettyJson = v => JSON.stringify(v, null, 2);

// Все поля со своими путями: [{ path, type, segs }] (для проверки и подсказок)
export function listPaths(value, limit = 1000) {
  const out = [];
  const walk = (v, segs) => {
    if (out.length >= limit) return;
    out.push({ path: pathLabel(segs), type: typeOf(v), segs });
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, segs.concat(i)));
    else if (v && typeof v === 'object') Object.keys(v).forEach(k => walk(v[k], segs.concat(k)));
  };
  walk(value, []);
  return out;
}

export function typeOf(v) {
  return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
}

export const statusClass = s => (s >= 200 && s < 300 ? 'ok' : s >= 400 && s < 500 ? 'warn' : s >= 500 ? 'bad' : 'info');
export const STATUS_TEXT = {
  200: 'OK', 201: 'Created', 204: 'No Content', 400: 'Bad Request', 404: 'Not Found', 405: 'Method Not Allowed', 413: 'Payload Too Large', 422: 'Unprocessable Entity',
};
export const statusLabel = s => `${s} ${STATUS_TEXT[s] || ''}`.trim();

const leafText = v => (typeof v === 'string' ? JSON.stringify(v) : String(v));
const summary = v => (Array.isArray(v) ? (v.length ? `[ ${v.length} ]` : '[ ]') : Object.keys(v).length ? `{ ${Object.keys(v).length} }` : '{ }');

// Дерево JSON со сворачиваемыми узлами. onPick(segs, value) — нажатие на название/значение узла.
export function renderTree(value, onPick, opts = {}) {
  const open0 = opts.openDepth === undefined ? 2 : opts.openDepth;
  const build = (v, segs, label, depth) => {
    const isBox = v !== null && typeof v === 'object';
    const pickBtn = (cls, children) => h('button', {
      type: 'button', class: `api-pick ${cls}`, 'data-path': pathLabel(segs), onclick: () => { if (onPick) onPick(segs, v); },
    }, ...children);
    const keyEl = label === null ? null : h('span', { class: 'api-key' }, `${label}: `);
    if (!isBox) {
      return h('div', { class: 'api-node' }, h('div', { class: 'api-row' },
        h('span', { class: 'api-caret-gap', 'aria-hidden': 'true' }),
        pickBtn('', [keyEl, h('span', { class: `api-val ${typeOf(v)}` }, leafText(v))])));
    }
    const keys = Array.isArray(v) ? v.map((_, i) => i) : Object.keys(v);
    const kids = h('div', { class: 'api-kids' });
    let open = depth < open0;
    const caret = h('button', { type: 'button', class: 'api-caret', 'aria-expanded': open ? 'true' : 'false', 'aria-label': `${open ? 'Свернуть' : 'Развернуть'} ${pathLabel(segs)}` }, open ? '▾' : '▸');
    const fill = () => {
      if (kids.children.length) return;
      keys.slice(0, SHOWN_MAX).forEach(k => kids.append(build(v[k], segs.concat(k), Array.isArray(v) ? `[${k}]` : k, depth + 1)));
      if (keys.length > SHOWN_MAX) kids.append(h('div', { class: 'api-more' }, `… и ещё ${keys.length - SHOWN_MAX}`));
    };
    const sync = () => {
      caret.setAttribute('aria-expanded', open ? 'true' : 'false');
      caret.setAttribute('aria-label', `${open ? 'Свернуть' : 'Развернуть'} ${pathLabel(segs)}`);
      caret.textContent = open ? '▾' : '▸';
      if (open) fill();
      if (kids.classList) kids.classList.toggle('closed', !open);
    };
    caret.addEventListener('click', () => { open = !open; sync(); });
    const node = h('div', { class: 'api-node' },
      h('div', { class: 'api-row' }, caret, pickBtn('', [keyEl, h('span', { class: 'api-sum' }, summary(v))])), kids);
    sync();
    return node;
  };
  return h('div', { class: 'api-tree', role: 'tree' }, build(value, [], null, 0));
}

// Журнал запросов -> те же запросы заново на чистом сервере (детерминированно)
export function replayHistory(history, setup) {
  const api = createApi(setup || {});
  (history || []).forEach(e => api.request(e.method, e.path, e.body));
  return api;
}

export const historyLine = e => `${e.method} ${e.path} · ${e.status}`;

// ---------- экран ----------

const TYPE_RU = { object: 'объект', array: 'массив', string: 'строка', number: 'число', boolean: 'да/нет', null: 'пусто' };

// «Путь: data.items[2].name · строка» в абзаце host
function pickLine(host, segs, v) {
  host.replaceChildren(h('span', {}, 'Путь: '), h('code', { class: 'api-path-out' }, pathLabel(segs)), h('span', { class: 'api-type' }, ` · ${TYPE_RU[typeOf(v)]}`));
}
function textBox(attrs) {
  return h('textarea', Object.assign({ class: 'code-editor api-editor', rows: '5', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off' }, attrs));
}

// Черновик api-задачи дня: отдельно от свободного режима (там своя история запросов)
function dailyApiStore(storage, daily) {
  const read = () => {
    const v = (storage.loadDaily(daily.d, daily.task.id) || {}).api || {};
    return {
      method: typeof v.method === 'string' ? v.method : 'GET',
      path: typeof v.path === 'string' ? v.path : '/users',
      body: typeof v.body === 'string' ? v.body : '',
      json: typeof v.json === 'string' ? v.json : '',
      history: Array.isArray(v.history) ? v.history.filter(e => e && typeof e.method === 'string' && typeof e.path === 'string').slice(-API_HISTORY_MAX) : [],
    };
  };
  return { loadApi: read, saveApi: v => storage.saveDaily(daily.d, daily.task.id, { api: v }) };
}

// opts: { storage, setup?, daily? } — storage: createSandboxStorage (loadApi/saveApi);
// daily { app, d, task, date? } — задача дня вида api: сервер стартует с task.setup, под условием панель сдачи, история хранится в черновике задачи
export function mountApi(container, opts) {
  const { daily } = opts;
  const storage = daily ? dailyApiStore(opts.storage, daily) : opts.storage;
  const saved = storage.loadApi();
  const state = {
    method: METHODS.indexOf(saved.method) >= 0 ? saved.method : 'GET',
    path: saved.path || '/users',
    body: saved.body || '',
    history: saved.history.slice(-HISTORY_MAX),
    json: saved.json || '',
  };
  let api = replayHistory(state.history, opts.setup);
  const persist = () => storage.saveApi({ method: state.method, path: state.path, body: state.body, history: state.history, json: state.json });

  // вкладки
  const tabReq = h('button', { type: 'button', class: 'btn small sbx-tab', 'aria-pressed': 'true' }, 'Запросы');
  const tabJson = h('button', { type: 'button', class: 'btn small ghost sbx-tab', 'aria-pressed': 'false' }, 'Разбор JSON');
  const reqView = h('div', { class: 'api-view' });
  const jsonView = h('div', { class: 'api-view', hidden: true });
  const setTab = name => {
    const req = name === 'req';
    tabReq.setAttribute('aria-pressed', req ? 'true' : 'false');
    tabJson.setAttribute('aria-pressed', req ? 'false' : 'true');
    tabReq.classList.toggle('ghost', !req);
    tabJson.classList.toggle('ghost', req);
    if (req) { reqView.removeAttribute('hidden'); jsonView.setAttribute('hidden', ''); } else { jsonView.removeAttribute('hidden'); reqView.setAttribute('hidden', ''); }
  };
  tabReq.addEventListener('click', () => setTab('req'));
  tabJson.addEventListener('click', () => setTab('json'));

  // --- вкладка «Запросы»
  const method = h('select', { class: 'api-method', 'aria-label': 'Метод' }, METHODS.map(m => h('option', { value: m }, m)));
  method.value = state.method;
  const pathIn = h('input', { class: 'api-path', type: 'text', 'aria-label': 'Адрес', placeholder: '/users', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', value: state.path });
  const bodyIn = textBox({ 'aria-label': 'Тело запроса (JSON)', value: state.body });
  const bodyMsg = h('p', { class: 'api-msg', 'aria-live': 'polite' });
  const bodyWrap = h('div', { class: 'api-body-wrap' }, h('label', { class: 'api-label' }, 'Тело запроса (JSON)'), bodyIn, bodyMsg);
  const send = h('button', { type: 'button', class: 'btn big' }, 'Отправить');
  const pathMsg = h('p', { class: 'api-msg bad', 'aria-live': 'polite' });
  const resultHost = h('section', { class: 'api-result', 'aria-label': 'Ответ' });
  const pickOut = h('p', { class: 'api-picked', 'aria-live': 'polite' }, PICK_HINT);
  const histHost = h('ol', { class: 'api-history', 'aria-label': 'История запросов' });
  const reset = h('button', { type: 'button', class: 'btn small ghost' }, RESET_TEXT);

  const chips = h('div', { class: 'api-chips' }, EXAMPLES.map(ex => h('button', {
    type: 'button', class: 'btn small ghost', onclick: () => { setRequest(ex.method, ex.path, ex.body || ''); },
  }, ex.label)));

  const showPick = (segs, v) => pickLine(pickOut, segs, v);

  function bodyCheck() {
    const needs = state.method === 'POST' || state.method === 'PUT';
    if (needs) bodyWrap.removeAttribute('hidden'); else bodyWrap.setAttribute('hidden', '');
    const text = bodyIn.value;
    if (!needs || text.trim() === '') { bodyIn.classList.remove('bad'); bodyIn.removeAttribute('aria-invalid'); bodyMsg.textContent = ''; return null; }
    const r = parseJsonText(text);
    bodyIn.classList.toggle('bad', !r.ok);
    if (r.ok) { bodyIn.removeAttribute('aria-invalid'); bodyMsg.textContent = ''; bodyMsg.classList.remove('bad'); } else { bodyIn.setAttribute('aria-invalid', 'true'); bodyMsg.textContent = r.message; bodyMsg.classList.add('bad'); }
    return r;
  }

  function setRequest(m, p, b) {
    state.method = m; state.path = p; state.body = b;
    method.value = m; pathIn.value = p; bodyIn.value = b;
    bodyCheck();
    persist();
  }

  function renderResult(resp) {
    const head = h('div', { class: 'api-status-row' },
      h('span', { class: `api-status ${statusClass(resp.status)}` }, statusLabel(resp.status)));
    const hdr = Object.keys(resp.headers);
    const headers = h('div', { class: 'api-headers' }, h('div', { class: 'api-label' }, 'Заголовки'),
      hdr.length ? hdr.map(k => h('div', { class: 'api-hdr' }, `${k}: ${resp.headers[k]}`)) : h('div', { class: 'api-hdr' }, '—'));
    const bodyBox = h('div', { class: 'api-resp-body' }, h('div', { class: 'api-label' }, 'Тело ответа'),
      resp.body === null ? h('div', { class: 'api-hdr' }, 'Пусто — так и должно быть') : renderTree(resp.body, showPick, { openDepth: 3 }));
    resultHost.replaceChildren(head, headers, bodyBox, pickOut);
  }

  function renderHistory() {
    if (!state.history.length) { histHost.replaceChildren(h('li', { class: 'api-empty' }, HISTORY_EMPTY_TEXT)); return; }
    histHost.replaceChildren(...state.history.slice().reverse().slice(0, 30).map(e => h('li', {},
      h('button', {
        type: 'button', class: `api-hist-btn ${statusClass(e.status)}`,
        onclick: () => setRequest(e.method, e.path, typeof e.body === 'string' ? e.body : ''),
      }, historyLine(e)))));
  }

  function doSend() {
    if (state.history.length >= HISTORY_MAX) { pathMsg.textContent = LIMIT_TEXT; return; } // история — единственный источник состояния: старые не отбрасываем
    const p = pathIn.value.trim();
    if (!p) { pathMsg.textContent = EMPTY_PATH_TEXT; return; }
    if (p.length > API_PATH_MAX) { pathMsg.textContent = PATH_LONG_TEXT; return; } // сервер задач дня принимает адрес не длиннее
    pathMsg.textContent = '';
    state.method = method.value; state.path = p; state.body = bodyIn.value;
    const needs = state.method === 'POST' || state.method === 'PUT';
    const body = needs ? bodyIn.value : undefined;
    const r = bodyCheck();
    if (needs && r && !r.ok && r.pos !== null && typeof bodyIn.setSelectionRange === 'function') {
      try { bodyIn.focus(); bodyIn.setSelectionRange(r.pos, Math.min(r.pos + 1, bodyIn.value.length)); } catch (e) { /* не страшно */ }
    }
    const resp = api.request(state.method, p, body);
    // слишком большое тело (413) в историю не кладём: повтор пустого тела так же не меняет состояние
    state.history.push({ method: state.method, path: p, body: needs && bodyIn.value.length <= API_BODY_MAX ? bodyIn.value : '', status: resp.status });
    renderResult(resp);
    renderHistory();
    persist();
  }

  method.addEventListener('change', () => { state.method = method.value; bodyCheck(); persist(); });
  pathIn.addEventListener('input', () => { state.path = pathIn.value; pathMsg.textContent = ''; persist(); });
  bodyIn.addEventListener('input', () => { state.body = bodyIn.value; bodyCheck(); persist(); });
  send.addEventListener('click', doSend);

  let resetTimer = null;
  reset.addEventListener('click', () => {
    if (!resetTimer) {
      reset.textContent = RESET_SURE_TEXT;
      resetTimer = setTimeout(() => { resetTimer = null; reset.textContent = RESET_TEXT; }, RESET_SURE_MS);
      return;
    }
    clearTimeout(resetTimer); resetTimer = null; reset.textContent = RESET_TEXT;
    state.history = []; api = createApi(opts.setup || {});
    resultHost.replaceChildren();
    renderHistory(); persist();
  });

  reqView.append(
    h('p', { class: 'hint' }, 'Это учебный сервер: он живёт в браузере. Ресурсы: /users, /tasks, /weather?city=, /models.'),
    chips,
    h('div', { class: 'api-line' }, method, pathIn), pathMsg, bodyWrap, send, resultHost,
    h('h2', { class: 'api-h' }, 'История запросов'), histHost, reset);

  // --- вкладка «Разбор JSON»
  const jsonIn = textBox({ 'aria-label': 'JSON для разбора', rows: '8', placeholder: '{"data": {"items": [{"name": "Аня"}]}}', value: state.json });
  const jsonMsg = h('p', { class: 'api-msg', 'aria-live': 'polite' });
  const jsonPick = h('p', { class: 'api-picked', 'aria-live': 'polite' }, PICK_HINT);
  const jsonTree = h('div', { class: 'api-json-tree' });
  const pickJson = (segs, v) => pickLine(jsonPick, segs, v);
  function parseJsonView() {
    const r = parseJsonText(jsonIn.value);
    jsonIn.classList.toggle('bad', !r.ok && !r.empty);
    if (r.ok) {
      jsonIn.removeAttribute('aria-invalid');
      jsonMsg.textContent = JSON_OK_TEXT; jsonMsg.classList.remove('bad');
      jsonTree.replaceChildren(renderTree(r.value, pickJson, { openDepth: 5 }));
    } else {
      if (r.empty) jsonIn.removeAttribute('aria-invalid'); else jsonIn.setAttribute('aria-invalid', 'true');
      jsonMsg.textContent = r.empty ? '' : r.message;
      jsonMsg.classList.toggle('bad', !r.empty);
      jsonTree.replaceChildren();
    }
    jsonPick.textContent = r.ok ? PICK_HINT : '';
  }
  jsonIn.addEventListener('input', () => { state.json = jsonIn.value; parseJsonView(); persist(); });
  jsonView.append(h('p', { class: 'hint' }, JSON_HINT), jsonIn, jsonMsg, jsonTree, jsonPick);

  if (daily) {
    const host = h('div', { class: 'sbx-daily-host' });
    container.append(host);
    mountDailyPanel(host, { app: daily.app, d: daily.d, task: daily.task, kind: 'api', date: daily.date, source: daily.source, getApiHistory: () => state.history });
  }
  container.append(h('div', { class: 'sbx-tabs' }, tabReq, tabJson), reqView, jsonView);
  bodyCheck();
  renderHistory();
  parseJsonView();
  return { getApi: () => api, state, send: doSend };
}
