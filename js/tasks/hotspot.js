import { h } from '../util/dom.js';
import { mdInline } from '../util/text.js';
import { fraction, isIdx } from './common.js';

export default {
  manual: false,
  validate(t) {
    const e = [];
    if (!Array.isArray(t.lines) || t.lines.length < 2) e.push('hotspot: нужно ≥2 lines');
    if (!Array.isArray(t.correct) || !t.correct.length || !t.correct.every(i => isIdx(i, t.lines?.length ?? 0))) e.push('hotspot: correct — непустой массив индексов lines');
    return e;
  },
  ready: (t, a) => Array.isArray(a) && a.length > 0,
  check(t, a) {
    const sel = new Set(Array.isArray(a) ? a : []);
    const hits = t.correct.filter(i => sel.has(i)).length;
    const fp = [...sel].filter(i => !t.correct.includes(i)).length;
    return fraction(t, Math.max(0, hits - fp), t.correct.length);
  },
  solution: t => [...t.correct].sort((a, b) => a - b),
  render(t, el, { answer, onChange, locked }) {
    const sel = new Set(Array.isArray(answer) ? answer : []);
    const box = h('div', { class: `hotspot ${t.code ? 'code' : ''}` });
    el.append(box);
    const draw = () => box.replaceChildren(...t.lines.map((line, i) => {
      const chosen = sel.has(i);
      const target = t.correct.includes(i);
      const state = !locked ? (chosen ? 'chosen' : '') : target ? (chosen ? 'right' : 'missed') : chosen ? 'wrong' : '';
      return h('div', { class: 'hs-row' },
        h('button', {
          type: 'button', class: `hs-line ${state}`, disabled: locked, 'aria-pressed': String(chosen),
          onclick: () => { chosen ? sel.delete(i) : sel.add(i); onChange([...sel].sort((a, b) => a - b)); draw(); },
        }, t.code ? h('span', { class: 'ln' }, String(i + 1)) : null, t.code ? h('code', {}, line || ' ') : h('span', { html: mdInline(line) })),
        locked && t.notes?.[i] ? h('div', { class: 'hs-note', html: mdInline(t.notes[i]) }) : null);
    }));
    draw();
  },
};
