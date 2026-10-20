// C1: «Нет на паре» — убрать студента с текущего занятия (не входит в «на занятии X из Y», «Сдали X из Y» и цель 80 %).
// Отметка живёт на сервере (boardAbsent, кэш на 12 часов); пульс самого студента её снимает. Модель — чистые функции, UI — ниже.
import { h } from '../util/dom.js';
import { avatarUrl, defaultAvatar } from '../avatars.js';
import { frameClass } from '../sandbox/cosmetics.js';
import { errText } from '../ui/login.js';

const list = v => (Array.isArray(v) ? v : []);

export const isAbsent = s => !!(s && s.absent === true);

// Студенты занятия без отсутствующих — по ним считаются «на занятии», «сдали» и цель
export const presentOf = students => list(students).filter(s => s && !isAbsent(s));
export const absentOf = students => list(students).filter(isAbsent);

// Подпись полосы «Отсутствуют: N» (на доске, без имён)
export const absentStripText = n => `Отсутствуют: ${Math.max(0, Math.floor(Number(n) || 0))}`;

// Тело запроса boardAbsent
export const absentBody = (ref, studentId, absent) => ({ group: ref.group, discipline: ref.discipline, lesson: ref.lesson, studentId, absent: !!absent });

// Меняет отметку в уже полученных данных (до ближайшего опроса): новый объект данных
export function withAbsent(data, studentId, flag) {
  if (!data || !Array.isArray(data.students)) return data;
  return { ...data, students: data.students.map(s => (s && s.id === studentId ? { ...s, absent: !!flag } : s)) };
}

// ctl: { mark(id, flag) -> Promise<bool>, tileButton(id), rowButton(id) -> { el, set(flag) }, strip: { el, update(students) } }
// call — ctx.call; ref — { group, discipline, lesson }; onChange(id, flag) — после успеха; onError(text) — текст ошибки.
export function createAbsentCtl({ call, ref, onChange, onError }) {
  let busy = false;
  async function mark(id, flag) {
    if (busy) return false;
    busy = true;
    try {
      const r = await call('boardAbsent', absentBody(ref, id, flag));
      if (r && r.ok === false) throw new Error(r.error || 'Не получилось');
      if (onChange) onChange(id, flag);
      return true;
    } catch (e) {
      if (onError && !(e && e.handled)) onError(errText(e));
      return false;
    } finally { busy = false; }
  }
  const btn = (cls, text, flag, id) => {
    const b = h('button', { class: cls, type: 'button' }, text);
    b.addEventListener('click', ev => { ev.stopPropagation(); b.disabled = true; mark(id, flag).then(() => { b.disabled = false; }); });
    return b;
  };
  // плитка «не зашёл» на доске: маленькая кнопка, видна только у плиток tile-none (CSS)
  const tileButton = id => btn('tile-absent-btn', '✕ нет на паре', true, id);
  // «Мой экран»: одна кнопка, текст по состоянию
  function rowButton(id) {
    const b = h('button', { class: 'btn small live-absent-btn', type: 'button' }, 'Нет на паре');
    let flag = false;
    b.addEventListener('click', () => { b.disabled = true; mark(id, !flag).then(() => { b.disabled = false; }); });
    return { el: b, set(f) { flag = !!f; b.textContent = flag ? 'Вернуть' : 'Нет на паре'; } };
  }
  // полоса на доске: «Отсутствуют: N» и аватары с кнопкой «вернуть» (без имён)
  const label = h('span', { class: 'board-absent-label' });
  const box = h('span', { class: 'board-absent-list' });
  const stripEl = h('div', { class: 'board-absent', hidden: true }, label, box);
  const strip = {
    el: stripEl,
    update(students) {
      const a = absentOf(students);
      stripEl.hidden = !a.length;
      label.textContent = absentStripText(a.length);
      box.replaceChildren(...a.map(s => {
        const b = h('button', { class: 'board-absent-back', type: 'button', title: 'Вернуть на занятие', 'aria-label': 'Вернуть на занятие' },
          h('img', { class: ('board-absent-avatar ' + frameClass(s.frame)).trim(), src: avatarUrl(s.avatar || defaultAvatar(s.id)), alt: '', width: '36', height: '36', draggable: 'false' }),
          h('span', { 'aria-hidden': 'true' }, '↩'));
        b.addEventListener('click', () => { b.disabled = true; mark(s.id, false).then(() => { b.disabled = false; }); });
        return b;
      }));
    },
  };
  return { mark, tileButton, rowButton, strip };
}
