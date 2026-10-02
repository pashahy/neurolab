import { h } from '../util/dom.js';
import { shuffledIndices } from '../util/text.js';
import { fraction } from './common.js';

export const KINDS = { role: 'Роль', context: 'Контекст', task: 'Задача', format: 'Формат', constraints: 'Ограничения', examples: 'Примеры', steps: 'Шаги' };

export default {
  manual: false,
  validate(t) {
    const e = [];
    if (!Array.isArray(t.blocks) || t.blocks.length < 3) return ['prompt-builder: нужно ≥3 blocks'];
    t.blocks.forEach((b, i) => {
      if (!b.text) e.push(`prompt-builder: блок ${i}: нужен text`);
      if (!(b.kind in KINDS)) e.push(`prompt-builder: блок ${i}: kind из KINDS`);
      if (typeof b.good !== 'boolean') e.push(`prompt-builder: блок ${i}: good — true или false`);
    });
    if (!t.blocks.some(b => b.good === true)) e.push('prompt-builder: нужен хотя бы один блок с good: true');
    return e;
  },
  ready: (t, a) => Array.isArray(a?.selected) && a.selected.length > 0,
  check(t, a) {
    const sel = Array.isArray(a?.selected) ? a.selected : [];
    const good = sel.filter(i => t.blocks[i]?.good === true).length;
    const bad = sel.filter(i => t.blocks[i]?.good === false).length;
    return fraction(t, Math.max(0, good - bad), t.blocks.filter(b => b.good).length);
  },
  solution: t => ({ selected: t.blocks.flatMap((b, i) => (b.good ? [i] : [])), extra: '' }),
  toText: (t, a) => [...(a.selected || []).map(i => t.blocks[i]?.text), a.extra].filter(Boolean).join('\n'),
  render(t, el, { answer, onChange, locked }) {
    const st = { selected: [...(answer?.selected || [])], extra: answer?.extra || '' };
    const order = shuffledIndices(t.blocks.length);
    const emit = () => onChange({ selected: [...st.selected], extra: st.extra });
    const blockBtn = (i, inPrompt) => h('button', {
      type: 'button', disabled: locked,
      class: ['pb-block', inPrompt && 'in', locked && (t.blocks[i].good ? 'right' : 'wrong')].filter(Boolean).join(' '),
      onclick: () => {
        st.selected = inPrompt ? st.selected.filter(x => x !== i) : [...st.selected, i];
        emit();
        draw();
      },
    }, h('small', { class: 'kind-tag' }, KINDS[t.blocks[i].kind]), ' ', t.blocks[i].text);
    const extra = t.extra ? h('label', { class: 'field' }, h('span', {}, t.extra.label || 'Допишите свой блок'),
      h('textarea', { rows: 3, placeholder: t.extra.placeholder || '', disabled: locked, oninput: e => { st.extra = e.target.value; emit(); } }, st.extra)) : '';
    const dyn = h('div');
    const wrap = h('div', { class: 'pb' }, dyn, extra);
    el.append(wrap);
    function draw() {
      const covered = new Set(st.selected.map(i => t.blocks[i].kind));
      const used = Object.keys(KINDS).filter(k => t.blocks.some(b => b.kind === k));
      dyn.replaceChildren(
        h('div', { class: 'pb-kinds', 'aria-label': 'Компоненты промпта' }, used.map(k => h('span', { class: `kind ${covered.has(k) ? 'on' : ''}` }, `${covered.has(k) ? '✓ ' : ''}${KINDS[k]}`))),
        h('div', { class: 'pb-result' }, h('div', { class: 'pb-label' }, '📝 Ваш промпт'),
          st.selected.length ? st.selected.map(i => blockBtn(i, true)) : h('p', { class: 'hint' }, 'Нажимайте на блоки ниже, чтобы собрать промпт. Нажатие на блок в промпте убирает его.')),
        locked ? '' : h('div', { class: 'pb-palette' }, order.filter(i => !st.selected.includes(i)).map(i => blockBtn(i, false))),
        locked ? h('ul', { class: 'key-list' }, t.blocks.map((b, i) => {
          if (b.good && !st.selected.includes(i)) return h('li', {}, `Не хватило: «${b.text}»`);
          if (!b.good && st.selected.includes(i)) return h('li', {}, `Лишний блок: «${b.text}»${b.why ? ` — ${b.why}` : ''}`);
          return null;
        })) : '');
    }
    draw();
  },
};
