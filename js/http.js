import { DEFAULT_TIMEOUT_MS } from './net-config.js';

// Таймауты — в net-config.js (общий новый файл); здесь повторно экспортируются для удобства тестов
export { DEFAULT_TIMEOUT_MS, SUBMIT_TIMEOUT_MS } from './net-config.js';

// POST text/plain с таймаутом (AbortSignal.timeout нет на старых телефонах).
// Ошибка таймаута помечена e.timeout = true, ответ не-2xx — e.httpStatus.
export async function postJson(fetchFn, url, body, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  let timedOut = false;
  const timer = ctrl ? setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs) : null;
  try {
    const res = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined });
    if (!res.ok) { const err = new Error(`HTTP ${res.status}`); err.httpStatus = res.status; throw err; }
    return await res.json();
  } catch (e) {
    if (timedOut && e && typeof e === 'object') e.timeout = true;
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
