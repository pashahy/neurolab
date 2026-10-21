// ДЗ формата v4 на клиенте: выбор уровня («Базовое» / «⭐ Творческое»), задания, сдача, результат с отметкой, попытки 1–3.
// Черновик ДЗ — отдельный, под ключом "<ПЗ>#hw" (homeworkDraftKey); попытки, лучший результат и отметка — store.homework(key).
// Экран подключает js/ui/lesson.js: homeworkV4(ctx) открывает ДЗ целиком, homeworkChooser(ctx, onPick) — карточка выбора
// (встроена в экран после сдачи). ctx собирает lesson.js: { app, lesson, key, discipline, view, back, preview, mountTask, saveDraft, isActive, ownerChanged, evict, plural }.
import { h } from '../util/dom.js';
import { md } from '../util/text.js';
import { pts } from '../tasks/common.js';
import { gradeHomework, homeworkMark, MARK_LABEL } from '../grading-v4.js';
import { homeworkTasks, hasHomework, HW_MAX_ATTEMPTS } from '../lesson-v4.js';
import { repairHomeworkDraft } from '../draft-v4.js';
import { createStore, memoryStorage } from '../store.js';
import { holdText, rejectText, LIMIT_TEXT } from '../submit.js';
// новые имена — из нового модуля: именованный импорт имени, которого нет в старой копии store.js/submit.js из кэша, положил бы сайт
import { homeworkDraftKey, buildHomeworkSubmission } from '../hw-submit.js';
import { queuedLive } from './queued-live.js';

const HW_MINUTES = 15;
// В демо (#/demo4) попытки, отметка и XP живут только в памяти страницы и не попадают в данные вошедшего студента
const demoBank = createStore(memoryStorage());
const bank = ctx => (ctx.preview ? demoBank : ctx.app.store);
const LEVELS = [
  { id: 'base', icon: '📝', fallback: 'Базовое', note: 'Отметка за базовое ДЗ — не выше «4».' },
  { id: 'adv', icon: '⭐', fallback: 'Творческое', note: 'За творческое ДЗ можно получить «5».' },
];
const levelTitle = (lesson, id) => {
  const spec = LEVELS.find(l => l.id === id);
  const title = lesson.homework && lesson.homework[id] && lesson.homework[id].title;
  return typeof title === 'string' && title ? title : `${id === 'adv' ? '⭐ ' : ''}${spec.fallback}`;
};

// карточка выбора уровня: зачем это нужно, статус попыток, две карточки уровней
export function homeworkChooser(ctx, onPick) {
  const { app, lesson, key, plural } = ctx;
  const rec = bank(ctx).homework(key);
  const used = rec ? rec.attempts : 0;
  const over = used >= HW_MAX_ATTEMPTS;
  const why = lesson.homework && typeof lesson.homework.why === 'string' ? lesson.homework.why : '';
  return h('div', { class: 'card hw-card' },
    h('h2', { class: 'v4-label' }, '📝 Домашнее задание'),
    why ? h('div', { class: 'hw-why', html: md(why) }) : '',
    h('p', { class: 'hint hw-status' },
      over ? 'Попытки ДЗ закончились.' : `Попыток осталось: ${HW_MAX_ATTEMPTS - used} из ${HW_MAX_ATTEMPTS}. Засчитывается лучшая.`,
      rec ? ` Лучшая отметка: ${MARK_LABEL[rec.mark]}.` : ''),
    h('div', { class: 'hw-levels', role: 'group', 'aria-label': 'Уровень ДЗ' }, LEVELS.map(l => {
      const tasks = homeworkTasks(lesson, l.id);
      if (!tasks.length) return '';
      const total = Math.round(tasks.reduce((n, t) => n + pts(t), 0) * 10) / 10;
      return h('button', { type: 'button', class: `hw-level hw-${l.id}`, disabled: over, onclick: () => onPick(l.id) },
        h('span', { class: 'hw-level-title' }, levelTitle(lesson, l.id)),
        h('span', { class: 'hw-level-meta' }, `${tasks.length} ${plural(tasks.length, 'задание', 'задания', 'заданий')} · до ${total} б. · ≈ ${HW_MINUTES} мин`),
        h('span', { class: 'hw-level-note' }, l.note));
    })));
}

