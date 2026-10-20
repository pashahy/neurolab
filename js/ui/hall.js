// Зал славы песочницы на экране рейтинга. Новый модуль (в кэше телефона старых копий нет).
import { h } from '../util/dom.js';
import { avatarUrl } from '../avatars.js';
import { daysWord } from '../sandbox/streak-view.js';
import { frameClass } from '../sandbox/cosmetics.js';

const withFrame = (row, e) => { const c = frameClass(e.frame); if (c) row.cls = c; return row; };

// Строки блока: { img, alt, text }; пусто — блок не показывается.
export function hallRows(hall) {
  if (!hall || typeof hall !== 'object') return [];
  const rows = [];
  (Array.isArray(hall.streaks) ? hall.streaks : []).forEach(e => {
    if (!e || !e.name) return;
    rows.push(withFrame({ img: e.avatar ? avatarUrl(e.avatar) : '', alt: String(e.name), text: `🔥 ${e.name} — ${e.streak} ${daysWord(e.streak)}` }, e));
  });
  const f = hall.firstToday;
  if (f && f.name) rows.push(withFrame({ img: f.avatar ? avatarUrl(f.avatar) : '', alt: String(f.name), text: `🥇 Первым сегодня: ${f.name} в ${f.at}` }, f));
  return rows;
}

export function renderHall(hall) {
  const rows = hallRows(hall);
  if (!rows.length) return null;
  return h('div', { class: 'hall' },
    h('h2', { class: 'hall-title' }, 'Песочница'),
    h('ul', { class: 'hall-list' }, rows.map(r => h('li', { class: 'hall-row' },
      r.img ? h('img', { src: r.img, alt: r.alt, width: '32', height: '32', class: ('hall-ava ' + (r.cls || '')).trim() }) : null,
      h('span', {}, r.text)))));
}
