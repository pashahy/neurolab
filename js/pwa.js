// PWA: регистрация service worker и подсказка «Установить на главный экран» (в профиле).
import { h } from './util/dom.js';

let deferred = null;
let redraw = null; // одна подписка: перерисовывает блок текущего профиля

function notify() { try { if (redraw) redraw(); } catch (err) { /* тихо */ } }

export function canRegister(loc, nav) {
  if (!nav || !('serviceWorker' in nav)) return false;
  const host = loc.hostname;
  return loc.protocol === 'https:' || host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

export function registerPWA() {
  try {
    if (typeof window === 'undefined' || !canRegister(window.location, window.navigator)) return;
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferred = e;
      notify();
    });
    window.addEventListener('appinstalled', () => { deferred = null; notify(); });
    const reg = () => { navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {}); };
    if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg);
  } catch (err) { /* тихо */ }
}

function standalone() {
  try {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  } catch (e) { return false; }
}

function isIOS() {
  const ua = (window.navigator && window.navigator.userAgent) || '';
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1);
}

// Небольшой блок для профиля; null, если установка уже сделана или недоступна.
export function installHint() {
  try {
    if (standalone()) return null;
    const box = h('section', { class: 'card', 'aria-label': 'Установка' });
    const draw = () => {
      if (deferred) {
        box.hidden = false;
        box.replaceChildren(
          h('p', { class: 'hint' }, 'Можно открывать практикум с главного экрана, как приложение.'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => {
            const ev = deferred; deferred = null;
            if (ev && ev.prompt) { ev.prompt(); }
            draw();
          } }, 'Установить на главный экран'));
      } else if (isIOS()) {
        box.hidden = false;
        box.replaceChildren(h('p', { class: 'hint' }, 'Чтобы открывать как приложение: Поделиться → На экран «Домой».'));
      } else {
        box.hidden = true;
      }
    };
    redraw = () => { if (box.isConnected) draw(); else redraw = null; };
    draw();
    return box;
  } catch (e) { return null; }
}
