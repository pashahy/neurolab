// C2: интерактив на доске — только «зрительский» вид: вопрос + живые результаты (управление — на «Моём экране»).
// Модель режима отделена от DOM. Правильный ответ приходит от сервера только после «Показать ответ» (item.revealed).
import { h } from '../util/dom.js';
import { inlineCode } from '../util/inline-code.js';
import { histogramRows, bugRows, bugNotes, cloudWords, kindIcon, controlState } from './board-live.js';
import { isAbsent } from './board-absent.js';

// «Ответили N из M»: M — без отсутствующих на паре
export function answeredLine(results, students) {
  const list = Array.isArray(students) ? students : [];
  return `Ответили: ${results ? results.total : 0} из ${list.filter(s => !isAbsent(s)).length}`;
}

// Ответ опроса, запрошенный до последнего действия преподавателя (reveal/stop), устарел и игнорируется
export const isStaleReply = (requestedAt, actedAt) => !!actedAt && requestedAt < actedAt;

// Какой экран показывает доска: активный интерактив — вопрос (пока преподаватель не выбрал «плитки»), иначе плитки.
export function boardMode(item, pref) {
  if (!item) return 'tiles';
  return pref === 'tiles' ? 'tiles' : 'question';
}

// Выбор «плитки / вопрос» сбрасывается на «вопрос» при запуске нового вопроса и когда интерактива нет.
export function nextPref(prevStarted, item, pref) {
  if (!item) return { started: null, pref: 'question' };
  if (item.startedAt !== prevStarted) return { started: item.startedAt, pref: 'question' };
  return { started: prevStarted, pref: pref === 'tiles' ? 'tiles' : 'question' };
}

// Вид. call — ctx.call; ref — { group, discipline, lesson }.
export function createIaView({ call, ref, onStop, onAct }) {
  let data = null, busy = false;
  const status = h('p', { class: 'iav-status', role: 'status' });
  const head = h('div', { class: 'iav-head' });
  const view = h('div', { class: 'iav-view' });
  const el = h('section', { class: 'lp lp-board iav', 'aria-label': 'Интерактив' }, head, status, view);

  async function act(action, id) {
    if (busy) return;
    busy = true; status.textContent = '';
    try {
      const r = await call(action, { ...ref, id });
      if (onAct && !(r && r.ok === false)) onAct();
      if (r && r.ok === false) status.textContent = r.error || 'Не получилось';
      else if (action === 'boardReveal') data = { ...(data || {}), item: r.item };
      else if (action === 'boardStop') { data = { ...(data || {}), item: null, results: null }; if (onStop) onStop(); }
    } catch (e) {
      if (!(e && e.handled)) status.textContent = (e && e.message) || 'Нет связи';
    }
    busy = false;
    paint();
  }

  function paintHead() {
    const item = data && data.item;
    head.replaceChildren();
    if (!item) return;
    const cs = controlState(item);
    const b = (label, fn) => { const x = h('button', { class: 'iav-btn', type: 'button' }, label); x.disabled = busy; x.addEventListener('click', fn); return x; };
    head.append(
      h('h2', { class: 'iav-title' }, `${kindIcon(item.kind)} `, inlineCode(item.text)),
      h('div', { class: 'iav-side' },
        h('div', { class: 'lp-count' }, answeredLine(data.results, data.students)),
        h('div', { class: 'iav-corner' },
          cs.canReveal ? b('Показать ответ', () => act('boardReveal', item.id)) : null,
          b('Завершить', () => act('boardStop', item.id)))));
  }

  function paintResults() {
    const item = data && data.item;
    const res = data && data.results;
    view.replaceChildren();
    if (!item) return;
    if (item.kind === 'poll') {
      view.append(h('div', { class: 'lp-bars' }, histogramRows(item, res).map(r => h('div', { class: `lp-bar${r.correct ? ' right' : ''}` },
        h('div', { class: 'lp-bar-label' }, r.correct ? '✓ ' : '', inlineCode(r.label)),
        h('div', { class: 'lp-bar-track' }, h('div', { class: 'lp-bar-fill', style: `width:${r.pct}%` })),
        h('div', { class: 'lp-bar-num' }, `${r.count}`)))));
    } else if (item.kind === 'bug') {
      view.append(h('div', { class: 'lp-code' }, bugRows(item, res).map(r => h('div', { class: `lp-line${r.correct ? ' right' : ''}`, style: `--heat:${r.heat.toFixed(2)}` },
        h('span', { class: 'lp-line-n' }, String(r.n)), h('span', { class: 'lp-line-t' }, r.line), h('span', { class: 'lp-line-c' }, r.count ? String(r.count) : '')))));
      const notes = bugNotes(item);
      if (notes) view.append(h('p', { class: 'lp-notes' }, notes));
    } else {
      const words = cloudWords(res, 26, 100);
      view.append(h('div', { class: 'lp-cloud' }, words.length
        ? words.map(w => h('span', { class: 'lp-word', style: `font-size:${w.size}px` }, w.w))
        : h('p', { class: 'lp-empty' }, 'Ответов пока нет')));
    }
  }

  function paint() { paintHead(); paintResults(); }
  return { el, update(d) { data = d; paint(); } };
}

// Маленький переключатель «плитки / вопрос» в шапке доски; виден, только пока интерактив активен.
export function createIaSwitch(onPick) {
  const mk = (mode, label) => { const b = h('button', { class: 'iav-btn', type: 'button', 'aria-pressed': 'false' }, label); b.addEventListener('click', () => onPick(mode)); return b; };
  const tiles = mk('tiles', 'плитки'), question = mk('question', 'вопрос');
  const el = h('span', { class: 'iav-seg', role: 'group', 'aria-label': 'Что показывать', hidden: true }, tiles, question);
  return {
    el,
    update(item, mode) {
      el.hidden = !item;
      tiles.setAttribute('aria-pressed', String(mode === 'tiles'));
      question.setAttribute('aria-pressed', String(mode === 'question'));
    },
  };
}
