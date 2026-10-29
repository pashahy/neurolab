// Вкладка «Доступ»: блок «Контрольная» у пары «группа × дисциплина». Хранится на отдельном листе «Контрольные»
// (лист «Доступ» не меняется). ПЗ контрольной должно быть открыто в «Открытых ПЗ» выше.
import { h } from '../util/dom.js';

const pad = n => (n < 10 ? '0' : '') + n;

// ISO (UTC) -> значение поля datetime-local (местное время браузера); пусто -> ''
export function isoToLocal(iso) {
  const t = Date.parse(iso);
  if (!iso || isNaN(t)) return '';
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// значение datetime-local -> ISO (UTC); пусто -> ''; неверное -> null
export function localToIso(v) {
  if (!v) return '';
  const t = new Date(v).getTime();
  return isNaN(t) ? null : new Date(t).toISOString();
}

export function controlBlock(ctx, group, discipline) {
  const box = h('div', { class: 'field ctl-admin' });
  const list = h('div', { class: 'ctl-list' });
  const err = h('p', { class: 'error', role: 'alert' });
  const msg = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });

  async function save(rec, extra) {
    err.textContent = ''; msg.textContent = '';
    const n = Number(rec.num.value);
    const minutes = Number(rec.min.value);
    const until = localToIso(rec.until.value);
    const reveal = localToIso(rec.reveal.value);
    if (!Number.isInteger(n) || n < 1) { err.textContent = 'Укажите номер ПЗ'; return; }
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240) { err.textContent = 'Длительность — от 5 до 240 минут'; return; }
    if (until === null || reveal === null) { err.textContent = 'Неверная дата или время'; return; }
    try {
      await ctx.call('adminSetControl', Object.assign({ group, discipline, lesson: n, minutes, until, reveal }, extra || {}));
      if (!ctx.alive()) return;
      msg.textContent = '✓ Сохранено';
      load();
    } catch (e) { ctx.fail(e, err); }
  }

  function row(c) {
    const num = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '999', step: '1', 'aria-label': 'Номер ПЗ', placeholder: '№ ПЗ', value: c ? String(c.n) : '' });
    const min = h('input', { type: 'number', inputmode: 'numeric', min: '5', max: '240', step: '1', 'aria-label': 'Минут', placeholder: 'минут', value: c ? String(c.minutes) : '' });
    const until = h('input', { type: 'datetime-local', 'aria-label': 'Начать можно до', value: c ? isoToLocal(c.until) : '' });
    const reveal = h('input', { type: 'datetime-local', 'aria-label': 'Ответы показать после', value: c ? isoToLocal(c.reveal) : '' });
    const rec = { num, min, until, reveal };
    const state = c ? (c.closed ? 'закрыта преподавателем' : c.ended ? 'окончена' : 'идёт или ждёт начала') : 'новая';
    return h('div', { class: 'ctl-row' },
      h('div', { class: 'deadline-row' },
        h('label', { class: 'dl-num' }, h('span', {}, 'ПЗ №'), num),
        h('label', { class: 'dl-num' }, h('span', {}, 'минут'), min)),
      h('label', { class: 'dl-day' }, h('span', {}, 'начать можно до'), until),
      h('label', { class: 'dl-day' }, h('span', {}, 'ответы показать после (пусто — после окончания окна)'), reveal),
      h('p', { class: 'hint' }, `Состояние: ${state}`),
      h('div', { class: 'ctl-actions' },
        h('button', { class: 'btn small primary', type: 'button', onclick: () => save(rec, c ? {} : { close: false }) }, 'Сохранить'),
        c ? h('button', { class: 'btn small', type: 'button', onclick: () => save(rec, { close: !c.closed }) }, c.closed ? 'Открыть снова' : 'Закрыть и показать ответы') : '',
        c ? h('button', { class: 'btn small', type: 'button', onclick: async () => {
          if (!confirm(`Убрать контрольную по ПЗ ${c.n}? Начатые студентами попытки останутся.`)) return;
          try { await ctx.call('adminSetControl', { group, discipline, lesson: c.n, remove: true }); if (ctx.alive()) load(); } catch (e) { ctx.fail(e, err); }
        } }, 'Убрать') : ''));
  }

  async function load() {
    let d;
    try { d = await ctx.call('adminControls', { group, discipline }); } catch (e) { if (ctx.alive()) ctx.fail(e, err); return; }
    if (!ctx.alive()) return;
    const items = Array.isArray(d.controls) ? d.controls : [];
    list.replaceChildren(...items.map(row));
  }

  box.append(
    h('span', {}, '⏱ Контрольная (таймер, одна попытка, ответы скрыты до окончания)'),
    list,
    h('button', { class: 'btn small', type: 'button', onclick: () => list.append(row(null)) }, '➕ Добавить контрольную'),
    err, msg);
  load();
  return box;
}
