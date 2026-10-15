// Серия песочницы: подписи для экранов. Бонусы: 3 -> +10, 7 -> +30, 14 -> +70, дальше +70 за каждые 14 дней (28, 42, ...).

// ближайший бонус строго впереди текущей серии
export function nextBonus(streak) {
  const s = Math.max(0, Math.floor(Number(streak) || 0));
  if (s < 3) return { at: 3, points: 10 };
  if (s < 7) return { at: 7, points: 30 };
  if (s < 14) return { at: 14, points: 70 };
  return { at: (Math.floor(s / 14) + 1) * 14, points: 70 };
}

export function daysWord(n) {
  const m100 = n % 100;
  const m10 = n % 10;
  if (m100 >= 11 && m100 <= 14) return 'дней';
  if (m10 === 1) return 'день';
  if (m10 >= 2 && m10 <= 4) return 'дня';
  return 'дней';
}

export function streakLabel({ streak } = {}) {
  const s = Math.max(0, Math.floor(Number(streak) || 0));
  if (s === 0) return 'Начни серию сегодня';
  const nb = nextBonus(s);
  return `Серия ${s} ${daysWord(s)} 🔥 — ещё ${nb.at - s} до +${nb.points}`;
}

export function freezeLabel(freeze) {
  return freeze ? '🧊 Заморозка есть' : '🧊 Заморозка потрачена — вернётся на 7-й день';
}
