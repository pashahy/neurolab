// Общая часть терминала для заданий и песочницы: экран, ввод, история ↑/↓, Tab, цвета, подсказки опечаток,
// быстрые команды, список целей (необязательно).
import { h } from '../util/dom.js';
import { checkGoal } from '../sim/shell.js';
import { colorize, promptParts } from './term-color.js';
import { complete, suggest } from './term-complete.js';

export const TERM_CHIPS = ['ls', 'cd ', 'pwd', 'mkdir ', 'touch ', 'cat ', 'git status', 'git add ', 'git commit -m ""', 'git log --oneline'];
export const TERM_MOTD = 'Учебный терминал НейроЛаб. Введите help, чтобы увидеть команды.';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const UNKNOWN_RE = /команда не найдена|не является командой git/;

// shell — createShell(...); goals — [{ text, kind, … }] или не задано; history — уже выполненные команды (повторяются на экране);
// onCommand(cmd, history) — после выполнения команды; animate — печать ответа по кускам (≤ 0,5 с, кроме reduced-motion)
// → { el, input, refresh(), history(), print(text, cls) }
export function termView({ shell, goals, history = [], onCommand, locked = false, chips = TERM_CHIPS, motd = TERM_MOTD, animate = false } = {}) {
  const hist = [...history];
  const screen = h('div', { class: 'term-screen', role: 'log' });
  const goalsEl = goals && goals.length ? h('ul', { class: 'goals' }) : null;
  let finishTyping = null;
  const scroll = () => { screen.scrollTop = screen.scrollHeight; };
  // Цветные куски — текстовыми узлами и span (никакого innerHTML)
  const paint = (el, segs) => el.replaceChildren(...segs.map(s => (s.cls ? h('span', { class: s.cls }, s.text) : s.text)));
  // segs — готовые куски [{ text, cls }]; без них текст печатается без цвета
  const print = (text, cls = '', typed = false, segs = null) => {
    if (text === '\u001bclear') { screen.replaceChildren(); return; }
    if (!text) { scroll(); return; }
    const pre = h('pre', { class: cls });
    screen.append(pre);
    const fill = () => { if (segs) paint(pre, segs); else pre.textContent = text; };
    if (typed && animate && !reduced() && text.length > 12) {
      const size = Math.max(2, Math.ceil(text.length / 25)); // ≈ 25 кусков по 20 мс
      let i = 0;
      let timer = null;
      const done = () => { clearTimeout(timer); fill(); finishTyping = null; scroll(); };
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
      fill();
      scroll();
    }
  };
  const printCmd = c => {
    const pre = h('pre', { class: 'cmd' });
    paint(pre, promptParts(shell).concat({ text: ` ${c}`, cls: '' }));
    screen.append(pre);
  };
  const printResult = (c, out, typed) => {
    print(out, '', typed, colorize(c, out, shell));
    if (UNKNOWN_RE.test(out)) {
      const s = suggest(c);
      if (s) print(`Возможно, ты имел в виду «${s}»?`, 'dim');
    }
  };
  const refresh = () => {
    paint(promptEl, promptParts(shell));
    if (goalsEl) goalsEl.replaceChildren(...goals.map(g => { const ok = checkGoal(shell, g); return h('li', { class: ok ? 'done' : '' }, ok ? '✅ ' : '⬜ ', g.text); }));
  };
  const promptEl = h('span', { class: 'term-prompt' });
  paint(promptEl, promptParts(shell));
  print(motd, 'dim');
  for (const c of hist) { printCmd(c); printResult(c, shell.exec(c), false); }
  const input = h('input', { class: 'term-input', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'send', disabled: locked, 'aria-label': 'Команда терминала' });
  let hi = hist.length;
  const submit = () => {
    const c = input.value.trim();
    if (!c) return;
    if (finishTyping) finishTyping();
    input.value = '';
    printCmd(c);
    printResult(c, shell.exec(c), true);
    hist.push(c);
    hi = hist.length;
    if (onCommand) onCommand(c, [...hist]);
    refresh();
  };
  // Tab: дополнить команду или путь; несколько вариантов — общий префикс и список
  const doTab = () => {
    if (locked) return;
    const r = complete(input.value, shell);
    if (r.line !== input.value) input.value = r.line;
    if (r.options.length) print(r.options.join('  '), 'dim');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'Tab' && !e.shiftKey && input.value.trim()) { e.preventDefault(); doTab(); }
    else if (e.key === 'ArrowUp' && hi > 0) { e.preventDefault(); input.value = hist[--hi]; }
    else if (e.key === 'ArrowDown' && hi < hist.length) { e.preventDefault(); hi++; input.value = hist[hi] ?? ''; }
  });
  const tabChip = h('button', {
    type: 'button', class: 'chip tab-chip', disabled: locked, 'aria-label': 'Дополнить (Tab)',
    onpointerdown: e => e.preventDefault(),
    onclick: doTab,
  }, '⇥');
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
    locked ? '' : h('div', { class: 'chips' }, tabChip, chipEls));
  return { el, input, refresh, history: () => [...hist], print };
}
