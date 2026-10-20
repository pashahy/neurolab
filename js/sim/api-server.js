// Учебный API-сервер в памяти (для песочницы и заданий типа api). Чистая логика без DOM и случайности:
// id — из счётчиков, время не используется; повтор тех же запросов даёт то же состояние.
// Без import: файл встраивается в Code.gs (tools/embed-sandbox.js), как js/sim/shell.js.
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const clone = v => JSON.parse(JSON.stringify(v));
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

export const API_GOAL_KINDS = ['resourceExists', 'resourceMissing', 'fieldEquals', 'used'];

// Пределы учебного сервера (сервер заданий и экран инструмента используют те же числа)
export const API_HISTORY_MAX = 100; // запросов в истории; на сотом — «Сбросить сервер»
export const API_BODY_MAX = 4096; // байт (символов) тела запроса
export const API_TEXT_MAX = 200; // символов в title / name
export const API_ITEMS_MAX = 200; // объектов в коллекции

const DEFAULTS = {
  users: [
    { id: 1, name: 'Аня', role: 'student' },
    { id: 2, name: 'Борис', role: 'student' },
    { id: 3, name: 'Вика', role: 'teacher' },
  ],
  tasks: [
    { id: 1, title: 'Сделать практику', done: true, userId: 1 },
    { id: 2, title: 'Прочитать лекцию', done: false, userId: 1 },
    { id: 3, title: 'Починить терминал', done: false, userId: 2 },
    { id: 4, title: 'Сдать отчёт', done: false, userId: 3 },
  ],
  weather: [
    { city: 'Москва', tempC: 8, sky: 'облачно' },
    { city: 'Санкт-Петербург', tempC: 5, sky: 'дождь' },
    { city: 'Казань', tempC: 7, sky: 'ясно' },
    { city: 'Новосибирск', tempC: -2, sky: 'снег' },
    { city: 'Сочи', tempC: 17, sky: 'солнечно' },
  ],
  models: [
    { id: 1, name: 'Классификатор отзывов', kind: 'text', accuracy: 0.91 },
    { id: 2, name: 'Распознавание цифр', kind: 'image', accuracy: 0.97 },
    { id: 3, name: 'Прогноз погоды', kind: 'table', accuracy: 0.78 },
  ],
};

const reply = (status, body, extra) => ({
  status,
  headers: Object.assign(body === null ? {} : Object.assign({}, JSON_HEADERS), extra || {}),
  body,
});
const err = (status, message, extra) => reply(status, { error: message }, extra);
const maxId = list => list.reduce((m, x) => (x && typeof x.id === 'number' && x.id > m ? x.id : m), 0);

function parseQuery(qs) {
  const out = {};
  if (!qs) return out;
  qs.split('&').forEach(pair => {
    if (!pair) return;
    const i = pair.indexOf('=');
    const raw = i < 0 ? [pair, ''] : [pair.slice(0, i), pair.slice(i + 1)];
    const dec = s => { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch (e) { return s; } };
    out[dec(raw[0])] = dec(raw[1]);
  });
  return out;
}

// Тело POST/PUT -> { ok, value } | { ok: false, resp }
function parseBody(body) {
  const size = typeof body === 'string' ? body.length : body === undefined || body === null ? 0 : JSON.stringify(body).length;
  if (size > API_BODY_MAX) return { ok: false, resp: err(413, `Тело слишком большое: можно до ${API_BODY_MAX} символов`) };
  if (body === undefined || body === null || (typeof body === 'string' && body.trim() === '')) {
    return { ok: false, resp: err(400, 'Тело запроса пустое. Отправь JSON, например {"title": "Купить хлеб"}') };
  }
  let v = body;
  if (typeof body === 'string') {
    try { v = JSON.parse(body); } catch (e) {
      return { ok: false, resp: err(400, 'Тело запроса — не JSON. Проверь кавычки, запятые и скобки') };
    }
  }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return { ok: false, resp: err(400, 'Нужен JSON-объект в фигурных скобках: {"поле": "значение"}') };
  }
  return { ok: true, value: v };
}

