import { h, add } from '../util/dom.js';
import { fraction } from './common.js';
import { createShell, checkGoal, GOAL_KINDS } from '../sim/shell.js';
import { termView, TERM_CHIPS, TERM_MOTD } from './terminal-ui.js';
import { openInSandboxButton } from '../sandbox/export.js';

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
  render(t, el, { answer, onChange, locked, store }) {
    const shell = createShell(t.setup);
    const view = termView({ shell, goals: t.goals, history: answer?.history || [], locked, chips: t.chips || TERM_CHIPS, motd: t.motd || TERM_MOTD, onCommand: (c, history) => onChange({ history }) });
    add(el, view.el, store ? h('div', { class: 'row' }, openInSandboxButton(store, 'term', () => ({ kind: 'terminal', setup: t.setup }))) : '');
  },
};
