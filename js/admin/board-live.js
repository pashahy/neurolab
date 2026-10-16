// B4: интерактивы на доске и на «Моём экране» — панель управления (запустить / показать ответ / завершить / свой вопрос) и живые результаты.
// Модель (чистые функции) отделена от DOM. Данные приходят в ответе boardState: ready, item, results, students.
import { h } from '../util/dom.js';
import { inlineCode } from '../util/inline-code.js';

const AT_LABEL = { intro: 'вводная часть', practice: 'практика', outro: 'итоги' };
const KIND_LABEL = { poll: 'Опрос', bug: 'Найди ошибку', cloud: 'Облако слов' };
const KIND_ICON = { poll: '📊', bug: '🐞', cloud: '☁️' };

export const kindLabel = kind => KIND_LABEL[kind] || '';
export const kindIcon = kind => KIND_ICON[kind] || '❓';

// «когда запускать»: intro / s1…s5 / practice / outro
export function atLabel(at) {
  if (Object.prototype.hasOwnProperty.call(AT_LABEL, at)) return AT_LABEL[at];
  const m = /^s(\d)$/.exec(String(at || ''));
  return m ? `лекция, раздел ${m[1]}` : '';
}

// Гистограмма опроса: строки { label, count, pct (доля от max), share (доля ответивших), correct }.
export function histogramRows(item, results) {
  if (!item || !Array.isArray(item.options)) return [];
  const counts = results && Array.isArray(results.counts) ? results.counts : [];
  const max = Math.max(1, ...item.options.map((_, i) => counts[i] || 0));
  const total = results && results.total ? results.total : 0;
  const ok = item.revealed && Array.isArray(item.correct) ? item.correct : [];
  return item.options.map((label, i) => {
    const count = counts[i] || 0;
    return { label, count, pct: Math.round(count / max * 100), share: total ? Math.round(count / total * 100) : 0, correct: ok.includes(i) };
  });
}

// Строки кода «найди ошибку»: heat 0..1 по голосам, correct — после «Показать ответ».
export function bugRows(item, results) {
  if (!item || !Array.isArray(item.lines)) return [];
  const counts = results && Array.isArray(results.counts) ? results.counts : [];
  const max = Math.max(1, ...item.lines.map((_, i) => counts[i] || 0));
  const ok = item.revealed && Array.isArray(item.correct) ? item.correct : [];
  return item.lines.map((line, i) => ({ line, n: i + 1, count: counts[i] || 0, heat: (counts[i] || 0) / max, correct: ok.includes(i) }));
}

// Пояснение к верным строкам после «Показать ответ».
export function bugNotes(item) {
  if (!item || !item.revealed || item.notes === undefined) return '';
  if (typeof item.notes === 'string') return item.notes;
  const ok = Array.isArray(item.correct) ? item.correct : [];
  return ok.map(i => item.notes[i]).filter(Boolean).join(' ');
}

// Облако: размер шрифта (px) пропорционален частоте между minPx и maxPx.
export function cloudWords(results, minPx = 24, maxPx = 96) {
  const words = results && Array.isArray(results.words) ? results.words : [];
  if (!words.length) return [];
  const top = Math.max(...words.map(w => w.n));
  const low = Math.min(...words.map(w => w.n));
  return words.map(w => ({ w: w.w, n: w.n, size: top === low ? Math.round((minPx + maxPx) / 2) : Math.round(minPx + (w.n - low) / (top - low) * (maxPx - minPx)) }));
}

// Форма «Свой вопрос»: { kind, text, optionsText } -> { ok, custom } | { ok: false, error } (как проверяет сервер).
export function validateCustom({ kind, text, optionsText }) {
  const t = String(text || '').trim();
  if (!t) return { ok: false, error: 'Введите текст вопроса' };
  if (t.length > 300) return { ok: false, error: 'Текст длиннее 300 символов' };
  if (kind === 'cloud') return { ok: true, custom: { kind: 'cloud', text: t } };
  const options = String(optionsText || '').split('\n').map(s => s.trim()).filter(Boolean);
  if (options.length < 2 || options.length > 6) return { ok: false, error: 'В опросе от 2 до 6 вариантов (каждый с новой строки)' };
  if (options.some(o => o.length > 100)) return { ok: false, error: 'Вариант длиннее 100 символов' };
  return { ok: true, custom: { kind: 'poll', text: t, options } };
}

