// B5: полоса этапов занятия с таймером и кнопками (доска и «Мой экран»). Состояние хранит сервер (boardPhase).
import { h } from '../util/dom.js';
import { loadLesson } from '../content.js';
import { confirmDialog } from './common.js';
import { errText } from '../ui/login.js';
import { PHASES, PHASE_LABEL, lessonPhaseMinutes, stepPhase, normPhase, phaseOffset, phaseRemainingMs, timerText } from '../phase-model.js';

// ctx.call — админ-вызов; { group, d, n }. Возвращает { el, update(phase, serverNow, clientNow), tick(clientNow) }.
export function phaseControl(ctx, { group, d, n, alive }) {
  let phase = null;
  let offset = 0;
  let minutes = lessonPhaseMinutes(null);
  let busy = false;
  let changedSrv = 0; // серверное время последнего изменения этапа: более ранние ответы boardState устарели
  loadLesson(d, n).then(l => { minutes = lessonPhaseMinutes(l); }, () => { /* без файла занятия — минуты по умолчанию */ });

  const segs = PHASES.map(p => h('li', { class: 'phase-seg', 'data-phase': p }, h('span', { class: 'phase-name' }, PHASE_LABEL[p])));
  const timer = h('span', { class: 'phase-timer', role: 'timer', 'aria-live': 'off' }, '');
  const back = h('button', { class: 'phase-btn', type: 'button', title: 'Предыдущий этап' }, '◀ Назад');
  const pause = h('button', { class: 'phase-btn', type: 'button', title: 'Пауза или продолжение' }, '⏸');
  const next = h('button', { class: 'phase-btn primary', type: 'button' }, '▶ Следующий этап');
  const note = h('span', { class: 'phase-note', role: 'status' });
  const el = h('div', { class: 'phase-bar' }, h('ol', { class: 'phase-segs' }, segs), timer, h('div', { class: 'phase-btns' }, back, pause, next), note);

  async function send(body) {
    if (busy) return;
    busy = true;
    back.disabled = pause.disabled = next.disabled = true;
    note.textContent = '';
    try {
      const r = await ctx.call('boardPhase', { group, discipline: d, lesson: n, ...body });
      if (!alive || alive()) { phase = normPhase(r && r.phase); if (r && typeof r.now === 'number') changedSrv = r.now; offset = phaseOffset(r && r.now, Date.now()); paint(Date.now()); }
    } catch (e) {
      if (!(e && e.handled) && (!alive || alive())) note.textContent = 'Не получилось: ' + errText(e);
    } finally {
      busy = false;
      back.disabled = pause.disabled = next.disabled = false;
    }
  }
  const go = async dir => {
    const to = stepPhase(phase && phase.phase, dir);
    if (!to && phase && !(await confirmDialog(dir > 0 ? { title: 'Завершить занятие?', body: 'Таймер и этап будут сброшены.', ok: 'Завершить' } : { title: 'Вернуться до начала?', body: 'Этап «Вход» будет сброшен, занятие станет не начатым.', ok: 'Сбросить' }))) return;
    send(to ? { phase: to, minutes: minutes[to] } : { phase: null });
  };
  back.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  pause.addEventListener('click', () => { if (phase) send({ phase: phase.phase, paused: phase.pausedAt == null }); });

  function paint(clientNow) {
    const cur = phase ? phase.phase : null;
    segs.forEach(s => {
      const p = s.getAttribute('data-phase');
      const i = PHASES.indexOf(p);
      const ci = PHASES.indexOf(cur);
      s.className = `phase-seg${p === cur ? ' phase-cur' : ''}${ci >= 0 && i < ci ? ' phase-past' : ''}`;
      if (p === cur) s.setAttribute('aria-current', 'step'); else s.removeAttribute('aria-current');
    });
    if (!phase) { timer.textContent = ''; timer.className = 'phase-timer'; }
    else {
      const r = phaseRemainingMs(phase, clientNow + offset);
      timer.textContent = timerText(r);
      timer.className = `phase-timer${r < 0 ? ' phase-over' : ''}${phase.pausedAt != null ? ' phase-paused' : ''}`;
    }
    pause.hidden = !phase;
    pause.textContent = phase && phase.pausedAt != null ? '▶ Продолжить' : '⏸ Пауза';
    back.hidden = !phase;
    next.textContent = !phase ? '▶ Начать занятие' : cur === 'outro' ? '■ Завершить' : '▶ Следующий этап';
  }
  paint(Date.now());

  return {
    el,
    update(p, serverNow, clientNow) {
      if (busy || (typeof serverNow === 'number' && serverNow < changedSrv)) return;
      phase = normPhase(p);
      offset = phaseOffset(serverNow, clientNow);
      paint(clientNow);
    },
    tick: paint,
  };
}
