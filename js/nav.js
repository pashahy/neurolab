// Чистые функции навигации (без DOM и хранилища) — их проверяют юнит-тесты.

// Возвращаться после входа можно только на внутренний маршрут, но не на сам экран входа.
export const safeNext = n => (typeof n === 'string' && n.charAt(0) === '/' && n.slice(0, 2) !== '//' && n.indexOf('/login') !== 0 ? n : '/');

// Студент сессии изменился (выход или вход другого студента в соседней вкладке)? prev/cur — id студента или null.
export const identityChanged = (prev, cur) => (prev == null ? null : prev) !== (cur == null ? null : cur);

// Куда вернуть студента после входа, если сессия истекла на маршруте `path` (например, '/d/dup01/3').
// - в занятии: туда же, если есть черновик или занятие ещё не сдано (stage не finished);
// - на карту курса — только сразу после сдачи (работа ушла в очередь, черновик очищен);
// - остальные маршруты возвращаются как есть.
// state: { draft: есть ли сохранённый черновик этого занятия, submitted: работа только что сдана }
export function expiryNext(path, { draft = false, submitted = false } = {}) {
  const p = String(path || '/').split('?')[0].split('/').filter(Boolean);
  if (p[0] === 'd' && p[1] && p[2]) {
    return submitted && !draft ? `/d/${p[1]}` : `/d/${p[1]}/${p[2]}`;
  }
  return p.length ? `/${p.join('/')}` : '/';
}