const isText = v => typeof v === 'string' && v.trim() !== '';

// Поля, которые можно задавать, и проверка их типов (422 — тело разобрано, но значения не подходят)
const SCHEMAS = {
  users: { required: ['name'], check: b => (has(b, 'name') && !isText(b.name) ? 'Поле name — непустая строка' : has(b, 'name') && b.name.length > API_TEXT_MAX ? `Поле name — до ${API_TEXT_MAX} символов` : has(b, 'role') && !isText(b.role) ? 'Поле role — непустая строка' : null), fields: ['name', 'role'] },
  tasks: {
    required: ['title'],
    check: b => (has(b, 'title') && !isText(b.title) ? 'Поле title — непустая строка'
      : has(b, 'title') && b.title.length > API_TEXT_MAX ? `Поле title — до ${API_TEXT_MAX} символов`
      : has(b, 'done') && typeof b.done !== 'boolean' ? 'Поле done — true или false'
        : has(b, 'userId') && typeof b.userId !== 'number' ? 'Поле userId — число' : null),
    fields: ['title', 'done', 'userId'],
  },
};

export function createApi(setup = {}) {
  const pick = k => clone(Array.isArray(setup[k]) ? setup[k].filter(x => x !== null && typeof x === 'object') : DEFAULTS[k]);
  const state = { users: pick('users'), tasks: pick('tasks'), weather: pick('weather'), models: pick('models'), next: {}, log: [] };
  state.next.users = maxId(state.users) + 1;
  state.next.tasks = maxId(state.tasks) + 1;

  const find = (name, id) => state[name].find(x => String(x.id) === id);

  function collection(name, method, query, body) {
    const sc = SCHEMAS[name];
    if (method === 'GET') {
      let list = state[name];
      if (name === 'tasks' && has(query, 'done')) {
        if (query.done !== 'true' && query.done !== 'false') return err(400, 'Параметр done — true или false');
        list = list.filter(t => t.done === (query.done === 'true'));
      }
      return reply(200, clone(list));
    }
    if (method === 'POST') {
      const p = parseBody(body);
      if (!p.ok) return p.resp;
      if (state[name].length >= API_ITEMS_MAX) return err(422, `В /${name} уже ${API_ITEMS_MAX} объектов — больше нельзя`);
      const miss = sc.required.filter(f => !has(p.value, f));
      if (miss.length) return err(422, `Не хватает поля: ${miss.join(', ')}`);
      const bad = sc.check(p.value);
      if (bad) return err(422, bad);
      const item = { id: state.next[name]++ };
      sc.fields.forEach(f => { if (has(p.value, f)) item[f] = p.value[f]; });
      if (name === 'tasks' && !has(item, 'done')) item.done = false;
      if (name === 'users' && !has(item, 'role')) item.role = 'student';
      state[name].push(item);
      return reply(201, clone(item), { Location: `/${name}/${item.id}` });
    }
    return err(405, `Метод ${method} здесь не работает. Можно: GET, POST`, { Allow: 'GET, POST' });
  }

  function item(name, id, method, body) {
    const sc = SCHEMAS[name];
    const cur = find(name, id);
    if (!['GET', 'PUT', 'DELETE'].includes(method)) return err(405, `Метод ${method} здесь не работает. Можно: GET, PUT, DELETE`, { Allow: 'GET, PUT, DELETE' });
    if (!cur) return err(404, `Такого объекта нет: /${name}/${id}`);
    if (method === 'GET') return reply(200, clone(cur));
    if (method === 'DELETE') {
      state[name].splice(state[name].indexOf(cur), 1);
      return reply(204, null);
    }
    const p = parseBody(body);
    if (!p.ok) return p.resp;
    const bad = sc.check(p.value);
    if (bad) return err(422, bad);
    sc.fields.forEach(f => { if (has(p.value, f)) cur[f] = p.value[f]; });
    return reply(200, clone(cur));
  }

  function route(method, path, body) {
    const q = path.indexOf('?');
    const pathname = q < 0 ? path : path.slice(0, q);
    const query = parseQuery(q < 0 ? '' : path.slice(q + 1));
    const seg = pathname.split('/').filter(Boolean);
    if (!path.startsWith('/') || !seg.length) return err(404, 'Такого адреса нет. Адрес начинается с /, например /users');
    const [res, id] = seg;
    if (seg.length > 2) return err(404, `Такого адреса нет: ${pathname}`);
    if (res === 'users' || res === 'tasks') return id === undefined ? collection(res, method, query, body) : item(res, id, method, body);
    if (res === 'weather' && id === undefined) {
      if (method !== 'GET') return err(405, `Метод ${method} здесь не работает. Можно: GET`, { Allow: 'GET' });
      if (!isText(query.city)) return err(400, 'Нужен параметр city, например /weather?city=Москва');
      const w = state.weather.find(x => x.city.toLowerCase() === query.city.trim().toLowerCase());
      return w ? reply(200, clone(w)) : err(404, `Города «${query.city}» нет в учебной погоде`);
    }
    if (res === 'models') {
      if (method !== 'GET') return err(405, `Метод ${method} здесь не работает. Можно: GET`, { Allow: 'GET' });
      if (id === undefined) return reply(200, clone(state.models));
      const m = find('models', id);
      return m ? reply(200, clone(m)) : err(404, `Такого объекта нет: /models/${id}`);
    }
    return err(404, `Такого адреса нет: ${pathname}`);
  }

  function request(method, path, body) {
    const m = String(method || '').trim().toUpperCase();
    const p = String(path || '');
    const resp = m === '' ? err(400, 'Не выбран метод. Нужен GET, POST, PUT или DELETE') : route(m, p, body);
    state.log.push({ method: m, path: p.split('?')[0], full: p, status: resp.status });
    return resp;
  }

  return { request, state };
}

