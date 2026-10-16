// Текст с инлайн-кодом в `обратных кавычках` -> массив узлов: строки и <code> (без innerHTML, данные не разбираются как разметка).
export function inlineCode(text) {
  const s = String(text == null ? '' : text);
  const out = [];
  const re = /`([^`\n]+)`/g;
  let last = 0, m;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const c = document.createElement('code');
    c.textContent = m[1];
    out.push(c);
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

// То же без DOM: части { code: bool, text } (для проверки и тестов).
export function inlineCodeParts(text) {
  const s = String(text == null ? '' : text);
  const out = [];
  const re = /`([^`\n]+)`/g;
  let last = 0, m;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push({ code: false, text: s.slice(last, m.index) });
    out.push({ code: true, text: m[1] });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ code: false, text: s.slice(last) });
  return out;
}
