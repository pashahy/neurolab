import { h, add } from '../util/dom.js';
import { pts } from './common.js';

// «1 234,5» → 1234.5; всё, что не является десятичным числом целиком («12abc», «0x10», «1e3», «1,234.5»), → NaN
const NUM = /^[+-]?\d+(\.\d+)?$/;
export function parseNum(s) {
  const t = String(s ?? '').replace('\u2212', '-').replace(',', '.').replace(/\s/g, '');
  const x = NUM.test(t) ? parseFloat(t) : NaN;
  return Number.isFinite(x) ? x : NaN; // 400 цифр подряд → Infinity
}

const ok = (t, a) => {
  const x = parseNum(a);
  return Number.isFinite(x) && Math.abs(x - t.answer) <= (t.tolerance ?? 0) + 1e-9;
};

export default {
  manual: false,
  validate(t) {
    const e = [];
    if (typeof t.answer !== 'number' || !Number.isFinite(t.answer)) e.push('numeric: answer — конечное число');
    if (t.tolerance !== undefined && !(typeof t.tolerance === 'number' && Number.isFinite(t.tolerance) && t.tolerance >= 0)) e.push('numeric: tolerance — число ≥ 0');
    return e;
  },
  ready: (t, a) => Number.isFinite(parseNum(a)),
  check: (t, a) => ({ score: ok(t, a) ? pts(t) : 0, max: pts(t) }),
  solution: t => String(t.answer),
  toText: (t, a) => String(a ?? ''),
  render(t, el, { answer, onChange, locked }) {
    const right = locked && ok(t, answer);
    const input = h('input', {
      class: `numeric-input ${locked ? (right ? 'right' : 'wrong') : ''}`, type: 'text', inputmode: 'decimal', value: answer ?? '',
      disabled: locked, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Число', 'aria-label': 'Ответ — число',
      oninput: e => onChange(e.target.value),
    });
    add(el, h('div', { class: 'numeric' }, input, t.unit ? h('span', { class: 'unit' }, t.unit) : '',
      locked && !right ? h('small', { class: 'key' }, ` (${t.answer}${t.unit ? ` ${t.unit}` : ''})`) : ''));
  },
};
