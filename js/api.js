import { postJson } from './http.js';

const COMMENT_KEY = /^[a-z0-9]+\/\d{1,3}$/;

export function createApi({ url, fetchFn = (...a) => fetch(...a), getToken = () => null, getAdminToken = () => null, now = () => Date.now() }) {
  async function request(action, body, token) {
    if (!url) throw new Error('Адрес сервера не настроен');
    const payload = Object.assign({}, body, { action });
    if (token) payload.token = token;
    let data;
    try { data = await postJson(fetchFn, url, payload); } catch (e) {
      // сеть, таймаут, не-2xx — не ответ сервера; экраны показывают «Нет связи» по этому признаку
      const err = new Error(e && e.message ? e.message : 'Нет связи с сервером');
      err.network = true;
      throw err;
    }
    if (!data.ok) {
      const err = new Error(data.error || 'Ошибка сервера');
      if (data.auth) err.auth = true;
      if (data.busy === true) err.busy = true; // сервер занят (блокировка таблицы): экраны показывают понятный текст
      throw err;
    }
    return data;
  }
  const call = (action, body) => request(action, body, getToken());
  const admin = (action, body) => request(action, body, getAdminToken());
  // Комментарии преподавателя группе из последнего ответа myGrades: { 'dup03/21': текст }. Привязаны к токену студента
  // (после смены сессии чужие не показываются); в хранилище не пишутся — при перезагрузке придут с первым же myGrades.
  let commentsCache = { token: null, at: 0, comments: {} };
  const cleanComments = c => {
    const out = {};
    if (c && typeof c === 'object' && !Array.isArray(c)) {
      Object.keys(c).forEach(k => { if (COMMENT_KEY.test(k) && typeof c[k] === 'string' && c[k].trim()) out[k] = c[k]; });
    }
    return out;
  };
  // одновременные вызовы (несколько карточек комментария, обновление аккаунта) делят один запрос на токен
  let gradesInFlight = null; // { token, promise }
  const myGrades = () => {
    const token = getToken();
    if (gradesInFlight && gradesInFlight.token === token) return gradesInFlight.promise;
    const entry = { token, promise: null };
    entry.promise = (async () => {
      try {
        const d = await call('myGrades');
        commentsCache = { token, at: now(), comments: cleanComments(d.comments) };
        return d.grades;
      } finally {
        if (gradesInFlight === entry) gradesInFlight = null;
      }
    })();
    gradesInFlight = entry;
    return entry.promise;
  };
  return {
    call,
    admin,
    // панель преподавателя v4: сводка занятия и комментарий группе (поля discipline и lesson, не d и n)
    adminLessonSummary: ({ group, discipline, lesson }) => admin('adminLessonSummary', { group, discipline, lesson }),
    adminGroupComment: ({ group, discipline, lesson, text }) => admin('adminGroupComment', { group, discipline, lesson, text }),
    // комментарии группы текущего студента: из кэша (синхронно) или свежие, если кэш старше maxAgeMs
    groupComments: () => (commentsCache.token !== null && commentsCache.token === getToken() ? commentsCache.comments : {}),
    myComments: async maxAgeMs => {
      const fresh = commentsCache.token !== null && commentsCache.token === getToken() && now() - commentsCache.at < maxAgeMs;
      if (!fresh) await myGrades();
      return commentsCache.token === getToken() ? commentsCache.comments : {};
    },
    // файлы студентов и хранилище (админ-панель): подписанная ссылка на чтение, настройки, тестовая загрузка
    adminFileUrl: params => admin('adminFileUrl', params),
    adminStorage: () => admin('adminStorage'),
    adminSetStorage: params => admin('adminSetStorage', params),
    adminCheckUpload: () => admin('adminCheckUpload'),
    login: (login, password) => request('login', { login, password }),
    setPassword: (login, oneTime, newPassword) => request('setPassword', { login, oneTime, newPassword }),
    me: () => call('me'),
    logout: () => call('logout'),
    rating: async () => {
      const d = await call('rating');
      return { top: d.top, me: d.me, total: d.total };
    },
    myGrades,
    // прогресс студента с сервера {ok, studentId, progress, xp, days}; старый сервер без myProgress — null
    // (сбой сети и истёкшая сессия — исключение, как у остальных запросов)
    myProgress: async () => {
      try { return await call('myProgress'); } catch (e) {
        if (!e.network && !e.auth && e.message === 'unknown action') return null;
        throw e;
      }
    },
    // форма загрузки файла в хранилище; отказ сервера — {ok:false, error} (сбой сети — исключение с network)
    uploadUrl: async params => {
      try { return await call('uploadUrl', params); } catch (e) {
        if (e.network) throw e;
        const r = { ok: false, error: e.message };
        if (e.auth) r.auth = true;
        return r;
      }
    },
  };
}
