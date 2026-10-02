import { h } from '../util/dom.js';
import { mdInline, shuffledIndices } from '../util/text.js';
import { fraction } from './common.js';

const COLORS = 6;

export default {
  manual: false,
  validate(t) {
    if (!Array.isArray(t.pairs) || t.pairs.length < 2) return ['match: нужно ≥2 pairs'];
    if (t.pairs.some(p => !Array.isArray(p) || p.length !== 2)) return ['match: каждая пара — [left, right]'];
    const r = t.pairs.map(p => p[1]);
    return new Set(r).size === r.length ? [] : ['match: правые части должны быть уникальны'];
  },
  ready: (t, a) => Array.isArray(a) && a.length === t.pairs.length && a.every(Number.isInteger),
  check(t, a) { return fraction(t, Array.isArray(a) ? a.filter((v, i) => v === i).length : 0, t.pairs.length); },
  solution: t => t.pairs.map((_, i) => i),
  render(t, el, { answer, onChange, locked }) {
    const ans = Array.isArray(answer) ? [...answer] : t.pairs.map(() => null);
    const rightOrder = shuffledIndices(t.pairs.length);
    let active = null;
    const wrap = h('div', { class: 'match' });
    el.append(wrap);
    const draw = () => {
      const left = h('div', { class: 'match-col' }, t.pairs.map((p, i) => h('button', {
        type: 'button', disabled: locked,
        class: ['match-item', ans[i] !== null && `pair-${i % COLORS}`, active === i && 'active', locked && (ans[i] === i ? 'right' : 'wrong')].filter(Boolean).join(' '),
        onclick: () => {
          if (ans[i] !== null) { ans[i] = null; onChange([...ans]); active = null; }
          else active = active === i ? null : i;
          draw();
        },
      }, h('span', { html: mdInline(p[0]) }))));
      const right = h('div', { class: 'match-col' }, rightOrder.map(j => {
        const owner = ans.indexOf(j);
        return h('button', {
          type: 'button', disabled: locked,
          class: ['match-item', owner >= 0 && `pair-${owner % COLORS}`, active !== null && 'target'].filter(Boolean).join(' '),
          onclick: () => {
            if (active === null) return;
            if (owner >= 0) ans[owner] = null;
            ans[active] = j;
            active = null;
            onChange([...ans]);
            draw();
          },
        }, h('span', { html: mdInline(t.pairs[j][1]) }));
      }));
      wrap.replaceChildren(
        locked ? '' : h('p', { class: 'hint' }, active === null ? 'Нажмите элемент слева, затем пару для него справа. Повторное нажатие слева — отменить пару.' : 'Теперь выберите пару справа'),
        h('div', { class: 'match-grid' }, left, right),
        locked ? h('ul', { class: 'key-list' }, t.pairs.map((p, i) => (ans[i] === i ? null : h('li', {}, `${p[0]} → ${p[1]}`)))) : '');
    };
    draw();
  },
};
