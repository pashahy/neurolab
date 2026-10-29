// «Что подтянуть»: чистая логика блока профиля. Сервер (действие myWeakSpots) отдаёт ПЗ и задания,
// где студент чаще ошибается по своим сдачам; здесь ответ проверяется, подписывается и превращается в ссылки.

const DISCS = ['dup01', 'dup03'];
const MAX_LESSONS = 8;
const MAX_TASKS = 5;

// Ответ сервера -> [{ d, n, title, attempts, errPct, href, tasks: [{ id, type, tries, wrong, avgPct }] }].
// Негодные записи отбрасываются; ПЗ без заданий с ошибками не показываются.
export function normalizeWeakSpots(resp) {
  if (!resp || resp.ok !== true || !Array.isArray(resp.lessons)) return [];
  const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const out = [];
  resp.lessons.forEach(l => {
    if (!l || !DISCS.includes(l.d)) return;
    const n = Number(l.n);
    if (!Number.isInteger(n) || n < 1 || !Array.isArray(l.tasks)) return;
    const tasks = l.tasks.filter(t => t && t.id != null && num(t.wrong) > 0 && num(t.tries) > 0).slice(0, MAX_TASKS).map(t => ({
      id: String(t.id),
      type: String(t.type || ''),
      tries: num(t.tries),
      wrong: num(t.wrong),
      avgPct: Math.min(100, Math.max(0, Math.round(num(t.avgPct)))),
    }));
    if (!tasks.length) return;
    out.push({
      d: l.d, n, title: String(l.title || ''), attempts: num(l.attempts),
      errPct: Math.min(100, Math.max(0, Math.round(num(l.errPct)))),
      href: lessonHref(l.d, n), tasks,
    });
  });
  return out.slice(0, MAX_LESSONS);
}

export const lessonHref = (d, n) => `#/d/${d}/${n}`;

// Подпись задания без текста занятия: «Задание N» по числу в id, иначе сам id.
export function taskLabel(id) {
  const m = /(\d+)\s*$/.exec(String(id));
  return m ? `Задание ${Number(m[1])}` : `Задание ${id}`;
}

// «ошибся 2 из 3 попыток»
export function triesText(t) {
  return `ошибок: ${t.wrong} из ${t.tries}`;
}

// Подпись задания из текста занятия (по возможности): поля формулировки у разных типов разные, берём первое строковое.
// warmupFn (необязательно) — разминочные задания v4: без текста они подписываются «Разминка, вопрос N».
export function taskCaption(task, lesson, allTasksFn, warmupFn) {
  try {
    const warm = warmupFn ? warmupFn(lesson) || [] : [];
    const t = (allTasksFn(lesson) || []).concat(warm).find(x => x && String(x.id) === task.id);
    const raw = t && [t.title, t.prompt, t.q, t.question, t.text].find(v => typeof v === 'string' && v.trim());
    if (raw) {
      const s = raw.replace(/\s+/g, ' ').trim();
      return s.length > 80 ? s.slice(0, 79) + '…' : s;
    }
    const w = warm.findIndex(x => x && String(x.id) === task.id);
    if (w >= 0) return `Разминка, вопрос ${w + 1}`;
  } catch (e) { /* без текста занятия */ }
  return taskLabel(task.id);
}

// Запрос блока: список ПЗ или null (нет связи, старый сервер, ошибка) — блок тогда скрывается.
export async function fetchWeakSpots(api) {
  try {
    return normalizeWeakSpots(await api.call('myWeakSpots'));
  } catch (e) {
    return null;
  }
}
