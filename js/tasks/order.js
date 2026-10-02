import { h } from '../util/dom.js';
import { mdInline, shuffledIndices } from '../util/text.js';
import { fraction } from './common.js';

export default {
  manual: false,
  validate: t => (Array.isArray(t.items) && t.items.length >= 3 ? [] : ['order: нужно ≥3 items в правильном порядке']),
  ready: (t, a) => Array.isArray(a) && a.length === t.items.length,
  check(t, a) { return fraction(t, Array.isArray(a) ? a.filter((v, i) => v === i).length : 0, t.items.length); },
  solution: t => t.items.map((_, i) => i),
  render(t, el, { answer, onChange, locked }) {
    const cur = Array.isArray(answer) ? [...answer] : shuffledIndices(t.items.length);
    if (!Array.isArray(answer)) onChange([...cur]);
    const list = h('ol', { class: 'order' });
    el.append(list);
    const move = (i, d) => {
      const j = i + d;
      if (j < 0 || j >= cur.length) return;
      [cur[i], cur[j]] = [cur[j], cur[i]];
      onChange([...cur]);
      draw();
    };
    const draw = () => list.replaceChildren(...cur.map((idx, i) => h('li', { class: ['order-item', locked && (idx === i ? 'right' : 'wrong')].filter(Boolean).join(' ') },
      h('span', { class: 'order-text', html: mdInline(t.items[idx]) }),
      locked
        ? (idx === i ? null : h('small', { class: 'key' }, `верно: ${idx + 1}-е место`))
        : h('span', { class: 'order-btns' },
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Выше', disabled: i === 0, onclick: () => move(i, -1) }, '▲'),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Ниже', disabled: i === cur.length - 1, onclick: () => move(i, 1) }, '▼')))));
    draw();
  },
};
