import { h } from '../util/dom.js';
import { queuedView, MANUAL_COOLDOWN_MS, liveCapable } from '../submit-status.js';

// Живой статус работы, которая не ушла сразу (сбой сети, таймаут, ошибка или busy сервера) на экране «Работа сохранена».
// Показывает попытки и обратный отсчёт, кнопку «Отправить сейчас» (недоступна, пока идёт запрос, и 5 с после нажатия), и сам
// превращается в «✓ Работа сдана» (или «Работа не принята»), когда повтор удался, — без перезагрузки страницы.
// «Сдана» — только по записанному итогу отправки; работа, пропавшая из очереди без итога, — нейтральное сообщение.
// parts — { icon, title, text }: элементы экрана, которые меняются по итогу. Возвращает { nodes, stop }.
// Если в кэше телефона осталась старая копия submit.js (без status/subscribe), живого статуса нет: nodes пуст.
export function queuedLive(app, { id, parts }) {
  const sub = app.submitter;
  if (!liveCapable(sub)) return { nodes: [], stop() {} };
  const my = app.routeId;
  const main = h('p', { class: 'send-status-main' });
  const node = h('div', { class: 'send-status', role: 'status', 'aria-live': 'polite' }, main);
  const retry = h('p', { class: 'hint send-status-retry' }); // отсчёт вне aria-live: иначе скринридер читал бы его каждую секунду
  const btn = h('button', { class: 'btn big', type: 'button' }, 'Отправить сейчас');
  let unsubscribe = () => {};
  let ticker = null;
  let coolUntil = 0;
  let coolTimer = null;
  const stop = () => {
    unsubscribe();
    if (ticker !== null) { clearInterval(ticker); ticker = null; }
    if (coolTimer !== null) { clearTimeout(coolTimer); coolTimer = null; }
  };

  function render() {
    if (app.routeId !== my) { stop(); return; } // экран сменился (другое занятие, выход)
    const st = sub.status();
    const v = queuedView(st, { queued: sub.isQueued(id), outcome: sub.outcome(id), hold: sub.holdOf(id), item: sub.itemError(id) });
    main.textContent = v.text;
    node.className = `send-status ${v.kind}`;
    retry.textContent = v.kind === 'wait' && v.retryIn !== null ? `Следующая попытка через ${v.retryIn} с` : '';
    retry.hidden = !retry.textContent;
    if (v.kind === 'sent') {
      parts.icon.textContent = '🎉';
      parts.title.textContent = 'Работа сдана!';
      parts.text.textContent = 'Результат уже в таблице преподавателя.';
      btn.hidden = true;
      stop();
      return;
    }
    if (v.kind === 'rejected') {
      parts.icon.textContent = '⚠️';
      parts.title.textContent = 'Работа не принята';
      parts.text.textContent = '';
      node.setAttribute('role', 'alert');
      btn.hidden = true;
      stop();
      return;
    }
    if (v.kind === 'gone') { // пропала из очереди без итога (другая вкладка): не утверждаем «сдана»
      parts.text.textContent = '';
      btn.hidden = true;
      stop();
      return;
    }
    btn.hidden = v.kind === 'limit'; // до завтра сервер всё равно не примет
    btn.disabled = v.kind === 'sending' || Date.now() < coolUntil;
    if (st.nextRetryAt !== null && ticker === null) ticker = setInterval(render, 1000);
    else if (st.nextRetryAt === null && ticker !== null) { clearInterval(ticker); ticker = null; }
  }

  btn.addEventListener('click', () => {
    btn.disabled = true;
    coolUntil = Date.now() + MANUAL_COOLDOWN_MS;
    if (coolTimer !== null) clearTimeout(coolTimer);
    coolTimer = setTimeout(() => { coolTimer = null; render(); }, MANUAL_COOLDOWN_MS + 50);
    sub.flush({ manual: true });
  });
  unsubscribe = sub.subscribe(render);
  render();
  return { nodes: [node, retry, btn], stop };
}
