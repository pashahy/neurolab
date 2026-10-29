import { h } from '../util/dom.js';
import { errText } from '../ui/login.js';
import { DISC, discCode, loadError, emptyBox, confirmDialog, fmtTime } from './common.js';
import { filterBar } from './journal.js';

const pad2 = v => String(v).padStart(2, '0');
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const dayPlus = days => { const t = new Date(); t.setDate(t.getDate() + days); return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`; };
const STATUS = {
  open: ['открыт', 'hint'],
  overdue: ['просрочен', 'error'],
  done: ['сдан в срок отработки', 'hint'],
  doneLate: ['сдан после срока', 'hint'],
};

// #/admin/debts: долги студентов группы по ПЗ («отработка»): список со статусами, срок, удаление, добавление из кандидатов
// (открытые ПЗ группы, по которым у студента нет сдач). Тексты вставляются как текст (h()), разметка не разбирается.
export async function renderDebts(ctx, main) {
  let groups;
  try { groups = await ctx.groups(); } catch (e) {
    if (!ctx.alive() || (e && e.handled)) return;
    main.replaceChildren(loadError(errText(e), () => ctx.rerender()));
    return;
  }
  if (!ctx.alive()) return;
  if (!groups.length) { main.replaceChildren(emptyBox('Групп пока нет: добавьте студентов на вкладке «Студенты».')); return; }
  const qg = ctx.query.get('group');
  const group = groups.indexOf(qg) >= 0 ? qg : groups[0];
  const qd = ctx.query.get('d');
  const disc = DISC.some(x => x.id === qd) ? qd : DISC[0].id;
  const bar = filterBar(ctx, 'debts', groups, group, disc);
  main.replaceChildren(bar, h('p', { class: 'loading' }, 'Загрузка…'));
  let data;
  try { data = await ctx.call('adminDebts', { group, discipline: disc }); } catch (e) {
    if (!ctx.alive() || (e && e.handled)) return;
    main.replaceChildren(bar, loadError(errText(e), () => ctx.rerender()));
    return;
  }
  if (!ctx.alive()) return;
  const debts = Array.isArray(data.debts) ? data.debts : [];
  const students = Array.isArray(data.students) ? data.students : [];
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const msg = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
  const err = h('p', { class: 'error', role: 'alert' });
  const fail = e => { if (!ctx.alive() || (e && e.handled)) return; err.textContent = errText(e); msg.textContent = ''; };
  const save = async body => {
    err.textContent = '';
    try {
      await ctx.call('adminSetDebt', Object.assign({ discipline: disc }, body));
    } catch (e) { fail(e); return false; }
    if (ctx.alive()) ctx.rerender(); // список перечитывается: новая запись видна сразу
    return true;
  };

  // ----- список долгов -----
  const list = debts.length
    ? h('div', { class: 'card' }, h('h2', {}, `Долги: ${discCode(disc)}, группа ${group}`), debts.map(x => debtRow(x)))
    : emptyBox('Долгов пока нет. Добавьте их ниже.');

  function debtRow(x) {
    const st = STATUS[x.status] || STATUS.open;
    const day = h('input', { type: 'date', 'aria-label': 'Срок отработки', value: x.due });
    return h('div', { class: 'row debt-row' },
      h('strong', {}, x.name), ` · ПЗ ${x.n} · `,
      h('span', { class: st[1] }, st[0]),
      x.doneAt ? h('small', { class: 'hint' }, ` (${fmtTime(x.doneAt)})`) : '',
      x.comment ? h('small', { class: 'hint' }, ` — ${x.comment}`) : '',
      ' · до ', day,
      h('button', { class: 'btn small', type: 'button', onclick: () => { if (day.value && day.value !== x.due) save({ studentIds: [x.studentId], lesson: x.n, due: day.value }); } }, 'Сохранить срок'),
      h('button', {
        class: 'btn small danger', type: 'button',
        onclick: async () => {
          const ok = await confirmDialog({ title: 'Удалить отработку?', body: `${x.name}, ПЗ ${x.n}. Студент больше не сможет сдать это ПЗ, если оно закрыто для группы.`, ok: 'Удалить', danger: true });
          if (ok) save({ studentIds: [x.studentId], lesson: x.n, remove: true });
        },
      }, 'Удалить'));
  }

  // ----- добавление -----
  const due = h('input', { type: 'date', 'aria-label': 'Срок отработки', value: dayPlus(7) });
  const comment = h('input', { type: 'text', name: 'debt-comment', autocomplete: 'off', maxlength: '300', placeholder: 'комментарий (необязательно)' });
  const picks = []; // { studentId, n, box }
  const candBox = candidates.length
    ? candidates.map(c => h('div', { class: 'row debt-cand' }, h('strong', {}, c.name), ' ',
      (Array.isArray(c.lessons) ? c.lessons : []).map(n => {
        const box = h('input', { type: 'checkbox', 'aria-label': `${c.name}, ПЗ ${n}` });
        picks.push({ studentId: c.studentId, n, box });
        return h('label', { class: 'debt-pick' }, box, ` ПЗ ${n} `);
      })))
    : [h('p', { class: 'hint' }, 'Кандидатов нет: у всех студентов есть сдачи по открытым ПЗ (или в «Доступе» ничего не открыто).')];
  const addPicked = h('button', { class: 'btn primary', type: 'button' }, 'Назначить отмеченные');
  addPicked.addEventListener('click', async () => {
    const chosen = picks.filter(p => p.box.checked);
    if (!chosen.length) { err.textContent = 'Отметьте хотя бы одно ПЗ у студента.'; return; }
    if (!DATE_RE.test(due.value)) { err.textContent = 'Укажите срок отработки.'; return; }
    const byLesson = {};
    chosen.forEach(p => { (byLesson[p.n] = byLesson[p.n] || []).push(p.studentId); });
    addPicked.disabled = true;
    let okAll = true;
    for (const n of Object.keys(byLesson)) {
      const body = { studentIds: byLesson[n], lesson: Number(n), due: due.value };
      if (comment.value.trim()) body.comment = comment.value.trim();
      try { await ctx.call('adminSetDebt', Object.assign({ discipline: disc }, body)); } catch (e) { fail(e); okAll = false; break; }
    }
    addPicked.disabled = false;
    if (okAll && ctx.alive()) ctx.rerender();
  });

  // вручную: любой студент группы и номер ПЗ (например, ПЗ, которое сейчас закрыто для группы)
  const who = h('select', { 'aria-label': 'Студент' }, students.map(s => h('option', { value: s.id }, s.name)));
  const num = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '999', step: '1', 'aria-label': 'Номер ПЗ', placeholder: '№ ПЗ' });
  const addOne = h('button', { class: 'btn', type: 'button' }, 'Добавить');
  addOne.addEventListener('click', () => {
    const n = Number(num.value);
    if (!who.value) { err.textContent = 'В группе нет студентов.'; return; }
    if (!Number.isInteger(n) || n < 1 || n > 999) { err.textContent = 'Укажите номер ПЗ от 1 до 999.'; return; }
    if (!DATE_RE.test(due.value)) { err.textContent = 'Укажите срок отработки.'; return; }
    const body = { studentIds: [who.value], lesson: n, due: due.value };
    if (comment.value.trim()) body.comment = comment.value.trim();
    save(body);
  });

  main.replaceChildren(
    bar,
    h('p', { class: 'hint' }, 'Студент увидит список «Отработать» на главной и сможет сдать отмеченное ПЗ до своего срока, даже если оно закрыто для группы. Сдача получит пометку «отработка». Долг остаётся, пока вы его не удалите.'),
    list,
    h('div', { class: 'card' },
      h('h2', {}, 'Добавить долг'),
      h('div', { class: 'tools-row' },
        h('label', { class: 'field inline' }, h('span', {}, 'Срок отработки'), due),
        h('label', { class: 'field inline' }, h('span', {}, 'Комментарий'), comment)),
      h('h3', {}, 'Кандидаты: открытые ПЗ без сдач'),
      candBox,
      candidates.length ? addPicked : '',
      h('h3', {}, 'Вручную'),
      h('div', { class: 'tools-row' }, who, num, addOne),
      err, msg));
}
