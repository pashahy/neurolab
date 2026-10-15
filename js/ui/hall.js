// Зал славы песочницы на экране рейтинга. Новый модуль (в кэше телефона старых копий нет).
import { h } from '../util/dom.js';
import { avatarUrl } from '../avatars.js';
import { daysWord } from '../sandbox/streak-view.js';

// Строки блока: { img, alt, text }; пусто — блок не показывается.
export function hallRows(hall) {
  if (!hall || typeof hall !== 'object') return [];
  const rows = [];
  (Array.isArray(hall.streaks) ? hall.streaks : []).forEach(e => {
    if (!e || !e.name) return;
    rows.push({ img: e.avatar ? avatarUrl(e.avatar) : '', alt: String(e.name), text: `🔥 ${e.name} — ${e.streak} ${daysWord(e.streak)}` });
  });
  const f = hall.firstToday;
  if (f && f.name) rows.push({ img: f.avatar ? avatarUrl(f.avatar) : '', alt: String(f.name), text: `🥇 Первым сегодня: ${f.name} в ${f.at}` });
  return rows;
}

export function renderHall(hall) {
  const rows = hallRows(hall);
  if (!rows.length) return null;
  return h('div', { class: 'hall' },
    h('h2', { class: 'hall-title' }, 'Песочница'),
    h('ul', { class: 'hall-list' }, rows.map(r => h('li', { class: 'hall-row' },
      r.img ? h('img', { src: r.img, alt: r.alt, width: '32', height: '32', class: 'hall-ava' }) : null,
      h('span', {}, r.text)))));
}