export function homeworkV4(ctx, startLevel) {
  const { app, lesson, key, discipline, view, back, preview, mountTask, saveDraft, isActive, ownerChanged, evict } = ctx;
  const hwKey = homeworkDraftKey(key);
  let hd = repairHomeworkDraft(app.store.getDraft(hwKey), lesson);
  const saveHd = () => saveDraft(hwKey, hd);
  const head = title => h('header', { class: 'lesson-head' },
    h('a', { href: back, class: 'back' }, preview ? '← Главная' : '← Карта курса'),
    h('div', { class: 'lesson-meta' }, `${preview ? 'Демо' : discipline.toUpperCase()} · ПЗ №${lesson.number} · Домашнее задание`),
    h('h1', { class: 'display lesson-title' }, title));
  const mount = (...nodes) => { view.replaceChildren(...nodes); window.scrollTo(0, 0); };

  function pickLevel(level) {
    hd.level = level;
    if (!Object.keys(hd.answers).length) hd.startedAt = Date.now();
    saveHd();
    drawTasks();
  }
  function drawChooser() {
    mount(head(lesson.title), homeworkChooser(ctx, pickLevel), h('a', { class: 'btn ghost big', href: back }, preview ? 'На главную' : 'К карте курса'));
  }

  function drawTasks() {
    const level = hd.level;
    const tasks = homeworkTasks(lesson, level);
    const used = (bank(ctx).homework(key) || { attempts: 0 }).attempts;
    if (!tasks.length || used >= HW_MAX_ATTEMPTS) { hd.level = null; drawChooser(); return; }
    const errLine = h('p', { class: 'error', role: 'alert' });
    const submitBtn = h('button', { class: 'btn primary big', type: 'button', onclick: submitHw }, preview ? '📤 Сдать ДЗ (демо)' : '📤 Сдать ДЗ');
    const note = h('p', { class: 'hint hw-note' });
    const refresh = () => {
      const left = tasks.filter(t => !hd.locked[t.id]).length;
      submitBtn.disabled = left > 0;
      note.textContent = left > 0 ? `Осталось заданий: ${left}. Проверьте ответ или пропустите задание.` : `Готово к сдаче. Попытка ${used + 1} из ${HW_MAX_ATTEMPTS}.`;
    };
    const cards = tasks.map((t, i) => {
      const body = h('div', { class: 'task-body' });
      const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
      const footer = h('div', { class: 'task-footer' });
      const ui = {
        body, feedback, footer, draft: hd, save: saveHd, isActive: () => isActive(), redraw: drawTasks,
        skipConfirm: 'Пропустить задание? За него будет 0 баллов, вернуться к нему нельзя.',
        onLock: refresh,
        onSkip: () => { body.replaceChildren(); feedback.replaceChildren(); mountTask(t, ui); refresh(); },
      };
      const card = h('div', { class: 'card lec-check hw-task' },
        h('div', { class: 'task-title' }, h('span', {}, `Задание ${i + 1} из ${tasks.length}`), h('span', { class: 'pill pts' }, `${pts(t)} б.`)),
        h('div', { class: 'task-text', html: md(t.text) }), body, feedback, footer);
      return [card, ui, t];
    });
    mount(head(levelTitle(lesson, level)),
      h('p', { class: 'hint' }, `Попытка ${used + 1} из ${HW_MAX_ATTEMPTS} · ≈ ${HW_MINUTES} мин. Засчитывается лучшая попытка.`),
      ...cards.map(c => c[0]),
      submitBtn, note, errLine,
      h('button', { class: 'btn ghost big', type: 'button', onclick: () => { hd.level = null; saveHd(); drawChooser(); } }, '↩ Другой уровень'));
    cards.forEach(([, ui, t]) => mountTask(t, ui));
    refresh();

    async function submitHw() {
      submitBtn.disabled = true;
      errLine.textContent = '';
      if (ownerChanged()) { evict(); return; }
      if (!preview && !app.store.session()) { // сессия пропала: ДЗ остаётся в черновике
        app.flash = 'Войдите, чтобы сдать ДЗ';
        app.go(`/login?next=${encodeURIComponent(`/d/${discipline}/${lesson.number}`)}`);
        return;
      }
      let grade, mark, rec, sub;
      try {
        grade = gradeHomework(lesson, level, hd.answers);
        mark = homeworkMark({ score: grade.score, max: grade.max, level });
        if (!preview) sub = buildHomeworkSubmission({ profile: app.store.profile(), discipline, lesson, level, grade, startedAt: hd.startedAt, answers: hd.answers });
        rec = bank(ctx).recordHomework(key, { score: grade.score, max: grade.max, level, mark, at: new Date().toISOString() });
        app.store.clearDraft(hwKey);
        hd = repairHomeworkDraft(null, lesson);
      } catch (e) {
        submitBtn.disabled = false;
        errLine.textContent = `Не удалось сдать ДЗ: ${(e && e.message) || e}. Попробуйте ещё раз.`;
        return;
      }
      let res = null;
      if (!preview) {
        submitBtn.textContent = 'Отправляем…';
        res = await app.submitter.submit(sub);
        if (!isActive()) return; // сессия истекла или студент ушёл: ДЗ в очереди
      }
      drawResult({ grade, mark, rec, level, res, subId: sub ? sub.id : null });
    }
  }

  function syncText(res) {
    if (preview) return 'Демо: результат никуда не отправляется.';
    if (res.sent) return 'Результат отправлен преподавателю.';
    if (res.rejected !== undefined) return `Сервер не принял ДЗ: ${rejectText(res.rejected)}.`;
    if (res.limit) return `${LIMIT_TEXT}.`;
    if (res.hold) return `${holdText(res.hold)}.`;
    return 'ДЗ сохранено на телефоне и отправится само.';
  }

  function drawResult({ grade, mark, rec, level, res, subId }) {
    const left = HW_MAX_ATTEMPTS - rec.attempts;
    const syncLine = h('p', { class: 'hint', role: res && res.rejected !== undefined ? 'alert' : null }, syncText(res || {}));
    // ДЗ не ушло сразу (сеть, таймаут, ошибка или busy сервера): тот же живой статус повторов, что и у сдачи занятия
    // (очередь, пауза и «Отправить сейчас» общие); по итогу повтора меняется строка syncLine
    const queued = !preview && res && !res.sent && res.rejected === undefined && !res.limit && !res.hold && subId;
    const live = queued ? queuedLive(app, { id: subId, parts: { icon: h('span'), title: h('span'), text: syncLine } }) : null;
    mount(head(levelTitle(lesson, level)), h('div', { class: 'card result hw-result' },
      h('h2', { class: 'v4-label' }, `Результат · попытка ${rec.attempts} из ${HW_MAX_ATTEMPTS}`),
      h('div', { class: 'big-score' }, `${grade.score} / ${grade.max}`),
      h('p', { class: 'muted' }, 'баллов за ДЗ'),
      h('div', { class: `mark-big mark-${mark}` }, MARK_LABEL[mark]),
      level === 'base' && mark === 4 ? h('p', { class: 'hint' }, 'Базовое ДЗ выше «4» не даёт: «5» — за творческое.') : '',
      rec.mark > mark ? h('p', { class: 'hint' }, `Засчитывается лучшая отметка: ${MARK_LABEL[rec.mark]}.`) : '',
      rec.gain ? h('div', { class: 'xp-gain' }, `+${rec.gain} XP`) : h('p', { class: 'hint' }, 'XP начисляются за улучшение результата'),
      syncLine,
      ...(live ? live.nodes : [])),
    left > 0
      ? h('button', { class: 'btn primary big', type: 'button', onclick: drawChooser }, `Ещё попытка (осталось ${left})`)
      : h('p', { class: 'hw-over', role: 'status' }, 'Попытки ДЗ закончились'),
    h('a', { class: 'btn ghost big', href: back }, preview ? 'На главную' : 'К карте курса'));
  }

  if (!hasHomework(lesson)) { mount(head(lesson.title), h('div', { class: 'card' }, h('p', {}, 'У этого занятия нет домашнего задания.')), h('a', { class: 'btn ghost big', href: back }, 'Назад')); return; }
  if (startLevel === 'base' || startLevel === 'adv') pickLevel(startLevel);
  else if (hd.level) drawTasks();
  else drawChooser();
}
