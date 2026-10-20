// Учебный симулятор bash + git. Чистая логика без DOM: используется тренажёром и валидатором.
export const HOME = '/home/student';
const fail = m => { throw new Error(m); };
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function resolvePath(sh, p) {
  if (!p || p === '~') return HOME;
  let base = sh.cwd;
  if (p.startsWith('/')) base = '';
  else if (p.startsWith('~/')) { base = HOME; p = p.slice(2); }
  const out = [];
  for (const part of `${base}/${p}`.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop(); else out.push(part);
  }
  return `/${out.join('/')}`;
}
const parentOf = p => (p.lastIndexOf('/') <= 0 ? '/' : p.slice(0, p.lastIndexOf('/')));
const baseName = p => p.slice(p.lastIndexOf('/') + 1);
function mkdirp(sh, p) {
  let cur = '';
  for (const part of p.split('/').filter(Boolean)) { cur += `/${part}`; if (!sh.fs.has(cur)) sh.fs.set(cur, { dir: true }); }
}
const childrenOf = (sh, dir) => [...sh.fs.keys()].filter(k => k !== '/' && k !== dir && parentOf(k) === dir).sort();

function writeFile(sh, abs, content, append) {
  if (!sh.fs.get(parentOf(abs))?.dir) fail(`bash: ${abs}: Нет такого файла или каталога`);
  const cur = sh.fs.get(abs);
  if (cur?.dir) fail(`bash: ${abs}: Это каталог`);
  sh.fs.set(abs, { dir: false, content: append && cur ? cur.content + content : content });
}

// Лексер: токены {v, op}; op=true для неэкранированных > и >> (в том числе слитных: echo hi>f.txt).
function lex(line) {
  const out = [];
  let cur = null;
  let q = null;
  const flush = () => { if (cur !== null) { out.push({ v: cur, op: false }); cur = null; } };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === q) q = null; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; if (cur === null) cur = ''; continue; }
    if (/\s/.test(ch)) { flush(); continue; }
    if (ch === '>') {
      flush();
      if (line[i + 1] === '>') { out.push({ v: '>>', op: true }); i++; } else out.push({ v: '>', op: true });
      continue;
    }
    cur = (cur === null ? '' : cur) + ch;
  }
  flush();
  return out;
}
export const tokenize = line => lex(line).map(t => t.v);

// Есть ли неэкранированные операторы &&, ||, ; или |
function hasChainOperator(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") q = ch;
    else if (ch === ';' || ch === '|' || (ch === '&' && line[i + 1] === '&')) return true;
  }
  return false;
}
const CHAIN_MSG = 'Операторы &&, ||, ; и | не поддерживаются в тренажёре — вводите команды по одной.';

function copy(sh, a, b, move, recursive) {
  const cmd = move ? 'mv' : 'cp';
  if (!a || !b) fail(`${cmd}: пропущен операнд`);
  const src = resolvePath(sh, a);
  const node = sh.fs.get(src);
  if (!node) fail(`${cmd}: не удалось выполнить stat для '${a}': Нет такого файла или каталога`);
  if (node.dir && !move && !recursive) fail(`cp: не указан -r; пропускается каталог '${a}'`);
  let dst = resolvePath(sh, b);
  if (sh.fs.get(dst)?.dir) dst = `${dst === '/' ? '' : dst}/${baseName(src)}`;
  if (!sh.fs.get(parentOf(dst))?.dir) fail(`${cmd}: невозможно создать '${b}': Нет такого файла или каталога`);
  const entries = [...sh.fs.entries()].filter(([k]) => k === src || k.startsWith(`${src}/`));
  if (move) for (const [k] of entries) sh.fs.delete(k);
  for (const [k, v] of entries) sh.fs.set(dst + k.slice(src.length), { ...v });
}

const COMMANDS = {
  help: () => 'Команды: pwd, ls [-a], cd, mkdir [-p], touch, cat, echo, rm [-r], mv, cp [-r], clear, whoami, env, export, history, git, docker',
  pwd: sh => sh.cwd,
  whoami: sh => sh.env.USER,
  clear: () => '\u001bclear',
  ls(sh, args) {
    const name = args.find(a => !a.startsWith('-'));
    const target = resolvePath(sh, name || '.');
    const node = sh.fs.get(target);
    if (!node) fail(`ls: невозможно получить доступ к '${name}': Нет такого файла или каталога`);
    if (!node.dir) return baseName(target);
    const all = args.some(a => /^-\w*a/.test(a));
    return childrenOf(sh, target).map(k => baseName(k) + (sh.fs.get(k).dir ? '/' : '')).filter(n => all || !n.startsWith('.')).join('  ');
  },
  cd(sh, [p]) {
    const t = resolvePath(sh, p);
    const n = sh.fs.get(t);
    if (!n) fail(`bash: cd: ${p}: Нет такого файла или каталога`);
    if (!n.dir) fail(`bash: cd: ${p}: Это не каталог`);
    sh.cwd = t;
    return '';
  },
  mkdir(sh, args) {
    const pflag = args.includes('-p');
    const names = args.filter(a => a !== '-p');
    if (!names.length) fail('mkdir: пропущен операнд');
    for (const n of names) {
      const t = resolvePath(sh, n);
      if (sh.fs.has(t)) { if (!pflag) fail(`mkdir: невозможно создать каталог «${n}»: Файл существует`); continue; }
      if (pflag) mkdirp(sh, t);
      else if (!sh.fs.get(parentOf(t))?.dir) fail(`mkdir: невозможно создать каталог «${n}»: Нет такого файла или каталога`);
      else sh.fs.set(t, { dir: true });
    }
    return '';
  },
  touch(sh, args) {
    if (!args.length) fail('touch: пропущен операнд');
    for (const n of args) { const t = resolvePath(sh, n); if (!sh.fs.has(t)) writeFile(sh, t, '', false); }
    return '';
  },
  cat(sh, args) {
    if (!args.length) fail('cat: пропущен операнд');
    return args.map(n => {
      const node = sh.fs.get(resolvePath(sh, n));
      if (!node) fail(`cat: ${n}: Нет такого файла или каталога`);
      if (node.dir) fail(`cat: ${n}: Это каталог`);
      return node.content.replace(/\n$/, '');
    }).join('\n');
  },
  echo: (sh, args) => args.join(' '),
  rm(sh, args) {
    const rec = args.some(a => /^-\w*[rR]/.test(a));
    const names = args.filter(a => !a.startsWith('-'));
    if (!names.length) fail('rm: пропущен операнд');
    for (const n of names) {
      const t = resolvePath(sh, n);
      const node = sh.fs.get(t);
      if (!node) fail(`rm: невозможно удалить '${n}': Нет такого файла или каталога`);
      if (node.dir && !rec) fail(`rm: невозможно удалить '${n}': Это каталог`);
      for (const k of [...sh.fs.keys()]) if (k === t || k.startsWith(`${t}/`)) sh.fs.delete(k);
    }
    return '';
  },
  mv(sh, args) { const n = args.filter(x => !x.startsWith('-')); copy(sh, n[0], n[1], true, true); return ''; },
  cp(sh, args) { const n = args.filter(x => !x.startsWith('-')); copy(sh, n[0], n[1], false, args.some(x => /^-\w*[rR]/.test(x))); return ''; },
  env: sh => Object.entries(sh.env).map(([k, v]) => `${k}=${v}`).join('\n'),
  export(sh, args) {
    for (const a of args) {
      const m = a.match(/^([A-Za-z_]\w*)=(.*)$/);
      if (!m) fail(`bash: export: «${a}»: это неправильный идентификатор`);
      sh.env[m[1]] = m[2];
    }
    return '';
  },
  history: sh => sh.history.map((x, i) => `${String(i + 1).padStart(4)}  ${x}`).join('\n'),
  git: (sh, args) => git(sh, args),
  docker: (sh, args) => dockerCmd(sh, args),
};

