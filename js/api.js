import { postJson } from './http.js';

export function createApi({ url, fetchFn = (...a) => fetch(...a), getToken = () => null, getAdminToken = () => null }) {
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
      throw err;
    }
    return data;
  }
  const call = (action, body) => request(action, body, getToken());
  const admin = (action, body) => request(action, body, getAdminToken());
  return {
    call,
    admin,
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
    myGrades: async () => (await call('myGrades')).grades,
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
