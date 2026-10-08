// Загрузка файла для задания `file`: сервер выдаёт подписанную форму (действие uploadUrl),
// браузер отправляет файл прямо в хранилище (POST-форма: сначала поля, файл последним под именем file).
// Ошибки — Error с текстом для студента.

// Белый список расширений — как MIME_BY_EXT_ в apps-script/Code.gs (спецификация §6.1).
export const FILE_EXTS = ['xlsx', 'xls', 'csv', 'py', 'ipynb', 'docx', 'pdf', 'png', 'jpg', 'jpeg', 'txt', 'md', 'zip'];
export const MAX_FILE_MB = 5;
const MB = 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 120000;
const MAX_NAME = 120;

export const UPLOAD_MSG = {
  tooBig: mb => `Файл больше ${mb} МБ`,
  empty: 'Файл пустой',
  ext: 'Этот формат не принимается',
  off: 'Загрузка файлов пока не подключена — сообщите преподавателю',
  offline: 'Нужен интернет, чтобы загрузить файл',
  noAnswer: 'Сервер не ответил, попробуйте ещё раз',
  failed: 'Не удалось загрузить файл, попробуйте ещё раз',
  limit: 'Слишком много загрузок за сегодня — попробуйте завтра',
  auth: 'Войдите снова, чтобы загрузить файл',
  unknownLesson: 'Этого ПЗ пока нет на сервере — загрузить файл нельзя. Попробуйте позже или сообщите преподавателю',
  lessonClosed: 'ПЗ сейчас закрыто преподавателем — загрузить файл нельзя',
  noTable: 'Сервер сейчас не может проверить ПЗ — попробуйте загрузить файл чуть позже',
};

export function fileExt(name) {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

// Расширения задания (только из белого списка); без списка — весь белый список.
export function allowedExts(accept) {
  const list = Array.isArray(accept) ? accept.filter(e => FILE_EXTS.includes(e)) : [];
  return list.length ? list : FILE_EXTS.slice();
}

// Предел размера задания в МБ: maxMb, но не больше 5.
export function limitMb(maxMb) {
  return typeof maxMb === 'number' && maxMb > 0 ? Math.min(maxMb, MAX_FILE_MB) : MAX_FILE_MB;
}

// Проверка до обращения к серверу: '' — файл подходит, иначе текст ошибки.
export function checkFile(file, { accept, maxMb } = {}) {
  const ext = fileExt(file && file.name);
  if (!ext || !allowedExts(accept).includes(ext)) return UPLOAD_MSG.ext;
  const size = Number(file.size);
  if (!(size > 0)) return UPLOAD_MSG.empty;
  const mb = limitMb(maxMb);
  if (size > mb * MB) return UPLOAD_MSG.tooBig(mb);
  return '';
}

// Имя файла для ответа: без пути, не длиннее MAX_NAME символов.
export const cleanName = name => String(name || '').split(/[\\/]/).pop().slice(0, MAX_NAME);

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const fail = (message, extra) => Object.assign(new Error(message), extra || {});

// Ответы сервера -> текст для студента. 'unknown action' — скрипт таблицы ещё не обновлён до v3 (нет uploadUrl).
const SERVER_ERRORS = {
  'storage off': UPLOAD_MSG.off,
  'unknown action': UPLOAD_MSG.off,
  'bad ext': UPLOAD_MSG.ext,
  'bad size': UPLOAD_MSG.tooBig(MAX_FILE_MB),
  limit: UPLOAD_MSG.limit,
  // ПЗ проверяется по таблице баллов с сайта и доступу группы (как при сдаче)
  'unknown lesson': UPLOAD_MSG.unknownLesson,
  'lesson closed': UPLOAD_MSG.lessonClosed,
  'no table': UPLOAD_MSG.noTable,
};
const serverError = code => (typeof code === 'string' && Object.prototype.hasOwnProperty.call(SERVER_ERRORS, code) ? SERVER_ERRORS[code] : UPLOAD_MSG.failed);

// api — createApi(...) (нужен api.uploadUrl); fetchFn — fetch.
// Возвращает ответ задания { key, name, size, ext, uploadedAt }.
export async function uploadFile(api, { discipline, lesson, taskId, file, accept, maxMb }, fetchFn = (...a) => fetch(...a)) {
  const problem = checkFile(file, { accept, maxMb });
  if (problem) throw fail(problem);
  if (isOffline()) throw fail(UPLOAD_MSG.offline);
  const ext = fileExt(file.name);
  const size = Number(file.size);
  let form;
  try {
    form = await api.uploadUrl({ discipline, lesson, taskId, ext, size });
  } catch (e) {
    // network — нет ответа от Apps Script: сеть пропала, таймаут или 5xx. Про интернет говорим, только если браузер офлайн.
    if (e && e.network) throw fail(isOffline() ? UPLOAD_MSG.offline : UPLOAD_MSG.noAnswer);
    throw fail(UPLOAD_MSG.failed);
  }
  if (!form || !form.ok) {
    if (form && form.auth) throw fail(UPLOAD_MSG.auth, { auth: true });
    throw fail(serverError(form && form.error));
  }
  let res;
  try {
    res = await postUploadForm(form, file, fetchFn);
  } catch (e) {
    throw fail(isOffline() ? UPLOAD_MSG.offline : UPLOAD_MSG.failed);
  }
  if (!uploadOk(res)) throw fail(UPLOAD_MSG.failed);
  return { key: form.key, name: cleanName(file.name), size, ext, uploadedAt: new Date().toISOString() };
}

// Хранилище приняло файл: 204 (без success_action_status) или 200.
export const uploadOk = res => !!res && (res.status === 204 || res.status === 200);

// POST подписанной формы {url, fields} в хранилище: сначала поля по порядку, файл последним под именем file
// (поля после файла хранилище не читает). fileName — имя части файла, если file — Blob без имени.
// Возвращает Response; сбой сети, CORS или таймаут — исключение fetch (AbortError при таймауте).
export async function postUploadForm(form, file, fetchFn = (...a) => fetch(...a), { fileName, timeoutMs = UPLOAD_TIMEOUT_MS } = {}) {
  const fd = new FormData();
  const fields = form.fields || {};
  Object.keys(fields).forEach(k => fd.append(k, fields[k]));
  if (fileName) fd.append('file', file, fileName);
  else fd.append('file', file);
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    return await fetchFn(form.url, { method: 'POST', body: fd, signal: ctrl ? ctrl.signal : undefined });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---------- проверка хранилища из админ-панели (вкладка «Настройки») ----------

const CHECK_TIMEOUT_MS = 30000;
const S3_HINTS = {
  SignatureDoesNotMatch: 'подпись не совпала — проверьте секретный ключ',
  InvalidAccessKeyId: 'хранилище не знает такой ID ключа — проверьте ID ключа',
  AccessDenied: 'нет доступа — проверьте роль storage.editor у сервисного аккаунта на этот бакет',
  NoSuchBucket: 'бакет не найден — проверьте имя бакета',
  RequestTimeTooSkewed: 'часы сервера и хранилища расходятся — попробуйте позже',
};
export const CHECK_MSG = {
  ok: 'Хранилище работает',
  off: 'Хранилище не подключено: сначала сохраните ключи',
  cors: what => `Браузер не смог ${what}: проверьте CORS-правило бакета (см. инструкцию) и подключение к интернету`,
  timeout: 'Хранилище не ответило за 30 секунд — попробуйте ещё раз',
  mismatch: 'Файл загрузился, но прочитано другое содержимое — попробуйте ещё раз',
};

// Код ошибки из XML-ответа хранилища (<Code>…</Code>). Берём только код — сообщение и прочие поля
// (запрос, подпись) в текст ошибки не попадают.
async function s3Code(res) {
  try {
    const m = /<Code>([A-Za-z]{1,64})<\/Code>/.exec(await res.text());
    return m ? m[1] : '';
  } catch (e) { return ''; }
}
async function rejected(res, what) {
  const code = await s3Code(res);
  const hint = code && S3_HINTS[code];
  return `Хранилище отклонило ${what} (${code || `HTTP ${res.status}`})${hint ? `: ${hint}` : ''}`;
}
async function withTimeout(fetchFn, url, opts) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), CHECK_TIMEOUT_MS) : null;
  try {
    return await fetchFn(url, Object.assign({}, opts, { signal: ctrl ? ctrl.signal : undefined }));
  } finally {
    if (timer) clearTimeout(timer);
  }
}
const netFail = (e, what) => (e && e.name === 'AbortError' ? CHECK_MSG.timeout : CHECK_MSG.cors(what));