function run(sh, line) {
  line = String(line).trim();
  if (!line) return '';
  if (hasChainOperator(line)) return CHAIN_MSG;
  const expanded = line.replace(/\$\{?([A-Za-z_]\w*)\}?/g, (_, n) => (has(sh.env, n) ? sh.env[n] : ''));
  let tokens = lex(expanded);
  let redirect = null;
  const ri = tokens.findIndex(t => t.op);
  if (ri >= 0) {
    if (!tokens[ri + 1] || tokens[ri + 1].op) return 'bash: синтаксическая ошибка рядом с неожиданным маркером «newline»';
    redirect = { append: tokens[ri].v === '>>', path: tokens[ri + 1].v };
    tokens = tokens.slice(0, ri);
  }
  const [cmd, ...args] = tokens.map(t => t.v);
  const fn = has(COMMANDS, cmd) ? COMMANDS[cmd] : null;
  if (!fn) return `${cmd}: команда не найдена (список команд: help)`;
  try {
    const out = fn(sh, args) ?? '';
    if (redirect) { writeFile(sh, resolvePath(sh, redirect.path), `${out}\n`, redirect.append); return ''; }
    return out;
  } catch (e) {
    return e.message;
  }
}

// ---------- git ----------
function repoFiles(sh, r) {
  const out = {};
  for (const [k, v] of sh.fs) {
    if (!v.dir && k.startsWith(`${r.root}/`) && !k.startsWith(`${r.root}/.git/`)) out[k.slice(r.root.length + 1)] = v.content;
  }
  return out;
}
const headIdx = r => (has(r.branches, r.head) ? r.branches[r.head] : null);
const snapshot = r => (headIdx(r) === null ? {} : r.commits[headIdx(r)].files);
const sameFiles = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => has(b, k) && a[k] === b[k]);
function hash(s) {
  let x = 2166136261;
  for (const ch of s) { x ^= ch.codePointAt(0); x = Math.imul(x, 16777619); }
  return (x >>> 0).toString(16).padStart(8, '0').slice(0, 7);
}
function countCommits(r) { let n = 0; let c = headIdx(r); while (c !== null) { n++; c = r.commits[c].parent; } return n; }
const gitDir = r => `${r.root === '/' ? '' : r.root}/.git`;
const liveRepo = sh => (sh.repo && sh.fs.get(gitDir(sh.repo))?.dir ? sh.repo : null);
const findRepo = sh => { const r = liveRepo(sh); return r && (sh.cwd === r.root || sh.cwd.startsWith(`${r.root}/`)) ? r : null; };
const cfg = (sh, key) => findRepo(sh)?.config[key] ?? sh.gitConfig[key];

function relPath(sh, r, f) {
  const abs = resolvePath(sh, f);
  if (abs === r.root) return '';
  if (!abs.startsWith(`${r.root}/`)) fail(`fatal: ${f}: «${f}» находится вне репозитория`);
  return abs.slice(r.root.length + 1);
}

export function diffState(sh, r) {
  const work = repoFiles(sh, r);
  const idx = r.index;
  const head = snapshot(r);
  const staged = [];
  const unstaged = [];
  const untracked = [];
  for (const p of new Set([...Object.keys(idx), ...Object.keys(head)])) {
    if (!has(idx, p)) staged.push(['удалён', p]);
    else if (!has(head, p)) staged.push(['новый файл', p]);
    else if (idx[p] !== head[p]) staged.push(['изменён', p]);
  }
  for (const p of Object.keys(idx)) {
    if (!has(work, p)) unstaged.push(['удалён', p]);
    else if (work[p] !== idx[p]) unstaged.push(['изменён', p]);
  }
  for (const p of Object.keys(work)) if (!has(idx, p)) untracked.push(p);
  return { staged, unstaged, untracked };
}

function status(sh, r) {
  const d = diffState(sh, r);
  const fmt = ([k, p]) => `\t${`${k}:`.padEnd(13)} ${p}`;
  const lines = [`На ветке ${r.head}`];
  if (headIdx(r) === null) lines.push('', 'Еще нет коммитов');
  if (d.staged.length) lines.push('', 'Изменения, которые будут включены в коммит:', '  (используйте «git restore --staged <файл>...», чтобы убрать из индекса)', ...d.staged.map(fmt));
  if (d.unstaged.length) lines.push('', 'Изменения, которые не в индексе для коммита:', '  (используйте «git add <файл>...», чтобы добавить файл в индекс)', ...d.unstaged.map(fmt));
  if (d.untracked.length) lines.push('', 'Неотслеживаемые файлы:', '  (используйте «git add <файл>...», чтобы добавить в то, что будет включено в коммит)', ...d.untracked.sort().map(p => `\t${p}`));
  if (!d.staged.length && !d.unstaged.length && !d.untracked.length) {
    lines.push('', headIdx(r) === null ? 'нечего коммитить (создайте/скопируйте файлы, затем запустите «git add»)' : 'нечего коммитить, нет изменений в рабочем каталоге');
  }
  return lines.join('\n');
}

function writeTree(sh, r, from, to) {
  for (const p of Object.keys(from)) sh.fs.delete(`${r.root}/${p}`);
  for (const [p, c] of Object.entries(to)) { const abs = `${r.root}/${p}`; mkdirp(sh, parentOf(abs)); sh.fs.set(abs, { dir: false, content: c }); }
}

function unstage(r, rel, src) {
  const inPath = p => rel === '' || p === rel || p.startsWith(`${rel}/`);
  for (const p of new Set([...Object.keys(r.index), ...Object.keys(src)])) {
    if (!inPath(p)) continue;
    if (has(src, p)) r.index[p] = src[p]; else delete r.index[p];
  }
}

// Ревизия: HEAD, HEAD~N, HEAD^, имя ветки или хеш (полный/7 символов) среди коммитов, достижимых из HEAD.
// undefined — аргумент не похож на ревизию.
function tryRev(r, target) {
  const m = target.match(/^HEAD(?:~(\d+)|(\^))?$/);
  if (m) {
    let c = headIdx(r);
    if (c === null) fail('fatal: в репозитории ещё нет коммитов');
    for (let steps = m[1] ? Number(m[1]) : m[2] ? 1 : 0; steps > 0; steps--) {
      c = r.commits[c].parent;
      if (c === null) fail(`fatal: неоднозначный аргумент «${target}»: такой ревизии нет`);
    }
    return c;
  }
  if (has(r.branches, target)) return r.branches[target];
  if (/^[0-9a-f]{7,40}$/.test(target)) {
    for (let c = headIdx(r); c !== null; c = r.commits[c].parent) if (target.startsWith(r.commits[c].id)) return c;
  }
  return undefined;
}

