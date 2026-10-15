import { h, add } from '../util/dom.js';
import { renderHall } from './hall.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export async function renderRating(app) {
  const my = app.routeId;
  const p = app.store.profile();
  const box = h('div', { class: 'card' }, h('p', { class: 'loading' }, 'Загружаем рейтинг…'));
  add(app.root, h('a', { href: '#/', class: 'back' }, '← Главная'), h('h1', { class: 'display' }, '🏆 Рейтинг группы ', h('span', { class: 'nowrap' }, p.group)), box);
  try {
    // не чаще раза в минуту на студента (кэш), после своей сдачи — заново; без loadRating (старая копия app.js) — как раньше
    const r = await (typeof app.loadRating === 'function' ? app.loadRating() : app.api.rating());
    if (app.routeId !== my) return;
    if (!r.top.length) { box.replaceChildren(h('p', {}, 'В группе пока нет сданных работ — станьте первым!')); return; }
    box.replaceChildren(
      h('ol', { class: 'rating' }, r.top.map(x => h('li', { class: x.me ? 'me' : '' },
        h('span', { class: 'place' }, MEDALS[x.place - 1] || String(x.place)), h('span', { class: 'name' }, x.name), h('span', { class: 'xp' }, `${x.xp} XP`)))),
      r.me ? h('p', { class: 'my-place' }, `Ваше место: ${r.me.place} из ${r.total} · ${r.me.xp} XP`) : h('p', { class: 'hint' }, 'Сдайте первую работу, чтобы попасть в рейтинг.'),
      h('p', { class: 'hint' }, 'Показаны первые пять мест. Учитывается лучшая попытка каждого занятия.'),
      renderHall(r.hall));
  } catch (e) {
    if (app.routeId !== my) return;
    if (e && e.auth) { app.authExpired(); return; }
    // сервер без таблицы баллов («no table») не считает рейтинг: не показываем неподтверждённые числа
    if (e && !e.network && e.message === 'no table') { box.replaceChildren(h('p', {}, 'Рейтинг временно недоступен. Попробуйте позже.')); return; }
    box.replaceChildren(h('p', {}, 'Рейтинг сейчас недоступен: нет связи с сервером. Попробуйте позже.'));
  }
}
