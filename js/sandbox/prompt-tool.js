// Конструктор промптов (#/sandbox/prompt): шесть блоков, порядок, живая сборка, оценка без нейросети.
import { h } from '../util/dom.js';
import { promptScore } from '../sim/prompt-score.js';
import { exportText } from './export.js';
import { canUsePrompts } from './access.js';
import { mountDailyPanel } from './daily.js';

export const BLOCKS = [
  { key: 'role', title: 'Роль', hint: 'Кем должна стать нейросеть', placeholder: 'Ты — преподаватель информатики, объясняешь просто', rows: 2 },
  { key: 'context', title: 'Контекст', hint: 'Для кого и зачем', placeholder: 'Я студент 1 курса, завтра зачёт по теме «Сети»', rows: 3 },
  { key: 'task', title: 'Задача', hint: 'Что именно сделать', placeholder: 'Объясни, чем IP-адрес отличается от MAC-адреса', rows: 3 },
  { key: 'format', title: 'Формат', hint: 'Как оформить ответ и сколько', placeholder: 'Список из 5 пунктов, в каждом одно предложение', rows: 2 },
  { key: 'limits', title: 'Ограничения', hint: 'Чего не делать, тон, объём', placeholder: 'Не больше 100 слов, без сложных терминов', rows: 2 },
  { key: 'examples', title: 'Примеры', hint: 'Как должен выглядеть хороший ответ', placeholder: '1. IP-адрес — адрес в сети, его можно поменять.', rows: 3 },
];
export const BLOCK_KEYS = BLOCKS.map(b => b.key);
export const LOCKED_TEXT = 'Конструктор доступен группе ИИ112-26';
export const COPY_HINT = 'Вставь в GigaChat или Алису';
export const FILE_NAME = 'prompt.txt';
export const MAX_LEN = 2000;
export const RESCORE_MS = 150;

// ключи без повторов и чужих, недостающие — в конец
export function normalizeOrder(order) {
  const seen = {};
  const out = [];
  (Array.isArray(order) ? order : []).forEach(k => { if (BLOCK_KEYS.indexOf(k) >= 0 && !seen[k]) { seen[k] = true; out.push(k); } });
  BLOCK_KEYS.forEach(k => { if (!seen[k]) out.push(k); });
  return out;
}

// сдвиг блока на dir (-1 вверх, +1 вниз); на краю порядок не меняется
export function moveBlock(order, key, dir) {
  const o = normalizeOrder(order);
  const i = o.indexOf(key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= o.length) return o;
  const t = o[i]; o[i] = o[j]; o[j] = t;
  return o;
}

// Итоговый промпт: непустые блоки в выбранном порядке, «Роль: …»
export function assemblePrompt(blocks, order) {
  const b = blocks || {};
  return normalizeOrder(order).map(k => {
    const text = typeof b[k] === 'string' ? b[k].trim() : '';
    const def = BLOCKS.filter(x => x.key === k)[0];
    return text ? `${def.title}: ${text}` : '';
  }).filter(Boolean).join('\n\n');
}

// Запасной путь копирования: выделить текст и execCommand
function legacyCopy(text) {
  if (typeof document === 'undefined' || !document.body) return false;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
  document.body.append(ta);
  let ok = false;
  try {
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    ok = !!document.execCommand('copy');
  } catch (e) { ok = false; }
  ta.remove();
  return ok;
}

// env.clipboard / env.legacy подменяются в тестах. true — скопировано.
export async function copyText(text, env) {
  const e = env || {};
  const clip = 'clipboard' in e ? e.clipboard : (typeof navigator !== 'undefined' ? navigator.clipboard : null);
  if (clip && typeof clip.writeText === 'function') {
    try { await clip.writeText(text); return true; } catch (err) { /* ниже запасной путь */ }
  }
  return (e.legacy || legacyCopy)(text);
}

function ringColor(score) {
  return score >= 80 ? 'var(--ok)' : score >= 50 ? 'var(--warn)' : 'var(--bad)';
}

// Черновик промпта задачи дня: отдельно от свободного режима
function dailyPromptStore(storage, daily) {
  return {
    loadPrompt() {
      const v = (storage.loadDaily(daily.d, daily.task.id) || {}).prompt;
      return { blocks: v && v.blocks && typeof v.blocks === 'object' ? Object.assign({}, v.blocks) : {}, order: v && Array.isArray(v.order) ? v.order.slice() : [] };
    },
    savePrompt(v) { storage.saveDaily(daily.d, daily.task.id, { prompt: { blocks: Object.assign({}, v.blocks), order: v.order.slice() } }); },
  };
}

const BLOCK_TITLES = BLOCKS.reduce((o, b) => { o[b.key] = b.title; return o; }, {});

