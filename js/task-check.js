// Очередь проверок заданий запечатанного занятия на сервере (этап 2 защиты оценок).
// Один запрос в полёте; все ждущие задания сливаются в один запрос (не больше 40); busy и сбой сети — повтор с паузой (как у сдачи),
// событие online — сразу. Ожидающие проверки лежат в черновике (D.pend) и переживают перезагрузку: start() поднимает их заново.
// Ответ сервера применяется на месте: задание восстанавливается, ответ переводится в каноническое, D.rv/D.cn обновляются (sealed-state.applyReveal).
import { retryDelay } from './submit-status.js';
import { taskIndex, needsKey, isSealedTask, applyReveal } from './sealed-state.js';

export const MAX_ITEMS = 40;
export const MSG = {
  sending: 'Проверяю…',
  offline: 'Проверится при подключении',
  busy: 'Сервер занят — проверим автоматически',
  retry: 'Проверка повторится автоматически',
  failed: 'Не удалось проверить это задание — сообщите преподавателю',
};
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

export function createTaskChecker({
  api, lesson, discipline, kind = 'lesson', getDraft, save = () => {}, isActive = () => true,
  retryMs = null, random = Math.random, coalesceMs = 250,
  setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = id => clearTimeout(id),
  win = typeof window !== 'undefined' ? window : null,
  isOnline = () => (typeof navigator === 'undefined' || navigator.onLine !== false),
}) {
  const idx = () => taskIndex(lesson);
  let timer = null;
  let inFlight = null; // id в текущем запросе
  let failures = 0;
  let lastKind = null; // network | busy | server
  let started = false;
  let stopped = false;
  const failed = {}; // id → true: сервер не знает такого задания, повторов нет
  const watchers = {}; // id → { onStatus, onReveal }
  let screen = null; // один слушатель экрана: любое раскрытие
  const subs = [];

  const D = () => getDraft();
  const notify = id => {
    const w = watchers[id];
    if (w && w.onStatus) { try { w.onStatus(statusOf(id)); } catch (e) { console.error(e); } }
  };
  const notifyAll = () => { Object.keys(watchers).forEach(notify); subs.slice().forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); };

  function pendingIds() {
    const d = D();
    if (!isObj(d) || !isObj(d.pend)) return [];
    const ix = idx();
    return Object.keys(d.pend).filter(id => d.pend[id] && ix[id] && isSealedTask(ix[id]) && !failed[id]);
  }

  // done | sending | wait | failed | none
  function statusOf(id) {
    const d = D();
    if (failed[id]) return 'failed';
    if (d && isObj(d.rv) && d.rv[id]) return 'done';
    if (inFlight && inFlight.indexOf(id) >= 0) return 'sending';
    if (d && isObj(d.pend) && d.pend[id]) return 'wait';
    return 'none';
  }
  // текст под заданием, пока оно ждёт ответа
  function textOf(id) {
    const s = statusOf(id);
    if (s === 'failed') return MSG.failed;
    if (s === 'sending') return MSG.sending;
    if (s === 'wait') return !isOnline() || lastKind === 'network' ? MSG.offline : lastKind === 'busy' ? MSG.busy : lastKind === 'server' ? MSG.retry : MSG.sending;
    return '';
  }

  function arm(ms) {
    if (stopped || timer !== null || inFlight) return;
    timer = setTimer(() => { timer = null; run(); }, ms);
  }
  function disarm() { if (timer !== null) { clearTimer(timer); timer = null; } }

  // item для сервера: ответ в опубликованном пространстве (a), у черновика до выпуска — уже канонический (c:1); у «мягких» ответ не нужен
  function itemOf(id, t) {
    const d = D();
    const it = { id };
    if (!needsKey(t)) return it;
    const has = isObj(d.answers) && Object.prototype.hasOwnProperty.call(d.answers, id);
    it.a = has ? d.answers[id] : null;
    if (isObj(d.cn) && d.cn[id]) it.c = 1;
    return it;
  }

  async function run() {
    if (stopped) return;
    if (!isActive()) { stop(); return; }
    const ids = pendingIds().slice(0, MAX_ITEMS);
    if (!ids.length || inFlight) return;
    if (!isOnline()) { lastKind = 'network'; notifyAll(); return; } // ждём события online
    const ix = idx();
    inFlight = ids;
    notifyAll();
    let data;
    try {
      data = await api.call('checkTasks', { code: discipline, lesson: lesson.number, kind, items: ids.map(id => itemOf(id, ix[id])) });
    } catch (e) {
      inFlight = null;
      if (stopped || !isActive()) { stop(); return; }
      if (e && e.auth) { lastKind = 'server'; notifyAll(); return; } // сессия кончилась: вход, затем проверки поднимутся при открытии
      failures++;
      lastKind = e && e.network ? 'network' : e && (e.busy || e.message === 'busy') ? 'busy' : 'server';
      notifyAll();
      if (lastKind === 'network' && !isOnline()) return; // online разбудит
      arm(retryMs !== null ? retryMs : retryDelay(failures, random));
      return;
    }
    inFlight = null;
    if (stopped || !isActive()) { stop(); return; } // экран сменился: ответ не применяем, черновик перепроверит при следующем открытии
    failures = 0;
    lastKind = null;
    const d = D();
    const results = data && Array.isArray(data.results) ? data.results : [];
    const revealed = [];
    results.forEach(r => {
      if (!isObj(r) || ids.indexOf(r.id) < 0) return;
      const t = ix[r.id];
      if (r.error) { failed[r.id] = true; return; }
      if (applyReveal(d, t, r)) revealed.push(r.id);
    });
    // id без ответа в results сервер не вернул — считаем неизвестными (иначе повторялись бы бесконечно)
    ids.forEach(id => { if (revealed.indexOf(id) < 0 && !failed[id]) failed[id] = true; });
    save();
    revealed.forEach(id => { const w = watchers[id]; if (w && w.onReveal) { try { w.onReveal(); } catch (e) { console.error(e); } } });
    notifyAll();
    if (revealed.length && screen) { try { screen(revealed); } catch (e) { console.error(e); } }
    if (pendingIds().length) arm(0);
  }

  function onOnline() {
    if (stopped) return;
    disarm();
    failures = 0;
    arm(0);
  }

  function stop() {
    stopped = true;
    started = false;
    disarm();
    if (win && typeof win.removeEventListener === 'function') win.removeEventListener('online', onOnline);
  }

  const self = {
    // поставить задание в очередь: его ответ уже лежит в D.answers (закрыто локально)
    request(t, soft) {
      const d = D();
      if (d.rv && d.rv[t.id] && d.rv[t.id].hidden) return;
      if (!isObj(d.pend)) d.pend = {};
      d.pend[t.id] = soft === true || !needsKey(t) ? 2 : 1;
      save();
      delete failed[t.id];
      notify(t.id);
      arm(coalesceMs); // слияние: задания, поставленные в одну короткую паузу, уходят одним запросом
    },
    // закрытые, но не раскрытые запечатанные задания, которых нет в очереди (черновик до выпуска, ответы команды), — в очередь
    sync() {
      const d = D();
      const ix = idx();
      let added = false;
      if (isObj(d) && isObj(d.locked)) {
        Object.keys(d.locked).forEach(id => {
          const t = ix[id];
          if (!d.locked[id] || !t || !isSealedTask(t) || (isObj(d.rv) && d.rv[id])) return;
          if (!isObj(d.pend)) d.pend = {};
          if (!d.pend[id]) { d.pend[id] = needsKey(t) ? 1 : 2; added = true; }
        });
      }
      if (added) save();
      if (pendingIds().length) arm(0);
      return added;
    },
    // запустить очередь: поднять ожидающие из черновика, подписаться на online. Повторный start — без эффекта.
    start() {
      if (started) return self;
      started = true;
      stopped = false;
      if (win && typeof win.addEventListener === 'function') win.addEventListener('online', onOnline);
      self.sync();
      return self;
    },
    stop,
    flush() { failures = 0; disarm(); arm(0); },
    pendingIds,
    pendingCount: () => pendingIds().filter(id => D().pend[id] === 1).length,
    statusOf,
    textOf,
    // слушатель одного задания (замещает прежнего): onStatus(status), onReveal()
    watch(id, w) { watchers[id] = w; },
    unwatch(id) { delete watchers[id]; },
    // слушатель экрана (один, замещается): вызывается после раскрытия заданий, получает их id
    onReveal(fn) { screen = fn; },
    subscribe(fn) { subs.push(fn); },
  };
  return self;
}
