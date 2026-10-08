import { postJson } from './http.js';

const pad2 = n => (n < 10 ? '0' : '') + n;
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// что видит студент, когда сервер отложил сдачу из-за суточного лимита
export const LIMIT_TEXT = 'Сегодня отправлено слишком много работ — попытка сохранена и уйдёт завтра';
// сервер отложил сдачу (hold): работа остаётся в очереди и уйдёт при следующем запуске сайта или по «Отправить сейчас»
export const HOLD_TEXT = {
  'unknown lesson': 'Это ПЗ ещё не появилось на сервере — работа сохранена и уйдёт позже',
  'lesson closed': 'ПЗ сейчас закрыто преподавателем — работа сохранена и уйдёт, когда его откроют',
};
export const holdText = reason => (Object.prototype.hasOwnProperty.call(HOLD_TEXT, reason) ? HOLD_TEXT[reason] : 'Сервер пока не принимает эту работу — она сохранена и уйдёт позже');

// причины отказа сервера (reject: true — сдача повреждена, повторять бессмысленно) понятными словами
const REJECT_TEXT = {
  'no submission': 'пустая сдача', 'missing id': 'нет номера сдачи', 'bad id': 'неверный номер сдачи',
  'unknown discipline': 'неизвестная дисциплина', 'bad lesson': 'неверный номер ПЗ', 'bad submittedAt': 'неверное время сдачи',
  'bad score': 'неверные баллы', 'bad max': 'неверные баллы', 'bad manualMax': 'неверные баллы',
  'bad variant': 'неверный вариант практики', 'bad json': 'повреждённые данные', 'unknown action': 'устаревшая версия сайта',
};
export const rejectText = error => (typeof error === 'string' && Object.prototype.hasOwnProperty.call(REJECT_TEXT, error)
  ? REJECT_TEXT[error] : `ошибка данных (${typeof error === 'string' && error ? error : 'без описания'})`);

// variant ('phone' | 'pc') — только у занятия с вариантами практики; без него поля в сдаче нет
export function buildSubmission({ profile, discipline, lesson, answers, grade, texts, startedAt, variant, now = Date.now(), rnd = Math.random }) {
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
  return sub;
}

export function createSubmitter({
  store, url, fetchFn = (...a) => fetch(...a), retryMs = 30000,
  getToken = () => store.session()?.token ?? null,
  getStudentId = () => store.session()?.student.id ?? null,
  onAuthRequired = () => {},
  today = () => localDay(),
}) {
  let chain = Promise.resolve();
  let timer = null;
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

  // очередь общая, но отправляем только сдачи вошедшего студента
  const mine = () => { const sid = getStudentId(); return sid ? store.queue().filter(q => q.studentId === sid) : []; };

  // ответ сервера -> { kind: 'ok' | 'auth' | 'limit' | 'hold' | 'reject', error }; сбой сети и прочие ошибки — исключение
  async function send(item) {
    if (!url) throw new Error('Адрес сервера не настроен');
    const data = await postJson(fetchFn, url, { action: 'submit', token: getToken(), submission: item });
    if (data.auth) return { kind: 'auth' };
    if (data.ok) return { kind: 'ok' };
    if (data.reject) return { kind: 'reject', error: data.error };
    if (data.limit) return { kind: 'limit' };
    if (data.hold) return { kind: 'hold', error: data.error };
    throw new Error(data.error || 'Ошибка сервера');
  }

  // после сбоя пробуем ещё раз через retryMs; одновременно ждёт только один таймер
  function scheduleRetry() {
    if (timer !== null) return;
    timer = setTimeout(() => { timer = null; if (mine().length) self.flush(); }, retryMs);
    if (typeof timer?.unref === 'function') timer.unref(); // в Node не держим процесс открытым
  }

  async function drain(manual) {
    const sid = getStudentId();
    if (limited()) return;
    if (manual) held.clear();
    for (const item of mine()) {
      if (getStudentId() !== sid) return; // сессия сменилась посреди отправки — чужой токен не используем
      if (held.has(item.id)) continue;
      let r;
      try { r = await send(item); } catch { scheduleRetry(); return; }
      if (r.kind === 'limit') { limitHit = { sid, day: today() }; return; } // без таймера: до завтра повторять бессмысленно
      if (r.kind === 'hold') { held.set(item.id, r.error); continue; } // без таймера; следующие работы очереди отправляем
      if (r.kind === 'auth') { // сдача остаётся в очереди до нового входа
        // оповещаем, только если вошедший студент всё ещё владелец отправлявшейся сдачи; сбой обработчика не должен ломать очередь
        if (getStudentId() === item.studentId) { try { onAuthRequired(); } catch (e) { console.error(e); } }
        return;
      }
      if (r.kind === 'reject') rejected.set(item.id, r.error); // повреждённая сдача: убираем, но «сдано» не говорим
      store.dequeue(item.id);
    }
  }

  const self = {
    // manual: true — по кнопке «Отправить сейчас»: повторяет и отложенные (hold) работы
    flush(opts) {
      const manual = !!(opts && opts.manual);
      const run = () => drain(manual);
      chain = chain.then(run, run);
      return chain;
    },
    async submit(item) {
      if (!getStudentId()) return { sent: false, error: 'no session' }; // без сессии работу некому отправить — не копим в очереди
      const entry = item.studentId ? item : Object.assign({}, item, { studentId: getStudentId() });
      store.enqueue(entry);
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
  };
  return self;
}
