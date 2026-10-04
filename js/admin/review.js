import { h } from '../util/dom.js';
import { md, round1 } from '../util/text.js';
import { TASK_TYPES } from '../tasks/registry.js';
import { loadLesson } from '../content.js';
import { allTasks, hasVariants, inferVariant } from '../lesson-model.js';
import { errText } from '../ui/login.js';
import { discCode, select, fmtTime, hashQuery, loading, loadError, emptyBox } from './common.js';
import { workHref } from './journal.js';

const own = (o, k) => o != null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const TYPE_LABEL = {
  single: 'Один ответ', multi: 'Несколько ответов', fill: 'Пропуски', swipe: 'Да/нет', order: 'Порядок', match: 'Соответствие',
  categorize: 'Категории', hotspot: 'Поиск ошибки', 'prompt-builder': 'Конструктор запроса', dilemma: 'Дилемма',
  text: 'Развёрнутый ответ', terminal: 'Терминал', python: 'Python', numeric: 'Число',
};

// ---------- очередь «Проверка» ----------

export async function renderReview(ctx, main) {
  let groups;
  try { groups = await ctx.groups(); } catch (e) {
    if (!ctx.alive() || (e && e.handled)) return;
    main.replaceChildren(loadError(errText(e), () => ctx.rerender()));
    return;
  }
  if (!ctx.alive()) return;
  const qg = ctx.query.get('group') || '';
  const group = groups.indexOf(qg) >= 0 ? qg : '';
  const bar = h('div', { class: 'card admin-tools no-print' }, h('div', { class: 'tools-row' },
    h('label', { class: 'field inline' }, h('span', {}, 'Группа'),
      select([{ value: '', label: 'Все группы' }].concat(groups.map(g => ({ value: g, label: g }))), group, v => ctx.go(hashQuery('/admin/review', { group: v })))),
    h('div', { class: 'tools-count', id: 'review-count' })));
  const body = h('div', {}, loading('Загружаем очередь…'));
  main.replaceChildren(bar, body);
  let d;
  try { d = await ctx.call('adminReviewQueue', { group }); } catch (e) {
    if (!ctx.alive() || (e && e.handled)) return;
    body.replaceChildren(loadError(errText(e), () => ctx.rerender()));
    return;
  }
  if (!ctx.alive()) return;
  const queue = Array.isArray(d.queue) ? d.queue : [];
  bar.querySelector('#review-count').textContent = `Ждут проверки: ${queue.length}`;
  if (!queue.length) { body.replaceChildren(emptyBox('✅ Всё проверено: развёрнутых ответов без оценки нет.')); return; }
  body.replaceChildren(h('ul', { class: 'review-list' }, queue.map(q => h('li', {},
    h('a', { class: 'review-item', href: workHref(q.studentId, q.discipline, q.lesson, { a: q.submissionId, from: 'review' }) },
      h('span', { class: 'review-main' }, h('strong', {}, q.name), h('span', { class: 'muted' }, ` · ${q.group}`)),
      h('span', { class: 'review-sub' }, `${discCode(q.discipline)} · ПЗ ${q.lesson}${q.title ? `. ${q.title}` : ''}`),
      h('span', { class: 'review-meta' }, `${fmtTime(q.time)} · заданий к проверке: ${Array.isArray(q.tasks) ? q.tasks.length : 0}`))))));
}

// ---------- карточка работы ----------

const taskMax = t => (t && t.points != null && Number(t.points) > 0 ? Number(t.points) : 1);

