// me (доступ к дисциплинам и занятиям) + оценки преподавателя; true, если данные изменились.
// Запрос в полёте привязан к токену: после смены сессии (выход/вход другого студента) стартует новый, а ответ старого отбрасывается.
//   me — не чаще раза в REFRESH_MS; оценки (тяжёлый запрос) — ещё и не чаще раза в минуту на студента (общий шлюз gate).
//   force (вход, собственная сдача) — без пауз. me (доступ к занятиям) обновляется всегда — при любом состоянии очереди.
//   Пока идёт отправка работ этого студента (isBusy: запрос в полёте или ждёт повтор, не дольше нескольких сбоев подряд),
//   тяжёлый запрос оценок пропускается — сдаче достаётся мощность сервера.
// accessOnly завершает ожидание после me; полный refresh и обновление оценок продолжаются.
export const REFRESH_MS = 15000;

export function createAccountRefresh({ api, store, gate, isBusy = () => false, onAuth = () => {}, now = () => Date.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  let refreshing = null; // { token, promise }
  let lastRefresh = { token: null, at: 0 };
  return function refreshAccount({ force = false, accessOnly = false, deferGradesMs = 0 } = {}) {
    const s = store.session();
    if (!s) return Promise.resolve(false);
    const token = s.token;
    const sid = s.student.id;
    if (refreshing && refreshing.token === token) return accessOnly ? refreshing.access : refreshing.promise;
    if (!force && lastRefresh.token === token && now() - lastRefresh.at < REFRESH_MS) return Promise.resolve(false);
    lastRefresh = { token, at: now() };
    const same = () => !!store.session() && store.session().token === token;
    let resolveAccess;
    const entry = { token, promise: null, access: new Promise(resolve => { resolveAccess = resolve; }) };
    entry.promise = (async () => {
      let tookGrades = false;
      try {
        const before = JSON.stringify([store.me(), store.grades(), store.profile()]);
        const m = await api.me();
        if (!same()) return false;
        store.setSession({ token, student: m.student });
        store.setMe({ student: m.student, access: m.access });
        resolveAccess(true); // права уже получены: оценки не должны удерживать вход или открытие занятия
        if ((force || !isBusy()) && gate.take('grades', sid, force)) {
          tookGrades = true;
          try {
            if (deferGradesMs > 0) await sleep(deferGradesMs);
            if (!same()) { gate.release('grades', sid); return false; }
            const g = await api.myGrades();
            if (same()) store.setGrades(g);
          } catch (e) { gate.release('grades', sid); if (e.auth) throw e; /* оценки подтянутся в следующий раз */ }
        }
        return same() && before !== JSON.stringify([store.me(), store.grades(), store.profile()]);
      } catch (e) {
        if (tookGrades) gate.release('grades', sid);
        lastRefresh = { token: null, at: 0 }; // неудача не должна блокировать повторную попытку
        if (e && e.auth && same()) onAuth();
        return false; // нет сети — работаем с сохранёнными данными
      } finally {
        resolveAccess(false); // ошибка или смена студента тоже завершают ожидание прав
        if (refreshing === entry) refreshing = null;
      }
    })();
    refreshing = entry;
    return accessOnly ? entry.access : entry.promise;
  };
}
