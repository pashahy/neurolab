import { h, add } from '../util/dom.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export async function renderRating(app) {
  const my = app.routeId;
  const p = app.store.profile();
  const box = h('div', { class: 'card' }, h('p', { class: 'loading' }, 'Загружаем рейтинг…'));
  add(app.root, h('a', { href: '#/', class: 'back' }, '← Главная'), h('h1', {}, `🏆 Рейтинг группы ${p.group}`), box);
  try {
    const r = await app.api.rating();
    if (app.routeId !== my) return;
    if (!r.top.length) { box.replaceChildren(h('p', {}, 'В группе пока нет сданных работ — станьте первым!')); return; }
    box.replaceChildren(
      h('ol', { class: 'rating' }, r.top.map(x => h('li', { class: x.me ? 'me' : '' },
        h('span', { class: 'place' }, MEDALS[x.place - 1] || String(x.place)), h('span', { class: 'name' }, x.name), h('span', { class: 'xp' }, `${x.xp} XP`)))),
      r.me ? h('p', { class: 'my-place' }, `Ваше место: ${r.me.place} из ${r.total} · ${r.me.xp} XP`) : h('p', { class: 'hint' }, 'Сдайте первую работу, чтобы попасть в рейтинг.'),
      h('p', { class: 'hint' }, 'Показаны первые пять мест. Учитывается лучшая попытка каждого занятия.'));
  } catch (e) {
    if (app.routeId !== my) return;
    if (e && e.auth) { app.authExpired(); return; }
    box.replaceChildren(h('p', {}, 'Рейтинг сейчас недоступен: нет связи с сервером. Попробуйте позже.'));
  }
}