function gitConfig(sh, args) {
  const global = args.includes('--global');
  const rest = args.filter(a => a !== '--global');
  if (rest[0] === '--list' || rest[0] === '-l') return Object.entries({ ...sh.gitConfig, ...(findRepo(sh)?.config || {}) }).map(([k, v]) => `${k}=${v}`).join('\n');
  const [key, ...val] = rest;
  if (!key) fail('использование: git config [--global] <ключ> [<значение>]');
  if (!val.length) return cfg(sh, key) ?? '';
  if (!global && !findRepo(sh)) fail('fatal: не в каталоге git (для глобальной настройки добавьте --global)');
  (global ? sh.gitConfig : sh.repo.config)[key] = val.join(' ');
  return '';
}

function git(sh, args) {
  const [sub, ...rest] = args;
  if (!sub) return 'использование: git <команда> [<аргументы>]\nОсновные команды: init, status, add, commit, log, diff, config, branch, checkout, switch, restore, reset';
  if (sub === '--version' || sub === 'version') return 'git version 2.45.0';
  if (sub === 'config') return gitConfig(sh, rest);
  if (sub === 'init') {
    let branch = 'main';
    let dir = null;
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i];
      if (a === '-b' || a === '--initial-branch') { branch = rest[++i]; if (!branch) fail(`error: для параметра «${a}» требуется значение`); }
      else if (a.startsWith('--initial-branch=')) { branch = a.slice('--initial-branch='.length); if (!branch) fail('error: для параметра «initial-branch» требуется значение'); }
      else if (a.startsWith('-')) continue;
      else dir = a;
    }
    const root = dir ? resolvePath(sh, dir) : sh.cwd;
    const old = liveRepo(sh);
    if (old && old.root !== root) fail(`fatal: в тренажёре поддерживается только один репозиторий (${old.root})\nЕсли репозиторий создан по ошибке, удалите его: rm -r ${old.root}/.git`);
    if (sh.fs.has(root) && !sh.fs.get(root).dir) fail(`fatal: невозможно создать каталог «${dir}»: Файл существует`);
    mkdirp(sh, root);
    if (old) return `Повторная инициализация существующего репозитория Git в ${gitDir(old)}/`;
    sh.repo = { root, index: {}, commits: [], branches: {}, head: branch, config: {} };
    sh.fs.set(gitDir(sh.repo), { dir: true });
    return `Инициализирован пустой репозиторий Git в ${gitDir(sh.repo)}/`;
  }
  const r = findRepo(sh);
  if (!r) fail('fatal: не найден git репозиторий (или один из родительских каталогов): .git');
  switch (sub) {
    case 'status': return status(sh, r);
    case 'add': {
      if (!rest.length) fail('Ничего не указано, ничего не добавлено.\nВозможно, вы хотели сказать «git add .»?');
      const work = repoFiles(sh, r);
      for (const a of rest) {
        const rel = a === '-A' || a === '--all' ? '' : relPath(sh, r, a);
        const match = p => rel === '' || p === rel || p.startsWith(`${rel}/`);
        if (![...Object.keys(work), ...Object.keys(r.index)].some(match)) fail(`fatal: указанный путь «${a}» не соответствует ни одному файлу`);
        for (const p of Object.keys(work)) if (match(p)) r.index[p] = work[p];
        for (const p of Object.keys(r.index)) if (match(p) && !has(work, p)) delete r.index[p];
      }
      return '';
    }
    case 'commit': {
      const all = rest.includes('-a') || rest.includes('-am');
      const mi = rest.findIndex(a => a === '-m' || a === '-am');
      const msg = mi >= 0 ? rest[mi + 1] : undefined;
      if (!msg) fail('Прервано: пустое сообщение коммита. Используйте: git commit -m "сообщение"');
      const name = cfg(sh, 'user.name');
      const email = cfg(sh, 'user.email');
      if (!name || !email) fail('Пожалуйста, скажите мне, кто вы есть.\n\nЗапустите\n\n  git config --global user.email "you@example.com"\n  git config --global user.name "Ваше Имя"\n\nчтобы указать ваши данные.');
      if (all) {
        const work = repoFiles(sh, r);
        for (const p of Object.keys(r.index)) { if (has(work, p)) r.index[p] = work[p]; else delete r.index[p]; }
      }
      const head = snapshot(r);
      if (sameFiles(r.index, head)) return `${status(sh, r)}\nничего не добавлено в коммит (используйте «git add»)`;
      const parent = headIdx(r);
      const id = hash(`${msg}|${r.commits.length}|${parent}|${JSON.stringify(Object.entries(r.index).sort())}`);
      const changed = new Set([...Object.keys(r.index), ...Object.keys(head)].filter(p => r.index[p] !== head[p])).size;
      r.commits.push({ id, msg, files: { ...r.index }, parent, author: `${name} <${email}>`, date: new Date().toLocaleString('ru-RU') });
      r.branches[r.head] = r.commits.length - 1;
      return `[${r.head}${parent === null ? ' (корневой коммит)' : ''} ${id}] ${msg}\n ${changed} файл(ов) изменено`;
    }
    case 'log': {
      let c = headIdx(r);
      if (c === null) fail(`fatal: в вашей текущей ветке «${r.head}» еще нет ни одного коммита`);
      const one = rest.includes('--oneline');
      const out = [];
      while (c !== null) {
        const cm = r.commits[c];
        const refs = Object.keys(r.branches).filter(b => r.branches[b] === c).sort((a, b) => (b === r.head) - (a === r.head)).map(b => (b === r.head ? `HEAD -> ${b}` : b));
        const dec = refs.length ? ` (${refs.join(', ')})` : '';
        out.push(one ? `${cm.id}${dec} ${cm.msg}` : `commit ${cm.id}${dec}\nAuthor: ${cm.author}\nDate:   ${cm.date}\n\n    ${cm.msg}\n`);
        c = cm.parent;
      }
      return out.join('\n');
    }
    case 'diff': {
      const staged = rest.includes('--staged') || rest.includes('--cached');
      const from = staged ? snapshot(r) : r.index;
      const to = staged ? r.index : Object.fromEntries(Object.entries(repoFiles(sh, r)).filter(([p]) => has(r.index, p)));
      const out = [];
      for (const p of [...new Set([...Object.keys(from), ...Object.keys(to)])].sort()) {
        if (from[p] === to[p]) continue;
        const a = (from[p] ?? '').split('\n').filter(Boolean);
        const b = (to[p] ?? '').split('\n').filter(Boolean);
        out.push(`diff --git a/${p} b/${p}`, `--- a/${p}`, `+++ b/${p}`, ...a.filter(l => !b.includes(l)).map(l => `-${l}`), ...b.filter(l => !a.includes(l)).map(l => `+${l}`));
      }
      return out.join('\n');
    }
    case 'branch': {
      const del = rest.includes('-d') || rest.includes('-D');
      const name = rest.find(a => !a.startsWith('-'));
      if (!name) return [...new Set([...Object.keys(r.branches), r.head])].sort().map(b => (b === r.head ? `* ${b}` : `  ${b}`)).join('\n');
      if (del) {
        if (name === r.head) fail(`error: невозможно удалить ветку «${name}», так как вы на ней`);
        if (!has(r.branches, name)) fail(`error: ветка «${name}» не найдена.`);
        delete r.branches[name];
        return `Ветка ${name} удалена.`;
      }
      if (headIdx(r) === null) fail(`fatal: неверное имя объекта: «${r.head}».`);
      if (has(r.branches, name)) fail(`fatal: ветка с именем «${name}» уже существует.`);
      r.branches[name] = headIdx(r);
      return '';
    }
    case 'checkout':
    case 'switch': {
      if (sub === 'checkout' && rest[0] === '--') return git(sh, ['restore', ...rest.slice(1)]);
      const create = rest.includes('-b') || rest.includes('-c');
      const name = rest.find(a => !a.startsWith('-'));
      if (!name) fail(`использование: git ${sub} ${sub === 'checkout' ? '[-b]' : '[-c]'} <ветка>`);
      if (create) {
        if (has(r.branches, name)) fail(`fatal: ветка с именем «${name}» уже существует.`);
        if (headIdx(r) !== null) r.branches[name] = headIdx(r);
        r.head = name;
        return `Переключились на новую ветку «${name}»`;
      }
      if (!has(r.branches, name)) fail(sub === 'switch' ? `fatal: неверная ссылка: ${name}` : `error: спецификатор пути «${name}» не соответствует ни одному файлу, известному git`);
      if (name === r.head) return `Уже на «${name}»`;
      const d = diffState(sh, r);
      if (d.staged.length || d.unstaged.length) fail('error: ваши локальные изменения будут перезаписаны при переключении.\nСделайте коммит или отмените изменения (git restore).');
      const to = r.commits[r.branches[name]].files;
      writeTree(sh, r, snapshot(r), to);
      r.index = { ...to };
      r.head = name;
      return `Переключились на ветку «${name}»`;
    }
    case 'restore': {
      const staged = rest.includes('--staged') || rest.includes('-S');
      const files = rest.filter(a => !a.startsWith('-'));
      if (!files.length) fail('fatal: вы должны указать путь(и) для восстановления');
      const head = snapshot(r);
      for (const f of files) {
        const rel = relPath(sh, r, f);
        const pick = src => Object.keys(src).filter(p => rel === '' || p === rel || p.startsWith(`${rel}/`));
        if (staged) unstage(r, rel, head);
        else {
          const ps = pick(r.index);
          if (!ps.length) fail(`error: спецификатор пути «${f}» не соответствует ни одному файлу, известному git`);
          for (const p of ps) { const abs = `${r.root}/${p}`; mkdirp(sh, parentOf(abs)); sh.fs.set(abs, { dir: false, content: r.index[p] }); }
        }
      }
      return '';
    }
    case 'reset': {
      const explicit = rest.find(a => ['--soft', '--hard', '--mixed'].includes(a));
      const mode = explicit || '--mixed';
      const dd = rest.indexOf('--');
      const args = (dd >= 0 ? rest.slice(0, dd) : rest).filter(a => !a.startsWith('-'));
      const first = args[0];
      const asRev = first === undefined ? undefined : tryRev(r, first);
      let target;
      let paths;
      if (dd >= 0) {
        if (first !== undefined && asRev === undefined) fail(`fatal: неизвестная ревизия «${first}»`);
        target = asRev;
        paths = rest.slice(dd + 1);
      } else if (asRev !== undefined) { target = asRev; paths = args.slice(1); } else { target = undefined; paths = args; }
      if (paths.length) {
        const src = target === undefined ? snapshot(r) : r.commits[target].files;
        const known = new Set([...Object.keys(r.index), ...Object.keys(snapshot(r)), ...Object.keys(repoFiles(sh, r))]);
        const rels = paths.map(f => {
          const rel = relPath(sh, r, f);
          if (![...known].some(p => rel === '' || p === rel || p.startsWith(`${rel}/`))) {
            fail(target === undefined && f === first ? `fatal: неизвестная ревизия «${f}»` : `error: спецификатор пути «${f}» не соответствует ни одному файлу, известному git`);
          }
          return rel;
        });
        if (mode !== '--mixed') fail(`fatal: нельзя использовать ${mode} вместе с путями`);
        for (const rel of rels) unstage(r, rel, src);
        return '';
      }
      let c = target === undefined ? headIdx(r) : target;
      if (c === null) fail('fatal: в репозитории ещё нет коммитов');
      const oldTracked = { ...snapshot(r), ...r.index };
      r.branches[r.head] = c;
      const files = r.commits[c].files;
      if (mode !== '--soft') r.index = { ...files };
      if (mode === '--hard') { writeTree(sh, r, oldTracked, files); return `HEAD сейчас на ${r.commits[c].id} ${r.commits[c].msg}`; }
      return '';
    }
    default:
      fail(`git: «${sub}» не является командой git. Смотрите «git».`);
  }
  return '';
}

