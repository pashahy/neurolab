// Подсказки к задаче дня: тексты, состояние черновика и блок «Подсказка» под условием.
import { h } from '../util/dom.js';
import { md } from '../util/text.js';
import { sandboxApi } from './api.js';
import { createSandboxStorage } from './storage.js';

export const HINT_OFFLINE_TEXT = 'Нужна сеть, чтобы открыть подсказку';
const HINT_ERRORS = {
  'no hint yet': 'Сначала сдай решение — подсказка откроется после первой неверной попытки',
  'solved': 'Задача уже решена — подсказка не нужна',
  'no more hints': 'Подсказки закончились',
  'closed': 'Игра спит до 5:00 — подсказки тоже',
  'no task': 'Эта задача дня уже недоступна',
  'not visible': 'Эта задача дня недоступна',
};

export const hintButtonText = used => (used > 0 ? '💡 Ещё подсказка (−50 % очков)' : '💡 Подсказка (−30 % очков)');
export const hintErrorText = msg => HINT_ERRORS[msg] || 'Не получилось открыть подсказку. Попробуй ещё раз';

// Состояние подсказок из черновика задачи: что открыто, была ли неверная сдача, можно ли просить ещё
export function hintsState(draft) {
  const dr = draft || {};
  const hints = Array.isArray(dr.hints) ? dr.hints.map(String) : [];
  const left = typeof dr.left === 'number' ? dr.left : null;
  const failed = !!dr.failed;
  return { hints, failed, left, canAsk: (failed || hints.length > 0) && left !== 0 };
}

// Новый черновик после ответа сервера { hint, n, left }; повтор уже открытой подсказки её не дублирует
export function applyHint(draft, reply) {
  const next = Object.assign({}, draft || {});
  const hints = Array.isArray(next.hints) ? next.hints.slice() : [];
  const i = Math.max(1, Number(reply.n) || hints.length + 1) - 1;
  hints[i] = String(reply.hint);
  next.hints = hints.filter(x => typeof x === 'string');
  next.left = Number(reply.left);
  return next;
}

// opts: { app, d, task }. Возвращает { fail() — была неверная сдача, done() — задача решена }
export function mountHints(container, opts) {
  const { d, task } = opts;
  const free = opts.source === 'tree' || opts.source === 'quest'; // дерево и квест: подсказки бесплатные, очки фиксированы
  const api = sandboxApi(opts.app.api);
  const storage = createSandboxStorage(opts.app.store);
  const list = h('div', { class: 'sbx-hints', 'aria-live': 'polite' });
  const note = h('p', { class: 'hint', role: 'status' });
  const btn = h('button', { class: 'btn small sbx-hint-btn', type: 'button' });
  container.append(list, btn, note);
  let busy = false;
  let solved = !!task.solved;

  const draw = () => {
    const st = hintsState(storage.loadDaily(d, task.id));
    list.replaceChildren(...st.hints.map((t, i) => h('div', { class: 'sbx-hint' }, h('strong', {}, `Подсказка ${i + 1}`), h('div', { html: md(t) }))));
    btn.hidden = solved || !st.canAsk;
    btn.textContent = free ? (st.hints.length > 0 ? '💡 Ещё подсказка (бесплатно)' : '💡 Подсказка (бесплатно)') : hintButtonText(st.hints.length);
  };

  btn.addEventListener('click', async () => {
    if (busy) return;
    busy = true; btn.disabled = true; note.textContent = '';
    try {
      const dr = storage.loadDaily(d, task.id) || {};
      const n = hintsState(dr).hints.length + 1;
      const r = free ? await api.freeHint(opts.source, d, task.id, n) : await api.hint(d, task.id, n);
      if (r.closed) note.textContent = r.reason === 'lesson' ? 'Подсказки откроются после пары' : hintErrorText('closed');
      else { storage.saveDaily(d, task.id, applyHint(dr, r)); draw(); }
    } catch (e) {
      const msg = e && e.message;
      if (e && e.network) note.textContent = HINT_OFFLINE_TEXT;
      else {
        note.textContent = hintErrorText(msg);
        if (msg === 'no more hints') { storage.saveDaily(d, task.id, { left: 0 }); draw(); }
        if (msg === 'no hint yet') { storage.saveDaily(d, task.id, { failed: false }); draw(); } // счётчик на сервере истёк
        if (msg === 'solved') { solved = true; draw(); }
      }
    } finally {
      busy = false; btn.disabled = false;
    }
  });

  draw();
  return {
    fail() { storage.saveDaily(d, task.id, { failed: true }); note.textContent = ''; draw(); },
    done() { solved = true; draw(); },
  };
}
