import { h } from '../util/dom.js';
import { DISC, select, hashQuery, loading, loadError, emptyBox } from './common.js';
import { errText } from '../ui/login.js';

const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const SUSPICIOUS_TIP = 'Подозрительно: идеальный автобалл быстрее чем за 3 минуты или больше 5 попыток за день. Проверьте строки студента в листе «Ответы».';

// Отметка занятия из ячейки журнала: строка столбца T сервера («5», «4 (предв.)», «нужно доработать») или { mark, preliminary }.
// -> { text: '«5»' | 'нужно доработать', preliminary } или null (отметки нет)
const MARK_RE = /^«?([345])»?(?:\s*\((предв\.?)\))?$|^(нужно доработать)(?:\s*\((предв\.?)\))?$/;
export function markView(m) {
  if (m == null || m === '') return null;
  if (typeof m === 'object') {
    const v = Number(m.mark);
    if (![0, 3, 4, 5].includes(v)) return null;
    return { text: v ? `«${v}»` : 'нужно доработать', preliminary: m.preliminary === true };
  }
  if (typeof m === 'number') return [0, 3, 4, 5].includes(m) ? { text: m ? `«${m}»` : 'нужно доработать', preliminary: false } : null;
  const r = MARK_RE.exec(String(m).trim());
  if (!r) return null;
  return { text: r[1] ? `«${r[1]}»` : r[3], preliminary: !!(r[2] || r[4]) };
}

// ДЗ из ячейки журнала { level: 'base'|'adv', mark, best, max, attempts } -> { label: 'ДЗ ⭐' | 'ДЗ баз.', text: '«5»' | 'нужно доработать' } или null
export function hwView(hw) {
  if (!hw || typeof hw !== 'object') return null;
  const v = Number(hw.mark);
  if (![0, 3, 4, 5].includes(v)) return null;
  return { label: hw.level === 'adv' ? 'ДЗ ⭐' : 'ДЗ баз.', text: v ? `«${v}»` : 'нужно доработать', adv: hw.level === 'adv', attempts: Number(hw.attempts) || 0 };
}

export function workHref(studentId, d, n, extra) {
  return `#${hashQuery('/admin/work', Object.assign({ student: studentId, d, n }, extra || {}))}`;
}

// Выбор группы и дисциплины: значения хранятся в адресе (#/admin/<screen>?group=…&d=…)
export function filterBar(ctx, screen, groups, group, disc) {
  const go = (g, d) => ctx.go(hashQuery(`/admin/${screen}`, { group: g, d }));
  return h('div', { class: 'card admin-tools no-print' },
    h('div', { class: 'tools-row' },
      h('label', { class: 'field inline' }, h('span', {}, 'Группа'), select(groups.map(g => ({ value: g, label: g })), group, v => go(v, disc))),
      h('label', { class: 'field inline' }, h('span', {}, 'Дисциплина'), select(DISC.map(x => ({ value: x.id, label: x.code })), disc, v => go(group, v)))));
}

