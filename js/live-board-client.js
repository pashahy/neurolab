// B4, студент: нижняя панель «📺 Вопрос с доски» поверх экрана ПЗ. Данные приходят в ответе пульса liveState
// (item, answered); ответ — одно действие liveAnswer. Всё молча: офлайн и ошибки на сдачу и баллы не влияют.
import { h } from './util/dom.js';
import { inlineCode } from './util/inline-code.js';

const SEEN_KEY = 'live:board:seen';
const SEEN_MAX = 40;
const WORD_MAX = 30;

export const seenKey = (d, n, item) => `${d}:${n}:${item.id}@${item.startedAt}`;

export function readSeen(storage) {
  try {
    const o = JSON.parse(storage.getItem(SEEN_KEY) || '{}');
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch { return {}; }
}

export function markSeen(storage, key, state, answer) {
  try {
    const o = readSeen(storage);
    delete o[key];
    o[key] = { s: state, a: answer === undefined ? null : answer };
    const keys = Object.keys(o);
    keys.slice(0, Math.max(0, keys.length - SEEN_MAX)).forEach(k => { delete o[k]; });
    storage.setItem(SEEN_KEY, JSON.stringify(o));
  } catch { /* хранилище недоступно: панель просто может показаться снова */ }
}

// null — панели нет; 'ask' — вопрос; 'reveal' — верный ответ (только тому, кто ответил).
export function panelMode(item, answeredServer, seen) {
  if (!item || typeof item !== 'object' || !item.id) return null;
  const st = seen && seen.s;
  if (st === 'skipped' || st === 'closed') return null;
  const answered = answeredServer === true || st === 'answered';
  if (item.revealed) return answered ? 'reveal' : null;
  return answered ? null : 'ask';
}

// Новый выбор после нажатия на вариант/строку i: poll — один (или несколько при multi), bug — до двух строк.
export function toggleChoice(sel, i, item) {
  const cur = Array.isArray(sel) ? sel : [];
  if (item.kind === 'poll' && !item.multi) return [i];
  if (cur.includes(i)) return cur.filter(x => x !== i);
  if (item.kind === 'bug' && cur.length >= 2) return [cur[1], i];
  return cur.concat(i).sort((a, b) => a - b);
}

// Слова облака из поля ввода: 1–2 слова до 30 символов; иначе null.
export function parseWords(text) {
  const words = String(text == null ? '' : text).trim().split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 2 || words.some(w => w.length > WORD_MAX)) return null;
  return words;
}

export function answerFor(item, sel, text) {
  if (item.kind === 'cloud') return parseWords(text);
  return Array.isArray(sel) && sel.length ? sel : null;
}

