// Косметика песочницы: темы оформления, рамки аватара, аватары «Лаборатория». Открываются по уровню (индекс в LEVELS из js/gamification.js).
// Сервер проверяет рамки и новые аватары сам (levelIndexOf_ / FRAME_LEVELS / AVATAR_LEVELS в Code.gs; сверяет tests/cosmetics.test.js).
// Темы — только на телефоне: выбор лежит в черновиках студента (store) под ключом THEME_KEY.
import { LEVELS, levelFor } from '../gamification.js';
import { LAB_AVATARS } from '../avatars-v2.js';

export const THEME_KEY = 'sandbox:theme';

export const THEMES = [
  { code: 'default', title: 'Обычная', level: 0 },
  { code: 'neon', title: 'Неон', level: 1 },
  { code: 'terminal', title: 'Терминал', level: 2 },
  { code: 'forest', title: 'Лес', level: 3 },
  { code: 'cosmos', title: 'Космос', level: 5 },
];

export const FRAMES = [
  { code: 'none', title: 'Без рамки', level: 0 },
  { code: 'silver', title: 'Серебро', level: 1 },
  { code: 'mint', title: 'Мята', level: 2 },
  { code: 'gold', title: 'Золото', level: 3 },
  { code: 'neon', title: 'Неон', level: 4 },
  { code: 'aurora', title: 'Северное сияние', level: 5 },
  { code: 'royal', title: 'Королевская', level: 7 },
];

// Рамки, которые можно выбрать (без «Без рамки»), и новые аватары -> уровень; это же значение у сервера.
export const FRAME_LEVELS = FRAMES.filter(f => f.code !== 'none').reduce((m, f) => { m[f.code] = f.level; return m; }, {});
export const AVATAR_LEVELS = LAB_AVATARS.reduce((m, a) => { m[a.code] = a.level; return m; }, {});

export function levelIndexOf(xp) {
  return levelFor(Number(xp) > 0 ? Number(xp) : 0).index;
}

export function isUnlocked(item, xp) {
  return !!item && levelIndexOf(xp) >= item.level;
}

// «Откроется на уровне «Джуниор»»
export function lockText(item) {
  const lv = LEVELS[item.level];
  return 'Откроется на уровне «' + (lv ? lv.title : '?') + '»';
}

export function knownTheme(code) {
  return THEMES.some(t => t.code === code);
}

// Тема на корневом элементе: data-skin; «обычная» и неизвестные коды — без атрибута.
export function applyTheme(root, code) {
  if (!root || !root.setAttribute) return 'default';
  const c = knownTheme(code) && code !== 'default' ? code : 'default';
  if (c === 'default') root.removeAttribute('data-skin'); else root.setAttribute('data-skin', c);
  return c;
}

export function storedTheme(store) {
  let v = null;
  try { v = store.getDraft(THEME_KEY); } catch (e) { v = null; }
  return typeof v === 'string' && knownTheme(v) ? v : 'default';
}

export function saveTheme(store, code) {
  try { store.setDraft(THEME_KEY, knownTheme(code) ? code : 'default'); } catch (e) { /* хранилище недоступно */ }
}

// Класс рамки для <img> аватара; неизвестная рамка — без класса.
export function frameClass(code) {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(FRAME_LEVELS, code) ? 'frm frm-' + code : '';
}

export function avatarLevel(code) {
  return Object.prototype.hasOwnProperty.call(AVATAR_LEVELS, code) ? AVATAR_LEVELS[code] : 0;
}