export async function renderWork(ctx, main) {
  const q = ctx.query;
  const studentId = q.get('student') || '';
  const disc = q.get('d') || '';
  const n = Number(q.get('n'));
  const wanted = q.get('a') || '';
  const from = q.get('from') === 'review' ? 'review' : 'journal';
  if (!studentId || !disc || !Number.isInteger(n) || n < 1) {
    main.replaceChildren(emptyBox('Неверная ссылка на работу.'), h('a', { class: 'btn', href: '#/admin/journal' }, '← К журналу'));
    return;
  }
  let sub;
  let lesson = null;
  try {
    const [r, l] = await Promise.all([
      ctx.call('adminSubmission', { studentId, discipline: disc, lesson: n }),
      loadLesson(disc, n).catch(() => null), // файла занятия может не быть — тогда показываем ответы без формулировок
    ]);
    sub = r;
    lesson = l;
  } catch (e) {
    if (!ctx.alive() || (e && e.handled)) return;
    main.replaceChildren(loadError(errText(e), () => ctx.rerender()), h('a', { class: 'btn', href: '#/admin/journal' }, '← К журналу'));
    return;
  }
  if (!ctx.alive()) return;
  const attempts = Array.isArray(sub.attempts) ? sub.attempts : [];
  const st = sub.student || { name: '', group: '' };
  const backHref = from === 'review' ? '#/admin/review' : `#${hashQuery('/admin/journal', { group: st.group, d: disc })}`;
  const head = h('div', { class: 'card' },
    h('a', { class: 'back', href: backHref }, from === 'review' ? '← К очереди проверки' : '← К журналу'),
    h('h2', {}, st.name),
    h('p', { class: 'muted' }, `${st.group} · ${discCode(disc)} · ПЗ ${n}${sub.title ? `. ${sub.title}` : (lesson && lesson.title ? `. ${lesson.title}` : '')}`));
  if (!attempts.length) { main.replaceChildren(head, emptyBox('Сдач этого занятия у студента нет.')); return; }

  let cur = attempts.findIndex(a => a.id === wanted);
  if (cur < 0) cur = attempts.length - 1;
  const chips = h('div', { class: 'attempts', role: 'group', 'aria-label': 'Попытки' });
  const summary = h('div', { class: 'card work-summary', 'aria-live': 'polite' });
  const tasksBox = h('div', { class: 'work-tasks' });
  main.replaceChildren(head, chips, summary, tasksBox);

  function draw() {
    const a = attempts[cur];
    const data = a.data || {};
    const answers = data.answers && typeof data.answers === 'object' ? data.answers : {};
    const texts = data.texts && typeof data.texts === 'object' ? data.texts : {};
    const items = Array.isArray(data.items) ? data.items : [];
    // задания того варианта, который сдал студент; у старой сдачи занятия с вариантами варианта нет — определяем по id заданий
    // (у занятия без вариантов вся практика, как раньше)
    const variant = a.variant === 'pc' || a.variant === 'phone' ? a.variant
      : hasVariants(lesson) ? inferVariant(lesson, [...items.map(it => String(it.id)), ...Object.keys(answers)]) : undefined;
    const tasks = allTasks(lesson, variant);
    chips.replaceChildren(...attempts.map((x, i) => h('button', {
      class: `btn small chip${i === cur ? ' primary' : ''}`, type: 'button', 'aria-pressed': String(i === cur),
      onclick: () => { cur = i; draw(); },
    }, `Попытка ${i + 1}`)));
    const itemOf = id => items.find(it => String(it.id) === String(id)) || null;
    const grades = a.grades && typeof a.grades === 'object' ? a.grades : (a.grades = {});

    // без файла занятия показываем задания по данным сдачи
    const list = tasks.length ? tasks : items.map(it => ({ id: String(it.id), type: it.type, points: it.max, _bare: true }));
    const isManual = t => { const ty = TASK_TYPES[t.type]; const it = itemOf(t.id); return ty ? !!ty.manual : !!(it && it.manual); };
    const manualList = list.filter(isManual);
    // максимум ручных баллов — из сдачи (как посчитал клиент студента), без него — по заданиям занятия
    const lessonManualMax = round1(manualList.reduce((s, t) => s + taskMax(t), 0));
    const manualMaxTotal = Number(a.manualMax) > 0 ? round1(Number(a.manualMax)) : lessonManualMax;
    const totalLine = h('div', { class: 'work-total' });
    const redrawTotal = () => {
      const got = manualList.filter(t => own(grades, t.id));
      const sum = round1(got.reduce((s, t) => s + Number(grades[t.id].score || 0), 0));
      const pending = manualList.length - got.length;
      totalLine.replaceChildren(
        h('strong', {}, `Итог за работу: ${round1(Number(a.score) + sum)} из ${round1(Number(a.max) + manualMaxTotal)}`),
        ` (авто ${a.score} из ${a.max}${manualList.length ? `, вручную ${sum} из ${manualMaxTotal}` : ''})`,
        pending ? h('div', { class: 'pending-note' }, `⏳ Не оценено вручную: ${pending}`) : '');
    };
    summary.replaceChildren(
      h('div', {}, `Попытка ${cur + 1} из ${attempts.length} · ${fmtTime(a.time)}${a.durationMin ? ` · ${a.durationMin} мин` : ''}`,
        a.late ? h('span', { class: 'late-badge' }, '⏰ после срока') : '',
        variant ? h('span', { class: 'variant-badge' }, variant === 'pc' ? ' · 💻 ПК-вариант' : ' · 📱 телефон') : ''),
      h('div', {}, `Автобаллы: ${a.score} из ${a.max}`),
      totalLine);
    redrawTotal();

    tasksBox.replaceChildren(...list.map((t, i) => {
      const ty = TASK_TYPES[t.type];
      const it = itemOf(t.id);
      const manual = isManual(t);
      const max = taskMax(t);
      const art = h('article', { class: 'work-task card', 'data-task': t.id });
      const answerBox = h('div', { class: 'work-answer' });
      const raw = own(answers, t.id) ? answers[t.id] : undefined;
      if (raw === null) answerBox.append(h('p', { class: 'muted' }, 'Задание пропущено.'));
      else if (raw === undefined) {
        if (own(texts, t.id)) answerBox.append(h('pre', { class: 'work-text' }, String(texts[t.id])));
        else answerBox.append(h('p', { class: 'muted' }, 'Ответа нет в данных сдачи.'));
      } else if (ty && !t._bare) {
        try { ty.render(t, answerBox, { answer: raw, locked: true, onChange: () => {} }); } catch (e) {
          console.error(e);
          answerBox.replaceChildren(h('p', { class: 'muted' }, 'Не удалось показать ответ в исходном виде.'),
            own(texts, t.id) ? h('pre', { class: 'work-text' }, String(texts[t.id])) : '');
        }
      } else if (own(texts, t.id)) answerBox.append(h('pre', { class: 'work-text' }, String(texts[t.id])));
      else answerBox.append(h('pre', { class: 'work-text' }, JSON.stringify(raw, null, 1)));

      // текст развёрнутого ответа (для дилеммы — «Выборы… Обоснование…») показываем и под заданием
      if (manual && raw !== undefined && raw !== null && ty && !t._bare && own(texts, t.id)) {
        answerBox.append(h('div', { class: 'work-text-label' }, 'Текст ответа:'), h('pre', { class: 'work-text' }, String(texts[t.id])));
      }

      let auto = '';
      if (!manual) {
        let s = null;
        let m = null;
        if (it) { s = Number(it.score); m = Number(it.max); } else if (ty && raw !== undefined && raw !== null && !t._bare) { try { const r = ty.check(t, raw); s = r.score; m = r.max; } catch { /* пропускаем */ } }
        auto = s === null ? '' : h('p', { class: `auto-score ${s >= m ? 'right' : s > 0 ? 'partial' : 'wrong'}` }, `Автоматически: ${s} из ${m} б.`);
      }
      art.append(
        h('div', { class: 'work-task-head' }, h('strong', {}, `Задание ${i + 1}`), h('span', { class: 'muted' }, ` · ${TYPE_LABEL[t.type] || t.type}${manual ? ' · ручная проверка' : ''} · ${max} б.`)),
        t.text ? h('div', { class: 'task-text', html: md(t.text) }) : '', // формулировка из файла занятия
        answerBox, auto, manual ? gradeForm(t, a, max, grades, redrawTotal) : '');
      return art;
    }));
  }

  function gradeForm(t, a, max, grades, onSaved) {
    const g = own(grades, t.id) ? grades[t.id] : null;
    const score = h('input', { name: `score-${t.id}`, type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': `Баллы, от 0 до ${max}`, value: g ? String(g.score) : '' });
    const comment = h('textarea', { name: `comment-${t.id}`, rows: 3, maxlength: '2000', 'aria-label': 'Комментарий студенту' }, g ? (g.comment || '') : '');
    const msg = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' }, g ? 'Оценка выставлена' : 'Ещё не оценено');
    const err = h('p', { class: 'error', role: 'alert' });
    const btn = h('button', { class: 'btn primary', type: 'button' }, 'Сохранить');
    btn.addEventListener('click', async () => {
      err.textContent = '';
      const raw = score.value.trim().replace(',', '.');
      const v = raw === '' ? NaN : Number(raw);
      if (!isFinite(v) || v < 0 || v > max) { err.textContent = `Баллы — число от 0 до ${max}`; return; }
      btn.disabled = true;
      msg.textContent = 'Сохраняем…';
      try {
        await ctx.call('adminGrade', { submissionId: a.id, taskId: t.id, score: v, comment: comment.value });
        if (!ctx.alive()) return;
        grades[t.id] = { score: round1(v), comment: comment.value };
        msg.textContent = `✓ Сохранено: ${round1(v)} из ${max}`;
        onSaved();
      } catch (e) { msg.textContent = own(grades, t.id) ? 'Оценка выставлена' : 'Ещё не оценено'; ctx.fail(e, err); } finally { btn.disabled = false; }
    });
    return h('div', { class: 'grade-form' },
      h('label', { class: 'field' }, h('span', {}, `Баллы (0..${max})`), score),
      h('label', { class: 'field' }, h('span', {}, 'Комментарий'), comment),
      err, msg, btn);
  }

  draw();
}
