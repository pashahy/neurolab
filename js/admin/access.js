import { h } from '../util/dom.js';
import { errText } from '../ui/login.js';
import { DISC, fmtOpen, parseOpen, loadError, emptyBox } from './common.js';

const normGroup = g => String(g || '').toUpperCase().replace(/\s+/g, '');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
let uid = 0;

// #/admin/access: для каждой пары «группа × дисциплина» — видна ли, какие ПЗ открыты, сроки сдачи
export async function renderAccess(ctx, main) {
  let d;
  try { d = await ctx.call('adminAccess'); } catch (e) {
    if (!ctx.alive() || (e && e.handled)) return;
    main.replaceChildren(loadError(errText(e), () => ctx.rerender()));
    return;
  }
  if (!ctx.alive()) return;
  const groups = Array.isArray(d.groups) ? d.groups.map(String) : [];
  const rows = Array.isArray(d.rows) ? d.rows : [];
  if (!groups.length) { main.replaceChildren(emptyBox('Групп пока нет: добавьте студентов на вкладке «Студенты».')); return; }
  const rowFor = (g, disc) => rows.find(r => normGroup(r.group) === normGroup(g) && r.discipline === disc);

  main.replaceChildren(
    h('p', { class: 'hint' }, 'Студент видит дисциплину, если она «видна» его группе, и может открыть только указанные ПЗ. После срока работу можно сдать, но она получит отметку «после срока». Если для группы ничего не настроено, всё видно и открыто.'),
    h('div', { class: 'access-list' }, groups.map(g => h('section', { class: 'card access-group' },
      h('h2', {}, `Группа ${g}`),
      DISC.map(x => accessForm(ctx, g, x, rowFor(g, x.id)))))));
}

function accessForm(ctx, group, disc, row) {
  const id = `acc-${++uid}`;
  const cur = row || { visible: true, open: 'all', deadlines: {} };
  const visible = h('input', { type: 'checkbox', id: `${id}-v`, checked: cur.visible !== false });
  const open = h('input', { type: 'text', id: `${id}-o`, name: `open-${id}`, autocomplete: 'off', placeholder: 'все  или  1-5, 7', value: fmtOpen(cur.open === 'all' ? 'all' : (Array.isArray(cur.open) ? cur.open : 'all')) });
  const openNote = h('p', { class: 'hint' });
  const dlBox = h('div', { class: 'deadlines' });
  const err = h('p', { class: 'error', role: 'alert' });
  const msg = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn primary', type: 'button' }, 'Сохранить');

  const dl = [];
  const dlRow = (n, date) => {
    const num = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '999', step: '1', 'aria-label': 'Номер ПЗ', placeholder: '№ ПЗ', value: n == null ? '' : String(n) });
    const day = h('input', { type: 'date', 'aria-label': 'Срок сдачи', value: date || '' });
    const rec = { num, day };
    const el = h('div', { class: 'deadline-row' }, h('label', { class: 'dl-num' }, h('span', {}, 'ПЗ №'), num), h('label', { class: 'dl-day' }, h('span', {}, 'до'), day),
      h('button', { class: 'btn small', type: 'button', 'aria-label': 'Удалить срок', onclick: () => { dl.splice(dl.indexOf(rec), 1); el.remove(); } }, '✕'));
    rec.el = el;
    dl.push(rec);
    dlBox.append(el);
  };
  Object.keys(cur.deadlines || {}).map(Number).sort((a, b) => a - b).forEach(n => dlRow(n, cur.deadlines[n]));

  const updNote = () => {
    const p = parseOpen(open.value);
    openNote.textContent = p.error ? p.error : p.value === 'all' ? 'Открыты все ПЗ.' : p.value.length ? `Открыто ПЗ: ${p.value.length} (${fmtOpen(p.value)}).` : 'Пусто: ни одно ПЗ не открыто.';
    openNote.className = p.error ? 'hint error' : 'hint';
  };
  open.addEventListener('input', updNote);
  updNote();

  btn.addEventListener('click', async () => {
    err.textContent = ''; msg.textContent = '';
    const p = parseOpen(open.value);
    if (p.error) { err.textContent = p.error; return; }
    const deadlines = {};
    for (const r of dl) {
      const n = r.num.value.trim();
      const day = r.day.value.trim();
      if (!n && !day) continue;
      if (!/^\d{1,3}$/.test(n) || Number(n) < 1) { err.textContent = 'В сроках укажите номер ПЗ — число от 1 до 999'; return; }
      if (!DATE_RE.test(day)) { err.textContent = `Для ПЗ ${n} выберите дату срока`; return; }
      if (Object.prototype.hasOwnProperty.call(deadlines, Number(n))) { err.textContent = `Для ПЗ ${n} срок указан дважды`; return; }
      deadlines[Number(n)] = day;
    }
    btn.disabled = true;
    try {
      await ctx.call('adminSetAccess', { group, discipline: disc.id, visible: visible.checked, open: p.value === 'all' ? 'все' : p.value.join(','), deadlines });
      if (!ctx.alive()) return;
      msg.textContent = '✓ Сохранено';
    } catch (e) { ctx.fail(e, err); } finally { btn.disabled = false; }
  });

  return h('form', { class: 'access-form', onsubmit: e => e.preventDefault() },
    h('h3', {}, disc.code),
    h('label', { class: 'check-row', for: `${id}-v` }, visible, h('span', {}, 'Дисциплина видна группе')),
    h('label', { class: 'field', for: `${id}-o` }, h('span', {}, 'Открытые ПЗ'), open),
    openNote,
    h('div', { class: 'field' }, h('span', {}, 'Сроки сдачи'), dlBox,
      h('button', { class: 'btn small', type: 'button', onclick: () => dlRow(null, '') }, '➕ Добавить срок')),
    err, msg, btn);
}
