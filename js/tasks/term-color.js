// Раскраска терминала: чистые функции без DOM. Вывод симулятора остаётся строкой — цвет определяется разбором.
import { resolvePath } from '../sim/shell.js';

const PLAIN_OUT = new Set(['cat', 'echo', 'env', 'history', 'pwd', 'whoami', 'help']);
const ERR_RE = /(команда не найдена|Нет такого файла|Это (не )?каталог|Это каталог|пропущен операнд|не поддерживаются в тренажёре|Файл существует|использование:|не является командой git|синтаксическая ошибка|неправильный идентификатор)/;
const ERR_START = /^(fatal|error|bash|git|docker):/;
const DOCKER_ERR = /^(docker: |Error response from daemon|ERROR: |unknown flag)/m;

const firstWord = cmd => String(cmd).trim().split(/\s+/)[0] || '';

export function isErrorOutput(cmd, output) {
  const out = String(output || '');
  if (!out) return false;
  const first = out.split('\n')[0];
  if (first.startsWith('Операторы &&')) return true;
  const w = firstWord(cmd);
  if (w === 'cat') return first.startsWith('cat: ') && ERR_RE.test(first);
  if (w === 'docker') return DOCKER_ERR.test(out) || ERR_RE.test(first);
  if (PLAIN_OUT.has(w)) return false;
  return ERR_START.test(first) || ERR_RE.test(first);
}

// Склейка соседних кусков с одинаковым цветом.
function merge(segs) {
  const out = [];
  for (const s of segs) {
    if (!s.text) continue;
    const last = out[out.length - 1];
    if (last && last.cls === s.cls) last.text += s.text; else out.push({ text: s.text, cls: s.cls });
  }
  return out;
}

function lsLine(line, base, sh) {
  const segs = [];
  for (const part of line.split(/( {2,})/)) {
    if (!part) continue;
    if (/^ +$/.test(part)) { segs.push({ text: part, cls: '' }); continue; }
    const name = part.replace(/\/$/, '');
    let dir = part.length > name.length;
    if (!dir && sh) {
      const node = sh.fs.get(resolvePath(sh, base === '.' ? name : `${base.replace(/\/$/, '')}/${name}`));
      dir = !!(node && node.dir);
    }
    segs.push({ text: part, cls: dir ? 'dir' : '' });
  }
  return segs;
}

// cmd — введённая строка; output — строка из shell.exec; shell — результат createShell → [{ text, cls }]
export function colorize(cmd, output, shell) {
  const out = String(output || '');
  if (!out || out === '\u001bclear') return [];
  if (isErrorOutput(cmd, out)) return [{ text: out, cls: 'err' }];
  const words = String(cmd).trim().split(/\s+/);
  const sh = shell && shell.state;
  const segs = [];
  const lines = out.split('\n');
  if (words[0] === 'ls') {
    const arg = words.slice(1).find(a => !a.startsWith('-')) || '.';
    lines.forEach((l, i) => { if (i) segs.push({ text: '\n', cls: '' }); segs.push(...lsLine(l, arg, sh)); });
    return merge(segs);
  }
  if (words[0] === 'git' && words[1] === 'status') {
    let section = '';
    lines.forEach((l, i) => {
      if (i) segs.push({ text: '\n', cls: '' });
      if (!l.trim()) section = '';
      else if (l.startsWith('Изменения, которые будут включены')) section = 'ok';
      else if (l.startsWith('Изменения, которые не в индексе') || l.startsWith('Неотслеживаемые файлы')) section = 'err';
      segs.push({ text: l, cls: l.startsWith('\t') ? section : '' });
    });
    return merge(segs);
  }
  return [{ text: out, cls: '' }];
}

// Промпт «student@neurolab:~/x$» → пользователь, путь, $; склейка равна shell.prompt()
export function promptParts(shell) {
  const p = shell.prompt();
  const m = p.match(/^([^:]+):(.*)\$$/);
  if (!m) return [{ text: p, cls: '' }];
  return [{ text: m[1], cls: 'user' }, { text: ':', cls: '' }, { text: m[2], cls: 'path' }, { text: '$', cls: '' }];
}
