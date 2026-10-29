// Экраны занятия формата v4: вход («где мы»), целеполагание, разминка, критерии, инструктаж, заставка ⭐, итоги с рефлексией и карточка отметки.
// Каждый экран — function <stage>V4(ctx); ctx собирает js/ui/lesson.js:
// { view, lesson, course, acc, draft, save, show, header, tools, grid, mountTask, deadlineNote, preview, plural, practice, switchVariant }
// tools(withLecture, hasSheet, withCriteria) — ряд кнопок; withCriteria добавляет «📋 Критерии» (инструктаж, практика, итоги).
import { h } from '../util/dom.js';
import { md, mdInline, round1 } from '../util/text.js';
import { isLessonOpen } from '../content.js';
import { lessonPlace } from '../content-v4.js';
import { TASK_TYPES } from '../tasks/registry.js';
import { gradeLesson } from '../grading.js';
import { mistakeItems, reflectionFilled, lessonMark, MARK_LABEL, NEXT_MIN, NEXT_MAX } from '../grading-v4.js';
import { hasVariants, allTasks, sortedGlossary } from '../lesson-model.js';
import { sealedNext, sealedResultCard } from './control.js';
import { stageMinutes, warmupTasks, baseTasks, advTasks, isAdv, safetyRules, safetyChecks, practiceV4, MISTAKE_REASONS } from '../lesson-v4.js';
import { CHARACTERS } from '../../content/story.js';

const DEFAULT_QUESTION = 'Что нужно уметь, чтобы решить эту задачу?';

// Карточка «💬 Комментарий преподавателя группе» (myGrades.comments); без текста карточки нет.
// Текст — только текстовым узлом (свободный ввод преподавателя), переносы строк сохраняет CSS (white-space: pre-wrap).
export function groupCommentCard(text) {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t) return '';
  return h('section', { class: 'card group-comment', 'aria-label': 'Комментарий преподавателя группе' },
    h('h2', { class: 'v4-label' }, '💬 Комментарий преподавателя группе'),
    h('p', { class: 'group-comment-text' }, t));
}

// ---------- вход: где мы, зачем в профессии, проблемная ситуация, план ----------
export function introV4(ctx) {
  const { view, lesson, course, acc, draft, save, show, header, grid, deadlineNote, preview } = ctx;
  const who = CHARACTERS[lesson.story.from];
  const place = lessonPlace(course, lesson.number);

  // соседнее ПЗ — ссылка, если оно открыто для студента (так же, как карта курса); иначе обычный текст
  const neighbour = (label, l) => {
    const text = [h('strong', {}, `${label}: `), `ПЗ №${l.n} «${l.title}»`];
    return h('li', {}, acc && isLessonOpen(acc, l.n) ? h('a', { class: 'where-link', href: `#/d/${lesson.discipline}/${l.n}` }, text) : text);
  };
  // блок «Где мы»: у демо без курса — «Демо», у настоящего занятия, которого нет в курсе, — блока нет
  const where = place || preview
    ? h('div', { class: 'card where' },
      h('h2', { class: 'v4-label' }, 'Где мы'),
      place
        ? [
          h('p', { class: 'where-crumbs' }, `${course.code} · Раздел ${place.section.n}. ${place.section.title}`),
          h('p', { class: 'where-crumbs' }, `Тема ${place.topic.id}. ${place.topic.title}`),
          h('p', { class: 'where-pz' }, `ПЗ №${place.index} из ${place.total}`),
          place.prev || place.next
            ? h('ul', { class: 'where-nav' }, place.prev ? neighbour('Было', place.prev) : '', place.next ? neighbour('Дальше', place.next) : '')
            : '',
        ]
        : h('p', { class: 'where-pz' }, 'Демо'))
    : '';

  const career = lesson.career
    ? h('div', { class: 'card career' }, h('h2', { class: 'v4-label' }, 'Зачем в профессии'), h('div', { html: md(lesson.career) }))
    : '';
  const method = lesson.method ? h('p', { class: 'muted small method' }, lesson.method) : '';

  // план этапов: минуты из lesson.minutes (stageMinutes)
  const PLAN = [['Вход', 'intro', 'цель и разминка'], ['Лекция', 'lecture', 'разделы с вопросами'], ['Практика', 'task', 'инструктаж, база и ⭐'], ['Итоги', 'reflect', 'рефлексия']];
  const mins = PLAN.map(([, stage]) => stageMinutes(lesson, stage));
  const total = mins.reduce((a, b) => a + b, 0);
  const plan = h('div', { class: 'card plan' },
    h('h2', { class: 'v4-label' }, 'План занятия'),
    h('ol', { class: 'plan-list' }, PLAN.map(([name, , what], i) => h('li', {},
      h('span', { class: 'plan-name' }, name, h('span', { class: 'plan-what' }, what)),
      mins[i] ? h('span', { class: 'plan-min' }, `≈ ${mins[i]} мин`) : ''))),
    total ? h('p', { class: 'hint plan-total' }, `Всего ≈ ${total} мин`) : '');

  const story = h('div', { class: 'story' }, h('div', { class: 'avatar', 'aria-hidden': 'true' }, who.avatar),
    h('div', { class: 'bubble' }, h('div', { class: 'who' }, `${who.name}, ${who.role}`), h('div', { html: md(lesson.story.text) })));

  const start = h('button', { class: 'btn primary big', type: 'button', onclick: () => { draft.stage = 'goal'; save(); show(); } }, 'Начать →');
  // сданное ранее ПЗ: ДЗ доступно и позже
  const hw = ctx.canHomework ? h('button', { class: 'btn big', type: 'button', onclick: () => ctx.openHomework() }, '📝 Домашнее задание') : '';
  const side = [where, career, method].filter(Boolean);
  view.append(header(), grid('intro', side.length ? side : null, [story, ctx.commentSlot ? ctx.commentSlot() : '', plan, deadlineNote(), start, hw], 'Где мы'));
}

