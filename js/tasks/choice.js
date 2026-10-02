import { h, add } from '../util/dom.js';
import { mdInline } from '../util/text.js';
import { pts, isIdx } from './common.js';

function render(multi) {
  return (t, el, { answer, onChange, locked }) => {
    const sel = new Set(multi ? answer || [] : answer == null ? [] : [answer]);
    const list = h('div', { class: 'options', role: multi ? 'group' : 'radiogroup' });
    const isRight = i => (multi ? t.correct.includes(i) : t.correct === i);
    const draw = () => list.replaceChildren(...t.options.map((opt, i) => {
      const chosen = sel.has(i);
      const cls = ['option', chosen && 'chosen', locked && isRight(i) && 'right', locked && chosen && !isRight(i) && 'wrong'].filter(Boolean).join(' ');
      return h('button', {
        type: 'button', class: cls, disabled: locked, 'aria-pressed': String(chosen),
        onclick: () => {
          if (multi) { chosen ? sel.delete(i) : sel.add(i); onChange([...sel].sort((a, b) => a - b)); }
          else { sel.clear(); sel.add(i); onChange(i); }
          draw();
        },
      }, h('span', { class: 'mark' }, multi ? (chosen ? '☑' : '☐') : (chosen ? '◉' : '○')), h('span', { html: mdInline(opt) }));
    }));
    draw();
    add(el, multi ? h('p', { class: 'hint' }, 'Можно выбрать несколько вариантов') : null, list);
  };
}

function validateOptions(t, kind) {
  const e = [];
  if (!Array.isArray(t.options) || t.options.length < 2) e.push(`${kind}: нужно ≥2 options`);
  return e;
}

export const single = {
  manual: false,
  validate(t) {
    const e = validateOptions(t, 'single');
    if (!isIdx(t.correct, t.options?.length ?? 0)) e.push('single: correct — индекс из options');
    return e;
  },
  ready: (t, a) => Number.isInteger(a),
  check: (t, a) => ({ score: a === t.correct ? pts(t) : 0, max: pts(t) }),
  solution: t => t.correct,
  render: render(false),
};

export const multi = {
  manual: false,
  validate(t) {
    const e = validateOptions(t, 'multi');
    const n = t.options?.length ?? 0;
    if (!Array.isArray(t.correct) || !t.correct.length || !t.correct.every(i => isIdx(i, n))) e.push('multi: correct — непустой массив индексов options');
    return e;
  },
  ready: (t, a) => Array.isArray(a) && a.length > 0,
  check(t, a) {
    const ok = Array.isArray(a) && a.length === t.correct.length && t.correct.every(i => a.includes(i));
    return { score: ok ? pts(t) : 0, max: pts(t) };
  },
  solution: t => [...t.correct].sort((a, b) => a - b),
  render: render(true),
};
