// B5: плашка «Группа сейчас: Практика · осталось 23 мин» вверху экрана ПЗ студента. Не блокирует работу.
// Этап приходит в ответе liveState (поле phase), поэтому api оборачивается: старые модули не меняются.
import { phaseOffset, studentPhaseText } from './phase-model.js';

// Обёртка api: ответы liveState отдают этап в onPhase(phase | null); остальные вызовы — без изменений.
export function withPhase(api, onPhase) {
  return {
    ...api,
    call: (action, body) => Promise.resolve(api.call(action, body)).then(res => {
      if (action === 'liveState' && res && typeof res === 'object') { try { onPhase(res.phase || null, Date.now()); } catch { /* плашка не должна ломать пульс */ } }
      return res;
    }),
  };
}

// Плашка поверх страницы. Возвращает { onPhase, stop }. doc/now/setTimer подменяются в тестах.
export function createPhaseBanner({ active = () => true, doc = typeof document !== 'undefined' ? document : null, now = Date.now } = {}) {
  let phase = null, offset = 0, el = null, full = null, brief = null, timer = null;
  function paint() {
    if (!doc) return;
    const text = active() ? studentPhaseText(phase, now() + offset) : null;
    const short = text ? studentPhaseText(phase, now() + offset, true) : '';
    if (!text) { if (el) { el.remove(); el = null; } if (!active()) stop(); return; }
    if (!el) {
      el = doc.createElement('div');
      el.className = 'phase-banner';
      el.setAttribute('role', 'status');
      full = doc.createElement('span'); full.className = 'phase-full';
      brief = doc.createElement('span'); brief.className = 'phase-short';
      el.append(full, brief);
      const main = doc.getElementById('app'); // под шапкой, над экраном (экран перерисовывается целиком — внутрь main не кладём)
      if (main && main.parentNode) main.parentNode.insertBefore(el, main); else doc.body.append(el);
    }
    if (full.textContent !== text) full.textContent = text;
    if (brief.textContent !== short) brief.textContent = short;
  }
  function stop() { if (timer !== null) { clearInterval(timer); timer = null; } phase = null; if (el) { el.remove(); el = null; } }
  return {
    onPhase(p, localNow) {
      phase = p || null;
      offset = p ? phaseOffset(p.now, localNow) : 0;
      if (phase && timer === null) timer = setInterval(paint, 5000);
      else if (!phase && timer !== null) { clearInterval(timer); timer = null; }
      paint();
    },
    stop,
  };
}
