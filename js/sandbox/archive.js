// Разбор прошедших дней в хабе песочницы: «вчера и раньше».
import { h } from '../util/dom.js';
import { md } from '../util/text.js';
import { sandboxApi } from './api.js';
import { DISCIPLINE_NAMES } from './daily.js';

export const ARCHIVE_TITLE = 'Разбор: вчера и раньше';
export const ARCHIVE_OPEN_TEXT = 'Открыть разбор';
export const ARCHIVE_LOADING_TEXT = 'Загружаем разбор…';
export const ARCHIVE_OFFLINE_TEXT = 'Нужна сеть, чтобы открыть разбор';
export const ARCHIVE_EMPTY_TEXT = 'Разбор появится завтра — сегодняшние задачи пока открыты';
export const TRY_TEXT = 'Попробовать в песочнице';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

// «2026-10-16» → «16 октября»; непонятную строку возвращаем как есть
export function dayLabel(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return String(date);
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
}

const EXTRA_LABELS = { prompt: 'Промпт', api: 'API', docker: 'Docker' };

// Эталон третьей задачи для чтения: блоки промпта по строкам, запросы API — «МЕТОД адрес» и тело
function solutionNode(item) {
  const s = item.solution;
  if (Array.isArray(s) && s.length && typeof s[0] === 'object') {
    return h('ol', { class: 'sbx-rv-cmds' }, s.map(r => h('li', {}, h('code', {}, `${r.method} ${r.path}${r.body ? ` ${r.body}` : ''}`))));
  }
  if (Array.isArray(s)) return h('ol', { class: 'sbx-rv-cmds' }, s.map(c => h('li', {}, h('code', {}, String(c)))));
  if (s && typeof s === 'object') {
    return h('pre', { class: 'sbx-rv-code' }, h('code', {}, Object.keys(s).map(k => `${k}: ${s[k]}`).join('\n')));
  }
  return h('pre', { class: 'sbx-rv-code' }, h('code', {}, String(s)));
}

// Плоский список задач дня: [{ d, kind: 'py'|'term'|'prompt'|'api', label? (для третьей задачи), id, title, star, text, explain, solution, solved }]
export function reviewList(day) {
  const out = [];
  const ds = (day && day.disciplines) || {};
  Object.keys(ds).forEach(d => {
    const pair = ds[d] || {};
    [['python', 'py'], ['terminal', 'term']].forEach(([key, kind]) => {
      const r = pair[key];
      if (r) out.push({ d, kind, id: r.id, title: r.title, star: !!r.star, text: r.text || '', explain: r.explain || '', solution: r.solution === undefined ? null : r.solution, setup: r.setup && typeof r.setup === 'object' ? r.setup : {}, solved: !!r.solved });
    });
    const x = pair.extra; // третья задача: prompt -> конструктор, api -> API/JSON, docker -> терминал
    if (x && EXTRA_LABELS[x.kind]) {
      out.push({ d, kind: x.kind === 'docker' ? 'term' : x.kind, label: EXTRA_LABELS[x.kind], id: x.id, title: x.title, star: !!x.star, text: x.text || '', explain: x.explain || '', solution: x.solution === undefined ? null : x.solution, setup: x.setup && typeof x.setup === 'object' ? x.setup : {}, solved: !!x.solved });
    }
  });
  return out;
}

// Что передать инструменту для «Попробовать»: Python — эталонный код; терминал — копия со стартовыми файлами задачи, без панели сдачи
export function tryPayload(item) {
  if (!item || item.solution == null || item.solution === '' || (Array.isArray(item.solution) && !item.solution.length)) return null;
  if (item.kind === 'prompt' || item.kind === 'api') return null; // эталон только читают
  if (item.kind === 'py') return typeof item.solution === 'string' ? { kind: 'python', code: item.solution } : null;
  return { kind: 'terminal', setup: item.setup && typeof item.setup === 'object' ? item.setup : {} };
}

function reviewNode(item, onTry) {
  const parts = [
    h('div', { class: 'sbx-rv-head' },
      h('span', { class: 'sbx-pill' }, item.label || (item.kind === 'py' ? 'Python' : 'Терминал')),
      h('span', { class: 'sbx-rv-disc' }, DISCIPLINE_NAMES[item.d] || item.d),
      item.star ? h('span', { class: 'sbx-star' }, '⭐') : '',
      h('span', { class: item.solved ? 'sbx-rv-state ok' : 'sbx-rv-state' }, item.solved ? '✅ решил' : 'не решил')),
    h('h3', { class: 'sbx-rv-title' }, item.title),
    h('div', { class: 'sbx-task-text', html: md(item.text) }),
  ];
  if (item.explain) parts.push(h('div', { class: 'sbx-rv-explain' }, h('strong', {}, 'Как решать'), h('div', { html: md(item.explain) })));
  const payload = tryPayload(item);
  const hasSolution = !(item.solution == null || item.solution === '' || (Array.isArray(item.solution) && !item.solution.length));
  if (payload || (hasSolution && item.label)) {
    parts.push(h('strong', {}, 'Эталон'), solutionNode(item));
    if (payload) {
      const btn = h('button', { class: 'btn small', type: 'button' }, TRY_TEXT);
      btn.addEventListener('click', () => onTry(item, payload));
      parts.push(btn);
    }
  }
  return h('article', { class: 'sbx-rv' }, parts);
}

// opts: { app, storage, go? } — go(hash) по умолчанию меняет location.hash
export function mountArchive(container, opts) {
  const api = sandboxApi(opts.app.api);
  const go = opts.go || (hash => { location.hash = hash; });
  const body = h('div', { class: 'sbx-archive-body' });
  const btn = h('button', { class: 'btn big', type: 'button' }, ARCHIVE_OPEN_TEXT);
  container.append(h('h2', { class: 'sbx-disc-title' }, ARCHIVE_TITLE), btn, body);
  let busy = false;
  const onTry = (item, payload) => {
    opts.storage.putFrom(payload);
    go(`#/sandbox/${item.kind}?from=1`);
  };
  btn.addEventListener('click', async () => {
    if (busy) return;
    busy = true; btn.disabled = true;
    body.replaceChildren(h('p', { class: 'loading' }, ARCHIVE_LOADING_TEXT));
    try {
      const r = await api.archive();
      const days = (r && Array.isArray(r.days) ? r.days : []).filter(day => reviewList(day).length);
      if (r && r.closed) body.replaceChildren(h('p', { class: 'hint' }, 'Игра спит до 5:00 — разбор откроется утром'));
      else if (!days.length) body.replaceChildren(h('p', { class: 'hint' }, ARCHIVE_EMPTY_TEXT));
      else body.replaceChildren(...days.map(day => h('details', { class: 'card sbx-day' },
        h('summary', {}, dayLabel(day.date)),
        reviewList(day).map(item => reviewNode(item, onTry)))));
      btn.hidden = true;
    } catch (e) {
      if (e && e.auth && opts.app.authExpired) { opts.app.authExpired(); return; }
      body.replaceChildren(h('p', { class: 'hint' }, ARCHIVE_OFFLINE_TEXT));
      btn.disabled = false;
    } finally {
      busy = false;
    }
  });
  return { open: () => btn.click() };
}
