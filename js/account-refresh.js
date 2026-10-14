// me (доступ к дисциплинам и занятиям) + оценки преподавателя; true, если данные изменились.
// Запрос в полёте привязан к токену: после смены сессии (выход/вход другого студента) стартует новый, а ответ старого отбрасывается.
//   me — не чаще раза в REFRESH_MS; оценки (тяжёлый запрос) — ещё и не чаще раза в минуту на студента (общий шлюз gate).
//   force (вход, собственная сдача) — без пауз. me (доступ к занятиям) обновляется всегда — при любом состоянии очереди.
//   Пока идёт отправка работ этого студента (isBusy: запрос в полёте или ждёт повтор, не дольше нескольких сбоев подряд),
//   тяжёлый запрос оценок пропускается — сдаче достаётся мощность сервера.
export const REFRESH_MS = 15000;

export function createAccountRefresh({ api, store, gate, isBusy = () => false, onAuth = () => {}, now = () => Date.now() }) {
  let refreshing = null; // { token, promise }
  let lastRefresh = { token: null, at: 0 };
  return function refreshAccount({ force = false } = {}) {
    const s = store.session();
    if (!s) return Promise.resolve(false);
    const token = s.token;
    const sid = s.student.id;
    if (refreshing && refreshing.token === token) return refreshing.promise;
    if (!force && lastRefresh.token === token && now() - lastRefresh.at < REFRESH_MS) return Promise.resolve(false);
    lastRefresh = { token, at: now() };
    const same = () => !!store.session() && store.session().token === token;
    const entry = { token, promise: null };
    entry.promise = (async () => {
      let tookGrades = false;
      try {
        const before = JSON.stringify([store.me(), store.grades(), store.profile()]);
        const m = await api.me();
        if (!same()) return false;
        store.setSession({ token, student: m.student });
        store.setMe({ student: m.student, access: m.access });
        if ((force || !isBusy()) && gate.take('grades', sid, force)) {
          tookGrades = true;
          try {
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
        if (refreshing === entry) refreshing = null;
      }
    })();
    refreshing = entry;
    return entry.promise;
  };
}
