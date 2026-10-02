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
  help: () => 'Команды: pwd, ls [-a], cd, mkdir [-p], touch, cat, echo, rm [-r], mv, cp [-r], clear, whoami, env, export, history, git',
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

export const GOAL_KINDS = ['dir', 'file', 'noFile', 'cwd', 'gitInit', 'config', 'commits', 'commitMessage', 'tracked', 'staged', 'clean', 'branch', 'onBranch', 'used', 'env'];

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
