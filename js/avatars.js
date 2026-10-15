// Аватары студентов: 24 рисованных SVG в content/avatars/<код>.svg. Новый модуль (в кэше телефона старых копий нет).
// Правило аватара по умолчанию то же, что defaultAvatar_ в apps-script/Code.gs.
export const AVATARS = [
  { code: 'bot-1', title: 'Робот с антенной' },
  { code: 'bot-2', title: 'Робот с квадратными глазами' },
  { code: 'bot-3', title: 'Робот с визором' },
  { code: 'bot-4', title: 'Круглый робот' },
  { code: 'bot-5', title: 'Робот с одним глазом' },
  { code: 'bot-6', title: 'Робот-улыбака' },
  { code: 'bot-7', title: 'Робот с динамиками' },
  { code: 'bot-8', title: 'Робот с экраном' },
  { code: 'animal-1', title: 'Кот' },
  { code: 'animal-2', title: 'Пёс' },
  { code: 'animal-3', title: 'Лиса' },
  { code: 'animal-4', title: 'Медведь' },
  { code: 'animal-5', title: 'Кролик' },
  { code: 'animal-6', title: 'Сова' },
  { code: 'animal-7', title: 'Лягушка' },
  { code: 'animal-8', title: 'Панда' },
  { code: 'space-1', title: 'Ракета' },
  { code: 'space-2', title: 'Планета с кольцом' },
  { code: 'space-3', title: 'Луна' },
  { code: 'space-4', title: 'Звезда' },
  { code: 'space-5', title: 'Тарелка НЛО' },
  { code: 'space-6', title: 'Комета' },
  { code: 'space-7', title: 'Спутник' },
  { code: 'space-8', title: 'Шлем космонавта' },
];

export function avatarUrl(code) {
  return 'content/avatars/' + code + '.svg';
}

// Сумма кодов символов ID по модулю 24 -> код из AVATARS.
export function defaultAvatar(studentId) {
  const s = String(studentId == null ? '' : studentId);
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
  return AVATARS[sum % AVATARS.length].code;
}