// ---------- docker (учебный) ----------
// Состояние sh.docker = { seq, images, containers } детерминировано: id считаются от счётчика, времени и случайности нет
// (сервер повторяет историю и обязан получить то же самое).
const DOCKER_MAX_CONTAINERS = 50;
const DOCKER_MAX_IMAGES = 30;
const DOCKER_MAX_LOG_LINES = 100;
const DOCKER_MAX_LOG_LEN = 200;
const DOCKER_TRAIN = {
  'hello-world': { tags: ['latest'], size: '13.3kB', kind: 'once', cmd: '/hello' },
  python: { tags: ['3.12', '3.12-slim', 'latest'], size: '1.02GB', kind: 'script', cmd: 'python3' },
  nginx: { tags: ['latest', 'alpine'], size: '192MB', kind: 'service', cmd: "/docker-entrypoint.sh nginx -g 'daemon off;'" },
  'neurolab/api': { tags: ['latest'], size: '145MB', kind: 'service', cmd: 'uvicorn main:app --host 0.0.0.0' },
  'neurolab/bot': { tags: ['latest'], size: '98MB', kind: 'service', cmd: 'python bot.py' },
};
const DOCKER_SERVICE_LOGS = {
  nginx: ['/docker-entrypoint.sh: Configuration complete; ready for start up', 'nginx: worker process started'],
  'neurolab/api': ['INFO:     Started server process [1]', 'INFO:     Uvicorn running on http://0.0.0.0:8000'],
  'neurolab/bot': ['Bot started, polling updates...'],
};
const DOCKER_HELLO = ['', 'Hello from Docker!', 'This message shows that your installation appears to be working correctly.', ''];
const DOCKER_ADJ = ['brave', 'calm', 'eager', 'fancy', 'happy', 'jolly', 'keen', 'lucid', 'nifty', 'quirky'];
const DOCKER_NOUN = ['turing', 'lovelace', 'hopper', 'knuth', 'ritchie', 'torvalds', 'wozniak', 'liskov'];
const DOCKER_SUBS = ['run', 'ps', 'images', 'stop', 'start', 'rm', 'rmi', 'logs', 'build', 'pull'];

