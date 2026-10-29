import { h } from '../util/dom.js';
import { loadCourse, flatLessons } from '../content.js';
import { errText } from '../ui/login.js';
import { DISC, select, hashQuery, loading, loadError, emptyBox } from './common.js';
import { ATT_STATUS, nextStatus, effectiveStatus, countStatuses, diffOverrides, moscowParts, moscowTime } from './attendance-model.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// #/admin/attendance?group=…&d=…&n=…&date=…&time=…&late=…&dur=…: кто был на паре по входам и пульсу.
// Тексты вставляются как текст (h()), разметка не разбирается. Статус можно поправить щелчком — правка уйдёт при выгрузке.
export async function renderAttendance(ctx, main) {
  let groups;
  let course;
  try {
    groups = await ctx.groups();
    const qd0 = ctx.query.get('d');
    course = await loadCourse(DISC.some(x => x.id === qd0) ? qd0 : DISC[0].id);
  } catch (e) {
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
  const lessons = flatLessons(course).filter(l => l.ready);
  if (!lessons.length) { main.replaceChildren(emptyBox('В этой дисциплине пока нет готовых занятий.')); return; }
  const qn = Number(ctx.query.get('n'));
  const n = lessons.some(l => l.n === qn) ? qn : lessons[0].n;
  const now = moscowParts(Date.now());
  const qDate = ctx.query.get('date');
  const qTime = ctx.query.get('time');
  const date = DATE_RE.test(qDate || '') ? qDate : now.date;
  const time = TIME_RE.test(qTime || '') ? qTime : ''; // начало пары не подставляется: без него статусы не посчитать
  const qLate = ctx.query.get('late');
  const late = /^\d{1,3}$/.test(qLate || '') && Number(qLate) <= 120 ? Number(qLate) : 15;
  const qDur = ctx.query.get('dur');
  const dur = /^\d{2,3}$/.test(qDur || '') && Number(qDur) >= 30 && Number(qDur) <= 360 ? Number(qDur) : 90;

  const go = o => ctx.go(hashQuery('/admin/attendance', Object.assign({ group, d: disc, n, date, time, late, dur }, o)));
  const dateIn = h('input', { type: 'date', 'aria-label': 'Дата пары', value: date });
  const timeIn = h('input', { type: 'time', 'aria-label': 'Начало пары (Москва)', value: time });
  const lateIn = h('input', { type: 'number', inputmode: 'numeric', min: '0', max: '120', step: '1', 'aria-label': 'Порог опоздания, минут', value: String(late) });
  const durIn = h('input', { type: 'number', inputmode: 'numeric', min: '30', max: '360', step: '5', 'aria-label': 'Длительность пары, минут', value: String(dur) });
  const apply = h('button', { class: 'btn primary', type: 'button' }, 'Показать');
  const syncApply = () => { apply.disabled = !DATE_RE.test(dateIn.value) || !TIME_RE.test(timeIn.value); };
  dateIn.addEventListener('input', syncApply);
  timeIn.addEventListener('input', syncApply);
  syncApply();
  apply.addEventListener('click', () => go({ date: dateIn.value, time: timeIn.value, late: lateIn.value, dur: durIn.value }));
  const bar = h('div', { class: 'card admin-tools no-print' },
    h('div', { class: 'tools-row' },
      h('label', { class: 'field inline' }, h('span', {}, 'Группа'), select(groups.map(g => ({ value: g, label: g })), group, v => go({ group: v }))),
      h('label', { class: 'field inline' }, h('span', {}, 'Дисциплина'), select(DISC.map(x => ({ value: x.id, label: x.code })), disc, v => go({ d: v, n: '' }))),
      h('label', { class: 'field inline' }, h('span', {}, 'ПЗ'), select(lessons.map(l => ({ value: String(l.n), label: `№${l.n}` })), String(n), v => go({ n: v }), { 'aria-label': 'Практическое занятие' }))),
    h('div', { class: 'tools-row' },
      h('label', { class: 'field inline' }, h('span', {}, 'Дата'), dateIn),
      h('label', { class: 'field inline' }, h('span', {}, 'Начало (Москва)'), timeIn),
      h('label', { class: 'field inline' }, h('span', {}, 'Опоздание после, мин'), lateIn),
      h('label', { class: 'field inline' }, h('span', {}, 'Длительность, мин'), durIn),
      apply));
  if (!time) { main.replaceChildren(bar, h('p', { class: 'hint' }, 'Укажите дату и время начала пары (по Москве) и нажмите «Показать».')); return; }
  const body = h('div', {}, loading('Считаем посещаемость…'));
  main.replaceChildren(bar, body);

  let d;
  try {
    d = await ctx.call('adminAttendance', { group, discipline: disc, lesson: n, date, time, lateMin: late, durationMin: dur });
  } catch (e) {
    if (!ctx.alive() || (e && e.handled)) return;
    body.replaceChildren(loadError(errText(e), () => ctx.rerender()));
    return;
  }
  if (!ctx.alive()) return;
  const rows = Array.isArray(d && d.students) ? d.students : [];
  if (!rows.length) { body.replaceChildren(emptyBox('В группе нет студентов.')); return; }

  const over = {};
  const summary = h('p', { class: 'att-summary', role: 'status', 'aria-live': 'polite' });
  const msg = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
  const err = h('p', { class: 'error', role: 'alert' });
  const chips = new Map();
  const refresh = () => {
    const c = countStatuses(rows, over);
    summary.textContent = `был ${c.present} / опоздал ${c.late} / не был ${c.absent}`;
    rows.forEach(r => {
      const st = effectiveStatus(r, over);
      const chip = chips.get(r.id);
      chip.className = `att-chip ${ATT_STATUS[st].cls}`;
      chip.textContent = ATT_STATUS[st].label + (Object.prototype.hasOwnProperty.call(over, r.id) && over[r.id] !== r.status ? ' ✎' : '');
      chip.setAttribute('aria-label', `${r.name}: ${ATT_STATUS[st].label}. Нажмите, чтобы изменить`);
    });
  };
  const list = rows.map(r => {
    const chip = h('button', { class: 'att-chip', type: 'button' });
    chip.addEventListener('click', () => { over[r.id] = nextStatus(effectiveStatus(r, over)); refresh(); });
    chips.set(r.id, chip);
    return h('div', { class: 'row att-row' },
      h('strong', {}, r.name), ' ', chip,
      h('small', { class: 'hint' }, r.first ? ` · первый вход ${moscowTime(r.first)} (${r.source})` : (r.source ? ` · ${r.source}` : ' · входов нет')),
      r.saved ? h('small', { class: 'hint' }, ` · на листе: ${r.saved}`) : '');
  });
  const exportBtn = h('button', { class: 'btn primary', type: 'button' }, 'Выгрузить на лист «Посещаемость»');
  exportBtn.addEventListener('click', async () => {
    err.textContent = '';
    msg.textContent = '';
    exportBtn.disabled = true;
    try {
      const r = await ctx.call('adminAttendanceExport', { group, discipline: disc, lesson: n, date, time, lateMin: late, durationMin: dur, overrides: diffOverrides(rows, over) });
      if (!ctx.alive()) return;
      msg.textContent = `Выгружено строк: ${r.written}${r.replaced ? ` (заменено прежних: ${r.replaced})` : ''}.`;
    } catch (e) {
      if (ctx.alive() && !(e && e.handled)) err.textContent = errText(e);
    }
    exportBtn.disabled = false;
  });
  body.replaceChildren(
    h('p', { class: 'hint' }, `Пара ${date} в ${time} (Москва), ПЗ №${n}. «Был» — первый вход не позже ${late} мин после начала; «опоздал» — позже; «не был» — входов нет или студент отмечен «нет на паре» на доске. Первый вход дня хранится около 3 суток, пульс — 6 часов, сдачи — постоянно, поэтому выгружайте в день занятия. Ограничение: ПЗ, открытое дома в пределах 3 часов до пары, и пульс из дома считаются присутствием.`),
    h('div', { class: 'card' }, summary, list,
      h('p', { class: 'hint' }, 'Статус можно поправить щелчком (✎ — правка вручную): она попадёт на лист при выгрузке.'),
      exportBtn, err, msg));
  refresh();
}
