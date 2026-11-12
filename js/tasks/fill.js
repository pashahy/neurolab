import { h, add } from '../util/dom.js';
import { norm } from '../util/text.js';
import { taskKey, checkKey } from '../grade-core.js';

const RE = /\{\{(\d+)\}\}/g;

// число пропусков: у запечатанного задания blanks убраны — берём bn (число пропусков) или считаем {{N}} в шаблоне
const blankCount = t => (Array.isArray(t.blanks) ? t.blanks.length : Number.isInteger(t.bn) ? t.bn : [...String(t.template ?? '').matchAll(RE)].length);

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
  ready: (t, a) => Array.isArray(a) && a.length === blankCount(t) && a.every(x => String(x ?? '').trim()),
  check: (t, a) => checkKey(taskKey(t, 'fill'), a),
  solution: t => t.blanks.map(b => b[0]),
  render(t, el, { answer, onChange, locked }) {
    const vals = Array.isArray(answer) ? [...answer] : Array.from({ length: blankCount(t) }, () => '');
    const box = h('div', { class: `fill ${t.code ? 'code' : ''}` });
    const parts = String(t.template).split(RE);
    parts.forEach((part, k) => {
      if (k % 2 === 0) { add(box, part); return; }
      const i = Number(part);
      const accept = Array.isArray(t.blanks) && Array.isArray(t.blanks[i]) ? t.blanks[i] : null; // нет до раскрытия
      const ok = !!accept && accept.map(norm).includes(norm(vals[i]));
      const input = h('input', {
        class: `blank ${locked && accept ? (ok ? 'right' : 'wrong') : ''}`, value: vals[i] ?? '', disabled: locked,
        'aria-label': `Пропуск ${i + 1}`, autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false',
        size: accept ? Math.max(4, ...accept.map(s => s.length)) : 12,
        oninput: e => { vals[i] = e.target.value; onChange([...vals]); },
      });
      add(box, input, locked && !ok && accept ? h('small', { class: 'key' }, ` (${accept[0]})`) : null);
    });
    add(el, box);
  },
};
