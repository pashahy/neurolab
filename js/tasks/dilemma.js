import { h } from '../util/dom.js';
import { md } from '../util/text.js';
import { pts } from './common.js';
import { CHARACTERS } from '../../content/story.js';

function currentScene(t, path) {
  let id = t.start;
  for (const p of path) id = t.scenes[id]?.choices?.[p.choice]?.next ?? id;
  return id;
}

export default {
  manual: true,
  validate(t) {
    const e = [];
    const sc = t.scenes || {};
    if (!sc[t.start]) e.push('dilemma: нет стартовой сцены start');
    let ends = 0;
    for (const [id, s] of Object.entries(sc)) {
      if (!s.text) e.push(`dilemma: сцена ${id} без text`);
      const ch = s.choices || [];
      if (!ch.length) ends++;
      ch.forEach((c, i) => {
        if (!c.text) e.push(`dilemma: сцена ${id}, выбор ${i}: нужен text`);
        if (!sc[c.next]) e.push(`dilemma: сцена ${id}, выбор ${i}: нет сцены ${c.next}`);
      });
    }
    if (!ends) e.push('dilemma: нужна хотя бы одна финальная сцена (без choices)');
    if (!t.reflect) e.push('dilemma: нужен вопрос reflect');
    return e;
  },
  ready: (t, a) => a?.ended === true && String(a.reflection || '').trim().length >= (t.minLength ?? 30),
  check: t => ({ score: 0, max: pts(t), manual: true }),
  toText(t, a) {
    let id = t.start;
    const picks = (a.path || []).map(p => {
      const c = t.scenes[id]?.choices?.[p.choice];
      id = c?.next ?? id;
      return c?.text ?? '?';
    });
    return `Выборы: ${picks.join(' → ')}\nОбоснование: ${a.reflection || ''}`;
  },
  render(t, el, { answer, onChange, locked }) {
    const st = { path: [...(answer?.path || [])], ended: !!answer?.ended, reflection: answer?.reflection || '' };
    const who = CHARACTERS[t.character];
    let note = null;
    const emit = () => onChange({ path: [...st.path], ended: st.ended, reflection: st.reflection });
    const wrap = h('div', { class: 'dilemma' });
    el.append(wrap);
    const draw = () => {
      const id = currentScene(t, st.path);
      const scene = t.scenes[id];
      const min = t.minLength ?? 30;
      const counter = h('small', { class: 'counter' });
      const upd = () => { const n = st.reflection.trim().length; counter.textContent = n >= min ? `${n} симв. ✓` : `${n} / ${min} симв.`; };
      upd();
      wrap.replaceChildren(
        st.path.length ? h('p', { class: 'hint' }, `Шаг ${st.path.length + 1}`) : '',
        note ? h('div', { class: 'bubble note', html: md(`**Последствие:** ${note}`) }) : '',
        h('div', { class: 'story' }, who ? h('div', { class: 'avatar' }, who.avatar) : '', h('div', { class: 'bubble', html: md(scene.text) })),
        scene.choices?.length && !locked
          ? h('div', { class: 'options' }, scene.choices.map((c, i) => h('button', {
            type: 'button', class: 'option',
            onclick: () => {
              st.path.push({ scene: id, choice: i });
              note = c.note || null;
              st.ended = !t.scenes[c.next].choices?.length;
              emit();
              draw();
            },
          }, c.text)))
          : '',
        !scene.choices?.length ? h('label', { class: 'field' }, h('span', { html: md(t.reflect) }),
          h('textarea', { rows: 5, disabled: locked, placeholder: 'Ваше обоснование…', oninput: e => { st.reflection = e.target.value; upd(); emit(); } }, st.reflection), counter) : '',
        !locked && st.path.length ? h('button', { type: 'button', class: 'link-btn', onclick: () => { st.path = []; st.ended = false; note = null; emit(); draw(); } }, '↺ Начать кейс заново') : '');
    };
    draw();
  },
};