// daily { app, d, task, date? } — задача дня вида prompt: сверху панель сдачи, блоки хранятся в черновике задачи
export function mountPrompt(host, { storage: freeStorage, group, daily }) {
  if (!canUsePrompts(group)) {
    host.append(h('p', { class: 'hint pt-locked' }, LOCKED_TEXT));
    return;
  }
  const storage = daily ? dailyPromptStore(freeStorage, daily) : freeStorage;
  const saved = storage.loadPrompt();
  const st = { blocks: saved.blocks, order: normalizeOrder(saved.order) };
  const save = () => storage.savePrompt(st);
  if (daily) {
    const need = Array.isArray(daily.task.required) ? daily.task.required.map(k => BLOCK_TITLES[k]).filter(Boolean) : [];
    const panel = h('div', { class: 'sbx-daily-host' });
    host.append(panel);
    mountDailyPanel(panel, { app: daily.app, d: daily.d, task: daily.task, kind: 'prompt', date: daily.date, source: daily.source, getBlocks: () => Object.assign({}, st.blocks) });
    if (need.length) host.append(h('p', { class: 'hint' }, `Нужны блоки: ${need.join(', ')}`));
  }

  const list = h('div', { class: 'pt-blocks' });
  const nodes = {};
  const upBtns = {}, downBtns = {};
  BLOCKS.forEach(b => {
    const id = `pt-${b.key}`;
    const ta = h('textarea', {
      id, rows: b.rows, placeholder: b.placeholder, class: 'pt-input', autocomplete: 'off', maxlength: String(MAX_LEN),
      oninput: e => { st.blocks[b.key] = e.target.value.slice(0, MAX_LEN); save(); update(true); },
    });
    ta.value = typeof st.blocks[b.key] === 'string' ? st.blocks[b.key] : '';
    const up = h('button', { type: 'button', class: 'pt-move', 'aria-label': `${b.title}: выше`, onclick: () => move(b.key, -1) }, '↑');
    const down = h('button', { type: 'button', class: 'pt-move', 'aria-label': `${b.title}: ниже`, onclick: () => move(b.key, 1) }, '↓');
    upBtns[b.key] = up; downBtns[b.key] = down;
    nodes[b.key] = h('div', { class: 'pt-block' },
      h('div', { class: 'pt-block-head' },
        h('label', { for: id, class: 'pt-label' }, h('span', { class: 'pt-title' }, b.title), h('span', { class: 'pt-hint' }, b.hint)),
        h('div', { class: 'pt-moves' }, up, down)),
      ta);
  });

  const outPre = h('pre', { class: 'pt-out', tabindex: '0', 'aria-label': 'Собранный промпт' });
  const ring = h('div', { class: 'pt-ring', role: 'img' });
  const ringNum = h('span', { class: 'pt-ring-num' });
  ring.append(ringNum);
  const checksEl = h('ul', { class: 'pt-checks' });
  const note = h('p', { class: 'pt-note', role: 'status' }, COPY_HINT);
  const copyBtn = h('button', { type: 'button', class: 'btn big', onclick: onCopy }, '📋 Скопировать');
  const fileBtn = h('button', { type: 'button', class: 'btn ghost', onclick: () => exportText(FILE_NAME, assemblePrompt(st.blocks, st.order)) }, 'Скачать .txt');
  let timer = null;

  async function onCopy() {
    const text = assemblePrompt(st.blocks, st.order);
    const ok = await copyText(text);
    clearTimeout(timer);
    if (ok) {
      copyBtn.textContent = '✓ Скопировано';
      note.textContent = COPY_HINT;
      timer = setTimeout(() => { copyBtn.textContent = '📋 Скопировать'; }, 2000);
    } else {
      note.textContent = 'Не удалось скопировать — выдели текст ниже и скопируй вручную';
      const sel = window.getSelection && window.getSelection();
      if (sel) { const r = document.createRange(); r.selectNodeContents(outPre); sel.removeAllRanges(); sel.addRange(r); }
    }
  }

  function place() {
    st.order.forEach((k, i) => {
      list.append(nodes[k]);
      upBtns[k].disabled = i === 0;
      downBtns[k].disabled = i === st.order.length - 1;
    });
  }
  function move(key, dir) {
    st.order = moveBlock(st.order, key, dir);
    place();
    save();
    update();
    const btn = (dir < 0 ? upBtns : downBtns)[key];
    (btn.disabled ? (dir < 0 ? downBtns : upBtns)[key] : btn).focus();
  }
  let scoreTimer = null;
  // собранный текст — сразу, оценка — не чаще раза в RESCORE_MS (если typing = true)
  function update(typing) {
    const text = assemblePrompt(st.blocks, st.order);
    outPre.textContent = text || 'Здесь появится промпт — заполни блоки выше';
    outPre.classList.toggle('empty', !text);
    copyBtn.disabled = !text;
    fileBtn.disabled = !text;
    clearTimeout(scoreTimer);
    if (typing) scoreTimer = setTimeout(drawScore, RESCORE_MS); else drawScore();
  }
  function drawScore() {
    const r = promptScore(st.blocks);
    ringNum.textContent = String(r.score);
    ring.style.setProperty('--p', String(r.score));
    ring.style.setProperty('--c', ringColor(r.score));
    ring.setAttribute('aria-label', `Оценка промпта: ${r.score} из 100`);
    checksEl.replaceChildren(...r.checks.map(c => h('li', { class: c.ok ? 'ok' : 'miss' },
      h('span', { class: 'pt-mark', 'aria-hidden': 'true' }, c.ok ? '✓' : '•'),
      h('span', { class: 'pt-sr' }, c.ok ? 'Есть: ' : 'Нужно: '), c.text)));
  }

  place();
  update();
  host.append(
    h('p', { class: 'hint' }, 'Заполни блоки, меняй порядок стрелками. Оценка считается на этом телефоне, без нейросети.'),
    list,
    h('section', { class: 'pt-result card' },
      h('h2', { class: 'pt-h' }, 'Твой промпт'), outPre,
      h('div', { class: 'pt-actions' }, copyBtn, fileBtn), note),
    h('section', { class: 'pt-score card' },
      h('h2', { class: 'pt-h' }, 'Оценка'),
      h('div', { class: 'pt-score-row' }, ring, h('p', { class: 'pt-score-note' }, 'Сто — когда все проверки зелёные. Это подсказка, а не оценка за работу.')),
      checksEl));
  return { blocks: () => Object.assign({}, st.blocks) };
}
