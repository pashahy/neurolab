// «Зал славы» (B7): модель разделов (чистые функции) и панель с DOM. Доска показывает только аватары, «Мой экран» — с именами.
import { h } from '../util/dom.js';
import { avatarUrl, defaultAvatar } from '../avatars.js';
import { daysWord } from '../sandbox/streak-view.js';
import { errText } from '../ui/login.js';

export const HALL_REFRESH_MS = 60000; // пока зал открыт; сервер всё равно кэширует на 5 минут

export function pointsWord(n) {
  if (!Number.isInteger(n)) return 'балла';
  const m100 = Math.abs(n) % 100;
  const m10 = m100 % 10;
  if (m100 >= 11 && m100 <= 14) return 'баллов';
  return m10 === 1 ? 'балл' : m10 >= 2 && m10 <= 4 ? 'балла' : 'баллов';
}

const list = v => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []);
const img = e => avatarUrl(e.avatar || defaultAvatar(''));

function ranked(entries, names) {
  return list(entries).map((e, i) => ({
    place: i + 1,
    img: img(e),
    alt: names && e.name ? String(e.name) : '',
    label: names && e.name ? String(e.name) : '',
    text: `${e.points} ${pointsWord(e.points)}`,
  }));
}

// -> [{ id, title, hint, items: [{ place, img, alt, label, text }], extra: [{ img, alt, text }] }]
export function hallSections(data, names) {
  const d = data && typeof data === 'object' ? data : {};
  const who = e => (names && e.name ? `${e.name} — ` : '');
  const extra = list(d.streaks).map(e => ({
    img: img(e), alt: names && e.name ? String(e.name) : '',
    text: names && e.name ? `🔥 ${e.name} — ${e.streak} ${daysWord(e.streak)}` : `🔥 серия ${e.streak} ${daysWord(e.streak)}`,
  }));
  const f = d.firstToday && typeof d.firstToday === 'object' ? d.firstToday : null;
  if (f) extra.push({ img: img(f), alt: names && f.name ? String(f.name) : '', text: `🥇 ${who(f)}первым сегодня в ${f.at}` });
  return [
    { id: 'sandbox', title: '🧪 Песочница за неделю', hint: 'Очки песочницы за последние 7 дней', items: ranked(d.sandbox, names), extra },
    { id: 'lessons', title: '📘 Занятия за неделю', hint: 'Баллы за ПЗ: авто, лучшая попытка за неделю', items: ranked(d.lessons, names), extra: [] },
  ];
}

function sectionEl(s) {
  const rows = s.items.map(it => h('li', { class: 'hall-item' },
    h('span', { class: 'hall-place' }, String(it.place)),
    h('img', { class: 'hall-pic', src: it.img, alt: it.alt, width: '72', height: '72', draggable: 'false' }),
    h('span', { class: 'hall-text' }, it.label ? h('span', { class: 'hall-label' }, it.label) : null, h('span', { class: 'hall-pts' }, it.text))));
  const more = s.extra.map(it => h('li', { class: 'hall-extra' },
    h('img', { class: 'hall-pic-s', src: it.img, alt: it.alt, width: '44', height: '44', draggable: 'false' }), h('span', {}, it.text)));
  return h('section', { class: `hall-sec hall-${s.id}` },
    h('h2', { class: 'hall-h' }, s.title),
    rows.length ? h('ol', { class: 'hall-list' }, rows) : h('p', { class: 'hall-empty' }, 'Пока пусто'),
    more.length ? h('ul', { class: 'hall-more' }, more) : null);
}

// Панель: { el, open(), close() }. names — подписи именами («Мой экран»); alive() — маршрут жив.
export function hallPanel(ctx, { group, names, alive }) {
  const body = h('div', { class: 'hall-body' });
  const note = h('p', { class: 'hall-note', role: 'status' });
  const el = h('div', { class: 'hall-box' }, body, note);
  let timer = null;
  let seq = 0;
  async function load() {
    const me = ++seq;
    try {
      const r = await ctx.call('boardHall', names ? { group, names: true } : { group });
      if (me !== seq || !alive()) return;
      body.replaceChildren(...hallSections(r, names).map(sectionEl));
      note.textContent = '';
    } catch (e) {
      if (me !== seq || !alive() || (e && e.handled)) return;
      note.textContent = body.childNodes.length ? 'Нет связи, показаны прошлые данные.' : `Не получилось загрузить: ${errText(e)}`;
    }
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => { if (!alive()) return; if (!document.hidden) load(); schedule(); }, HALL_REFRESH_MS);
  }
  return {
    el,
    open() { note.textContent = 'Загружаем…'; load(); schedule(); },
    close() { clearTimeout(timer); seq++; },
  };
}

// Доска: кнопка в шапке + полноэкранное окно (аватары, без имён).
export function hallOverlay(ctx, { group, alive, host, button }) {
  const panel = hallPanel(ctx, { group, names: false, alive });
  const close = h('button', { class: 'defense-btn', type: 'button' }, 'Закрыть');
  const box = h('div', { class: 'hall-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Зал славы' },
    h('h1', { class: 'hall-title' }, '🏆 Зал славы'), panel.el, h('div', { class: 'defense-actions' }, close));
  const overlay = h('div', { class: 'defense-overlay hall-overlay', hidden: true }, box);
  host.append(overlay);
  function shut() { overlay.hidden = true; panel.close(); button.focus(); }
  button.addEventListener('click', () => { overlay.hidden = false; panel.open(); close.focus(); });
  close.addEventListener('click', shut);
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') shut(); });
}