// ---------- целеполагание: отметить умения → разбор → цель и задачи ----------
export function goalV4(ctx) {
  const { view, lesson, draft, save, show, header, grid } = ctx;
  const g = lesson.goal || {};
  const skills = Array.isArray(g.skills) ? g.skills : [];
  const toWarmup = () => { draft.stage = 'warmup'; save(); show(); };
  if (!skills.length) { draft.goal.done = true; toWarmup(); return; } // занятие без целеполагания (валидатор такое не пропускает)

  if (!draft.goal.done) {
    const chosen = new Set(draft.goal.chosen);
    const list = h('div', { class: 'options', role: 'group', 'aria-label': 'Умения' });
    const doneBtn = h('button', { class: 'btn primary big', type: 'button', onclick: () => {
      draft.goal = { chosen: [...chosen].sort((a, b) => a - b), done: true };
      save();
      show();
    } }, 'Готово');
    // focus — индекс кнопки, которая должна остаться в фокусе после перерисовки (иначе клавиатурный фокус пропадает)
    const draw = focus => {
      list.replaceChildren(...skills.map((s, i) => {
        const on = chosen.has(i);
        return h('button', {
          type: 'button', class: `option${on ? ' chosen' : ''}`, 'aria-pressed': String(on),
          onclick: () => {
            if (on) chosen.delete(i); else chosen.add(i);
            draft.goal.chosen = [...chosen].sort((a, b) => a - b);
            save();
            draw(i);
          },
        }, h('span', { class: 'mark' }, on ? '☑' : '☐'), h('span', { html: mdInline(s.text) }));
      }));
      doneBtn.disabled = chosen.size === 0;
      if (Number.isInteger(focus) && list.children[focus]) list.children[focus].focus();
    };
    draw();
    view.append(header(), grid('goal', null, [
      h('h2', { class: 'goal-question' }, g.question || DEFAULT_QUESTION),
      h('p', { class: 'hint' }, 'Отметьте всё, что понадобится. Ответ не оценивается: потом сайт покажет, что действительно нужно.'),
      list, doneBtn,
    ]));
    return;
  }

  const chosen = new Set(draft.goal.chosen);
  const review = h('ul', { class: 'goal-review', 'aria-label': 'Разбор умений' }, skills.map((s, i) => h('li', { class: `goal-skill ${s.need ? 'need' : 'extra'}` },
    h('span', { class: 'goal-mark', 'aria-hidden': 'true' }, s.need ? '✓' : '✗'),
    h('div', { class: 'goal-skill-body' },
      h('div', { class: 'goal-skill-text', html: mdInline(s.text) }),
      h('div', { class: 'goal-skill-tag' }, `${s.need ? 'Нужно' : 'Не нужно'} · ${chosen.has(i) ? 'вы отметили' : 'вы не отметили'}`),
      s.why ? h('p', { class: 'goal-why', html: mdInline(s.why) }) : ''))));
  const tasks = Array.isArray(g.tasks) ? g.tasks : [];
  const card = h('div', { class: 'card goal-card' },
    h('h2', { class: 'v4-label' }, '🎯 Цель занятия'),
    h('p', { class: 'goal-text', html: mdInline(g.goal || '') }),
    tasks.length ? [h('h3', { class: 'goal-tasks-title' }, 'Задачи'), h('ol', { class: 'goal-tasks' }, tasks.map(t => h('li', { html: mdInline(t) })))] : '');
  view.append(header(), grid('goal', [h('h2', { class: 'v4-label' }, 'Что было нужно'), review], [
    card,
    h('button', { class: 'btn primary big', type: 'button', onclick: toWarmup }, 'Дальше → Разминка'),
  ], 'Разбор умений'));
}