function dockerOf(sh) {
  if (!sh.docker) sh.docker = { seq: 0, images: [], containers: [] };
  return sh.docker;
}
function dockerHex(seed, n) {
  let s = '';
  for (let i = 0; s.length < n; i++) s += hash(`${seed}#${i}`);
  return s.slice(0, n);
}
function dockerRef(text) {
  const s = String(text);
  const i = s.lastIndexOf(':');
  if (i > s.lastIndexOf('/') && i > 0) return { name: s.slice(0, i), tag: s.slice(i + 1) || 'latest', typed: true };
  return { name: s, tag: 'latest', typed: false };
}
function dockerTable(rows) {
  const w = [];
  for (const r of rows) r.forEach((c, i) => { w[i] = Math.max(w[i] || 0, c.length); });
  return rows.map(r => r.map((c, i) => (i === r.length - 1 ? c : c.padEnd(w[i] + 3))).join('')).join('\n');
}
function dockerFindImage(d, name, tag) {
  return d.images.find(im => im.name === name && im.tag === tag) || null;
}
// Находит образ локально; учебный образ докачивает сам (как docker run), лишние строки кладёт в out.
function dockerEnsureImage(sh, ref, out, buildMode) {
  const d = dockerOf(sh);
  const local = dockerFindImage(d, ref.name, ref.tag);
  if (local) return local;
  const tr = has(DOCKER_TRAIN, ref.name) ? DOCKER_TRAIN[ref.name] : null;
  if (!tr) {
    if (buildMode) fail(`ERROR: failed to solve: ${ref.name}:${ref.tag}: failed to resolve source metadata for docker.io/library/${ref.name}:${ref.tag}: pull access denied, repository does not exist or may require authorization`);
    fail(`Unable to find image '${ref.name}:${ref.tag}' locally\ndocker: Error response from daemon: pull access denied for ${ref.name}, repository does not exist or may require 'docker login': denied: requested access to the resource is denied.\nВ тренажёре есть учебные образы: ${Object.keys(DOCKER_TRAIN).join(', ')}.`);
  }
  if (tr.tags.indexOf(ref.tag) < 0) {
    if (buildMode) fail(`ERROR: failed to solve: ${ref.name}:${ref.tag}: docker.io/library/${ref.name}:${ref.tag}: not found`);
    fail(`Unable to find image '${ref.name}:${ref.tag}' locally\ndocker: Error response from daemon: manifest for ${ref.name}:${ref.tag} not found: manifest unknown: manifest unknown.\nДоступные теги ${ref.name}: ${tr.tags.join(', ')}.`);
  }
  if (d.images.length >= DOCKER_MAX_IMAGES) fail(`docker: в тренажёре не больше ${DOCKER_MAX_IMAGES} образов — удали лишние (docker rmi)`);
  d.seq++;
  const im = { name: ref.name, tag: ref.tag, id: dockerHex(`img:${ref.name}:${ref.tag}:${d.seq}`, 12), size: tr.size, base: ref.name, kind: tr.kind, cmd: tr.cmd, files: {} };
  d.images.push(im);
  out.push(`Unable to find image '${ref.name}:${ref.tag}' locally`, `${ref.tag}: Pulling from library/${ref.name}`, `Status: Downloaded newer image for ${ref.name}:${ref.tag}`);
  return im;
}
function dockerFindContainer(d, key) {
  const k = String(key).replace(/^\//, '');
  return d.containers.find(c => c.name === k) || (k ? d.containers.find(c => c.id.startsWith(k)) : null) || null;
}
function dockerPrints(src) {
  const out = [];
  const re = /print\(\s*(["'])(.*?)\1\s*\)/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[2]);
  return out;
}
// Что печатает команда внутри контейнера. Возвращает { lines, code }.
function dockerRunCmd(im, t) {
  if (!t.length) return { lines: [], code: 0 };
  if (t[0] === 'echo') return { lines: [t.slice(1).join(' ')], code: 0 };
  if (t[0] === 'python' || t[0] === 'python3') {
    if (t[1] === '-c') return { lines: dockerPrints(t[2] || ''), code: 0 };
    if (t[1] && !t[1].startsWith('-')) {
      const base = t[1].slice(t[1].lastIndexOf('/') + 1);
      if (has(im.files, base)) return { lines: im.files[base], code: 0 };
      return { lines: [`python: can't open file '/${t[1].replace(/^\//, '')}': [Errno 2] No such file or directory`], code: 2 };
    }
    return { lines: [], code: 0 };
  }
  if (t[0] === 'pwd') return { lines: ['/'], code: 0 };
  if (t[0] === 'ls') return { lines: Object.keys(im.files), code: 0 };
  return fail(`docker: Error response from daemon: failed to create task for container: exec: "${t[0]}": executable file not found in $PATH: unknown.`);
}
function dockerAddLogs(c, lines) {
  for (const l of lines) c.logs.push(String(l).slice(0, DOCKER_MAX_LOG_LEN));
  if (c.logs.length > DOCKER_MAX_LOG_LINES) c.logs = c.logs.slice(-DOCKER_MAX_LOG_LINES);
}
// Запуск (или перезапуск) контейнера: пишет логи и ставит статус.
function dockerExecute(c, im) {
  if (c.cmdOverride === '' && im.kind === 'once') { dockerAddLogs(c, DOCKER_HELLO); c.status = 'exited'; c.code = 0; return; }
  if (c.cmdOverride === '' && im.kind === 'service') { dockerAddLogs(c, has(DOCKER_SERVICE_LOGS, im.base) ? DOCKER_SERVICE_LOGS[im.base] : ['started']); c.status = 'running'; c.code = 0; return; }
  const r = dockerRunCmd(im, c.cmdOverride !== '' ? c.cmdArgs : tokenize(im.cmd));
  dockerAddLogs(c, r.lines);
  c.status = 'exited';
  c.code = r.code;
}
function dockerPortBusy(d, ports, except) {
  for (const p of ports) {
    const busy = d.containers.find(c => c !== except && c.status === 'running' && c.ports.some(q => q.h === p.h));
    if (busy) fail(`docker: Error response from daemon: driver failed programming external connectivity on endpoint ${busy.name}: Bind for 0.0.0.0:${p.h} failed: port is already allocated.`);
  }
}
function dockerRun(sh, argv) {
  const args = argv.slice();
  const d = dockerOf(sh);
  let detach = false;
  let name = null;
  let autoRemove = false;
  const ports = [];
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (rest.length) { rest.push(a); continue; }
    if (/^-[a-zA-Z]{2,}$/.test(a)) { args.splice(i, 1, ...a.slice(1).split('').map(ch => `-${ch}`)); i--; continue; }
    if (/^-p[^=]/.test(a)) { args.splice(i, 1, '-p', a.slice(2)); i--; continue; }
    if (a === '-d' || a === '--detach') detach = true;
    else if (a === '--rm') autoRemove = true;
    else if (a === '-i' || a === '-t' || a === '-it' || a === '-ti') continue;
    else if (a === '--name' || a.startsWith('--name=')) { name = a === '--name' ? args[++i] : a.slice(7); if (!name) fail("docker: flag needs an argument: --name\nSee 'docker run --help'."); }
    else if (a === '-p' || a === '--publish' || a.startsWith('-p=') || a.startsWith('--publish=')) {
      const v = a === '-p' || a === '--publish' ? args[++i] : a.slice(a.indexOf('=') + 1);
      const m = String(v || '').replace(/\/(tcp|udp)$/, '').match(/^(?:[\d.]+:)?(\d+):(\d+)$/);
      if (!m) fail(`docker: invalid containerPort: ${v || ''}.\nФормат порта: -p ХОСТ:КОНТЕЙНЕР, например -p 8080:80.\nSee 'docker run --help'.`);
      ports.push({ h: m[1], c: m[2] });
    } else if (a === '-e' || a === '--env' || a === '-v' || a === '--volume' || a === '-w') i++;
    else if (/^(-e=|-v=|-w=|--env=|--volume=)/.test(a)) continue;
    else if (a.startsWith('-')) fail(`unknown flag: ${a}\nSee 'docker run --help'.`);
    else rest.push(a);
  }
  if (!rest.length) fail('docker: "docker run" requires at least 1 argument.\nSee \'docker run --help\'.\n\nUsage:  docker run [OPTIONS] IMAGE [COMMAND] [ARG...]');
  if (name !== null) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) fail(`docker: Error parsing reference: invalid container name (${name}), only [a-zA-Z0-9][a-zA-Z0-9_.-] are allowed.`);
    const dup = d.containers.find(c => c.name === name);
    if (dup) fail(`docker: Error response from daemon: Conflict. The container name "/${name}" is already in use by container "${dup.full}". You have to remove (or rename) that container to be able to reuse that name.`);
  }
  if (d.containers.length >= DOCKER_MAX_CONTAINERS) fail(`docker: в тренажёре не больше ${DOCKER_MAX_CONTAINERS} контейнеров — удали лишние (docker rm)`);
  dockerPortBusy(d, ports, null);
  const ref = dockerRef(rest[0]);
  const out = [];
  const im = dockerEnsureImage(sh, ref, out, false);
  d.seq++;
  if (name === null) {
    let k = d.seq;
    for (let tries = 0; tries < DOCKER_ADJ.length * DOCKER_NOUN.length; tries++, k += 7) {
      const cand = `${DOCKER_ADJ[k % DOCKER_ADJ.length]}_${DOCKER_NOUN[(k * 3) % DOCKER_NOUN.length]}`;
      if (!d.containers.some(c => c.name === cand)) { name = cand; break; }
    }
    if (name === null) name = `${DOCKER_ADJ[d.seq % DOCKER_ADJ.length]}_${DOCKER_NOUN[d.seq % DOCKER_NOUN.length]}_${d.seq}`;
  }
  const full = dockerHex(`ctr:${name}:${d.seq}`, 64);
  const c = { id: full.slice(0, 12), full, name, image: rest[0], imgName: im.name, imgTag: im.tag, cmdOverride: rest.slice(1).join(' '), cmdArgs: rest.slice(1), ports, logs: [], status: 'exited', code: 0 };
  dockerExecute(c, im);
  d.containers.push(c);
  if (detach) {
    if (autoRemove && c.status === 'exited') d.containers.splice(d.containers.indexOf(c), 1);
    out.push(full);
    return out.join('\n');
  }
  out.push(...c.logs);
  if (c.status === 'running') { c.status = 'exited'; c.code = 130; }
  if (autoRemove) d.containers.splice(d.containers.indexOf(c), 1);
  return out.join('\n');
}
function dockerPs(sh, args) {
  const d = dockerOf(sh);
  const all = args.some(a => a === '-a' || a === '--all' || a === '-qa' || a === '-aq');
  const quiet = args.some(a => a === '-q' || a === '--quiet' || a === '-qa' || a === '-aq');
  const list = d.containers.filter(c => all || c.status === 'running').slice().reverse();
  if (quiet) return list.map(c => c.id).join('\n');
  const rows = [['CONTAINER ID', 'IMAGE', 'COMMAND', 'CREATED', 'STATUS', 'PORTS', 'NAMES']];
  for (const c of list) {
    const im = dockerFindImage(d, c.imgName, c.imgTag);
    const cmd = c.cmdOverride !== '' ? c.cmdOverride : (im ? im.cmd : '');
    const shown = cmd.length > 20 ? `${cmd.slice(0, 19)}…` : cmd;
    const ports = c.ports.map(p => `0.0.0.0:${p.h}->${p.c}/tcp`).join(', ');
    rows.push([c.id, c.image, `"${shown}"`, 'Less than a second ago', c.status === 'running' ? 'Up Less than a second' : `Exited (${c.code}) Less than a second ago`, ports, c.name]);
  }
  return dockerTable(rows);
}
function dockerImages(sh, args) {
  const d = dockerOf(sh);
  const list = d.images.slice().reverse();
  if (args.some(a => a === '-q' || a === '--quiet')) return list.map(im => im.id).join('\n');
  const rows = [['REPOSITORY', 'TAG', 'IMAGE ID', 'CREATED', 'SIZE']];
  for (const im of list) rows.push([im.name, im.tag, im.id, 'Less than a second ago', im.size]);
  return dockerTable(rows);
}
function dockerEach(sh, sub, args, fn) {
  const names = args.filter(a => !a.startsWith('-'));
  if (!names.length) fail(`docker: "docker ${sub}" requires at least 1 argument.\nSee 'docker ${sub} --help'.`);
  const d = dockerOf(sh);
  const out = [];
  for (const n of names) {
    const c = dockerFindContainer(d, n);
    if (!c) { out.push(`Error response from daemon: No such container: ${n}`); continue; }
    const r = fn(d, c, n);
    if (r) out.push(r);
  }
  return out.join('\n');
}
function dockerStop(sh, args) {
  return dockerEach(sh, 'stop', args, (d, c, n) => { if (c.status === 'running') { c.status = 'exited'; c.code = 137; } return n; });
}
function dockerStart(sh, args) {
  return dockerEach(sh, 'start', args, (d, c, n) => {
    if (c.status === 'running') return n;
    dockerPortBusy(d, c.ports, c);
    const im = dockerFindImage(d, c.imgName, c.imgTag);
    if (!im) return `Error response from daemon: No such image: ${c.image}`;
    dockerExecute(c, im);
    return n;
  });
}
function dockerRemove(sh, args) {
  const force = args.some(a => a === '-f' || a === '--force');
  return dockerEach(sh, 'rm', args, (d, c, n) => {
    if (c.status === 'running' && !force) return `Error response from daemon: You cannot remove a running container ${c.full}. Stop the container before attempting removal or force remove`;
    d.containers.splice(d.containers.indexOf(c), 1);
    return n;
  });
}
function dockerLogs(sh, args) {
  const d = dockerOf(sh);
  let tail = null;
  const names = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--tail' || a === '-n') tail = Number(args[++i]);
    else if (a.startsWith('--tail=')) tail = Number(a.slice(7));
    else if (!a.startsWith('-')) names.push(a);
  }
  if (names.length !== 1) fail('docker: "docker logs" requires exactly 1 argument.\nSee \'docker logs --help\'.');
  const c = dockerFindContainer(d, names[0]);
  if (!c) fail(`Error response from daemon: No such container: ${names[0]}`);
  const lines = tail !== null && tail >= 0 ? c.logs.slice(Math.max(0, c.logs.length - tail)) : c.logs;
  return lines.join('\n');
}
function dockerRmi(sh, args) {
  const force = args.some(a => a === '-f' || a === '--force');
  const names = args.filter(a => !a.startsWith('-'));
  if (!names.length) fail('docker: "docker rmi" requires at least 1 argument.\nSee \'docker rmi --help\'.');
  const d = dockerOf(sh);
  const out = [];
  for (const n of names) {
    const ref = dockerRef(n);
    const im = d.images.find(x => x.name === ref.name && x.tag === ref.tag) || (n.length >= 3 ? d.images.find(x => x.id.startsWith(n)) : null);
    if (!im) { out.push(`Error response from daemon: No such image: ${ref.name}:${ref.tag}`); continue; }
    const user = d.containers.find(c => c.imgName === im.name && c.imgTag === im.tag);
    if (user && !force) { out.push(`Error response from daemon: conflict: unable to remove repository reference "${im.name}:${im.tag}" (must force) - container ${user.id} is using its referenced image ${im.id}`); continue; }
    d.images.splice(d.images.indexOf(im), 1);
    out.push(`Untagged: ${im.name}:${im.tag}`, `Deleted: sha256:${dockerHex(`sha:${im.id}`, 64)}`);
  }
  return out.join('\n');
}
function dockerPull(sh, args) {
  const names = args.filter(a => !a.startsWith('-'));
  if (names.length !== 1) fail('docker: "docker pull" requires exactly 1 argument.\nSee \'docker pull --help\'.');
  const ref = dockerRef(names[0]);
  const tr = has(DOCKER_TRAIN, ref.name) ? DOCKER_TRAIN[ref.name] : null;
  if (!tr) fail(`Error response from daemon: pull access denied for ${ref.name}, repository does not exist or may require 'docker login': denied: requested access to the resource is denied\nВ тренажёре есть учебные образы: ${Object.keys(DOCKER_TRAIN).join(', ')}.`);
  if (tr.tags.indexOf(ref.tag) < 0) fail(`Error response from daemon: manifest for ${ref.name}:${ref.tag} not found: manifest unknown: manifest unknown\nДоступные теги ${ref.name}: ${tr.tags.join(', ')}.`);
  const out = ref.typed ? [] : ['Using default tag: latest'];
  const d = dockerOf(sh);
  const had = dockerFindImage(d, ref.name, ref.tag);
  if (!had) dockerEnsureImage(sh, ref, []);
  out.push(`${ref.tag}: Pulling from library/${ref.name}`, `Digest: sha256:${dockerHex(`dig:${ref.name}:${ref.tag}`, 64)}`, had ? `Status: Image is up to date for ${ref.name}:${ref.tag}` : `Status: Downloaded newer image for ${ref.name}:${ref.tag}`, `docker.io/library/${ref.name}:${ref.tag}`);
  return out.join('\n');
}
function dockerBuild(sh, args) {
  const d = dockerOf(sh);
  let tag = null;
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-t' || a === '--tag') { tag = args[++i]; if (!tag) fail(`docker: flag needs an argument: ${a}\nSee 'docker build --help'.`); }
    else if (a.startsWith('--tag=')) tag = a.slice(6);
    else if (a === '-f' || a === '--file') i++;
    else if (a.startsWith('-')) continue;
    else pos.push(a);
  }
  if (pos.length !== 1) fail('docker: "docker build" requires exactly 1 argument.\nSee \'docker build --help\'.\n\nUsage:  docker build [OPTIONS] PATH | URL | -');
  const ctx = resolvePath(sh, pos[0]);
  if (!sh.fs.get(ctx)?.dir) fail(`ERROR: unable to prepare context: path "${pos[0]}" not found`);
  const prefix = ctx === '/' ? '' : ctx;
  const df = sh.fs.get(`${prefix}/Dockerfile`);
  if (!df || df.dir) fail('ERROR: failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory\nСоздай файл Dockerfile (с большой буквы) в папке сборки.');
  const ref = tag === null ? { name: '<none>', tag: '<none>' } : dockerRef(tag);
  if (tag !== null && !/^[a-z0-9][a-z0-9_.\/-]*$/.test(ref.name)) fail(`ERROR: invalid tag "${tag}": repository name must be lowercase`);
  // разбор Dockerfile: строки с «\» в конце склеиваем
  const ins = [];
  const lines = df.content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    const no = i + 1;
    if (!line || line.startsWith('#')) continue;
    while (line.endsWith('\\') && i + 1 < lines.length) { i++; line = `${line.slice(0, -1).trim()} ${lines[i].trim()}`; }
    const m = line.match(/^(\S+)\s*([\s\S]*)$/);
    ins.push({ op: m[1].toUpperCase(), arg: m[2].trim(), no });
  }
  if (!ins.length) fail('ERROR: failed to solve: the Dockerfile cannot be empty');
  const KNOWN_OPS = ['FROM', 'COPY', 'ADD', 'RUN', 'CMD', 'ENTRYPOINT', 'WORKDIR', 'ENV', 'EXPOSE', 'ARG', 'LABEL', 'USER'];
  for (const x of ins) if (KNOWN_OPS.indexOf(x.op) < 0) fail(`ERROR: failed to solve: dockerfile parse error on line ${x.no}: unknown instruction: ${x.op}`);
  const fromAt = ins.findIndex(x => x.op === 'FROM');
  if (fromAt < 0 || ins.slice(0, fromAt).some(x => x.op !== 'ARG')) fail(`ERROR: failed to solve: dockerfile parse error on line ${ins[0].no}: no build stage in current context\nПервой инструкцией должна быть FROM, например: FROM python:3.12`);
  const steps = [];
  const files = {};
  let cmd = null;
  let base = null;
  for (const x of ins) {
    if (x.op === 'FROM') {
      const parts = x.arg.split(/\s+/).filter(Boolean);
      if (parts.length !== 1 && parts.length !== 3) fail(`ERROR: failed to solve: dockerfile parse error on line ${x.no}: FROM requires either one or three arguments`);
      base = dockerEnsureImage(sh, dockerRef(parts[0]), [], true);
      steps.push(`FROM ${parts[0]}`);
    } else if (x.op === 'COPY' || x.op === 'ADD') {
      const parts = x.arg.split(/\s+/).filter(p => p && !p.startsWith('--'));
      if (parts.length < 2) fail(`ERROR: failed to solve: dockerfile parse error on line ${x.no}: ${x.op} requires at least two arguments, but only ${parts.length} ${parts.length === 1 ? 'was' : 'were'} provided. Destination could not be determined.`);
      for (const src of parts.slice(0, -1)) {
        const abs = resolvePath({ cwd: ctx }, src);
        const inside = abs === ctx || abs.startsWith(`${prefix}/`);
        if (!inside || !sh.fs.has(abs)) fail(`ERROR: failed to solve: failed to compute cache key: failed to calculate checksum of ref: "/${src.replace(/^\.?\//, '')}": not found\nФайла «${src}» нет в папке сборки.`);
        for (const [k, v] of sh.fs) {
          if (v.dir || !(k === abs || k.startsWith(`${abs}/`))) continue;
          const b = k.slice(k.lastIndexOf('/') + 1);
          files[b] = b.endsWith('.py') ? dockerPrints(v.content).slice(0, DOCKER_MAX_LOG_LINES).map(s => s.slice(0, DOCKER_MAX_LOG_LEN)) : [];
        }
      }
      steps.push(`${x.op} ${parts.join(' ')}`);
    } else if (x.op === 'RUN' || x.op === 'WORKDIR') {
      if (!x.arg) fail(`ERROR: failed to solve: dockerfile parse error on line ${x.no}: ${x.op} requires at least one argument`);
      steps.push(`${x.op} ${x.arg}`);
    } else if (x.op === 'CMD' || x.op === 'ENTRYPOINT') {
      if (!x.arg) fail(`ERROR: failed to solve: dockerfile parse error on line ${x.no}: ${x.op} requires at least one argument`);
      let text = x.arg;
      if (text.startsWith('[')) {
        let arr = null;
        try { arr = JSON.parse(text); } catch (e) { arr = null; }
        if (Array.isArray(arr) && arr.every(v => typeof v === 'string')) text = arr.map(v => (/\s/.test(v) ? JSON.stringify(v) : v)).join(' ');
        else fail(`ERROR: failed to solve: dockerfile parse error on line ${x.no}: ${x.op} в форме списка должен быть JSON-массивом строк в двойных кавычках: ${x.op} ["python", "app.py"]`);
      }
      cmd = text.slice(0, DOCKER_MAX_LOG_LEN);
    } else if (!x.arg) {
      fail(`ERROR: failed to solve: dockerfile parse error on line ${x.no}: ${x.op} requires at least one argument`);
    }
  }
  const old = ref.name === '<none>' ? null : dockerFindImage(d, ref.name, ref.tag);
  if (!old && d.images.length >= DOCKER_MAX_IMAGES) fail(`docker: в тренажёре не больше ${DOCKER_MAX_IMAGES} образов — удали лишние (docker rmi)`);
  d.seq++;
  const im = { name: ref.name, tag: ref.tag, id: dockerHex(`img:${ref.name}:${ref.tag}:${d.seq}`, 12), size: base.size, base: base.base, kind: cmd === null ? base.kind : 'script', cmd: cmd === null ? base.cmd : cmd, files: { ...base.files, ...files } };
  if (old) d.images.splice(d.images.indexOf(old), 1);
  d.images.push(im);
  const out = [`[+] Building 0.1s (${steps.length + 2}/${steps.length + 2}) FINISHED`, ' => [internal] load build definition from Dockerfile'];
  steps.forEach((s, i) => out.push(` => [${i + 1}/${steps.length}] ${s}`));
  out.push(' => exporting to image', ` => => naming to docker.io/library/${im.name}:${im.tag}`);
  if (cmd === null) out.push('Предупреждение: в Dockerfile нет CMD — контейнер запустит команду базового образа.');
  return out.join('\n');
}
function dockerCmd(sh, args) {
  const [sub, ...rest] = args;
  if (!sub) return `использование: docker <команда> [аргументы]\nКоманды: ${DOCKER_SUBS.join(', ')}`;
  if (sub === '--version' || sub === '-v' || sub === 'version') return 'Docker version 26.1.4, build 5650f9b';
  switch (sub) {
    case 'run': return dockerRun(sh, rest);
    case 'ps': return dockerPs(sh, rest);
    case 'images': return dockerImages(sh, rest);
    case 'stop': return dockerStop(sh, rest);
    case 'start': return dockerStart(sh, rest);
    case 'rm': return dockerRemove(sh, rest);
    case 'rmi': return dockerRmi(sh, rest);
    case 'logs': return dockerLogs(sh, rest);
    case 'build': return dockerBuild(sh, rest);
    case 'pull': return dockerPull(sh, rest);
    default: return `docker: '${sub}' is not a docker command.\nSee 'docker --help'. В тренажёре есть: ${DOCKER_SUBS.join(', ')}.`;
  }
}

