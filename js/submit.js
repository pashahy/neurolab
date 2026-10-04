import { postJson } from './http.js';

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
}) {
  let chain = Promise.resolve();
  let timer = null;

  // очередь общая, но отправляем только сдачи вошедшего студента
  const mine = () => { const sid = getStudentId(); return sid ? store.queue().filter(q => q.studentId === sid) : []; };

  // true — сервер принял или отверг сдачу; false — сессия недействительна
  async function send(item) {
    if (!url) throw new Error('Адрес сервера не настроен');
    const data = await postJson(fetchFn, url, { action: 'submit', token: getToken(), submission: item });
    if (data.auth) return false;
    if (!data.ok && !data.reject) throw new Error(data.error || 'Ошибка сервера');
    return true;
  }

  // после сбоя пробуем ещё раз через retryMs; одновременно ждёт только один таймер
  function scheduleRetry() {
    if (timer !== null) return;
    timer = setTimeout(() => { timer = null; if (mine().length) self.flush(); }, retryMs);
    if (typeof timer?.unref === 'function') timer.unref(); // в Node не держим процесс открытым
  }

  async function drain() {
    const sid = getStudentId();
    for (const item of mine()) {
      if (getStudentId() !== sid) return; // сессия сменилась посреди отправки — чужой токен не используем
      let ok;
      try { ok = await send(item); } catch { scheduleRetry(); return; }
      if (!ok) { // сдача остаётся в очереди до нового входа
        // оповещаем, только если вошедший студент всё ещё владелец отправлявшейся сдачи; сбой обработчика не должен ломать очередь
        if (getStudentId() === item.studentId) { try { onAuthRequired(); } catch (e) { console.error(e); } }
        return;
      }
      store.dequeue(item.id);
    }
  }

  const self = {
    flush() { chain = chain.then(drain, drain); return chain; },
    async submit(item) {
      if (!getStudentId()) return { sent: false, error: 'no session' }; // без сессии работу некому отправить — не копим в очереди
      const entry = item.studentId ? item : Object.assign({}, item, { studentId: getStudentId() });
      store.enqueue(entry);
      await self.flush();
      return { sent: !store.queue().some(q => q.id === entry.id) };
    },
    pending: () => mine().length,
    pendingOthers: () => store.queue().length - mine().length,
  };
  return self;
}