// ---------- разминка: задания прошлых ПЗ по одному, без баллов ----------
export function warmupV4(ctx) {
  const { view, lesson, draft, save, show, header, grid, mountTask, preview } = ctx;
  const tasks = warmupTasks(lesson);
  const toLecture = () => { draft.stage = 'lecture'; save(); show(); };
  if (!tasks.length) { toLecture(); return; }
  // текущее — первое незакрытое; если закрыты все, остаётся последнее (с пояснением и «К лекции →»)
  const firstOpen = tasks.findIndex(t => !draft.locked[t.id]);
  const i = firstOpen >= 0 ? firstOpen : tasks.length - 1;
  const t = tasks[i];
  const last = i === tasks.length - 1;
  const pct = Math.round(i / tasks.length * 100);
  const body = h('div', { class: 'task-body' });
  const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
  const footer = h('div', { class: 'task-footer' });

  const repeat = () => {
    if (!Number.isInteger(t.ref)) return '';
    const label = `Повторить: ПЗ №${t.ref}`;
    return preview
      ? h('p', { class: 'warm-repeat muted' }, label)
      : h('a', { class: 'warm-repeat', href: `#/d/${lesson.discipline}/${t.ref}` }, label);
  };
  const next = () => (last ? toLecture() : show());
  view.append(header(), grid('warmup', null, [
    h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Прогресс разминки', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, h('div', { class: 'bar', style: `width:${pct}%` })),
    h('div', { class: 'task-title' }, h('span', {}, `Разминка · задание ${i + 1} из ${tasks.length}`), h('span', { class: 'pill pts' }, 'Разминка · без баллов')),
    i === 0 ? h('p', { class: 'hint' }, 'Несколько вопросов по прошлым занятиям. Баллов нет, ошибаться можно: так мы видим, что повторить.') : '',
    h('div', { class: 'task-text', html: md(t.text) }), body, feedback, footer,
  ]));
  mountTask(t, {
    body, feedback, footer, skipConfirm: 'Пропустить задание? Баллов за разминку нет, но вернуться к нему нельзя.',
    onSkip: next,
    // ссылка «Повторить» — под пояснением, а не в липком подвале: lockedFooter вызывается после showFeedback и при проверке, и при возврате на задание
    lockedFooter: () => {
      feedback.append(repeat());
      return h('button', { class: 'btn primary big', type: 'button', onclick: next }, last ? 'К лекции →' : 'Дальше →');
    },
  });
}