// Панель. api.call('liveAnswer'), host — куда добавить; возвращает { onState(res), destroy() }.
export function mountBoardPanel({ api, d, n, host = document.body, storage = null, active = () => true }) {
  let el = null, shownKey = '', sel = [], text = '', busy = false, dead = false, last = null;

  function close() { if (el) { el.remove(); el = null; } shownKey = ''; }
  function destroy() { dead = true; close(); window.removeEventListener('hashchange', destroy); }
  window.addEventListener('hashchange', destroy);

  function ownAnswer(seen) { return seen && Array.isArray(seen.a) ? seen.a : null; }

  function render() {
    if (dead) return;
    if (!last) { close(); return; }
    const { item, answered } = last;
    const key = item ? seenKey(d, n, item) : '';
    const seen = key && storage ? readSeen(storage)[key] : null;
    const mode = panelMode(item, answered, seen);
    if (!mode) { close(); return; }
    const sig = `${key}|${mode}`;
    if (el && shownKey === sig) return; // тот же экран: не сбрасываем набранное
    if (!el || !shownKey.startsWith(`${key}|`)) { sel = []; text = ''; }
    shownKey = sig;
    const body = mode === 'ask' ? askBody(item, key) : revealBody(item, key, ownAnswer(seen));
    const node = h('div', { class: 'live-panel', role: 'dialog', 'aria-label': 'Вопрос с доски' },
      h('div', { class: 'live-panel-head' }, '📺 Вопрос с доски'), body);
    if (el) el.replaceWith(node); else host.append(node);
    el = node;
  }

  function askBody(item, key) {
    const err = h('p', { class: 'live-panel-err', role: 'alert' });
    const send = h('button', { class: 'btn primary', type: 'button', disabled: true }, 'Ответить');
    const refresh = () => { send.disabled = busy || !answerFor(item, sel, text); };
    let controls;
    if (item.kind === 'cloud') {
      const input = h('input', { class: 'live-panel-input', type: 'text', maxlength: '70', placeholder: item.placeholder || 'одно-два слова', 'aria-label': 'Ваш ответ' });
      input.addEventListener('input', () => { text = input.value; refresh(); });
      input.value = text;
      controls = h('div', { class: 'live-panel-list' }, input);
    } else {
      const rows = (item.kind === 'poll' ? item.options : item.lines).map((label, i) => {
        const b = h('button', { class: `live-panel-opt${item.kind === 'bug' ? ' code' : ''}`, type: 'button', 'aria-pressed': sel.includes(i) ? 'true' : 'false' }, item.kind === 'poll' ? inlineCode(label) : label);
        b.addEventListener('click', () => {
          sel = toggleChoice(sel, i, item);
          rows.forEach((r, j) => r.setAttribute('aria-pressed', sel.includes(j) ? 'true' : 'false'));
          refresh();
        });
        return b;
      });
      controls = h('div', { class: 'live-panel-list' }, rows);
    }
    send.addEventListener('click', async () => {
      const a = answerFor(item, sel, text);
      if (!a || busy) return;
      busy = true; refresh(); err.textContent = '';
      try {
        await api.call('liveAnswer', { d, n, id: item.id, answer: a });
        if (storage) markSeen(storage, key, 'answered', item.kind === 'cloud' ? null : a);
        if (last) last.answered = true;
        busy = false;
        render();
      } catch (e) {
        busy = false;
        // вопрос уже закрыт или ответ не принят — панель убираем; нет связи — можно повторить
        if (e && !e.network && !e.busy) { if (storage) markSeen(storage, key, 'skipped'); close(); }
        else { err.textContent = 'Нет связи — попробуйте ещё раз.'; refresh(); }
      }
    });
    const skip = h('button', { class: 'btn small', type: 'button' }, 'Пропустить');
    skip.addEventListener('click', () => { if (storage) markSeen(storage, key, 'skipped'); close(); });
    refresh();
    const hint = item.kind === 'bug' ? 'Нажмите строку с ошибкой (до двух).' : item.kind === 'poll' && item.multi ? 'Можно выбрать несколько.' : item.kind === 'cloud' ? 'Одно-два слова.' : '';
    return h('div', { class: 'live-panel-body' }, h('p', { class: 'live-panel-text' }, inlineCode(item.text)), hint ? h('p', { class: 'hint' }, hint) : null, controls, err,
      h('div', { class: 'live-panel-actions' }, send, skip));
  }

  function revealBody(item, key, mine) {
    const ok = Array.isArray(item.correct) ? item.correct : [];
    const labels = item.kind === 'poll' ? item.options : item.kind === 'bug' ? item.lines : [];
    const rows = labels.map((label, i) => h('div', { class: `live-panel-opt${item.kind === 'bug' ? ' code' : ''}${ok.includes(i) ? ' right' : ''}${mine && mine.includes(i) ? ' mine' : ''}` },
      ok.includes(i) ? '✓ ' : '', item.kind === 'poll' ? inlineCode(label) : label));
    let notes = null;
    if (typeof item.notes === 'string') notes = item.notes;
    else if (item.notes && typeof item.notes === 'object') notes = ok.map(i => item.notes[i]).filter(Boolean).join(' ');
    const done = h('button', { class: 'btn primary', type: 'button' }, 'Понятно');
    done.addEventListener('click', () => { if (storage) markSeen(storage, key, 'closed'); close(); });
    return h('div', { class: 'live-panel-body' }, h('p', { class: 'live-panel-text' }, inlineCode(item.text)), h('p', { class: 'live-panel-title' }, 'Верный ответ'),
      h('div', { class: 'live-panel-list' }, rows), notes ? h('p', { class: 'hint' }, notes) : null, h('div', { class: 'live-panel-actions' }, done));
  }

  return {
    onState(res) {
      if (dead) return;
      let alive = true;
      try { alive = !!active(); } catch { alive = false; }
      if (!alive) { destroy(); return; }
      last = res && res.item ? { item: res.item, answered: res.answered === true } : null;
      render();
    },
    destroy,
  };
}
