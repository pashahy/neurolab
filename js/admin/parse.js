// Разбор списка для импорта. Копия parseImport из apps-script/Code.gs: поведение должно совпадать
// с серверным (проверяет tests/admin-parse.test.js). Сервер всё равно перепроверяет список.
// Строки «ФИО;Группа» (разделитель «;», табуляция или последняя запятая).
export function parseImport(text) {
  const rows = [];
  const errors = [];
  let first = true;
  String(text == null ? '' : text).split(/\r\n|\r|\n/).forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    const isFirst = first;
    first = false;
    let at = raw.indexOf(';');
    if (at < 0) at = raw.indexOf('\t');
    if (at < 0) at = raw.lastIndexOf(',');
    if (at < 0) { errors.push({ line, reason: 'нет разделителя между ФИО и группой' }); return; }
    const name = raw.slice(0, at).trim().replace(/\s+/g, ' ');
    if (isFirst && /^фио(\s|$)/i.test(name)) return; // первая строка — заголовок («ФИО;Группа»)
    const group = raw.slice(at + 1).trim();
    if (name.split(' ').filter(Boolean).length < 2) { errors.push({ line, reason: 'в ФИО меньше двух слов' }); return; }
    if (!group) { errors.push({ line, reason: 'не указана группа' }); return; }
    if (/\s/.test(group)) { errors.push({ line, reason: 'в названии группы есть пробелы' }); return; }
    rows.push({ name, group: group.toUpperCase() });
  });
  return { rows, errors };
}