// ---------- критерии: баллы, шкала отметки, правило ⭐, ручные задания ----------
// Экран выбора варианта (над вариантами) и окно «📋 Критерии». variant — выбранный вариант практики (или undefined).
// Суммы баллов в обоих вариантах равны (проверяет валидатор), поэтому до выбора варианта считаем по «телефону»;
// список ручных заданий зависит от варианта и до выбора не показывается.
// суммы баллов заданий [авто, ручные] по оценке пустых ответов (byId — items gradeLesson) и подпись «N б. автопроверка + M б. проверит преподаватель»
const partSums = (tasks, byId) => [false, true].map(manual => round1(tasks.reduce((s, t) => { const it = byId.get(t.id); return s + (it && it.manual === manual ? it.max : 0); }, 0)));
const ptsText = ([auto, manual]) => [auto ? `${auto} б. автопроверка` : '', manual ? `${manual} б. проверит преподаватель` : ''].filter(Boolean).join(' + ') || '0 б.';
const plain = s => String(s || '').replace(/[*_`#>|]/g, '').replace(/\s+/g, ' ').trim();
const snippet = (s, n = 70) => { const p = plain(s); return p.length > n ? `${p.slice(0, n - 1).trimEnd()}…` : p; };

export function criteriaCard(lesson, variant) {
  const withVariants = hasVariants(lesson);
  const v = variant || (withVariants ? 'phone' : undefined);
  const grade = gradeLesson(lesson, {}, v);
  const byId = new Map(grade.items.map(i => [i.id, i]));
  const base = baseTasks(lesson, v);
  const adv = advTasks(lesson, v);
  const parts = { base: partSums(base, byId), adv: partSums(adv, byId) };
  const lectureAuto = round1(grade.max - parts.base[0] - parts.adv[0]);
  const row = (label, value, cls = '') => h('div', { class: `crit-row ${cls}`.trim() }, h('dt', {}, label), h('dd', {}, value));

  const pending = withVariants && !variant; // вариант не выбран: список ручных заданий ещё неизвестен
  const manualList = pending ? [] : [...base.map((t, i) => [t, `Задание ${i + 1}`]), ...adv.map((t, i) => [t, `⭐ ${i + 1}`])]
    .filter(([t]) => TASK_TYPES[t.type] && TASK_TYPES[t.type].manual);
  const total = [grade.max, grade.manualMax];

  return h('div', { class: 'card criteria' },
    h('h2', { class: 'v4-label' }, '📋 Критерии оценки'),
    h('dl', { class: 'crit-sums' },
      lectureAuto > 0 ? row('Вопросы лекции', `${lectureAuto} б. автопроверка`) : '',
      row('Базовая практика', ptsText(parts.base)),
      adv.length ? row('⭐ Повышенный уровень', ptsText(parts.adv)) : '',
      row('Всего', ptsText(total), 'crit-total')),
    h('h3', { class: 'crit-sub' }, 'Шкала отметки'),
    h('ul', { class: 'crit-scale' },
      h('li', {}, h('strong', {}, MARK_LABEL[5]), adv.length ? ' — от 85 % и выполнено ⭐' : ' — от 85 %'),
      h('li', {}, h('strong', {}, MARK_LABEL[4]), adv.length ? ' — от 70 % (или от 85 %, но без ⭐)' : ' — от 70 %'),
      h('li', {}, h('strong', {}, MARK_LABEL[3]), ' — от 50 %'),
      h('li', {}, h('strong', {}, MARK_LABEL[0]), ' — меньше 50 %')),
    h('p', { class: 'hint crit-note' }, 'Процент — это набранные баллы от суммы автоматических и ручных. Инструктаж, разминка и итоги баллов не дают. Сразу после сдачи отметка предварительная: ручные задания ждут проверки преподавателем.'),
    adv.length
      ? h('p', { class: 'crit-adv' }, h('strong', {}, '⭐ нужно для «5». '), 'Задание ⭐ выполнено, если автозадание решено на полный балл или за ручное получено не меньше половины баллов. ⭐ можно пропустить: тогда максимум — «4».')
      : '',
    pending || manualList.length
      ? h('div', { class: 'crit-manual' },
        h('h3', { class: 'crit-sub' }, 'Проверит преподаватель'),
        !pending
          ? h('ul', {}, manualList.map(([t, label]) => h('li', {}, h('strong', {}, `${label}`), ` · ${t.points ?? 1} б. — ${snippet(t.text)}`)))
          : h('p', { class: 'muted small' }, 'Список ручных заданий зависит от варианта практики: он появится после выбора.'))
      : '');
}

// ---------- заставка перед ⭐ ----------
export function advIntroV4(ctx) {
  const { view, lesson, draft, save, show, header, tools, grid, practice } = ctx;
  const adv = practice().filter(isAdv);
  const byId = new Map(gradeLesson(lesson, {}, draft.variant).items.map(i => [i.id, i]));
  const start = () => { draft.advIntro = 'seen'; save(); show(); };
  const skip = () => {
    if (!confirm('Пропустить ⭐ и перейти к итогам? Без выполненного ⭐ отметка «5» недоступна. Вернуться к ⭐ можно до сдачи работы.')) return;
    draft.stage = 'reflect'; // ⭐ остаются без ответа и не закрываются: черновик считает их необязательными
    save();
    show();
  };
  view.append(header(), tools(true, false, true), grid('adv-intro', null, [
    h('div', { class: 'card adv-card' },
      h('h2', { class: 'adv-title' }, '⭐ Повышенный уровень — нужен для «5»'),
      h('p', {}, 'Базовая практика пройдена. Эти задания сложнее и необязательны: без них можно перейти к итогам, но отметка «5» без выполненного ⭐ задания недоступна.'),
      h('p', { class: 'muted' }, `Заданий: ${adv.length} · до ${ptsText(partSums(adv, byId))}`)),
    h('button', { class: 'btn primary big', type: 'button', onclick: start }, 'Начать ⭐'),
    h('button', { class: 'btn ghost big', type: 'button', onclick: skip }, 'Пропустить ⭐ и перейти к итогам'),
  ]));
}

// ---------- инструктаж ОТ/ТБ: правила → проверочные вопросы → допуск к практике ----------
export function safetyV4(ctx) {
  const { view, lesson, draft, save, show, header, tools, grid, mountTask, practice, switchVariant } = ctx;
  const rules = safetyRules(lesson, draft.variant);
  const checks = safetyChecks(lesson);
  // к первому незакрытому заданию практики (ответы на общие задания сохраняются при смене варианта); всё закрыто — к итогам
  const toPractice = () => {
    const first = practice().findIndex(t => !draft.locked[t.id]);
    if (first >= 0) { draft.stage = 'task'; draft.index = first; } else draft.stage = 'reflect';
    save();
    show();
  };
  // занятие без инструктажа: допуск выдаётся сразу
  if (!rules.length && !checks.length) { draft.safetyOk = true; toPractice(); return; }
  // правила этого варианта показаны (у занятия без вариантов — 'all'): при смене варианта новые правила показываем ещё раз
  const seenKey = draft.variant || 'all';
  if (!Array.isArray(draft.safetySeen)) draft.safetySeen = [];
  if (!draft.safetySeen.includes(seenKey)) { draft.safetySeen.push(seenKey); save(); }

  const correct = t => { const r = TASK_TYPES[t.type].check(t, draft.answers[t.id]); return r.score >= r.max; };
  const closed = t => !!draft.locked[t.id] && correct(t);
  const nav = h('div', { class: 'safety-nav' });
  // допуск — только когда ВСЕ вопросы закрыты и отвечены верно; пересчитывается при каждом ответе и при повторе
  const refresh = () => {
    const ok = checks.every(closed);
    if (draft.safetyOk !== ok) { draft.safetyOk = ok; save(); }
    nav.replaceChildren(ok
      ? h('button', { class: 'btn primary big', type: 'button', onclick: toPractice }, 'К практике →')
      : h('p', { class: 'hint' }, 'Практика откроется, когда все ответы будут верными. После ошибки прочитайте пояснение и ответьте ещё раз.'));
  };

  const mountCard = (t, i, card) => {
    const body = h('div', { class: 'task-body' });
    const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
    const footer = h('div', { class: 'task-footer' });
    card.replaceChildren(
      h('div', { class: 'task-title' }, h('span', {}, `Проверочный вопрос ${i + 1} из ${checks.length}`), h('span', { class: 'pill pts' }, 'Инструктаж · без баллов')),
      h('div', { class: 'task-text', html: md(t.text) }), body, feedback, footer);
    mountTask(t, {
      body, feedback, footer, noSkip: true, // «Пропустить» нет: допуск к практике только по верным ответам
      onLock: refresh,
      lockedFooter: () => (correct(t) ? '' : h('button', { class: 'btn primary big', type: 'button', onclick: () => {
        // новая попытка: ответ и закрытие вопроса сбрасываются, число попыток уходит в сдачу
        delete draft.answers[t.id];
        delete draft.locked[t.id];
        draft.safetyAttempts = (Number.isInteger(draft.safetyAttempts) ? draft.safetyAttempts : 0) + 1;
        draft.safetyOk = false;
        save();
        mountCard(t, i, card);
        refresh();
        const f = card.querySelector('.task-body button, .task-body input, .task-body textarea, .task-body select');
        if (f) f.focus();
      } }, 'Ответить ещё раз')),
    });
  };

  const cards = checks.map((t, i) => { const card = h('div', { class: 'card safety-check' }); mountCard(t, i, card); return card; });
  refresh();
  view.append(header(), tools(true, false, true), grid('safety', [
    h('p', { class: 'hint safety-lead' }, 'Прочитайте правила: у каждого есть причина. Затем ответьте на вопросы. Баллов за инструктаж нет.'),
    ...rules.map(r => h('div', { class: 'card safety-rule' },
      h('h2', { class: 'v4-label' }, 'Правило'),
      h('p', { class: 'safety-text', html: mdInline(r.rule) }),
      h('h3', { class: 'v4-label' }, 'Почему'),
      h('p', { class: 'safety-why', html: mdInline(r.why) }))),
  ], [
    checks.length ? h('h2', { class: 'safety-title' }, '✅ Проверьте себя') : '',
    ...cards, nav, switchVariant(),
  ], 'Правила безопасности'));
}

// ---------- отметка (итоги и экран после сдачи) ----------
// grade — результат gradeLesson; title — заголовок карточки. Предварительная, пока есть ручные задания.
export function markCard(grade, title) {
  const m = lessonMark(grade);
  const hasAdv = grade.items.some(i => i.adv);
  const capped = hasAdv && !grade.adv.done && m.pct >= 85;
  return h('div', { class: `card mark-card mark-${m.mark}` },
    h('h2', { class: 'v4-label' }, title),
    h('div', { class: 'mark-big', 'aria-label': `Отметка: ${MARK_LABEL[m.mark]}` }, MARK_LABEL[m.mark]),
    h('p', { class: 'muted mark-pct' }, `${m.pct} % от баллов`, m.preliminary ? ' · предварительно, без ручных заданий' : ''),
    capped ? h('p', { class: 'hint mark-cap' }, '⭐ не выполнено, поэтому отметка не выше «4».') : '',
    m.preliminary ? h('p', { class: 'hint' }, `Ручные задания (до ${grade.manualMax} б.) проверит преподаватель, после этого отметка станет окончательной.`) : '');
}

// ---------- итоги и рефлексия: цель → результат, пройдено, мои ошибки, отметка, «Сдать работу» ----------
// Значения оценки задачи цели в черновике: 2 — «✅ умею», 1 — «🟡 частично», 0 — «⬜ пока нет»
const SELF_LEVELS = [[2, '✅', 'Умею'], [1, '🟡', 'Частично'], [0, '⬜', 'Пока нет']];

export function reflectV4(ctx) {
  const { view, lesson, draft, save, show, header, tools, grid, switchVariant, deadlineNote, preview, openGlossary, submit } = ctx;
  const sealed = !!(ctx.sealed && ctx.sealed()); // контрольная: баллы, ошибки и отметка скрыты до окончания
  const variant = draft.variant;
  const grade = gradeLesson(lesson, draft.answers, variant);
  const mistakes = sealed ? [] : mistakeItems(lesson, draft.answers, variant);
  const refl = draft.reflection;
  const goalTasks = Array.isArray(lesson.goal && lesson.goal.tasks) ? lesson.goal.tasks : [];
  const practice = practiceV4(lesson, variant);
  const lectureIds = (Array.isArray(lesson.lecture) ? lesson.lecture : []).flatMap(sec => (sec && Array.isArray(sec.check) ? sec.check : [])).map(t => t.id);
  const byId = new Map(allTasks(lesson, variant).map(t => [t.id, t]));
  // подпись задания в списке: «Вопрос лекции k», «Задание k», «⭐ k»
  const labelOf = id => {
    const lec = lectureIds.indexOf(id);
    if (lec >= 0) return `Вопрос лекции ${lec + 1}`;
    const base = practice.filter(t => !isAdv(t)).findIndex(t => t.id === id);
    if (base >= 0) return `Задание ${base + 1}`;
    return `⭐ ${practice.filter(isAdv).findIndex(t => t.id === id) + 1}`;
  };

  // --- цель → результат
  const goalCard = h('div', { class: 'card refl-goal' },
    h('h2', { class: 'v4-label' }, '🎯 Цель → результат'),
    h('p', { class: 'hint' }, 'Оцените себя по каждой задаче занятия.'),
    goalTasks.length ? h('ol', { class: 'refl-tasks' }, goalTasks.map((text, i) => {
      const btns = SELF_LEVELS.map(([v, icon, name]) => h('button', { type: 'button', class: `btn small refl-pick${refl.tasks[i] === v ? ' on' : ''}`, 'aria-pressed': String(refl.tasks[i] === v), onclick: () => {
        refl.tasks[i] = v;
        save();
        btns.forEach((x, k) => { const on = SELF_LEVELS[k][0] === v; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
        refreshGate();
      } }, `${icon} ${name}`));
      return h('li', { class: 'refl-task' }, h('div', { class: 'refl-task-text', html: mdInline(text) }), h('div', { class: 'refl-picks', role: 'group', 'aria-label': `Оценка: ${plain(text)}` }, btns));
    })) : h('p', { class: 'muted' }, 'У занятия нет списка задач.'));

  // --- пройдено
  const sumOf = list => list.reduce((acc, it) => [acc[0] + it.score, acc[1] + it.max], [0, 0]).map(x => Math.round(x * 10) / 10);
  const autoItems = grade.items.filter(i => !i.manual);
  const lec = sumOf(autoItems.filter(i => lectureIds.includes(i.id)));
  const base = sumOf(autoItems.filter(i => !lectureIds.includes(i.id) && !i.adv));
  const manualBase = grade.items.filter(i => i.manual && !i.adv).length;
  const advTotal = practice.filter(isAdv);
  const advTried = advTotal.some(t => draft.answers[t.id] !== undefined && draft.answers[t.id] !== null);
  const advText = !advTried ? 'пропущено' : grade.adv.done ? 'выполнено' : 'выполнено не полностью';
  const doneRows = [
    ['Вход', 'цель и разминка'],
    lec[1] ? ['Лекция', `${lec[0]} из ${lec[1]} б.`] : null,
    ['Инструктаж', draft.safetyAttempts ? `допуск получен, повторов: ${draft.safetyAttempts}` : 'допуск получен'],
    ['База', `${base[0]} из ${base[1]} б.${manualBase ? `, ручных заданий: ${manualBase}` : ''}`],
    advTotal.length ? ['⭐ Повышенный уровень', advText] : null,
  ].filter(Boolean);
  const terms = sortedGlossary(lesson).slice(0, 6);
  const doneCard = h('div', { class: 'card refl-done' },
    h('h2', { class: 'v4-label' }, 'Пройдено'),
    h('ul', { class: 'refl-done-list' }, doneRows.map(([name, what]) => h('li', {}, h('span', { class: 'refl-ok', 'aria-hidden': 'true' }, '✓'), h('span', {}, h('strong', {}, name), ` · ${what}`)))),
    terms.length ? [h('h3', { class: 'crit-sub' }, 'Ключевые термины'),
      h('div', { class: 'refl-terms' }, terms.map(g => h('span', { class: 'pill' }, g.term))),
      h('button', { class: 'btn small', type: 'button', onclick: openGlossary }, '📖 Весь словарь')] : '');

  // --- мои ошибки (или «Что помогло?»)
  const counter = h('span', { class: 'counter' });
  const area = h('textarea', { rows: 3, maxlength: String(NEXT_MAX), id: 'refl-next', placeholder: mistakes.length ? 'например: перечитывать условие перед ответом' : 'например: пересказал тему своими словами' });
  area.value = refl.next;
  area.addEventListener('input', () => { refl.next = area.value.slice(0, NEXT_MAX); save(); refreshGate(); });
  const reasonBtns = MISTAKE_REASONS.map((text, i) => h('button', { type: 'button', class: `option${refl.reason === i ? ' chosen' : ''}`, 'aria-pressed': String(refl.reason === i), onclick: () => {
    refl.reason = refl.reason === i ? null : i;
    save();
    reasonBtns.forEach((b, k) => { const on = refl.reason === k; b.classList.toggle('chosen', on); b.setAttribute('aria-pressed', String(on)); b.firstChild.textContent = on ? '◉' : '○'; });
  } }, h('span', { class: 'mark' }, refl.reason === i ? '◉' : '○'), h('span', {}, text)));
  const mistakesCard = mistakes.length
    ? h('div', { class: 'card refl-mistakes' },
      h('h2', { class: 'v4-label' }, 'Мои ошибки'),
      h('ul', { class: 'refl-mlist' }, mistakes.map(it => h('li', {},
        h('span', { class: 'refl-mname' }, h('strong', {}, labelOf(it.id)), ` · ${snippet(byId.get(it.id) && byId.get(it.id).text, 60)}`),
        h('span', { class: 'pill pts' }, `${it.score} из ${it.max} б.`)))),
      h('h3', { class: 'crit-sub' }, 'Что чаще всего подвело?'),
      h('div', { class: 'options', role: 'group', 'aria-label': 'Причина ошибок' }, reasonBtns),
      h('label', { class: 'refl-label', for: 'refl-next' }, 'В следующий раз я…'),
      area, counter)
    : h('div', { class: 'card refl-mistakes' },
      h('h2', { class: 'v4-label' }, 'Мои ошибки'),
      h('p', {}, 'Ошибок в автозаданиях нет. Отличная работа!'),
      h('label', { class: 'refl-label', for: 'refl-next' }, 'Что помогло справиться? (необязательно)'),
      area, counter);

  // --- сдача
  const errLine = h('p', { class: 'error', role: 'alert' });
  const gateNote = h('p', { class: 'hint refl-gate', 'aria-live': 'polite' });
  const submitBtn = h('button', { class: 'btn primary big', type: 'button', onclick: () => {
    if (sealed) sealedNext(refl, NEXT_MIN);
    if (!reflectionFilled(lesson, draft.answers, variant, refl)) return;
    submitBtn.disabled = true;
    draft.stage = 'finish'; // 'finish' у v4 — «сдаётся»: если сдача не дошла до конца, перезагрузка вернёт на этот экран
    save();
    submit(submitBtn, errLine);
  } }, '📤 Сдать работу');
  function refreshGate() {
    const left = refl.tasks.filter(v => v === null).length;
    const need = mistakes.length > 0 && refl.next.trim().length < NEXT_MIN;
    const ok = sealed ? refl.tasks.every(v => v !== null) : reflectionFilled(lesson, draft.answers, variant, refl);
    submitBtn.disabled = !ok;
    gateNote.textContent = ok ? (preview ? 'Демо: работа никуда не отправляется.' : '') : [left ? `Оцените все задачи цели (осталось: ${left}).` : '', need ? `Напишите, что сделаете в следующий раз: от ${NEXT_MIN} символов.` : ''].filter(Boolean).join(' ');
    counter.textContent = mistakes.length ? `${refl.next.trim().length} / ${NEXT_MAX}, нужно от ${NEXT_MIN}` : `${refl.next.trim().length} / ${NEXT_MAX}`;
  }
  refreshGate();

  view.append(header(), tools(true, false, true), grid('reflect', null, [
    goalCard, sealed ? '' : doneCard, sealed ? '' : mistakesCard,
    sealed ? sealedResultCard() : markCard(grade, 'Предварительная отметка'),
    deadlineNote(),
    submitBtn, gateNote, errLine,
    h('button', { class: 'btn ghost big', type: 'button', onclick: () => { draft.stage = 'task'; draft.index = 0; save(); show(); } }, '↩ К заданиям'),
    switchVariant(),
  ]));
}
