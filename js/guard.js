// Детект userscript'ов автосдачи («NeuroLab AutoMaster» и клонов): они встраивают панель с id neurolab-automaster-root
// и элементами nam-*. При обнаружении: внедрённое удаляется, студент видит предупреждение, на сервер один раз уходит
// сигнал cheatSignal (журнал выполнения). Работу сайта не ломает: ошибки и офлайн молча игнорируем.
// Отдельный НОВЫЙ модуль намеренно (как js/lesson-open.js): в кэше могут быть старые копии app.js.
import { h } from './util/dom.js';

const SELECTORS = ['#neurolab-automaster-root', '[id^="nam-"]', '.nam-btn', '#nam-panel'];
let reported = false;
let warned = false;

function sweep(app) {
  let hit = false;
  for (const sel of SELECTORS) {
    let found;
    try { found = document.querySelectorAll(sel); } catch (e) { continue; }
    found.forEach(el => { hit = true; try { el.remove(); } catch (e) { /* уже удалён */ } });
  }
  if (!hit) return false;
  if (!warned) {
    warned = true;
    try {
      const note = h('div', { class: 'guard-warn', role: 'alert' },
        'Обнаружен скрипт автосдачи — он отключён. Такие сдачи помечаются и видны преподавателю.');
      document.body.append(note);
      setTimeout(() => { try { note.remove(); } catch (e) { /* уже удалён */ } }, 12000);
    } catch (e) { /* без уведомления */ }
  }
  if (!reported) {
    reported = true;
    try {
      const api = app && app.api;
      if (api && typeof api.call === 'function') {
        const p = api.call('cheatSignal', { tool: 'automaster', page: location.hash.slice(0, 80) });
        if (p && typeof p.then === 'function') p.then(() => {}, () => {});
      }
    } catch (e) { /* офлайн — молча */ }
  }
  return true;
}

export function startGuard(app) {
  try {
    sweep(app);
    const obs = new MutationObserver(() => { try { sweep(app); } catch (e) { /* пропуск */ } });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    return () => obs.disconnect();
  } catch (e) {
    return () => {};
  }
}
