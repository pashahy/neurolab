// Прогресс студента с сервера (другие устройства): при входе и при открытии главной и карты курса,
// но не чаще раза в PROGRESS_SYNC_MS на студента — ответ сервера и так кэшируется на 2 минуты.
export const PROGRESS_SYNC_MS = 120000;

// syncProgress({force}) -> Promise<boolean>: true, если локальное состояние изменилось (экран стоит перерисовать).
// force (вход) — без паузы. Отсчёт паузы не начинается, если ответа нет или он не использован: сбой сети, истёкшая
// сессия (ещё и onAuth()), ответ отброшен из-за смены сессии. Старый сервер (null) и отказ сервера («no table») —
// обычный отсчёт, локальное состояние не меняется. Ответ сливается только в раздел студента, для которого
// запрашивался, и только если за время запроса сессия не сменилась.
export function createProgressSync({ api, store, now = () => Date.now(), intervalMs = PROGRESS_SYNC_MS, onAuth = () => {} }) {
  const lastAt = Object.create(null); // studentId -> время последнего запроса
  let inflight = null; // { sid, token, promise }
  return function syncProgress({ force = false } = {}) {
    const s = store.session();
    if (!s) return Promise.resolve(false);
    const sid = s.student.id;
    const token = s.token;
    if (inflight && inflight.sid === sid && inflight.token === token) return inflight.promise;
    if (!force && lastAt[sid] !== undefined && now() - lastAt[sid] < intervalMs) return Promise.resolve(false);
    const started = now();
    lastAt[sid] = started;
    const unused = () => { if (lastAt[sid] === started) delete lastAt[sid]; };
    const same = () => { const c = store.session(); return !!c && c.token === token; };
    const entry = { sid, token, promise: null };
    inflight = entry; // до запуска: синхронная ошибка api сразу снимет запись в finally
    entry.promise = (async () => {
      try {
        const data = await api.myProgress();
        if (!same()) { unused(); return false; }
        return store.mergeServerProgress(data, sid);
      } catch (e) {
        if (e && (e.network || e.auth)) unused();
        if (e && e.auth && same()) onAuth();
        return false;
      } finally {
        if (inflight === entry) inflight = null;
      }
    })();
    return entry.promise;
  };
}
