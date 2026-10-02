import { h, add } from '../util/dom.js';
import { pts } from './common.js';

async function copyText(s, btn) {
  try { await navigator.clipboard.writeText(s); }
  catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' }, s);
    document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  btn.textContent = '✓ Скопировано';
  setTimeout(() => { btn.textContent = '📋 Скопировать'; }, 1500);
}

export default {
  manual: true,
  validate: () => [],
  ready: (t, a) => typeof a === 'string' && a.trim().length >= (t.minLength ?? 50),
  check: t => ({ score: 0, max: pts(t), manual: true }),
  toText: (t, a) => String(a ?? ''),
  render(t, el, { answer, onChange, locked }) {
    const min = t.minLength ?? 50;
    const counter = h('small', { class: 'counter' });
    const upd = v => { const n = v.trim().length; counter.textContent = n >= min ? `${n} симв. ✓` : `${n} / ${min} симв.`; };
    const ta = h('textarea', { rows: t.rows ?? 6, placeholder: t.placeholder || 'Ваш ответ…', disabled: locked, oninput: e => { upd(e.target.value); onChange(e.target.value); } }, answer || '');
    upd(answer || '');
    let copyBox = '';
    if (t.copy) {
      const btn = h('button', { type: 'button', class: 'btn small', onclick: () => copyText(t.copy, btn) }, '📋 Скопировать');
      copyBox = h('div', { class: 'copy-box' }, h('div', { class: 'copy-label' }, 'Запрос для нейросети:'), h('pre', {}, t.copy), btn);
    }
    add(el, copyBox,
      t.rubric ? h('div', { class: 'rubric' }, h('strong', {}, 'Критерии оценки:'), h('ul', {}, t.rubric.map(r => h('li', {}, r)))) : '',
      h('label', { class: 'field' }, ta, counter));
  },
};
