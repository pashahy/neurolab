import { h } from '../util/dom.js';
import { mdInline } from '../util/text.js';
import { fraction, isIdx } from './common.js';

export default {
  manual: false,
  validate(t) {
    const e = [];
    if (!Array.isArray(t.categories) || t.categories.length < 2) e.push('categorize: нужно ≥2 categories');
    if (!Array.isArray(t.items) || t.items.length < 3) e.push('categorize: нужно ≥3 items');
    else t.items.forEach((it, i) => { if (!it.text || !isIdx(it.cat, t.categories?.length ?? 0)) e.push(`categorize: item ${i}: нужны text и cat (индекс категории)`); });
    return e;
  },
  ready: (t, a) => Array.isArray(a) && a.length === t.items.length && a.every(Number.isInteger),
  check(t, a) { return fraction(t, t.items.filter((it, i) => Array.isArray(a) && a[i] === it.cat).length, t.items.length); },
  solution: t => t.items.map(it => it.cat),
  render(t, el, { answer, onChange, locked }) {
    const ans = Array.isArray(answer) ? [...answer] : t.items.map(() => null);
    const wrap = h('div', { class: 'cat' });
    el.append(wrap);
    const draw = () => {
      const i = ans.findIndex(x => x === null);
      const current = !locked && i >= 0 ? h('div', { class: 'cat-current' },
        h('div', { class: 'cat-left' }, `Осталось: ${ans.filter(x => x === null).length}`),
        h('div', { class: 'swipe-card small', html: mdInline(t.items[i].text) }),
        h('div', { class: 'cat-buttons' }, t.categories.map((c, k) => h('button', { type: 'button', class: 'btn', onclick: () => { ans[i] = k; onChange([...ans]); draw(); } }, c)))) : '';
      const bins = h('div', { class: 'cat-bins' }, t.categories.map((c, k) => h('div', { class: 'cat-bin' },
        h('h4', {}, c),
        t.items.map((it, j) => (ans[j] !== k ? null : h('button', {
          type: 'button', disabled: locked, title: 'Нажмите, чтобы вернуть',
          class: ['chip', locked && (it.cat === k ? 'right' : 'wrong')].filter(Boolean).join(' '),
          onclick: () => { ans[j] = null; onChange([...ans]); draw(); },
        }, it.text))))));
      const key = locked ? h('ul', { class: 'key-list' }, t.items.map((it, j) => (ans[j] === it.cat ? null : h('li', {}, `${it.text} → ${t.categories[it.cat]}`)))) : '';
      wrap.replaceChildren(current, bins, key);
    };
    draw();
  },
};
