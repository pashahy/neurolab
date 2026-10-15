// Мелочи задачи дня: тексты отказов, дата по Москве, награды-значки, поле «бонус» ответа сервера.
import { BADGES, newBadges } from '../gamification.js';

export const STALE_TEXT = 'Эта задача была вчерашней — реши сегодняшнюю';

// текст отказа сервера: 'stale' — понятная фраза, остальное как пришло
export function rejectText(error) {
  if (error === 'stale') return STALE_TEXT;
  return typeof error === 'string' && error ? error : 'Сервер не принял решение';
}

// сегодняшняя дата по Москве (UTC+3 без перехода на летнее время), как на сервере
export function moscowDate(now) {
  return new Date((typeof now === 'number' ? now : Date.now()) + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

// бонус за серию: сервер шлёт { n, points }; старое число тоже понимаем
export function bonusPoints(bonus) {
  if (bonus && typeof bonus === 'object') return Number(bonus.points) || 0;
  return Number(bonus) || 0;
}

// выдаёт значки песочницы по сохранённой статистике; возвращает описания новых (пусто, если нечего)
export function awardSandboxBadges(store) {
  const ids = newBadges(store.state(), {});
  if (!ids.length) return [];
  return store.addBadges(ids).map(id => BADGES.find(b => b.id === id)).filter(Boolean);
}