function dockerMatch(c, g) {
  if (g.name != null && c.name !== g.name) return false;
  if (g.image != null) { const r = dockerRef(g.image); if (c.imgName !== r.name || (r.typed && c.imgTag !== r.tag)) return false; }
  return true;
}
export const GOAL_KINDS = ['dir', 'file', 'noFile', 'cwd', 'gitInit', 'config', 'commits', 'commitMessage', 'tracked', 'staged', 'clean', 'branch', 'onBranch', 'used', 'env', 'imageExists', 'containerRunning', 'containerExited', 'containerPort', 'usedDocker'];

export function checkGoal(shell, g) {
  const sh = shell.state;
  const r = liveRepo(sh);
  switch (g.kind) {
    case 'dir': return !!sh.fs.get(resolvePath(sh, g.path))?.dir;
    case 'file': { const n = sh.fs.get(resolvePath(sh, g.path)); return !!n && !n.dir && (g.contains == null || n.content.includes(g.contains)); }
    case 'noFile': return !sh.fs.has(resolvePath(sh, g.path));
    case 'cwd': return sh.cwd === resolvePath(sh, g.path);
    case 'gitInit': return !!r && (!g.path || r.root === resolvePath(sh, g.path));
    case 'config': { const v = r?.config[g.key] ?? sh.gitConfig[g.key]; return !!v && (g.value == null || v === g.value); }
    case 'commits': return !!r && countCommits(r) >= g.min;
    case 'commitMessage': return !!r && r.commits.some(c => c.msg.toLowerCase().includes(String(g.contains).toLowerCase()));
    case 'tracked': return !!r && has(r.index, g.path);
    case 'staged': return !!r && diffState(sh, r).staged.some(([, p]) => p === g.path);
    case 'clean': {
      if (!r || headIdx(r) === null) return false;
      const d = diffState(sh, r);
      return !d.staged.length && !d.unstaged.length && !d.untracked.length;
    }
    case 'branch': return !!r && has(r.branches, g.name);
    case 'onBranch': return !!r && r.head === g.name;
    case 'used': return sh.history.some(x => x.trim().replace(/\s+/g, ' ').startsWith(g.cmd));
    case 'env': return has(sh.env, g.name) && (g.value == null || sh.env[g.name] === g.value);
    case 'imageExists': { const r2 = dockerRef(g.name); const tg = g.tag || (r2.typed ? r2.tag : null); return dockerOf(sh).images.some(im => im.name === r2.name && (tg === null || im.tag === tg)); }
    case 'containerRunning': return dockerOf(sh).containers.some(c => c.status === 'running' && dockerMatch(c, g));
    case 'containerExited': return dockerOf(sh).containers.some(c => c.status === 'exited' && (g.code == null || c.code === g.code) && dockerMatch(c, g));
    case 'containerPort': return dockerOf(sh).containers.some(c => c.status === 'running' && dockerMatch(c, g) && c.ports.some(p => p.h === String(g.host) && p.c === String(g.container)));
    case 'usedDocker': return sh.history.some(x => { const w = x.trim().split(/\s+/); return w[0] === 'docker' && (!g.sub || w[1] === g.sub); });
    default: return false;
  }
}

