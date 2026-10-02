import { h } from '../util/dom.js';
import { mdInline } from '../util/text.js';
import { fraction } from './common.js';

const LABELS = { true: 'Правда', false: 'Выдумка' };

export default {
  manual: false,
  validate(t) {
    const e = [];
    if (!Array.isArray(t.cards) || t.cards.length < 3) return ['swipe: нужно ≥3 cards'];
    t.cards.forEach((c, i) => {
      if (!c.text) e.push(`swipe: карточка ${i} без text`);
      if (typeof c.answer !== 'boolean') e.push(`swipe: карточка ${i}: answer — true или false`);
    });
    return e;
  },
  ready: (t, a) => Array.isArray(a) && a.length === t.cards.length && a.every(x => typeof x === 'boolean'),
  check(t, a) { return fraction(t, t.cards.filter((c, i) => Array.isArray(a) && a[i] === c.answer).length, t.cards.length); },
  solution: t => t.cards.map(c => c.answer),
  render(t, el, { answer, onChange, locked }) {
    const labels = { ...LABELS, ...t.labels };
    const ans = Array.isArray(answer) ? [...answer] : t.cards.map(() => null);
    const box = h('div', { class: 'swipe' });
    el.append(box);
    const summary = () => box.replaceChildren(h('ul', { class: 'swipe-summary' }, t.cards.map((c, k) =>
      h('li', { class: ans[k] === c.answer ? 'right' : 'wrong' },
        h('span', { class: 'mark' }, ans[k] === c.answer ? '✓' : '✗'),
        h('span', { html: mdInline(c.text) }),
        h('small', {}, ` — ${labels[c.answer]}`)))));
    const draw = () => {
      const i = ans.findIndex(x => x === null);
      if (i === -1 || locked) { summary(); return; }
      const card = h('div', { class: 'swipe-card', tabindex: '0' },
        h('div', { class: 'swipe-count' }, `${i + 1} / ${t.cards.length}`),
        h('div', { class: 'swipe-text', html: mdInline(t.cards[i].text) }));
      const decide = val => {
        ans[i] = val;
        onChange([...ans]);
        const c = t.cards[i];
        const ok = val === c.answer;
        box.replaceChildren(h('div', { class: `swipe-feedback ${ok ? 'right' : 'wrong'}` },
          h('strong', {}, ok ? '✓ Верно!' : `✗ Нет — это «${labels[c.answer]}»`),
          c.explain ? h('p', { html: mdInline(c.explain) }) : null,
          h('button', { class: 'btn', type: 'button', onclick: draw }, ans.includes(null) ? 'Следующая карточка →' : 'Показать итоги')));
      };
      attachSwipe(card, dx => decide(dx > 0));
      card.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') decide(false); if (e.key === 'ArrowRight') decide(true); });
      box.replaceChildren(card, h('div', { class: 'swipe-buttons' },
        h('button', { class: 'btn swipe-no', type: 'button', onclick: () => decide(false) }, `← ${labels.false}`),
        h('button', { class: 'btn swipe-yes', type: 'button', onclick: () => decide(true) }, `${labels.true} →`)));
    };
    draw();
  },
};

function attachSwipe(card, onSwipe) {
  let x0 = null;
  const reset = () => { x0 = null; card.style.transform = ''; card.classList.remove('tilt-left', 'tilt-right'); };
  card.addEventListener('pointerdown', e => { x0 = e.clientX; card.setPointerCapture(e.pointerId); });
  card.addEventListener('pointermove', e => {
    if (x0 === null) return;
    const dx = e.clientX - x0;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 20}deg)`;
    card.classList.toggle('tilt-right', dx > 40);
    card.classList.toggle('tilt-left', dx < -40);
  });
  card.addEventListener('pointerup', e => { if (x0 === null) return; const dx = e.clientX - x0; reset(); if (Math.abs(dx) > 80) onSwipe(dx); });
  card.addEventListener('pointercancel', reset);
}
