// Тексты и чистые функции отправки работ. Файл НОВЫЙ намеренно: у сайта нет версионирования, и в кэше телефона может остаться
// старая копия submit.js рядом с новыми экранами. Всё, что добавлено этим исправлением, лежит здесь, а submit.js лишь
// повторно экспортирует прежние имена (LIMIT_TEXT, holdText, rejectText, HOLD_TEXT) — именованный импорт нового имени из
// старой копии submit.js был бы ошибкой компоновки и положил бы весь сайт.

// что видит студент, когда сервер отложил сдачу из-за суточного лимита
export const LIMIT_TEXT = 'Сегодня отправлено слишком много работ — попытка сохранена и уйдёт завтра';
// сервер отложил сдачу (hold): работа остаётся в очереди и уйдёт при следующем запуске сайта или по «Отправить сейчас»
export const HOLD_TEXT = {
  'unknown lesson': 'Это ПЗ ещё не появилось на сервере — работа сохранена и уйдёт позже',
  'lesson day limit': 'На сегодня исчерпан предел попыток этого ПЗ — работа сохранена и уйдёт завтра',
  'lesson closed': 'ПЗ сейчас закрыто преподавателем — работа сохранена и уйдёт, когда его откроют',
  // скрипт таблицы ещё без действия homeworkSubmit (ДЗ): работа ждёт в очереди, пока сервер не обновят
  'unknown action': 'Сервер ещё не обновлён — ДЗ сохранено и уйдёт, когда его обновят',
};
export const holdText = reason => (Object.prototype.hasOwnProperty.call(HOLD_TEXT, reason) ? HOLD_TEXT[reason] : 'Сервер пока не принимает эту работу — она сохранена и уйдёт позже');

// причины отказа сервера (reject: true — сдача повреждена, повторять бессмысленно) понятными словами
const REJECT_TEXT = {
  'no submission': 'пустая сдача', 'missing id': 'нет номера сдачи', 'bad id': 'неверный номер сдачи',
  'unknown discipline': 'неизвестная дисциплина', 'bad lesson': 'неверный номер ПЗ', 'bad submittedAt': 'неверное время сдачи',
  'bad score': 'неверные баллы', 'bad max': 'неверные баллы', 'bad manualMax': 'неверные баллы',
  'bad variant': 'неверный вариант практики', 'bad json': 'повреждённые данные', 'unknown action': 'устаревшая версия сайта',
  'bad v4': 'повреждённые данные этапов занятия', 'hw limit': 'попытки домашнего задания закончились',
  'no homework': 'у этого занятия нет домашнего задания', 'bad homework': 'повреждённые данные домашнего задания',
  'bad level': 'неверный уровень домашнего задания',
};
export const rejectText = error => (typeof error === 'string' && Object.prototype.hasOwnProperty.call(REJECT_TEXT, error)
  ? REJECT_TEXT[error] : `ошибка данных (${typeof error === 'string' && error ? error : 'без описания'})`);

// сервер занят (busy), не успел ответить — работа в очереди, отправка повторяется сама
export const OVERLOAD_TEXT = 'Сервер перегружен — отправим автоматически. Не закрывайте страницу и не очищайте данные браузера';
// запрос вообще не дошёл до сервера (нет интернета)
export const OFFLINE_TEXT = 'Нет связи с сервером — отправим автоматически, когда она появится. Не закрывайте страницу и не очищайте данные браузера';
// ответ пришёл, но это не JSON сервера (например, HTML-страница ошибки Google)
export const BAD_REPLY_TEXT = 'сервер вернул не тот ответ';

// Повторы отправки: экспоненциальная пауза со случайным разбросом, чтобы класс не стучался на сервер «волнами».
// Верх паузы после n-го подряд сбоя: min(CAP, BASE · FACTOR^(n-1)); пауза — случайно от половины верха до верха:
// 4–8 с, 7–14 с, 12–23 с, 20–39 с, 30–60 с, дальше 30–60 с. Удачная отправка обнуляет счётчик сбоев.
export const RETRY = { baseMs: 8000, factor: 1.7, capMs: 60000 };
export function retryDelay(failures, random = Math.random, { baseMs, factor, capMs } = RETRY) {
  const top = Math.min(capMs, baseMs * Math.pow(factor, Math.max(0, failures - 1)));
  const r = Math.min(1, Math.max(0, Number(random()) || 0));
  return Math.round(top * (0.5 + 0.5 * r));
}
// «Отправить сейчас»: повторное нажатие раньше чем через столько мс игнорируется (и в отправителе, и на кнопках)
export const MANUAL_COOLDOWN_MS = 5000;
// Пока отправка в повторах, тяжёлые фоновые запросы (оценки, прогресс) откладываются — но не дольше стольких сбоев подряд:
// постоянно падающая работа не должна замораживать оценки и прогресс навсегда
export const MAX_QUIET_FAILURES = 5;

