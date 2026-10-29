// «Отработать»: чистая логика блока студента. Сервер (действие myDebts) отдаёт долги преподавателя со статусами;
// здесь ответ проверяется, сортируется и превращается в ссылки и подписи.

const DISCS = ['dup01', 'dup03'];
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const debtHref = (d, n) => `#/d/${d}/${n}`;

// Ответ сервера -> [{ d, n, due, status, done, overdue, comment, href }]: сначала невыполненные (по сроку, затем по номеру), сданные в конце.
export function normalizeDebts(resp) {
  if (!resp || resp.ok !== true || !Array.isArray(resp.debts)) return [];
  const out = [];
  resp.debts.forEach(x => {
    if (!x || !DISCS.includes(x.d) || typeof x.due !== 'string' || !DATE_RE.test(x.due)) return;
    const n = Number(x.n);
    if (!Number.isInteger(n) || n < 1) return;
    const status = ['open', 'overdue', 'done', 'doneLate'].includes(x.status) ? x.status : 'open';
    const done = status === 'done' || status === 'doneLate';
    out.push({ d: x.d, n, due: x.due, status, done, overdue: status === 'overdue', comment: typeof x.comment === 'string' ? x.comment : '', href: debtHref(x.d, n) });
  });
  return out.sort((a, b) => (a.done - b.done) || (a.due < b.due ? -1 : a.due > b.due ? 1 : 0) || a.n - b.n).slice(0, 50);
}

export const dueLabel = due => { const m = DATE_RE.exec(due); return m ? `${m[3]}.${m[2]}` : due; };

// Подпись срока: «до 30.10», «срок прошёл: 01.10», «сдано», «сдано после срока».
export function debtLabel(x) {
  if (x.status === 'doneLate') return 'сдано после срока';
  if (x.done) return 'сдано';
  return x.overdue ? `срок прошёл: ${dueLabel(x.due)}` : `до ${dueLabel(x.due)}`;
}

export const openDebtsCount = list => list.filter(x => !x.done).length;

// Долг по ПЗ (пока он есть в листе, сервер принимает сдачу даже закрытого для группы ПЗ).
export function debtForLesson(list, d, n) {
  return (list || []).find(x => x.d === d && x.n === Number(n)) || null;
}

// Список долгов в памяти страницы (его загружает главная): экран занятия не ждёт сеть ради открытого ПЗ.
// Привязан к логину и живёт CACHE_MS; новый долг, назначенный позже, экран занятия найдёт запросом к сети (закрытое ПЗ).
const CACHE_MS = 5 * 60 * 1000;
let cache = { who: null, at: 0, list: null };
export function cachedDebts(who, now = Date.now()) {
  return cache.list && cache.who === who && now - cache.at < CACHE_MS ? cache.list : null;
}
export function resetDebtsCache() { cache = { who: null, at: 0, list: null }; }

// Запрос: список долгов или null (нет связи, старый сервер, ошибка) — блок тогда скрывается.
export async function fetchDebts(api, who) {
  try {
    const list = normalizeDebts(await api.call('myDebts'));
    if (who !== undefined) cache = { who, at: Date.now(), list };
    return list;
  } catch (e) {
    return null;
  }
}

// Долг по ПЗ для экрана занятия: null — долга нет или не удалось узнать. Сеть — только если needNet (ПЗ закрыто или у группы
// прошёл срок) и в памяти долга нет; для открытого в срок ПЗ берётся то, что есть в памяти, без ожидания.
export async function lessonDebt(api, who, d, n, needNet) {
  let debt = debtForLesson(cachedDebts(who), d, n);
  if (!debt && needNet) debt = debtForLesson(await fetchDebts(api, who), d, n);
  return debt;
}
