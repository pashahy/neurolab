import { h, add } from '../util/dom.js';

export const DISC = [{ id: 'dup01', code: 'ДУП.01' }, { id: 'dup03', code: 'ДУП.03' }];
export const discCode = id => { const d = DISC.find(x => x.id === id); return d ? d.code : String(id); };

const pad2 = v => String(v).padStart(2, '0');

// «02.10 14:30» по времени браузера; пусто, если дата неверна
export function fmtTime(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d.getTime())) return '';
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export const fmtDate = iso => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d.getTime()) ? `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}` : '';
};

// 'all' -> «все»; [1,2,3,7] -> «1-3, 7»
export function fmtOpen(list) {
  if (list === 'all') return 'все';
  if (!Array.isArray(list)) return '';
  const out = [];
  for (let i = 0; i < list.length; i++) {
    let j = i;
    while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
    out.push(j > i ? `${list[i]}-${list[j]}` : String(list[i]));
    i = j;
  }
  return out.join(', ');
}

// Разбор поля «Открытые ПЗ»: {value: 'все' | number[]} или {error}. Как parseOpenList на сервере,
// но неразобранные части — ошибка (сервер молча их пропускает и мог бы закрыть всё занятия).
export function parseOpen(text) {
  const s = String(text == null ? '' : text).trim().toLowerCase().replace(/\s*[-–—]\s*/g, '-');
  if (s === 'все' || s === 'all' || s === '*') return { value: 'all' };
  const out = new Set();
  const parts = s.split(/[,;\s]+/).filter(Boolean);
  for (const part of parts) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) return { error: `Не понял «${part}». Пример: все, или 1-5, 7` };
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    if (min < 1 || max > 999) return { error: 'Номера ПЗ — от 1 до 999' };
    for (let i = min; i <= max; i++) out.add(i);
  }
  return { value: Array.from(out).sort((x, y) => x - y) };
}

export function select(options, value, onChange, attrs = {}) {
  const el = h('select', Object.assign({ onchange: () => onChange(el.value) }, attrs),
    options.map(o => h('option', { value: o.value }, o.label)));
  el.value = value;
  if (el.value !== value && options.length) el.value = options[0].value;
  return el;
}

// Подтверждение в странице (не window.confirm): Promise<boolean>.
// body — строка или узел (текст всегда добавляется как текст).
export function confirmDialog({ title, body, ok = 'Подтвердить', danger = false, cancel = 'Отмена' }) {
  return new Promise(resolve => {
    const prev = document.activeElement;
    let done = false;
    const finish = v => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (prev && prev.focus) { try { prev.focus(); } catch { /* элемент исчез */ } }
      resolve(v);
    };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); finish(false); } };
    const cancelBtn = h('button', { class: 'btn', type: 'button', onclick: () => finish(false) }, cancel);
    const okBtn = h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'button', onclick: () => finish(true) }, ok);
    const overlay = h('div', { class: 'modal-wrap no-print', onclick: e => { if (e.target === overlay) finish(false); } },
      h('div', { class: 'modal card', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('h2', {}, title),
        h('div', { class: 'modal-body' }, body),
        h('div', { class: 'row modal-actions' }, cancelBtn, okBtn)));
    document.body.append(overlay);
    document.addEventListener('keydown', onKey, true);
    cancelBtn.focus();
  });
}

// Окно с сообщением и кнопкой «Закрыть»; возвращает Promise, закрывается кнопкой/Escape.
export function infoDialog({ title, body, close = 'Закрыть' }) {
  return new Promise(resolve => {
    const prev = document.activeElement;
    const finish = () => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (prev && prev.focus) { try { prev.focus(); } catch { /* элемент исчез */ } }
      resolve();
    };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); finish(); } };
    const btn = h('button', { class: 'btn primary', type: 'button', onclick: finish }, close);
    const overlay = h('div', { class: 'modal-wrap no-print', onclick: e => { if (e.target === overlay) finish(); } },
      h('div', { class: 'modal card', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('h2', {}, title), h('div', { class: 'modal-body' }, body), h('div', { class: 'row modal-actions' }, btn)));
    document.body.append(overlay);
    document.addEventListener('keydown', onKey, true);
    btn.focus();
  });
}

export const loading = text => h('p', { class: 'loading' }, text || 'Загрузка…');

// Ошибка загрузки экрана с кнопкой «Повторить»
export function loadError(msg, retry) {
  return h('div', { class: 'card' }, h('p', { class: 'error', role: 'alert' }, msg),
    retry ? h('button', { class: 'btn primary', type: 'button', onclick: retry }, 'Повторить') : '');
}

export const emptyBox = (...c) => add(h('div', { class: 'card muted' }), ...c);

export function hashQuery(path, params) {
  const q = Object.keys(params).filter(k => params[k] !== '' && params[k] != null)
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
  return q ? `${path}?${q}` : path;
}