export function createShell(setup = {}) {
  const sh = {
    fs: new Map([['/', { dir: true }], ['/home', { dir: true }], [HOME, { dir: true }]]),
    cwd: HOME,
    env: { USER: 'student', HOME, PATH: '/usr/local/bin:/usr/bin:/bin', ...(setup.env || {}) },
    gitConfig: { ...(setup.gitConfig || {}) },
    repo: null,
    docker: { seq: 0, images: [], containers: [] },
    history: [],
  };
  for (const d of setup.dirs || []) mkdirp(sh, resolvePath(sh, d));
  for (const [p, content] of Object.entries(setup.files || {})) {
    const abs = resolvePath(sh, p);
    mkdirp(sh, parentOf(abs));
    sh.fs.set(abs, { dir: false, content });
  }
  if (setup.cwd) { const c = resolvePath(sh, setup.cwd); mkdirp(sh, c); sh.cwd = c; }
  for (const cmd of setup.commands || []) run(sh, cmd);
  return {
    state: sh,
    exec(line) { sh.history.push(String(line)); return run(sh, line); },
    prompt: () => `student@neurolab:${sh.cwd === HOME ? '~' : sh.cwd.startsWith(`${HOME}/`) ? `~${sh.cwd.slice(HOME.length)}` : sh.cwd}$`,
  };
}
