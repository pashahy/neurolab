// Общие части Python-заданий и песочницы: редактор кода (с панелью символов) и блок вывода.
import { h } from '../util/dom.js';

export const PY_KEYS = ['⇥', ':', '(', ')', '"', "'", '=', '[', ']', '{', '}', '+', '-', '*', '/', '%', '<', '>', '#', '_', ','];
export const NO_OUTPUT_TEXT = '(программа ничего не вывела)';

export function insertAtCursor(ta, s) {
  if (ta.readOnly || ta.disabled) return;
  const { selectionStart: a, selectionEnd: b, value } = ta;
  ta.value = value.slice(0, a) + s + value.slice(b);
  ta.selectionStart = ta.selectionEnd = a + s.length;
  ta.dispatchEvent(new Event('input'));
  ta.focus();
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// текст результата одного запуска: вывод + ошибка
export function outputText(r) {
  const x = r || {};
  return `${x.output || ''}${x.error ? `\n${x.error}` : ''}`.trim() || NO_OUTPUT_TEXT;
}

// Редактор: панель символов (если не locked) и textarea.
// → { el, ta, get(), set(v) } ; onInput(value) вызывается на каждое изменение, set() её не вызывает
export function pyEditor({ value = '', onInput, locked = false, keys = true } = {}) {
  const rowsFor = v => Math.max(8, String(v).split('\n').length + 2);
  const ta = h('textarea', { class: 'code-editor', rows: rowsFor(value), spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', disabled: locked, 'aria-label': 'Код на Python' }, value);
  ta.addEventListener('input', () => { if (onInput) onInput(ta.value); });
  ta.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); insertAtCursor(ta, '    '); } });
  const bar = locked || !keys ? '' : h('div', { class: 'keybar', 'aria-label': 'Символы для кода' }, PY_KEYS.map(k => h('button', {
    type: 'button', class: 'key', onpointerdown: e => e.preventDefault(), onclick: () => insertAtCursor(ta, k === '⇥' ? '    ' : k),
  }, k)));
  return {
    el: h('div', { class: 'py-editor' }, bar, ta),
    ta,
    get: () => ta.value,
    set(v) { ta.value = String(v); ta.rows = rowsFor(ta.value); },
  };
}

// Блок вывода. show(results, { animate }) — первый результат; animate: построчное появление (кроме reduced-motion), ≤ 0,6 с.
export function pyOutput() {
  const el = h('pre', { class: 'py-out', 'aria-live': 'polite' });
  let timer = null;
  const stop = () => { if (timer) { clearTimeout(timer); timer = null; } };
  return {
    el,
    clear() { stop(); el.textContent = ''; el.classList.remove('err'); },
    show(results, opts) {
      stop();
      const r = Array.isArray(results) ? results[0] : results;
      const text = outputText(r);
      el.classList.toggle('err', !!(r && r.error));
      const lines = text.split('\n');
      if (!(opts && opts.animate) || reduced() || lines.length < 2) { el.textContent = text; return; }
      const step = Math.min(60, Math.max(8, Math.floor(600 / lines.length)));
      let i = 0;
      el.textContent = '';
      const tick = () => {
        i++;
        el.textContent = lines.slice(0, i).join('\n');
        timer = i < lines.length ? setTimeout(tick, step) : null;
      };
      tick();
    },
  };
}
