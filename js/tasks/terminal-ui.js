// Общая часть терминала для заданий и песочницы: экран, ввод, история ↑/↓, быстрые команды, список целей (необязательно).
import { h } from '../util/dom.js';
import { checkGoal } from '../sim/shell.js';

export const TERM_CHIPS = ['ls', 'cd ', 'pwd', 'mkdir ', 'touch ', 'cat ', 'git status', 'git add ', 'git commit -m ""', 'git log --oneline'];
export const TERM_MOTD = 'Учебный терминал НейроЛаб. Введите help, чтобы увидеть команды.';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// shell — createShell(...); goals — [{ text, kind, … }] или не задано; history — уже выполненные команды (повторяются на экране);
// onCommand(cmd, history) — после выполнения команды; animate — печать ответа по кускам (≤ 0,5 с, кроме reduced-motion)
// → { el, input, refresh(), history(), print(text, cls) }
export function termView({ shell, goals, history = [], onCommand, locked = false, chips = TERM_CHIPS, motd = TERM_MOTD, animate = false } = {}) {
  const hist = [...history];
  const screen = h('div', { class: 'term-screen', role: 'log' });
  const goalsEl = goals && goals.length ? h('ul', { class: 'goals' }) : null;
  let finishTyping = null;
  const scroll = () => { screen.scrollTop = screen.scrollHeight; };
  const print = (text, cls = '', typed = false) => {
    if (text === '\u001bclear') { screen.replaceChildren(); return; }
    if (!text) { scroll(); return; }
    const pre = h('pre', { class: cls });
    screen.append(pre);
    if (typed && animate && !reduced() && text.length > 12) {
      const size = Math.max(2, Math.ceil(text.length / 25)); // ≈ 25 кусков по 20 мс
      let i = 0;
      let timer = null;
      const done = () => { clearTimeout(timer); pre.textContent = text; finishTyping = null; scroll(); };
      const tick = () => {
        i += size;
        if (i >= text.length) { done(); return; }
        pre.textContent = text.slice(0, i);
        scroll();
        timer = setTimeout(tick, 20);
      };
      finishTyping = done;
      tick();
    } else {
      pre.textContent = text;
      scroll();
    }
  };
  const refresh = () => {
    promptEl.textContent = shell.prompt();
    if (goalsEl) goalsEl.replaceChildren(...goals.map(g => { const ok = checkGoal(shell, g); return h('li', { class: ok ? 'done' : '' }, ok ? '✅ ' : '⬜ ', g.text); }));
  };
  const promptEl = h('span', { class: 'term-prompt' }, shell.prompt());
  print(motd, 'dim');
  for (const c of hist) { print(`${shell.prompt()} ${c}`, 'cmd'); print(shell.exec(c)); }
  const input = h('input', { class: 'term-input', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'send', disabled: locked, 'aria-label': 'Команда терминала' });
  let hi = hist.length;
  const submit = () => {
    const c = input.value.trim();
    if (!c) return;
    if (finishTyping) finishTyping();
    input.value = '';
    print(`${shell.prompt()} ${c}`, 'cmd');
    print(shell.exec(c), '', true);
    hist.push(c);
    hi = hist.length;
    if (onCommand) onCommand(c, [...hist]);
    refresh();
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'ArrowUp' && hi > 0) { e.preventDefault(); input.value = hist[--hi]; }
    else if (e.key === 'ArrowDown' && hi < hist.length) { e.preventDefault(); hi++; input.value = hist[hi] ?? ''; }
  });
  const chipEls = (chips || []).map(c => h('button', {
    type: 'button', class: 'chip', disabled: locked,
    onpointerdown: e => e.preventDefault(),
    onclick: () => {
      input.value += (input.value && !input.value.endsWith(' ') ? ' ' : '') + c;
      const pos = input.value.length - (c.endsWith('""') ? 1 : 0);
      input.focus();
      input.setSelectionRange(pos, pos);
    },
  }, c.trim()));
  refresh();
  const el = h('div', { class: 'term-view' },
    goalsEl ? h('div', { class: 'goals-box' }, h('strong', {}, 'Цели:'), goalsEl) : '',
    h('div', { class: 'terminal', onclick: () => input.focus() }, screen,
      h('div', { class: 'term-line' }, promptEl, input, h('button', { type: 'button', class: 'term-enter', disabled: locked, onclick: submit, 'aria-label': 'Выполнить команду' }, '⏎'))),
    locked ? '' : h('div', { class: 'chips' }, chipEls));
  return { el, input, refresh, history: () => [...hist], print };
}
