import { DEFAULT_TIMEOUT_MS } from './net-config.js';

// Таймауты — в net-config.js (общий новый файл); здесь повторно экспортируются для удобства тестов
export { DEFAULT_TIMEOUT_MS, SUBMIT_TIMEOUT_MS } from './net-config.js';

// POST text/plain с таймаутом (AbortSignal.timeout нет на старых телефонах).
// Ошибка таймаута помечена e.timeout = true, ответ не-2xx — e.httpStatus.
export async function postJson(fetchFn, url, body, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  let timedOut = false;
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      const error = new Error('Сервер не ответил вовремя');
      error.timeout = true;
      if (ctrl) ctrl.abort();
      reject(error);
    }, timeoutMs);
  });
  try {
    const request = (async () => {
      const res = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined });
      if (!res.ok) { const err = new Error(`HTTP ${res.status}`); err.httpStatus = res.status; throw err; }
      try { return await res.json(); } catch (e) { if (e && typeof e === 'object') e.badResponse = true; throw e; }
    })();
    return await Promise.race([request, deadline]);
  } catch (e) {
    if (timedOut && e && typeof e === 'object') e.timeout = true;
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
