import { h } from '../util/dom.js';
import { md } from '../util/text.js';
import { isV5, briefingErrors, briefingSlides } from '../lesson-v5-model.js';
import { loadSealedLesson } from '../sealed-content.js';

export const presentationHref = (discipline, n) => discipline === 'demo5' ? '#/present/demo5' : `#/present/${discipline}/${n}`;

export function briefingContent(lesson) {
  const b = lesson.briefing;
  return h('div', { class: 'v5-briefing' },
    h('p', { class: 'v5-lead' }, b.lead),
    h('div', { class: 'v5-summary-grid' }, b.sections.map(s => h('section', { class: 'card v5-summary' },
      h('h2', {}, s.title), h('div', { html: md(s.body) })))),
    h('section', { class: 'card v5-discussion' }, h('h2', {}, 'Обсудим перед самостоятельной работой'),
      h('p', {}, 'Здесь можно остановиться и задать вопросы преподавателю.'),
      h('ul', {}, b.questions.map(q => h('li', {}, q)))),
    h('section', { class: 'card v5-start' }, h('h2', {}, 'Как начать'), h('div', { html: md(b.start) })));
}

export function introV5(ctx) {
  const { view, lesson, draft, save, show, header, discipline } = ctx;
  view.append(header());
  if (briefingErrors(lesson.briefing).length) {
    view.append(h('p', { class: 'error', role: 'alert' }, 'Вводная теория этого занятия пока не подготовлена.'));
    return;
  }
  view.append(h('div', { class: 'v5-intro-head' },
    h('div', {}, h('span', { class: 'pill' }, `Вместе с преподавателем · ${lesson.briefing.minutes} мин`), h('h2', {}, lesson.briefing.title)),
    h('a', { class: 'btn', href: presentationHref(discipline, lesson.number), target: '_blank', rel: 'noopener' }, 'Режим для проектора')),
  briefingContent(lesson),
  h('div', { class: 'v5-intro-actions' },
    ctx.commentSlot ? ctx.commentSlot() : '', ctx.deadlineNote ? ctx.deadlineNote() : '',
    h('button', { class: 'btn primary big', type: 'button', onclick: () => { draft.stage = 'goal'; save(); show(); } }, 'Перейти к самостоятельной работе →'),
    ctx.canHomework ? h('button', { class: 'btn', type: 'button', onclick: () => ctx.openHomework() }, '📝 Домашнее задание') : ''));
}

// Only the public introduction is shown. This view never starts checks, changes a draft or submits work.
export async function renderPresentation(app, discipline, n) {
  const routeId = app.routeId;
  let lesson;
  try {
    if (discipline === 'demo5') lesson = (await import('../../content/demo-v5.js')).default;
    else if (['dup01', 'dup03'].includes(discipline) && Number.isInteger(n) && n > 0) lesson = await loadSealedLesson(discipline, n);
    if (!isV5(lesson) || briefingErrors(lesson.briefing).length) throw new Error('No briefing');
  } catch {
    if (app.routeId === routeId) app.root.replaceChildren(h('p', { class: 'error', role: 'alert' }, 'Вводная теория v5 для этого занятия недоступна.'));
    return;
  }
  if (app.routeId !== routeId) return;
  const slides = briefingSlides(lesson);
  let current = 0;
  const slide = h('section', { class: 'v5-slide', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const previous = h('button', { class: 'btn', type: 'button', onclick: () => move(-1) }, '← Назад');
  const next = h('button', { class: 'btn primary', type: 'button', onclick: () => move(1) }, 'Дальше →');
  const count = h('span', { class: 'v5-slide-count', role: 'status' });
  const controls = h('nav', { class: 'v5-slide-controls', 'aria-label': 'Управление показом' }, previous, count, next);
  const status = h('p', { class: 'hint', role: 'status' });
  const lessonHref = discipline === 'demo5' ? '#/demo5' : `#/d/${discipline}/${n}`;
  const frame = h('div', { class: 'v5-presentation', tabindex: '0', onkeydown: e => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); move(1); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); move(-1); }
  } },
    h('header', { class: 'v5-presentation-head' }, h('span', {}, lesson.title),
      h('a', { class: 'btn small', href: lessonHref }, 'Открыть ПЗ'),
      h('button', { class: 'btn small', type: 'button', onclick: async () => {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else if (frame.requestFullscreen) await frame.requestFullscreen();
          else status.textContent = 'Полноэкранный режим недоступен в этом браузере.';
        } catch { status.textContent = 'Полноэкранный режим недоступен в этом браузере.'; }
      } }, 'На весь экран')),
    slide, controls, status);
  function move(delta) { current = Math.max(0, Math.min(slides.length - 1, current + delta)); draw(); }
  function draw() {
    const s = slides[current];
    slide.replaceChildren(h('p', { class: 'v5-slide-label' }, s.label || 'Ключевая идея'), h('h1', {}, s.title),
      s.questions ? h('ul', {}, s.questions.map(q => h('li', {}, q))) : h('div', { class: 'v5-slide-body', html: md(s.body) }));
    slide.scrollTop = 0;
    previous.disabled = current === 0;
    next.disabled = current === slides.length - 1;
    count.textContent = `${current + 1} / ${slides.length}`;
  }
  app.root.replaceChildren(frame);
  draw();
  frame.focus();
}
