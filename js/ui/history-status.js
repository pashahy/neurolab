import { h } from '../util/dom.js';

export function historyCountText(app, done, total) {
  const status = app.syncProgress.status?.();
  return done === 0 && status && !status.loaded
    ? 'История сдач ещё не загружена'
    : `Сдано ${done} из ${total} доступных занятий`;
}

export function historyStatus(app) {
  if (typeof app.syncProgress.status !== 'function') return null;
  const id = app.routeId;
  const text = h('p', { role: 'status' });
  const retry = h('button', { class: 'btn small', type: 'button' }, 'Загрузить историю работ');
  const box = h('div', { class: 'card history-status' }, text, retry);
  box.hidden = true;
  const render = () => {
    if (app.routeId !== id) return;
    const s = app.syncProgress.status();
    const wasPending = !box.hidden;
    box.hidden = s.phase === 'ready';
    if (s.phase === 'ready' && wasPending) queueMicrotask(() => { if (app.routeId === id) app.rerender(); });
    text.textContent = s.phase === 'loading'
      ? 'Загружаем выполненные работы с сервера…'
      : 'Не удалось загрузить историю с другого устройства. Показаны только работы, сохранённые на этом устройстве.';
    retry.disabled = s.phase === 'loading';
  };
  app.updateHistoryStatus = render;
  retry.addEventListener('click', async () => {
    retry.disabled = true;
    await app.syncProgress({ force: true });
    if (app.routeId === id && app.syncProgress.status().phase === 'ready') app.rerender();
    else render();
  });
  render();
  return box;
}
