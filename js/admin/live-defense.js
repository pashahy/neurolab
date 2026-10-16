// «Мой экран»: блок «Защита сейчас» (B2) — имя студента, задание, ответ, оценка 0/1/2 и история защит пары.
import { h } from '../util/dom.js';
import { md } from '../util/text.js';
import { loadLesson } from '../content.js';
import { errText } from '../ui/login.js';
import { DEFENSE_SCORES, DEFENSE_MAX, defenseTaskInfo, defenseTaskTitle, defenseAnswerView, defenseHistoryLine, defenseGraded } from './board-defense.js';

// -> { el, update(def) }: def — поле defense из boardState (names: true) или null
export function defensePanel(ctx, { group, d, n }) {
  let lesson = null;
  loadLesson(d, n).then(l => { lesson = l; draw(); }, () => { /* без файла занятия показываем только ответ */ });
  let cur = null;      // текущая защита (defense из опроса)
  let curKey = '';
  const nameEl = h('div', { class: 'live-defense-name' });
  const taskEl = h('div', { class: 'live-defense-task' });
  const textEl = h('div', { class: 'live-defense-text' });
  const answerEl = h('pre', { class: 'live-defense-answer' });
  const comment = h('textarea', { name: 'defense-comment', rows: 2, maxlength: '1000', 'aria-label': 'Комментарий к защите', placeholder: 'Комментарий (необязательно)' });
  const msg = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
  const btns = h('div', { class: 'live-defense-btns' });
  const empty = h('p', { class: 'hint' }, 'Нажмите «🎲 Защита» на доске: здесь появится студент и задание.');
  const body = h('div', { class: 'live-defense-body' }, nameEl, taskEl, textEl, answerEl, comment, btns, msg);
  const historyEl = h('ul', { class: 'live-defense-history' });
  const el = h('section', { class: 'live-defense' }, h('h3', {}, 'Защита сейчас'), empty, body,
    h('details', { class: 'live-defense-hist' }, h('summary', {}, 'История защит'), historyEl));
  const buttons = DEFENSE_SCORES.map(s => {
    const b = h('button', { class: 'btn small', type: 'button', onclick: () => grade(s.score) }, s.label);
    btns.append(b);
    return b;
  });

  function draw() {
    empty.hidden = !!cur;
    body.hidden = !cur;
    if (!cur) return;
    const info = defenseTaskInfo(lesson, cur.taskId);
    nameEl.textContent = cur.name || '';
    taskEl.textContent = defenseTaskTitle(info, cur.taskId);
    textEl.replaceChildren(...(info && info.text ? [h('div', { html: md(info.text) })] : []));
    answerEl.textContent = defenseAnswerView(lesson, cur.taskId, cur.raw, cur.answer).text;
    const g = cur.grade;
    buttons.forEach((b, i) => b.classList.toggle('primary', defenseGraded(cur) && g.score === i));
    if (defenseGraded(cur)) msg.textContent = `✓ Оценка: ${g.score}/${DEFENSE_MAX}${g.comment ? `, ${g.comment}` : ''}`;
    else if (!msg.textContent.startsWith('Сохраняем')) msg.textContent = 'Ещё не оценено';
  }

  async function grade(score) {
    if (!cur) return;
    const sent = cur;
    buttons.forEach(b => { b.disabled = true; });
    msg.textContent = 'Сохраняем…';
    try {
      await ctx.call('adminDefenseGrade', {
        group, discipline: d, lesson: n, submissionId: sent.submissionId, studentId: sent.studentId, taskId: sent.taskId, score, comment: comment.value,
      });
      if (!ctx.alive()) return;
      if (cur === sent || (cur && cur.submissionId === sent.submissionId && cur.taskId === sent.taskId)) cur.grade = { score, comment: comment.value.trim() };
      msg.textContent = '';
      draw();
      loadHistory();
    } catch (e) {
      if (!ctx.alive() || (e && e.handled)) return;
      msg.textContent = `Не сохранено: ${errText(e)}`;
    } finally { buttons.forEach(b => { b.disabled = false; }); }
  }

  async function loadHistory() {
    try {
      const r = await ctx.call('adminDefenses', { group, discipline: d, lesson: n });
      if (!ctx.alive()) return;
      const list = r && Array.isArray(r.defenses) ? r.defenses : [];
      historyEl.replaceChildren(...(list.length ? list.map(x => h('li', {}, defenseHistoryLine(x, lesson))) : [h('li', { class: 'hint' }, 'Защит пока не было.')]));
    } catch (e) { /* история необязательна */ }
  }
  loadHistory();
  draw();

  return {
    el,
    update(def) {
      const key = def ? `${def.submissionId}|${def.taskId}|${def.at}` : '';
      if (key !== curKey) { curKey = key; comment.value = ''; msg.textContent = ''; cur = def || null; draw(); return; }
      if (cur && def) { cur.grade = def.grade; draw(); }
    },
  };
}
