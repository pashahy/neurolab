import { postJson } from './http.js';
import { SUBMIT_TIMEOUT_MS } from './net-config.js';
import { retryDelay, BAD_REPLY_TEXT, MANUAL_COOLDOWN_MS, MAX_QUIET_FAILURES } from './submit-status.js';

// Прежние экспорты (их импортируют экраны, в том числе старые копии из кэша телефона) остаются здесь под теми же именами;
// тексты и чистые функции лежат в submit-status.js, сюда они повторно экспортируются для удобства
export { LIMIT_TEXT, HOLD_TEXT, holdText, rejectText, OVERLOAD_TEXT, OFFLINE_TEXT, RETRY, retryDelay, queuedView, failureText, diagLine, errorLabel } from './submit-status.js';

const pad2 = n => (n < 10 ? '0' : '') + n;
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Что случилось с отправкой: 'busy' (сервер ответил busy или не взял блокировку таблицы), 'server' (сервер ответил ошибкой
// без reject/hold/limit, crashed, HTTP не 2xx или ответ не JSON), 'timeout' (не дождались ответа), 'network' (запрос не дошёл)
// Старый сервер отвечает на таймаут блокировки текстом исключения — по нему тоже узнаём «занят».
// Признаки ошибки http.js (timeout, httpStatus) могут отсутствовать, если в кэше старая копия http.js, — смотрим и на имя/текст.
const LOCK_RE = /lock|блокировк/i;
function failKind(e) {
  if (e && e.kind) return e.kind;
  if (e && (e.timeout || e.name === 'AbortError')) return 'timeout';
  if (e && (e.httpStatus || (typeof e.message === 'string' && /^HTTP \d{3}/.test(e.message)))) return 'server';
  if (e && e.name === 'SyntaxError') return 'server'; // 200, но не JSON (страница ошибки Google)
  return 'network';
}
const failText = e => {
  if (e && e.name === 'SyntaxError') return BAD_REPLY_TEXT;
  return e && typeof e.message === 'string' ? e.message : '';
};

// variant ('phone' | 'pc') — только у занятия с вариантами практики; без него поля в сдаче нет
// v4 — данные этапов занятия формата v4 (цель, разминка, инструктаж, рефлексия, ⭐); у остальных форматов поля в сдаче нет
export function buildSubmission({ profile, discipline, lesson, answers, grade, texts, startedAt, variant, v4, now = Date.now(), rnd = Math.random }) {
  const sub = {
    id: `${now.toString(36)}-${Math.floor(rnd() * 1e9).toString(36)}`,
    studentId: profile.id,
    discipline,
    lesson: lesson.number,
    title: lesson.title,
    score: grade.score,
    max: grade.max,
    manualMax: grade.manualMax,
    durationSec: Math.max(0, Math.round((now - (startedAt ?? now)) / 1000)),
    submittedAt: new Date(now).toISOString(),
    items: grade.items,
    answers,
    texts,
  };
  if (variant) sub.variant = variant;
  if (v4) sub.v4 = v4;
  return sub;
}

// Сдача ДЗ (формат v4) — в новом модуле hw-submit.js (в кэше телефона нет его старой копии); здесь только повторный экспорт
export { buildHomeworkSubmission } from './hw-submit.js';

export function createSubmitter({
  store, url, fetchFn = (...a) => fetch(...a),
  retryMs = null, // только для тестов: фиксированная пауза вместо экспоненциальной
  random = Math.random,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = id => clearTimeout(id),
  now = () => Date.now(),
  timeoutMs = SUBMIT_TIMEOUT_MS,
  getToken = () => store.session()?.token ?? null,
  getStudentId = () => store.session()?.student.id ?? null,
  onAuthRequired = () => {},
  today = () => localDay(),
}) {
  let chain = Promise.resolve();
  let passes = 0; // проходов по очереди в цепочке (ждут или идут)
  let lastManualAt = null; // когда начался прошлый ручной проход («Отправить сейчас»)
  // суточный лимит сервера ({limit: true}): работы этого студента ждут в очереди до смены даты (или перезапуска сайта);
  // ни таймер, ни flush до тех пор на сервер не ходят
  let limitHit = null; // { sid, day }
  const limited = () => {
    const sid = getStudentId();
    return !!limitHit && limitHit.sid === sid && limitHit.day === today();
  };
  // hold ({hold: true}: ПЗ закрыто или ещё неизвестно серверу): такие работы ждут в очереди, автоматические попытки
  // (таймер, online, возврат на вкладку) их пропускают; повтор — при новом запуске сайта или flush({manual: true})
  const held = new Map(); // id -> причина
  const rejected = new Map(); // id -> ошибка (для ответа submit)
  // чем закончилась отправка работы (для экрана «Работа отправлена»): id -> { sent: true } | { rejected: ошибка }
  const settled = new Map();
  const settle = (id, v) => { settled.set(id, v); if (settled.size > 100) settled.delete(settled.keys().next().value); };

  // Повторы после сбоя (сеть, таймаут, ошибка сервера, busy): один таймер, пауза растёт с каждым подряд идущим сбоем.
  // Состояние принадлежит студенту backoffSid; другой студент начинает с чистого листа.
  let timer = null;
  let nextRetryAt = null;
  let failures = 0;
  let lastError = null;
  let lastErrorText = ''; // текст ошибки сервера последнего сбоя — как пришёл
  let backoffSid = null;
  let inFlightSid = null; // чью очередь сейчас отправляем
  let sentCount = 0; // сколько работ принял сервер за время жизни страницы
  const listeners = [];

  // очередь общая, но отправляем только сдачи вошедшего студента
  const mine = () => { const sid = getStudentId(); return sid ? store.queue().filter(q => q.studentId === sid) : []; };

  function emit() {
    if (!listeners.length) return;
    const st = self.status();
    listeners.slice().forEach(fn => { try { fn(st); } catch (e) { console.error(e); } });
  }
  function clearRetry() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    nextRetryAt = null;
  }

  // ответ сервера -> { kind: 'ok' | 'auth' | 'limit' | 'hold' | 'reject', error };
  // сбой сети, таймаут, busy, прочие ошибки и ответ не того вида — исключение (с признаком kind: 'busy' | 'server')
  async function send(item) {
    if (!url) throw new Error('Адрес сервера не настроен');
    const hw = item.kind === 'hw';
    const sbx = item.kind === 'sbx';
    // песочница: действие sandboxSolve, работа лежит в поле solution
    const body = sbx
      ? { action: 'sandboxSolve', token: getToken(), solution: item }
      : { action: hw ? 'homeworkSubmit' : 'submit', token: getToken(), submission: item };
    const data = await postJson(fetchFn, url, body, timeoutMs);
    if (!data || typeof data !== 'object' || Array.isArray(data)) { // null, число, строка, массив — не ответ нашего сервера
      const bad = new Error(BAD_REPLY_TEXT);
      bad.kind = 'server';
      throw bad;
    }
    if (data.auth) return { kind: 'auth' };
    if (data.ok === true) return sbx ? { kind: 'ok', result: data } : { kind: 'ok' };
    // сервер без homeworkSubmit (скрипт таблицы ещё не обновлён): ДЗ не теряем, оставляем в очереди как отложенное
    if ((hw || sbx) && data.error === 'unknown action') return { kind: 'hold', error: data.error };
    if (data.reject) return { kind: 'reject', error: data.error };
    if (data.limit) return { kind: 'limit' };
    if (data.hold) return { kind: 'hold', error: data.error };
    // busy: сервер не смог взять блокировку, сдача НЕ записана — повторим позже, из очереди не убираем.
    // Прочее (ошибка без флагов, crashed, ok не true) — kind 'server' с текстом сервера
    const err = new Error(typeof data.error === 'string' && data.error ? data.error : 'Ошибка сервера');
    err.kind = data.busy === true || LOCK_RE.test(err.message) ? 'busy' : 'server';
    throw err;
  }

  // после сбоя пробуем ещё раз через паузу с разбросом; одновременно ждёт только один таймер
  function scheduleRetry() {
    clearRetry();
    const delay = retryMs !== null ? retryMs : retryDelay(failures, random);
    nextRetryAt = now() + delay;
    timer = setTimer(() => {
      timer = null; nextRetryAt = null;
      if (mine().length) self.flush(); else emit(); // принудительный проход: сдачи того, кто вошёл сейчас, и его токеном
    }, delay);
    if (timer && typeof timer.unref === 'function') timer.unref(); // в Node не держим процесс открытым
  }

  // Диагностика по работам: id -> { attempts, kind, error }. Записи живут, пока работа в очереди (лишние убираются при каждом проходе).
  const tries = new Map();
  const pruneTries = () => {
    if (!tries.size) return;
    const ids = new Set(store.queue().map(q => q.id));
    Array.from(tries.keys()).forEach(id => { if (!ids.has(id)) tries.delete(id); });
  };
  const triesOf = id => { let t = tries.get(id); if (!t) { t = { attempts: 0, kind: null, error: '' }; tries.set(id, t); } return t; };
  // порядок прохода: работы с меньшим числом попыток — первыми. Постоянно падающая работа уходит в конец очереди
  // и не мешает остальным (без «блокировки головы очереди»); у новых работ попыток нет, их порядок сохраняется
  const attemptsOf = id => (tries.has(id) ? tries.get(id).attempts : 0);
  const passOrder = () => mine().map((q, i) => ({ q, i })).sort((a, b) => attemptsOf(a.q.id) - attemptsOf(b.q.id) || a.i - b.i).map(x => x.q);

  // Проход по очереди студента. Сбой одной работы (ошибка сервера, busy) не останавливает остальные: идём дальше.
  // Нет связи или таймаут — сервер недоступен целиком, остальные работы в этот проход не пробуем.
  // После прохода: были сбои — один повтор по расписанию (пауза растёт); сбоев нет — счётчик сбоев и ожидание обнуляются.
  // manual — «Отправить сейчас»: снимает таймер ожидания и повторяет отложенные (hold); auto — автоматический повод
  // (возврат на вкладку, online): в момент запуска проверяет расписание и пока паузы не истекла, ничего не делает.
  async function drain(manual, auto) {
    const sid = getStudentId();
    if (limited()) { emit(); return; }
    if (sid !== backoffSid) { failures = 0; lastError = null; lastErrorText = ''; clearRetry(); backoffSid = sid; }
    if (auto && timer !== null && nextRetryAt !== null && nextRetryAt > now()) { emit(); return; } // расписание не обгоняем
    pruneTries();
    clearRetry(); // проход идёт сейчас: прежний таймер не нужен (по итогам прохода finally поставит новый или оставит пусто)
    if (manual) held.clear();
    if (!mine().some(q => !held.has(q.id))) { emit(); return; }
    inFlightSid = sid;
    emit();
    let failed = null; // последний сбой этого прохода: { kind, text }
    let abandoned = false; // сессия сменилась — состояние повторов не трогаем
    try {
      for (const item of passOrder()) {
        if (getStudentId() !== sid) { abandoned = true; return; } // сессия сменилась посреди отправки — чужой токен не используем
        if (held.has(item.id)) continue;
        const t = triesOf(item.id);
        t.attempts++;
        let r;
        try { r = await send(item); } catch (e) {
          if (getStudentId() !== sid) { abandoned = true; return; }
          const kind = failKind(e);
          failed = { kind, text: failText(e) };
          t.kind = kind; t.error = failed.text;
          emit();
          if (kind === 'network' || kind === 'timeout') return;
          continue;
        }
        if (r.kind === 'limit') { limitHit = { sid, day: today() }; t.kind = 'limit'; return; } // без таймера: до завтра повторять бессмысленно
        if (r.kind === 'hold') { held.set(item.id, r.error); t.kind = 'hold'; t.error = r.error; continue; } // без таймера; следующие работы очереди отправляем
        if (r.kind === 'auth') { // сдача остаётся в очереди до нового входа
          // оповещаем, только если вошедший студент всё ещё владелец отправлявшейся сдачи; сбой обработчика не должен ломать очередь
          if (getStudentId() === item.studentId) { try { onAuthRequired(); } catch (e) { console.error(e); } }
          return;
        }
        if (r.kind === 'reject') { rejected.set(item.id, r.error); settle(item.id, { rejected: r.error }); } // повреждённая сдача: убираем, но «сдано» не говорим
        else { sentCount++; settle(item.id, r.result ? { sent: true, result: r.result } : { sent: true }); } // итог серверa песочницы — тому, кто ждёт
        tries.delete(item.id);
        store.dequeue(item.id);
        emit();
      }
    } finally {
      inFlightSid = null;
      if (!abandoned) {
        if (failed && !limited()) { failures++; lastError = failed.kind; lastErrorText = failed.text; scheduleRetry(); } else { failures = 0; lastError = null; lastErrorText = ''; clearRetry(); }
      }
      emit();
    }
  }

  const self = {
    // flush() — принудительный проход (запуск сайта, новая сдача, таймер повтора).
    //   { manual: true } — «Отправить сейчас»: ещё и повторяет отложенные (hold); раньше чем через 5 с после прошлого
    //     ручного прохода игнорируется (одна пауза на все кнопки).
    //   { auto: true } — автоматический повод (возврат на вкладку, online): если проход уже ждёт или идёт, возвращает его же;
    //     в момент запуска ничего не делает, пока не истекла пауза повтора.
    flush(opts) {
      const manual = !!(opts && opts.manual);
      const auto = !manual && !!(opts && opts.auto);
      if (auto && passes > 0) return chain;
      if (manual) {
        if (lastManualAt !== null && now() - lastManualAt < MANUAL_COOLDOWN_MS) return chain;
        lastManualAt = now();
      }
      passes++;
      const run = async () => { try { return await drain(manual, auto); } finally { passes--; } };
      chain = chain.then(run, run);
      return chain;
    },
    // прежнее имя автоматического повода (возврат на вкладку)
    flushIfDue() { return self.flush({ auto: true }); },
    async submit(item) {
      if (!getStudentId()) return { sent: false, error: 'no session' }; // без сессии работу некому отправить — не копим в очереди
      const entry = item.studentId ? item : Object.assign({}, item, { studentId: getStudentId() });
      store.enqueue(entry);
      emit();
      await self.flush();
      if (rejected.has(entry.id)) { const error = rejected.get(entry.id); rejected.delete(entry.id); return { sent: false, rejected: error }; }
      if (!store.queue().some(q => q.id === entry.id)) return { sent: true };
      if (held.has(entry.id)) return { sent: false, hold: held.get(entry.id) };
      return limited() ? { sent: false, limit: true } : { sent: false };
    },
    pending: () => mine().length,
    limited,
    // причины отложенных (hold) работ вошедшего студента, без повторов, в порядке очереди
    held: () => Array.from(new Set(mine().filter(q => held.has(q.id)).map(q => held.get(q.id)))),
    pendingOthers: () => store.queue().length - mine().length,
    // Отправка работ вошедшего студента идёт или ждёт запланированный повтор — тяжёлые фоновые запросы (оценки, прогресс)
    // откладываются. После MAX_QUIET_FAILURES сбоев подряд ожидание повтора это уже не считается: постоянно падающая работа
    // не должна замораживать оценки и прогресс. Идущий запрос считается всегда.
    busy() {
      const sid = getStudentId();
      if (!sid) return false;
      if (inFlightSid === sid) return true;
      return timer !== null && backoffSid === sid && failures <= MAX_QUIET_FAILURES && mine().length > 0;
    },
    // состояние для экранов: pending — работ в очереди; inFlight — запрос идёт; attempt — номер текущей/последней попытки
    // подряд; lastError — 'busy' | 'server' | 'timeout' | 'network' | null; nextRetryAt — когда следующий автоповтор (мс) или null
    status() {
      const sid = getStudentId();
      const own = sid !== null && backoffSid === sid;
      const inFlight = sid !== null && inFlightSid === sid;
      const q = mine();
      return {
        pending: q.length,
        inFlight,
        busy: self.busy(),
        attempt: (own ? failures : 0) + (inFlight ? 1 : 0),
        lastError: own ? lastError : null,
        lastErrorText: own ? lastErrorText : '',
        nextRetryAt: own && timer !== null ? nextRetryAt : null,
        limited: limited(),
        held: self.held(),
        heldCount: q.filter(x => held.has(x.id)).length,
        sentCount,
      };
    },
    // fn(status) вызывается при каждом изменении очереди и отправки; возвращает функцию отписки
    subscribe(fn) {
      listeners.push(fn);
      return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
    },
    // диагностика работ вошедшего студента: ПЗ, число попыток, последняя ошибка (kind: network | timeout | busy | server | hold | limit)
    details() {
      const lim = limited();
      return mine().map(q => {
        const t = tries.get(q.id);
        const kind = held.has(q.id) ? 'hold' : lim ? 'limit' : t ? t.kind : null;
        const error = held.has(q.id) ? held.get(q.id) : t ? t.error : '';
        return { id: q.id, discipline: q.discipline, lesson: q.lesson, hw: q.kind === 'hw', sbx: q.kind === 'sbx' ? (/^term/.test(String(q.taskId)) ? 'term' : 'py') : null, attempts: t ? t.attempts : 0, kind, error };
      });
    },
    // последняя ошибка именно этой работы
    itemError(id) { const t = tries.get(id); return t && t.kind ? { kind: t.kind, error: t.error } : null; },
    isQueued: id => store.queue().some(q => q.id === id),
    holdOf: id => (held.has(id) ? held.get(id) : null),
    outcome: id => (settled.has(id) ? settled.get(id) : null),
  };
  return self;
}