// Какие кнопки доступны: запущенный интерактив, можно ли показать ответ.
export function controlState(item) {
  if (!item) return { running: false, canReveal: false };
  return { running: true, canReveal: !item.revealed && item.hasAnswer === true && (item.kind === 'poll' || item.kind === 'bug') };
}

export const answeredText = (results, students) => `Ответили: ${results ? results.total : 0} из ${Array.isArray(students) ? students.length : 0}`;

const shorten = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// Панель. call(action, body) — вызов сервера (ctx.call); ref — { group, discipline, lesson }.
// Возвращает { el, update(data), onAction(fn) }: el — корень; update вызывают после каждого boardState.
export function createLivePanel({ call, ref, variant = 'board' }) {
  let data = null, busy = false, readyKey = '', onToTiles = null;
  const status = h('p', { class: 'lp-status', role: 'status' });
  const head = h('div', { class: 'lp-head' });
  const view = h('div', { class: 'lp-view' });
  const launcher = h('div', { class: 'lp-launcher' });
  const readyList = h('ul', { class: 'lp-ready' });
  const el = h('section', { class: `lp lp-${variant}`, 'aria-label': 'Интерактивы' }, head, status, view, launcher);

  async function act(action, extra) {
    if (busy) return;
    busy = true; status.textContent = '';
    let done = false; // сервер принял действие
    paintHead();
    try {
      const r = await call(action, { ...ref, ...extra });
      if (r && r.ok === false) status.textContent = r.error || 'Не получилось';
      else if (action === 'boardStart' || action === 'boardReveal') data = { ...(data || {}), item: r.item, results: action === 'boardStart' ? null : data && data.results };
      else if (action === 'boardStop') data = { ...(data || {}), item: null, results: null };
      done = !(r && r.ok === false);
    } catch (e) {
      if (!(e && e.handled)) status.textContent = (e && e.message) || 'Нет связи';
    }
    busy = false;
    paint();
    return done;
  }

  function btn(label, cls, fn, disabled) {
    const b = h('button', { class: `btn ${cls}`, type: 'button' }, label);
    if (disabled) b.disabled = true;
    b.addEventListener('click', fn);
    return b;
  }

  function paintHead() {
    const item = data && data.item;
    const cs = controlState(item);
    head.replaceChildren();
    if (!cs.running) {
      head.append(h('h2', { class: 'lp-title' }, '📺 Интерактивы'));
    } else {
      head.append(
        h('h2', { class: 'lp-title' }, `${kindIcon(item.kind)} `, inlineCode(item.text)),
        h('div', { class: 'lp-count' }, answeredText(data.results, data.students)),
        h('div', { class: 'lp-actions' },
          cs.canReveal ? btn('Показать ответ', 'primary', () => act('boardReveal', { id: item.id }), busy) : null,
          btn('Завершить', '', () => act('boardStop', { id: item.id }), busy)));
    }
    if (onToTiles) head.append(btn('к плиткам', 'small lp-tiles', onToTiles));
  }

  function paintResults() {
    const item = data && data.item;
    const res = data && data.results;
    view.replaceChildren();
    if (!item) return;
    if (item.kind === 'poll') {
      view.append(h('div', { class: 'lp-bars' }, histogramRows(item, res).map(r => h('div', { class: `lp-bar${r.correct ? ' right' : ''}` },
        h('div', { class: 'lp-bar-label' }, r.correct ? '✓ ' : '', inlineCode(r.label)),
        h('div', { class: 'lp-bar-track' }, h('div', { class: 'lp-bar-fill', style: `width:${r.pct}%` })),
        h('div', { class: 'lp-bar-num' }, `${r.count}`)))));
    } else if (item.kind === 'bug') {
      view.append(h('div', { class: 'lp-code' }, bugRows(item, res).map(r => h('div', { class: `lp-line${r.correct ? ' right' : ''}`, style: `--heat:${r.heat.toFixed(2)}` },
        h('span', { class: 'lp-line-n' }, String(r.n)), h('span', { class: 'lp-line-t' }, r.line), h('span', { class: 'lp-line-c' }, r.count ? String(r.count) : '')))));
      const notes = bugNotes(item);
      if (notes) view.append(h('p', { class: 'lp-notes' }, notes));
    } else {
      const words = cloudWords(res, variant === 'board' ? 26 : 18, variant === 'board' ? 100 : 40);
      view.append(h('div', { class: 'lp-cloud' }, words.length
        ? words.map(w => {
          const b = h('button', { class: 'lp-word', type: 'button', style: `font-size:${w.size}px`, title: 'Скрыть слово' }, w.w);
          b.addEventListener('click', () => {
            b.hidden = true;
            call('boardHide', { ...ref, id: item.id, word: w.w }).catch(() => { b.hidden = false; });
          });
          return b;
        })
        : h('p', { class: 'lp-empty' }, 'Ответов пока нет')));
    }
  }

  function paintReady() {
    const list = data && Array.isArray(data.ready) ? data.ready : [];
    const key = list.map(i => i.id).join('|');
    if (key === readyKey) return;
    readyKey = key;
    readyList.replaceChildren(...(list.length ? list.map(i => h('li', { class: 'lp-ready-item' },
      h('div', { class: 'lp-ready-text' }, h('strong', {}, `${kindIcon(i.kind)} ${kindLabel(i.kind)}`), ' ', inlineCode(shorten(i.text, 110)),
        atLabel(i.at) ? h('span', { class: 'lp-when' }, ` · когда: ${atLabel(i.at)}`) : null),
      btn('Запустить', 'primary small', () => act('boardStart', { id: i.id })))) : [h('li', { class: 'lp-empty' }, 'Готовых интерактивов у занятия нет — используйте «Свой вопрос».')]));
  }

  function customForm() {
    const kind = h('select', { 'aria-label': 'Вид вопроса' }, h('option', { value: 'poll' }, 'Опрос'), h('option', { value: 'cloud' }, 'Облако слов'));
    const text = h('input', { type: 'text', maxlength: '300', placeholder: 'Текст вопроса', 'aria-label': 'Текст вопроса' });
    const opts = h('textarea', { rows: '4', placeholder: 'Варианты, каждый с новой строки (2–6)', 'aria-label': 'Варианты' });
    const err = h('p', { class: 'lp-status' });
    kind.addEventListener('change', () => { opts.hidden = kind.value === 'cloud'; });
    const go = btn('Запустить свой вопрос', 'primary small', () => {
      const v = validateCustom({ kind: kind.value, text: text.value, optionsText: opts.value });
      if (!v.ok) { err.textContent = v.error; return; }
      err.textContent = '';
      act('boardStart', { custom: v.custom }).then(ok => { if (ok) { text.value = ''; opts.value = ''; } }); // при отказе сервера форма остаётся
    });
    return h('details', { class: 'lp-custom' }, h('summary', {}, 'Свой вопрос'), kind, text, opts, err, go);
  }
  launcher.append(readyList, customForm());

  function paint() {
    el.classList.toggle('lp-running', !!(data && data.item));
    paintHead(); paintResults(); paintReady(); }

  return {
    el,
    update(d) { data = d; paint(); },
    // «к плиткам» (только доска): fn вызывают при нажатии
    onToTiles(fn) { onToTiles = fn; paintHead(); },
    // запущен ли интерактив и его запуск (для автоперехода на весь экран)
    current() { return data && data.item ? data.item : null; },
  };
}
