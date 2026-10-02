import { h, add } from '../util/dom.js';
import { norm } from '../util/text.js';
import { fraction } from './common.js';

const RE = /\{\{(\d+)\}\}/g;

export default {
  manual: false,
  validate(t) {
    const e = [];
    const count = [...String(t.template ?? '').matchAll(RE)].length;
    if (!t.template) e.push('fill: нужен template с {{0}}, {{1}}…');
    if (!Array.isArray(t.blanks) || t.blanks.some(b => !Array.isArray(b) || !b.length)) e.push('fill: blanks — массив массивов допустимых ответов');
    else if (count !== t.blanks.length) e.push(`fill: число {{N}} в template (${count}) не равно числу blanks (${t.blanks.length})`);
    return e;
  },
  ready: (t, a) => Array.isArray(a) && a.length === t.blanks.length && a.every(x => String(x ?? '').trim()),
  check(t, a) {
    const good = t.blanks.filter((acc, i) => Array.isArray(a) && acc.map(norm).includes(norm(a[i]))).length;
    return fraction(t, good, t.blanks.length);
  },
  solution: t => t.blanks.map(b => b[0]),
  render(t, el, { answer, onChange, locked }) {
    const vals = Array.isArray(answer) ? [...answer] : t.blanks.map(() => '');
    const box = h('div', { class: `fill ${t.code ? 'code' : ''}` });
    const parts = String(t.template).split(RE);
    parts.forEach((part, k) => {
      if (k % 2 === 0) { add(box, part); return; }
      const i = Number(part);
      const ok = t.blanks[i].map(norm).includes(norm(vals[i]));
      const input = h('input', {
        class: `blank ${locked ? (ok ? 'right' : 'wrong') : ''}`, value: vals[i] ?? '', disabled: locked,
        'aria-label': `Пропуск ${i + 1}`, autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false',
        size: Math.max(4, ...t.blanks[i].map(s => s.length)),
        oninput: e => { vals[i] = e.target.value; onChange([...vals]); },
      });
      add(box, input, locked && !ok ? h('small', { class: 'key' }, ` (${t.blanks[i][0]})`) : null);
    });
    add(el, box);
  },
};