// Сервер выдаёт форму для nl/_check/<мс>.txt (adminCheckUpload); браузер загружает файл в 1 байт
// и читает его по GET-ссылке. Результат — { ok, message }; ошибки сервера с auth/network пробрасываются
// (их показывает админ-панель). Секретов в тексте нет: только коды ошибок хранилища и статусы.
export async function checkStorage(api, fetchFn = (...a) => fetch(...a)) {
  let form;
  try { form = await api.adminCheckUpload(); } catch (e) {
    if (e && (e.auth || e.network)) throw e;
    return { ok: false, message: e && e.message === 'storage off' ? CHECK_MSG.off : String((e && e.message) || 'Ошибка сервера') };
  }
  const body = 'abcdefghijklmnopqrstuvwxyz'.charAt(Math.floor(Math.random() * 26)); // 1 байт
  const blob = new Blob([body], { type: 'text/plain' });
  let res;
  try {
    res = await postUploadForm(form, blob, fetchFn, { fileName: 'check.txt', timeoutMs: CHECK_TIMEOUT_MS });
  } catch (e) { return { ok: false, message: netFail(e, 'отправить файл в хранилище') }; }
  if (!uploadOk(res)) return { ok: false, message: await rejected(res, 'загрузку') };
  try {
    res = await withTimeout(fetchFn, form.getUrl, { method: 'GET', cache: 'no-store' });
  } catch (e) { return { ok: false, message: netFail(e, 'прочитать файл из хранилища') }; }
  if (res.status !== 200) return { ok: false, message: await rejected(res, 'чтение файла') };
  let got = null;
  try { got = await res.text(); } catch (e) { /* ниже — несовпадение */ }
  return got === body ? { ok: true, message: CHECK_MSG.ok } : { ok: false, message: CHECK_MSG.mismatch };
}
