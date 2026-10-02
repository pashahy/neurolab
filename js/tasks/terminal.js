import { h, add } from '../util/dom.js';
import { fraction } from './common.js';
import { createShell, checkGoal, GOAL_KINDS } from '../sim/shell.js';

const DEFAULT_CHIPS = ['ls', 'cd ', 'pwd', 'mkdir ', 'touch ', 'cat ', 'git status', 'git add ', 'git commit -m ""', 'git log --oneline'];

export function replay(t, history) {
  const shell = createShell(t.setup);
  for (const c of history) shell.exec(c);
  return { shell, done: t.goals.map(g => checkGoal(shell, g)) };
}

export default {
  manual: false,
  validate(t) {
    const e = [];
    if (!Array.isArray(t.goals) || !t.goals.length) return ['terminal: нужны goals'];
    t.goals.forEach((g, i) => {
      if (!g.text) e.push(`terminal: цель ${i}: нужен text`);
      if (!GOAL_KINDS.includes(g.kind)) e.push(`terminal: цель ${i}: неизвестный kind «${g.kind}»`);
      if (['dir', 'file', 'noFile', 'cwd'].includes(g.kind) && !/^[~/]/.test(g.path || '')) e.push(`terminal: цель ${i}: path должен начинаться с / или ~`);
    });
    if (!Array.isArray(t.solution) || !t.solution.length) e.push('terminal: нужен solution — команды эталонного решения');
    else {
      const r = replay(t, t.solution);
      const missed = t.goals.filter((g, i) => !r.done[i]).map(g => g.text);
      if (missed.length) e.push(`terminal: эталонное решение не выполняет цели: ${missed.join('; ')}`);
    }
    return e;
  },
  ready: (t, a) => Array.isArray(a?.history) && a.history.length > 0,
  check(t, a) { return fraction(t, replay(t, Array.isArray(a?.history) ? a.history : []).done.filter(Boolean).length, t.goals.length); },
  solution: t => ({ history: [...t.solution] }),
  toText: (t, a) => (a?.history || []).join('\n'),
  render(t, el, { answer, onChange, locked }) {
    const history = [...(answer?.history || [])];
    const shell = createShell(t.setup);
    const screen = h('div', { class: 'term-screen', role: 'log' });
    const goalsEl = h('ul', { class: 'goals' });
    const print = (text, cls = '') => {
      if (text === '\u001bclear') { screen.replaceChildren(); return; }
      if (text) screen.append(h('pre', { class: cls }, text));
      screen.scrollTop = screen.scrollHeight;
    };
    const drawGoals = () => goalsEl.replaceChildren(...t.goals.map(g => { const ok = checkGoal(shell, g); return h('li', { class: ok ? 'done' : '' }, ok ? '✅ ' : '⬜ ', g.text); }));
    print(t.motd || 'Учебный терминал НейроЛаб. Введите help, чтобы увидеть команды.', 'dim');
    for (const c of history) { print(`${shell.prompt()} ${c}`, 'cmd'); print(shell.exec(c)); }
    drawGoals();
    const promptEl = h('span', { class: 'term-prompt' }, shell.prompt());
    const input = h('input', { class: 'term-input', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'send', disabled: locked, 'aria-label': 'Команда терминала' });
    let hi = history.length;
    const submit = () => {
      const c = input.value.trim();
      if (!c) return;
      input.value = '';
      print(`${shell.prompt()} ${c}`, 'cmd');
      print(shell.exec(c));
      history.push(c);
      hi = history.length;
      promptEl.textContent = shell.prompt();
      onChange({ history: [...history] });
      drawGoals();
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      else if (e.key === 'ArrowUp' && hi > 0) { e.preventDefault(); input.value = history[--hi]; }
      else if (e.key === 'ArrowDown' && hi < history.length) { e.preventDefault(); hi++; input.value = history[hi] ?? ''; }
    });
    const chips = (t.chips || DEFAULT_CHIPS).map(c => h('button', {
      type: 'button', class: 'chip', disabled: locked,
      onpointerdown: e => e.preventDefault(),
      onclick: () => {
        input.value += (input.value && !input.value.endsWith(' ') ? ' ' : '') + c;
        const pos = input.value.length - (c.endsWith('""') ? 1 : 0);
        input.focus();
        input.setSelectionRange(pos, pos);
      },
    }, c.trim()));
    add(el,
      h('div', { class: 'goals-box' }, h('strong', {}, 'Цели:'), goalsEl),
      h('div', { class: 'terminal', onclick: () => input.focus() }, screen,
        h('div', { class: 'term-line' }, promptEl, input, h('button', { type: 'button', class: 'term-enter', disabled: locked, onclick: submit, 'aria-label': 'Выполнить команду' }, '⏎'))),
      locked ? '' : h('div', { class: 'chips' }, chips));
  },
};
