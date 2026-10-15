export const LEVELS = [
  { min: 0, title: 'Стажёр' },
  { min: 150, title: 'Младший специалист' },
  { min: 400, title: 'Джуниор' },
  { min: 800, title: 'Джуниор+' },
  { min: 1400, title: 'Мидл' },
  { min: 2200, title: 'Сеньор' },
  { min: 3200, title: 'Тимлид' },
  { min: 4500, title: 'Архитектор ИИ' },
];

export const PERFECT_BONUS = 20;

export function levelFor(xp) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].min) i++;
  const cur = LEVELS[i];
  const next = LEVELS[i + 1] ?? null;
  return { index: i, title: cur.title, min: cur.min, next: next?.min ?? null, nextTitle: next?.title ?? null, progress: next ? (xp - cur.min) / (next.min - cur.min) : 1 };
}

export function xpGain(prev, result) {
  let xp = Math.round(Math.max(0, result.score - (prev?.best ?? 0)) * 10);
  if (result.max > 0 && result.score === result.max && !prev?.perfect) xp += PERFECT_BONUS;
  return xp;
}

const done = s => Object.keys(s.progress);
// статистика песочницы лежит в черновиках студента (js/sandbox/storage.js, ключ sandbox:stats)
const sbxStat = (s, k) => { const v = s.drafts && s.drafts['sandbox:stats']; return v && Number(v[k]) || 0; };
const perfectType =type => (s, c) => !!c.perfectTypes?.includes(type);

export const BADGES = [
  { id: 'first', icon: '🎫', title: 'Первый рабочий день', desc: 'Сдать первое занятие', test: s => done(s).length >= 1 },
  { id: 'perfect', icon: '💎', title: 'Без единой ошибки', desc: 'Набрать 100 % автобаллов в занятии', test: s => Object.values(s.progress).some(p => p.perfect) },
  { id: 'five', icon: '🔥', title: 'Втянулся', desc: 'Сдать 5 занятий', test: s => done(s).length >= 5 },
  { id: 'fifteen', icon: '🚀', title: 'На орбите', desc: 'Сдать 15 занятий', test: s => done(s).length >= 15 },
  { id: 'thirty', icon: '🏅', title: 'Ветеран НейроЛаба', desc: 'Сдать 30 занятий', test: s => done(s).length >= 30 },
  { id: 'both', icon: '🧭', title: 'Универсал', desc: 'Сдать занятия по обеим дисциплинам', test: s => done(s).some(k => k.startsWith('dup01/')) && done(s).some(k => k.startsWith('dup03/')) },
  { id: 'days3', icon: '📅', title: 'Постоянство', desc: 'Сдавать работы в 3 разных дня', test: s => s.days.length >= 3 },
  { id: 'hunter', icon: '🕵️', title: 'Охотник за галлюцинациями', desc: 'Без ошибок пройти карточки «правда или нет»', test: perfectType('swipe') },
  { id: 'architect', icon: '🧩', title: 'Архитектор промптов', desc: 'Идеально собрать промпт в конструкторе', test: perfectType('prompt-builder') },
  { id: 'coder', icon: '🐍', title: 'Питонист', desc: 'Пройти все тесты Python-задания', test: perfectType('python') },
  { id: 'terminal', icon: '🌱', title: 'Повелитель терминала', desc: 'Выполнить все цели в тренажёре терминала', test: perfectType('terminal') },
  { id: 'bug', icon: '🐞', title: 'Зоркий глаз', desc: 'Найти все ошибки в задании «найди ошибку»', test: perfectType('hotspot') },
  { id: 'sbx-first', icon: '🧪', title: 'Первая задача дня', desc: 'Решить задачу дня в песочнице', test: s => sbxStat(s, 'solved') >= 1 },
  { id: 'sbx-streak3', icon: '🔥', title: 'Серия 3', desc: 'Решать задачи дня 3 дня подряд', test: s => sbxStat(s, 'bestStreak') >= 3 },
  { id: 'sbx-streak7', icon: '⚡', title: 'Серия 7', desc: 'Решать задачи дня 7 дней подряд', test: s => sbxStat(s, 'bestStreak') >= 7 },
  { id: 'sbx-streak14', icon: '🌋', title: 'Серия 14', desc: 'Решать задачи дня 14 дней подряд', test: s => sbxStat(s, 'bestStreak') >= 14 },
  { id: 'sbx-star10', icon: '⭐', title: 'Звёздный', desc: 'Решить 10 задач со звёздочкой', test: s => sbxStat(s, 'starSolved') >= 10 },
];

export function newBadges(state, ctx = {}) {
  return BADGES.filter(b => !state.badges.includes(b.id) && b.test(state, ctx)).map(b => b.id);
}
