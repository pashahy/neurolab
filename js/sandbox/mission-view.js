// Мини-миссии терминала: экран выбора и панель миссии (вступление, подсказка, поздравление).
import { h } from '../util/dom.js';
import { CHARACTERS } from '../../content/story.js';
import { isUnlocked, finishMission } from './missions.js';
import { awardSandboxBadges } from './sbx-extra.js';

export const MISSIONS_URL = '#/sandbox/term';
export const FREE_URL = '#/sandbox/term?free=1';
export const missionUrl = id => `${MISSIONS_URL}?m=${encodeURIComponent(id)}`;
export const HINT_TEXT = 'Подсказка';
export const DONE_TEXT = 'Миссия пройдена!';
export const NEXT_TEXT = 'Следующая миссия →';
export const ALL_TEXT = 'Все миссии пройдены. Ты мастер терминала!';
export const LOCKED_TEXT = 'Сначала пройди предыдущую миссию';

// Экран выбора: «Свободный режим» и карточки миссий (пройдена / доступна / закрыта)
export function renderChooser(host, { missions, done }) {
  const free = h('a', { class: 'sbx-card sbx-free', href: FREE_URL },
    h('div', { class: 'sbx-card-kind' }, 'Без заданий'),
    h('div', { class: 'sbx-card-title' }, 'Свободный режим'),
    h('p', { class: 'sbx-card-note' }, 'Пробуй команды как хочешь'));
  const cards = missions.map((m, i) => {
    const isDone = done.indexOf(m.id) >= 0;
    const open = isUnlocked(missions, done, m.id);
    const kind = h('div', { class: 'sbx-card-kind' }, `Миссия ${i + 1}`);
    const title = h('div', { class: 'sbx-card-title' }, m.title);
    if (isDone) return h('a', { class: 'sbx-card solved', href: missionUrl(m.id) }, kind, title, h('p', { class: 'sbx-card-note ok' }, '✅ Пройдена'));
    if (open) return h('a', { class: 'sbx-card open', href: missionUrl(m.id) }, kind, title, h('p', { class: 'sbx-card-note' }, 'Доступна · начать'));
    return h('div', { class: 'sbx-card closed', 'aria-disabled': 'true' }, kind, title, h('p', { class: 'sbx-card-note' }, `🔒 ${LOCKED_TEXT}`));
  });
  host.replaceChildren(
    free,
    h('h2', { class: 'sbx-disc-title' }, `Мини-миссии · пройдено ${missions.filter(m => done.indexOf(m.id) >= 0).length} из ${missions.length}`),
    h('div', { class: 'sbx-cards' }, cards));
}

function bubble(line) {
  const c = CHARACTERS[line.who] || { name: String(line.who), avatar: '' };
  return h('div', { class: 'sbx-say' },
    h('div', { class: 'sbx-say-ava', 'aria-hidden': 'true' }, c.avatar || ''),
    h('div', { class: 'sbx-say-body' }, h('div', { class: 'sbx-say-name' }, c.name), h('p', { class: 'sbx-say-text' }, line.text)));
}

// Панель миссии: { el, check(shell), loadHistory(), saveHistory(history) }
export function createMissionPanel({ missions, def, mstorage, store }) {
  const index = missions.findIndex(m => m.id === def.id);
  const next = index >= 0 && index + 1 < missions.length ? missions[index + 1] : null;
  const hintText = h('p', { class: 'sbx-hint-text', hidden: true }, def.hint);
  const hintBtn = h('button', { type: 'button', class: 'btn small ghost', 'aria-expanded': 'false' }, HINT_TEXT);
  hintBtn.addEventListener('click', () => {
    const show = hintText.hidden;
    hintText.hidden = !show;
    hintBtn.setAttribute('aria-expanded', show ? 'true' : 'false');
  });
  const status = h('div', { class: 'sbx-mission-status', role: 'status', 'aria-live': 'polite' });
  const el = h('section', { class: 'sbx-mission card' },
    h('div', { class: 'sbx-card-kind' }, `Миссия ${index + 1} из ${missions.length}`),
    h('h2', { class: 'sbx-daily-title' }, def.title),
    def.story.map(bubble),
    h('div', { class: 'row' }, hintBtn),
    hintText,
    status);
  const showDone = badgesLine => {
    const allDone = missions.every(m => mstorage.loadDone().indexOf(m.id) >= 0);
    status.className = 'sbx-mission-status ok';
    status.replaceChildren(
      h('p', { class: 'sbx-ok-title' }, `✅ ${DONE_TEXT}`),
      badgesLine ? h('p', { class: 'sbx-bonus' }, badgesLine) : '',
      allDone ? h('p', {}, ALL_TEXT) : '',
      next ? h('a', { class: 'btn big', href: missionUrl(next.id) }, NEXT_TEXT) : h('a', { class: 'btn big', href: MISSIONS_URL }, 'К списку миссий'));
  };
  return {
    el,
    loadHistory: () => mstorage.loadHistory(def.id),
    saveHistory: hist => mstorage.saveHistory(def.id, hist),
    check(shell) {
      const r = finishMission(missions, mstorage, def, shell);
      if (!r.passed) {
        if (mstorage.loadDone().indexOf(def.id) >= 0) showDone('');
        else { status.className = 'sbx-mission-status'; status.replaceChildren(); }
        return r;
      }
      let line = '';
      if (r.isNew) {
        const got = awardSandboxBadges(store);
        if (got.length) line = `Новый значок: ${got.map(b => `${b.icon} ${b.title}`).join(', ')}`;
      }
      showDone(line);
      return r;
    },
  };
}
