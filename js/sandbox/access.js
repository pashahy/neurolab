// Доступ к инструментам по группе. Конструктор промптов — только ИИ112-26 (зеркало SANDBOX_PROMPT_GROUPS в Code.gs).
export const PROMPT_GROUPS = ['ИИ112-26'];

// как normGroup в Code.gs: верхний регистр, без пробелов
const norm = g => String(g || '').toUpperCase().replace(/\s+/g, '');

export function canUsePrompts(group) {
  const k = norm(group);
  return k !== '' && PROMPT_GROUPS.some(x => norm(x) === k);
}
