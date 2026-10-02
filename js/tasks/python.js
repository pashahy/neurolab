import { h, add } from '../util/dom.js';
import { fraction } from './common.js';
import { runPython, preloadPython } from './python-runner.js';

const KEYS = ['⇥', ':', '(', ')', '"', "'", '=', '[', ']', '{', '}', '+', '-', '*', '/', '%', '<', '>', '#', '_', ','];

function insertAtCursor(ta, s) {
  if (ta.readOnly || ta.disabled) return;
  const { selectionStart: a, selectionEnd: b, value } = ta;
  ta.value = value.slice(0, a) + s + value.slice(b);
  ta.selectionStart = ta.selectionEnd = a + s.length;
  ta.dispatchEvent(new Event('input'));
  ta.focus();
}

export default {
  manual: false,
  validate(t) {
    const e = [];
    if (typeof t.starter !== 'string') e.push('python: нужен starter (может быть пустой строкой)');
    if (typeof t.solution !== 'string' || !t.solution.trim()) e.push('python: нужен solution — эталонный код');
    if (!Array.isArray(t.tests) || !t.tests.length) e.push('python: нужны tests');
    else t.tests.forEach((x, i) => { if (!x.name || !x.code) e.push(`python: тест ${i}: нужны name и code`); });
    return e;
  },
  ready: (t, a) => Array.isArray(a?.passed) && a.passed.length === t.tests.length,
  check(t, a) { return fraction(t, Array.isArray(a?.passed) ? a.passed.filter(Boolean).length : 0, t.tests.length); },
  toText: (t, a) => a?.code ?? '',
  render(t, el, { answer, onChange, locked }) {
    let code = answer?.code ?? t.starter;
    let passed = answer?.passed ?? null;
    if (!locked) preloadPython();
    const ta = h('textarea', { class: 'code-editor', rows: Math.max(8, code.split('\n').length + 2), spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', disabled: locked, 'aria-label': 'Код на Python' }, code);
    ta.addEventListener('input', () => { code = ta.value; passed = null; onChange({ code, passed }); });
    ta.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); insertAtCursor(ta, '    '); } });
    const out = h('pre', { class: 'py-out', 'aria-live': 'polite' });
    const results = h('ul', { class: 'py-tests' });
    const status = h('p', { class: 'hint', 'aria-live': 'polite' });
    const btnRun = h('button', { type: 'button', class: 'btn', disabled: locked }, '▶ Запустить');
    const btnTest = h('button', { type: 'button', class: 'btn primary', disabled: locked }, '✓ Проверить тестами');
    const busy = async (label, fn) => {
      btnRun.disabled = btnTest.disabled = true;
      ta.readOnly = true;
      status.textContent = label;
      try { status.textContent = (await fn()) || ''; } catch (e) { status.textContent = ''; throw e; } finally { ta.readOnly = locked; btnRun.disabled = btnTest.disabled = locked; }
    };
    const showTests = res => results.replaceChildren(...t.tests.map((x, i) => h('li', { class: res[i]?.ok ? 'right' : 'wrong' },
      res[i]?.ok ? '✅ ' : '❌ ', x.name, !res[i]?.ok && res[i]?.error ? h('pre', { class: 'py-err' }, res[i].error) : '')));
    btnRun.onclick = () => busy('Выполняется… Первый запуск загружает Python (до 30 секунд).', async () => {
      const { results: [r] } = await runPython(code, [{ stdin: t.stdin || [] }]);
      out.textContent = `${r.output || ''}${r.error ? `\n${r.error}` : ''}`.trim() || '(программа ничего не вывела)';
    });
    btnTest.onclick = () => busy('Проверяем…', async () => {
      const src = code;
      const { results: res } = await runPython(code, t.tests.map(x => ({ stdin: x.stdin || t.stdin || [], test: x.code })));
      if (code !== src) {
        return 'Код изменился во время проверки — нажмите «Проверить» ещё раз';
      }
      passed = res.map(r => r.ok);
      onChange({ code, passed });
      showTests(res);
    });
    if (passed) showTests(passed.map(ok => ({ ok })));
    add(el,
      t.stdin?.length ? h('p', { class: 'hint' }, `Входные данные для «Запустить»: ${t.stdin.join(' ⏎ ')}`) : '',
      locked ? '' : h('div', { class: 'keybar', 'aria-label': 'Символы для кода' }, KEYS.map(k => h('button', {
        type: 'button', class: 'key', onpointerdown: e => e.preventDefault(), onclick: () => insertAtCursor(ta, k === '⇥' ? '    ' : k),
      }, k))),
      ta, h('div', { class: 'row' }, btnRun, btnTest), status, out, results);
  },
};
