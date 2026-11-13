import { postJson } from './http.js';
import { h } from './util/dom.js';
import { API_URL } from './config.js';

// No account, token or password is read or sent. An unknown action has no server-side effect.
export async function checkConnection(url, fetchFn = (...args) => fetch(...args), timeoutMs = 10000) {
  const results = [];
  for (const method of ['GET', 'POST']) {
    const start = Date.now();
    try {
      let data;
      if (method === 'POST') data = await postJson(fetchFn, url, { action: '__connection_probe__' }, timeoutMs);
      else {
        let timer;
        const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
        try {
          data = await Promise.race([
            (async () => {
              const response = await fetchFn(url, { cache: 'no-store', credentials: 'omit', signal: ctrl?.signal });
              if (!response.ok) throw Object.assign(new Error('HTTP'), { httpStatus: response.status });
              try { return await response.json(); } catch { throw Object.assign(new Error('JSON'), { badResponse: true }); }
            })(),
            new Promise((_, reject) => { timer = setTimeout(() => { ctrl?.abort(); reject(Object.assign(new Error('timeout'), { timeout: true })); }, timeoutMs); }),
          ]);
        } finally { clearTimeout(timer); }
      }
      const valid = method === 'GET' ? data?.ok === true && data.service === 'НейроЛаб' : data?.ok === false && data.error === 'unknown action';
      results.push({ method, result: valid ? 'ok' : 'unexpected', ms: Date.now() - start });
    } catch (e) {
      results.push({ method, result: e.timeout ? 'timeout' : e.badResponse ? 'unexpected' : e.httpStatus ? `HTTP ${e.httpStatus}` : 'network', ms: Date.now() - start });
    }
  }
  return results;
}

export function connectionCheck() {
  const output = h('p', { class: 'hint', role: 'status' });
  const btn = h('button', { type: 'button', class: 'btn ghost small' }, 'Проверить соединение');
  const box = h('div', {}, btn, output);
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    output.textContent = 'Проверяем доступ к серверу без логина и пароля…';
    const results = await checkConnection(API_URL);
    const labels = { ok: 'доступен', timeout: 'таймаут', network: 'обрыв связи или блокировка браузером/сетью', unexpected: 'неожиданный ответ' };
    const details = results.map(r => `${r.method}: ${labels[r.result] || r.result} (${(r.ms / 1000).toFixed(1)} с)`).join('; ');
    output.textContent = details + '. ' + (results.every(r => r.result === 'ok')
      ? 'Сервер сейчас доступен. Если вход не работает, передайте преподавателю время ошибки и этот результат.'
      : 'Передайте преподавателю этот результат. На этом же компьютере сравните другой браузер и подключение через точку доступа телефона. Проверить нужно доступ к script.google.com и script.googleusercontent.com.');
    btn.disabled = false;
  });
  return box;
}