export async function renderJournal(ctx, main) {
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
  const bar = filterBar(ctx, 'journal', groups, group, disc);
  const body = h('div', {}, loading('Загружаем журнал…'));
  main.replaceChildren(bar, body);

  let d;
  try { d = await ctx.call('adminJournal', { group, discipline: disc }); } catch (e) {
    if (!ctx.alive() || (e && e.handled)) return;
    body.replaceChildren(loadError(errText(e), () => ctx.rerender()));
    return;
  }
  if (!ctx.alive()) return;
  const students = Array.isArray(d.students) ? d.students : [];
  const cells = d.cells && typeof d.cells === 'object' ? d.cells : {};
  // ПЗ только с ДЗ (занятие не сдавали) тоже попадают в журнал: объединяем номера занятий с номерами ячеек, где есть ДЗ
  const lessonSet = new Set((Array.isArray(d.lessons) ? d.lessons : []).map(Number));
  Object.keys(cells).forEach(sid => {
    const row = cells[sid];
    if (row && typeof row === 'object') Object.keys(row).forEach(k => { if (row[k] && hwView(row[k].hw) && Number(k) >= 1) lessonSet.add(Number(k)); });
  });
  const lessons = Array.from(lessonSet).sort((a, b) => a - b);
  if (!students.length) { body.replaceChildren(emptyBox('В этой группе пока нет студентов.')); return; }
  if (!lessons.length) { body.replaceChildren(emptyBox('Сдач по этой дисциплине пока нет.')); return; }

  const cell = (s, n) => {
    const c = own(cells, s.id) && own(cells[s.id], n) ? cells[s.id][n] : null;
    if (!c) return h('td', { class: 'jcell empty' }, h('span', { class: 'jdash', 'aria-label': 'не сдано' }, '–'));
    const hw = hwView(c.hw);
    const hwLine = hw ? h('span', { class: `jhw${hw.adv ? ' adv' : ''}`, title: hw.attempts ? `ДЗ, попыток: ${hw.attempts}` : 'ДЗ' }, `${hw.label} ${hw.text}`) : '';
    // у занятия нет сдачи, есть только ДЗ
    if (!(typeof c.best === 'number')) {
      return h('td', { class: 'jcell hwonly' }, h('div', { class: 'jlink', 'aria-label': `${s.name}, ПЗ ${n}: занятие не сдано${hw ? `, ${hw.label} ${hw.text}` : ''}` },
        h('span', { class: 'jpct muted' }, '–'), hwLine));
    }
    const mark = markView(c.mark);
    const markLine = mark ? h('span', { class: `jmark${mark.preliminary ? ' prelim' : ''}` }, mark.text, mark.preliminary ? h('span', { class: 'jprelim' }, 'предв.') : '') : '';
    const pct = c.max > 0 ? `${Math.round(c.best / c.max * 100)}%` : '—';
    const marks = [c.manual === 'pending' ? '⏳' : '', c.manual === 'graded' ? '💬' : '', c.late ? '⏰' : '', c.variant === 'pc' ? '💻' : ''].filter(Boolean).join('');
    const note = [`автобалл ${c.best} из ${c.max}`, mark ? `отметка ${mark.text}${mark.preliminary ? ' (предварительная)' : ''}` : '', hw ? `${hw.label} ${hw.text}` : '', c.manual === 'pending' ? 'ждёт ручной проверки' : '', c.manual === 'graded' ? `оценено вручную: ${c.manualScore}` : '', c.late ? 'после срока' : '', c.variant === 'pc' ? 'ПК-вариант' : '', `попыток: ${c.attempts}`, c.suspicious ? 'подозрительно: идеал быстрее 3 минут или больше 5 попыток за день' : ''].filter(Boolean).join(', ');
    return h('td', { class: 'jcell' }, h('a', { class: `jlink${c.late ? ' late' : ''}`, href: workHref(s.id, disc, n), title: note, 'aria-label': `${s.name}, ПЗ ${n}: ${note}` },
      h('span', { class: 'jpct' }, pct), markLine, hwLine, marks ? h('span', { class: 'jmarks', 'aria-hidden': 'true' }, marks) : '',
      c.suspicious === true ? h('span', { class: 'jwarn', title: SUSPICIOUS_TIP, 'aria-hidden': 'true' }, '⚠') : ''));
  };

  body.replaceChildren(
    h('p', { class: 'hint' }, '% — лучший автоматический балл; «5» — отметка за занятие («предв.» — пока не оценены ручные задания); ДЗ ⭐ / ДЗ баз. — домашнее задание и его отметка; ⏳ ждёт ручной проверки; 💬 оценено преподавателем; ⏰ сдано после срока; 💻 сдано в ПК-варианте; ⚠ подозрительная сдача (идеал быстрее 3 минут или больше 5 попыток за день). Нажмите на ячейку — откроется работа.'),
    h('div', { class: 'journal-wrap', tabindex: '0', role: 'region', 'aria-label': 'Журнал: прокручивается по горизонтали' },
      h('table', { class: 'journal' },
        h('thead', {}, h('tr', {}, h('th', { class: 'jname' }, 'Студент'), lessons.map(n => h('th', { class: 'jh' }, `ПЗ ${n}`)))),
        h('tbody', {}, students.map(s => h('tr', {}, h('th', { class: 'jname', scope: 'row' }, s.name), lessons.map(n => cell(s, n))))))));
}