// Значение по пути через точку: ключи объектов и номера элементов массива ("done", "owner.name", "tags.0")
function fieldOf(obj, field) {
  let cur = obj;
  for (const k of String(field).split('.')) {
    if (cur === null || typeof cur !== 'object' || !has(cur, k)) return { found: false };
    cur = cur[k];
  }
  return { found: true, value: cur };
}

// Чтение без записи в журнал: что вернул бы GET
function peek(api, path) {
  const before = api.state.log.length;
  const r = api.request('GET', path);
  api.state.log.length = before;
  return r;
}

const matches = (o, where) => o !== null && typeof o === 'object' && Object.keys(where && typeof where === 'object' ? where : {}).every(k => has(o, k) && JSON.stringify(o[k]) === JSON.stringify(where[k]));

const decode = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };

// Цели: resourceExists { path, where? }, resourceMissing { path }, fieldEquals { path, field, value },
// used { cmd: 'POST /tasks' } — был успешный (2xx) запрос; адрес без «?» сверяется по пути, с «?» — по всему адресу с параметрами.
// Неверная цель (null, не объект, неизвестный вид) — просто false, без исключений.
export function checkApiGoal(api, g) {
  if (g === null || typeof g !== 'object') return false;
  try {
    switch (g.kind) {
      case 'resourceExists': {
        const r = peek(api, g.path);
        if (r.status !== 200) return false;
        if (!g.where) return true;
        return Array.isArray(r.body) ? r.body.some(x => matches(x, g.where)) : matches(r.body, g.where);
      }
      case 'resourceMissing': return peek(api, g.path).status === 404;
      case 'fieldEquals': {
        const r = peek(api, g.path);
        if (r.status !== 200 || r.body === null || typeof r.body !== 'object') return false;
        const f = fieldOf(r.body, g.field);
        return f.found && JSON.stringify(f.value) === JSON.stringify(g.value);
      }
      case 'used': {
        const parts = String(g.cmd || g.value || '').trim().split(/\s+/);
        const method = (parts[0] || '').toUpperCase();
        const path = parts[1] || '';
        const withQuery = path.indexOf('?') >= 0;
        return api.state.log.some(e => e.method === method && e.status < 300 &&
          (path === '' || (withQuery ? (e.full === path || decode(e.full) === decode(path)) : e.path === path)));
      }
      default: return false;
    }
  } catch (e) {
    return false;
  }
}
