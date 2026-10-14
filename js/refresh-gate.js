// Фоновые запросы сайта не должны добавлять нагрузки, пока класс сдаёт работы.
// Тяжёлые запросы (оценки, прогресс, рейтинг) — не чаще раза в REFRESH_GATE_MS на студента и на запрос; общий «шлюз» для всех.
export const REFRESH_GATE_MS = 60000;

// take(kind, sid, force) -> true, если запрос можно делать сейчас (и отсчёт паузы начинается);
// release — запрос не удался (сети нет, ответ не использован): паузу не засчитываем;
// reset(sid) — данные студента устарели (он сам только что сдал работу): следующий запрос без паузы.
export function createRefreshGate({ now = () => Date.now(), intervalMs = REFRESH_GATE_MS } = {}) {
  const last = new Map(); // `${sid}|${kind}` -> время последнего запроса
  const k = (kind, sid) => `${sid}|${kind}`;
  return {
    due(kind, sid) { const at = last.get(k(kind, sid)); return at === undefined || now() - at >= intervalMs; },
    take(kind, sid, force = false) {
      if (!force && !this.due(kind, sid)) return false;
      last.set(k(kind, sid), now());
      return true;
    },
    release(kind, sid) { last.delete(k(kind, sid)); },
    reset(sid) { Array.from(last.keys()).forEach(key => { if (key.startsWith(`${sid}|`)) last.delete(key); }); },
  };
}

// Рейтинг: открытие экрана ходит на сервер не чаще раза в REFRESH_GATE_MS на студента (шлюз общий с оценками), в паузу
// показываем прошлый ответ; после собственной сдачи gate.reset(sid) открывает следующую загрузку. Сбой в кэш не попадает.
export function createRatingLoader({ api, gate, getStudentId }) {
  let cache = null; // { sid, data }
  let inflight = null; // { sid, promise }
  return {
    load() {
      const sid = getStudentId();
      if (sid === null) return api.rating(); // без сессии кэшировать нечего
      if (inflight && inflight.sid === sid) return inflight.promise;
      if (cache && cache.sid === sid && !gate.due('rating', sid)) return Promise.resolve(cache.data);
      gate.take('rating', sid, true);
      const entry = { sid, promise: null };
      entry.promise = (async () => {
        try {
          const data = await api.rating();
          if (getStudentId() === sid) cache = { sid, data };
          return data;
        } catch (e) {
          gate.release('rating', sid);
          throw e;
        } finally {
          if (inflight === entry) inflight = null;
        }
      })();
      inflight = entry;
      return entry.promise;
    },
  };
}

// Собственная сдача студента принята сервером -> один раз, когда отправка затихла, обновить оценки, прогресс и рейтинг
// (заранее пауза шлюза сбрасывается). Ждём только окончания идущего запроса (inFlight), а не повторов: другая работа,
// которая постоянно падает, не должна отменять обновление после принятой. Запуск откладывается на случайные 5–20 с,
// чтобы класс не обновлялся одновременно.
export function watchSubmissions({ submitter, run, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = id => clearTimeout(id), random = Math.random, minDelayMs = 5000, spreadMs = 15000 }) {
  let seen = submitter.status().sentCount;
  let wanted = false;
  let timer = null;
  const unsubscribe = submitter.subscribe(st => {
    if (st.sentCount !== seen) { seen = st.sentCount; wanted = true; }
    if (!wanted || st.inFlight || timer !== null) return;
    timer = setTimer(() => {
      timer = null;
      if (!wanted || submitter.status().inFlight) return; // снова идёт запрос — подождём следующей тишины
      wanted = false;
      run();
    }, minDelayMs + Math.floor(random() * spreadMs));
  });
  return () => { unsubscribe(); if (timer !== null) { clearTimer(timer); timer = null; } };
}
