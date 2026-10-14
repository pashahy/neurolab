import { h } from '../util/dom.js';
import { holdText, queuedView, diagLine, MANUAL_COOLDOWN_MS, liveCapable } from '../submit-status.js';

// «1 работа ждёт отправки», «2 работы ждут отправки», «5 работ ждут отправки»
export function pendingTitle(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} работа ждёт отправки`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} работы ждут отправки`;
  return `${n} работ ждут отправки`;
}

// Запасной вариант, если вместе с новыми экранами в кэше телефона осталась старая копия submit.js (без status/subscribe):
// плашка без живого статуса — счёт и кнопка, как раньше
function plainBanner(app) {
  const n = app.submitter.pending();
  const btn = h('button', { class: 'btn small', type: 'button', onclick: async e => { e.target.disabled = true; await app.submitter.flush({ manual: true }); app.rerender(); } }, 'Отправить сейчас');
  const box = h('div', { class: 'card warn pending-banner' }, h('p', { class: 'pending-title' }, `⏳ ${pendingTitle(n)}`), btn);
  box.hidden = n === 0;
  return box;
}

// Плашка «N работ ждут отправки» для главной и карты курса. Обновляется сама (подписка на отправителя) и пропадает, когда
// очередь студента опустела. «Отправить сейчас» недоступна, пока идёт запрос, и 5 с после нажатия (потом включается
// одной запланированной перерисовкой). Подписка снимается, когда экран сменился.
export function pendingBanner(app) {
  const sub = app.submitter;
  if (!liveCapable(sub)) return plainBanner(app);
  const my = app.routeId;
  const title = h('p', { class: 'pending-title' });
  const status = h('p', { class: 'pending-status', role: 'status' });
  const retry = h('p', { class: 'hint' }); // отсчёт вне aria-live: иначе скринридер читал бы его каждую секунду
  const holds = h('div');
  const btn = h('button', { class: 'btn small', type: 'button' }, 'Отправить сейчас');
  // диагностика: по каждой работе — ПЗ, число попыток и последняя ошибка (текст сервера как есть); по скриншоту видно причину
  const diagList = h('ul', { class: 'pending-diag-list' });
  const diag = h('details', { class: 'pending-diag' }, h('summary', {}, 'Подробности'), diagList);
  const box = h('div', { class: 'card warn pending-banner' }, title, status, retry, holds, btn, diag);
  box.hidden = true;
  let unsubscribe = () => {};
  let ticker = null;
  let coolUntil = 0;
  let coolTimer = null;
  const stopTicker = () => { if (ticker !== null) { clearInterval(ticker); ticker = null; } };
  const cleanup = () => { unsubscribe(); stopTicker(); if (coolTimer !== null) { clearTimeout(coolTimer); coolTimer = null; } };

  function render() {
    if (app.routeId !== my) { cleanup(); return; }
    const st = sub.status();
    box.hidden = st.pending === 0;
    if (st.pending === 0) { stopTicker(); return; }
    const v = queuedView(st, { queued: true, outcome: null, hold: null });
    diagList.replaceChildren(...sub.details().map(d => h('li', {}, diagLine(d)))); // текстовые узлы: ответ сервера не разбирается как HTML
    title.textContent = `⏳ ${pendingTitle(st.pending)}`;
    status.textContent = v.text;
    retry.textContent = v.kind === 'wait' && v.retryIn !== null ? `Следующая попытка через ${v.retryIn} с` : '';
    retry.hidden = !retry.textContent;
    holds.replaceChildren(...st.held.map(reason => h('p', { class: 'hint' }, `${holdText(reason)}.`)));
    btn.hidden = st.limited; // до завтра сервер всё равно не примет — кнопка не нужна
    btn.disabled = st.inFlight || Date.now() < coolUntil;
    // секундный отсчёт нужен, только пока ждём автоповтор
    if (st.nextRetryAt !== null && ticker === null) ticker = setInterval(render, 1000);
    else if (st.nextRetryAt === null) stopTicker();
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
  return box;
}