// Последняя ошибка работы коротко и честно (для строки диагностики); текст сервера — как есть
export function errorLabel(kind, error) {
  if (kind === 'network') return 'нет связи с сервером';
  if (kind === 'timeout') return 'сервер не ответил вовремя';
  if (kind === 'busy') return error && error !== 'busy' ? `сервер занят (${error})` : 'сервер занят';
  if (kind === 'server') return error || 'ошибка сервера';
  if (kind === 'hold') return `работа отложена (${error || 'hold'})`;
  if (kind === 'limit') return 'суточный лимит сервера';
  return '—';
}
// «ПЗ №N (дисциплина) · попыток отправки K · последняя ошибка: …»; сдача ДЗ (d.hw) — «ДЗ к ПЗ №N …»
export function diagLine(d) {
  const disc = typeof d.discipline === 'string' ? d.discipline.toUpperCase().replace('DUP', 'ДУП.') : '?';
  if (d.sbx === 'tree' || d.sbx === 'quest') return `${d.sbx === 'tree' ? 'Дерево навыков' : 'Квест'} · попыток отправки ${d.attempts} · последняя ошибка: ${errorLabel(d.kind, d.error)}`;
  if (d.sbx) return `Задача дня (${{ term: 'терминал', api: 'API', prompt: 'промпт' }[d.sbx] || 'Python'}) · попыток отправки ${d.attempts} · последняя ошибка: ${errorLabel(d.kind, d.error)}`;
  return `${d.hw ? 'ДЗ к ПЗ' : 'ПЗ'} №${d.lesson} (${disc}) · попыток отправки ${d.attempts} · последняя ошибка: ${errorLabel(d.kind, d.error)}`;
}

// Что сказать студенту о причине: нет связи / сервер перегружен / сервер не смог принять работу (текст сервера как есть)
export function failureText(kind, error) {
  if (kind === 'network') return OFFLINE_TEXT;
  if (kind === 'busy' || kind === 'timeout') return OVERLOAD_TEXT;
  if (kind === 'server') return `Сервер не смог принять работу: ${error || 'ошибка сервера'}. Покажите это сообщение преподавателю. Отправим ещё раз автоматически — не закрывайте страницу и не очищайте данные браузера`;
  return 'Работа сохранена на телефоне и ждёт отправки. Не очищайте данные браузера';
}

// Что показать студенту про работу(ы) в очереди. st — submitter.status(), queued — работа ещё в очереди,
// outcome — { sent: true } | { rejected: причина } | null (чем закончилась отправка этой работы на этом телефоне),
// hold — причина отложения (hold) или null, item — { kind, error } последняя ошибка именно этой работы
// (без него — последняя ошибка прохода из st).
// -> { kind: 'sent' | 'rejected' | 'gone' | 'sending' | 'hold' | 'limit' | 'wait', text, retryIn }; retryIn — секунд до повтора или null
// «Работа сдана» — только по записанному итогу (sent); работа, пропавшая из очереди без итога (другая вкладка), — 'gone'.
export function queuedView(st, { queued, outcome, hold, item }, now = Date.now()) {
  if (outcome && outcome.rejected !== undefined) return { kind: 'rejected', text: `Сервер не принял работу: ${rejectText(outcome.rejected)} — сообщите преподавателю.`, retryIn: null };
  if (outcome && outcome.sent) return { kind: 'sent', text: '✓ Работа сдана', retryIn: null };
  if (!queued) return { kind: 'gone', text: 'Работа ушла из очереди этого телефона (возможно, её отправила другая вкладка). Если сомневаетесь — сообщите преподавателю.', retryIn: null };
  if (hold) return { kind: 'hold', text: `${holdText(hold)}. Не очищайте данные браузера.`, retryIn: null };
  if (st.limited) return { kind: 'limit', text: `${LIMIT_TEXT}. Не очищайте данные браузера.`, retryIn: null };
  if (st.inFlight) return { kind: 'sending', text: `Отправляем… попытка ${Math.max(1, st.attempt)}`, retryIn: null };
  // в очереди одни отложенные (hold) работы: ничего не повторяется само, закрывать страницу незачем
  if (st.heldCount > 0 && st.heldCount >= st.pending) return { kind: 'hold', text: 'Ждём, когда занятие откроют или оно появится на сервере — тогда работа уйдёт (или нажмите «Отправить сейчас»).', retryIn: null };
  const retryIn = st.nextRetryAt === null ? null : Math.max(0, Math.ceil((st.nextRetryAt - now) / 1000));
  const own = item && item.kind && item.kind !== 'hold' ? item : null;
  const kind = own ? own.kind : st.lastError;
  const error = own ? own.error : st.lastErrorText;
  return { kind: 'wait', text: failureText(kind, error), retryIn };
}

// Подключён ли к экрану новый отправитель (в кэше может остаться старая копия submit.js без status/subscribe)
export const liveCapable = sub => !!sub && typeof sub.status === 'function' && typeof sub.subscribe === 'function';
