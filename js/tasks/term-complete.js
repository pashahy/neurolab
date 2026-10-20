// Tab-дополнение и подсказки при опечатках для учебного терминала. Чистые функции, без DOM.
import { createShell, resolvePath } from '../sim/shell.js';

export const GIT_SUBS = ['init', 'status', 'add', 'commit', 'log', 'diff', 'config', 'branch', 'checkout', 'switch', 'restore', 'reset'];
export const DOCKER_SUBS = ['run', 'ps', 'images', 'stop', 'start', 'rm', 'rmi', 'logs', 'build', 'pull'];

let names = null;
// Список команд берётся из справки симулятора: «Команды: pwd, ls [-a], …»
export function commandNames() {
  if (names) return names;
  const m = String(createShell().exec('help')).match(/Команды:\s*(.*)$/);
  names = m ? m[1].split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean) : [];
  return names;
}

function commonPrefix(list) {
  let p = list[0] || '';
  for (const s of list) { while (!s.startsWith(p)) p = p.slice(0, -1); }
  return p;
}

// Имена в папке dir (абсолютный путь): каталоги с «/» на конце
function listDir(sh, dir) {
  const base = dir === '/' ? '/' : `${dir}/`;
  const out = [];
  for (const [k, v] of sh.fs) {
    if (k === dir || !k.startsWith(base)) continue;
    const rest = k.slice(base.length);
    if (rest && rest.indexOf('/') < 0) out.push({ name: rest, dir: !!v.dir });
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

// → { line, options }: line — строка после Tab, options — варианты, если их несколько
export function complete(line, shell) {
  const text = String(line);
  const cut = Math.max(text.lastIndexOf(' '), text.lastIndexOf('\t')) + 1;
  const head = text.slice(0, cut);
  const word = text.slice(cut);
  const words = head.trim() ? head.trim().split(/\s+/) : [];
  let cands = null; // [{ text, dir }]
  let prefix = word;
  if (!words.length) {
    if (!word) return { line: text, options: [] };
    cands = commandNames().concat('git').filter((v, i, a) => a.indexOf(v) === i).filter(n => n.startsWith(word)).map(n => ({ text: n, dir: false }));
  } else if ((words[0] === 'git' || words[0] === 'docker') && words.length === 1) {
    cands = (words[0] === 'git' ? GIT_SUBS : DOCKER_SUBS).filter(n => n.startsWith(word)).map(n => ({ text: n, dir: false }));
  } else {
    const sh = shell.state;
    const slash = word.lastIndexOf('/');
    const dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
    prefix = word.slice(slash + 1);
    const dirAbs = resolvePath(sh, dirPart === '/' ? '/' : dirPart.replace(/\/$/, '') || '.');
    const node = sh.fs.get(dirAbs);
    cands = [];
    if (node && node.dir) {
      const onlyDirs = words[0] === 'cd';
      for (const e of listDir(sh, dirAbs)) {
        if (!e.name.startsWith(prefix)) continue;
        if (e.name.startsWith('.') && !prefix.startsWith('.')) continue;
        if (onlyDirs && !e.dir) continue;
        cands.push({ text: dirPart + e.name, dir: e.dir });
      }
    }
    prefix = word;
  }
  if (!cands.length) return { line: text, options: [] };
  if (cands.length === 1) {
    const c = cands[0];
    return { line: `${head}${c.text}${c.dir ? '/' : ' '}`, options: [] };
  }
  const p = commonPrefix(cands.map(c => c.text));
  const shown = cands.map(c => c.text.slice(c.text.lastIndexOf('/', c.text.length - 1) + 1) + (c.dir ? '/' : ''));
  return { line: `${head}${p.length > prefix.length ? p : word}`, options: shown };
}

export function levenshtein(a, b) {
  const prev = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

function nearest(word, list) {
  const max = Math.min(2, word.length - 1);
  let best = null;
  let bd = max + 1;
  for (const c of list) {
    const d = levenshtein(word, c);
    if (d > 0 && d < bd) { bd = d; best = c; }
  }
  return best;
}

// Строка с исправленной командой или подкомандой git, либо null
export function suggest(cmdLine) {
  const m = String(cmdLine).trim().match(/^(\S+)(\s+(\S+))?([\s\S]*)$/);
  if (!m) return null;
  const cmd = m[1];
  const all = commandNames().concat('git', 'docker').filter((v, i, a) => a.indexOf(v) === i);
  if (all.indexOf(cmd) < 0) {
    const fix = nearest(cmd, all);
    return fix ? `${fix}${String(cmdLine).trim().slice(cmd.length)}` : null;
  }
  if (cmd === 'git' && m[3] && !m[3].startsWith('-') && GIT_SUBS.indexOf(m[3]) < 0) {
    const fix = nearest(m[3], GIT_SUBS);
    return fix ? `git ${fix}${m[4]}` : null;
  }
  if (cmd === 'docker' && m[3] && !m[3].startsWith('-') && DOCKER_SUBS.indexOf(m[3]) < 0) {
    const fix = nearest(m[3], DOCKER_SUBS);
    return fix ? `docker ${fix}${m[4]}` : null;
  }
  return null;
}
