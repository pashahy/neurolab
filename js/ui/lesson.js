import { h, add, celebrate } from '../util/dom.js';
import { md, mdInline } from '../util/text.js';
import { TASK_TYPES } from '../tasks/registry.js';
import { submissionParts } from '../grading.js';
import { v4Submission } from '../grading-v4.js';
import { isV4 } from '../lesson-v4-model.js';
import { isV2, allTasks, hasVariants, practiceTasks, wordCount, readMinutes, sortedGlossary } from '../lesson-model.js';
import { loadCourse, loadLesson, isLessonOpen, courseAccess, deadlineInfo, teacherGrade } from '../content.js';
import { lessonKey } from '../store.js';
import { identityChanged } from '../nav.js';
import { repairDraft, answerWriter } from '../draft.js';
import { xpGain, levelFor, newBadges, BADGES } from '../gamification.js';
import { buildSubmission, LIMIT_TEXT, holdText, rejectText } from '../submit.js';
import { queuedLive } from './queued-live.js';
import { uploadFile } from '../upload.js';
import { CHARACTERS } from '../../content/story.js';
import { stageLabel, isAdv, practiceV4, advIntroNeeded, hasUnseenRules, hasHomework } from '../lesson-v4.js';
import { introV4, goalV4, warmupV4, safetyV4, reflectV4, criteriaCard, advIntroV4, markCard, groupCommentCard } from './lesson-v4.js';
import { homeworkV4, homeworkChooser } from './homework.js';
import { startLivePulse, stageOf, scoreOf } from '../live-pulse.js';

export async function renderLesson(app, discipline, n) {
  const my = app.routeId;
  const preview = discipline === 'demo' || discipline === 'demo2' || discipline === 'demo4';
  const back = preview ? '#/' : `#/d/${discipline}`;
  app.root.append(h('p', { class: 'loading' }, 'Загрузка занятия…'));
  let course = null;
  let lesson;
  try {
    if (preview) lesson = (await import(discipline === 'demo4' ? '../../content/demo-v4.js' : discipline === 'demo2' ? '../../content/demo-v2.js' : '../../content/demo.js')).default;
    else { course = await loadCourse(discipline); lesson = await loadLesson(discipline, n); }
  } catch {
    if (app.routeId !== my) return;
    app.root.replaceChildren(h('div', { class: 'card' }, h('p', {}, 'Не удалось загрузить занятие. Проверьте интернет и попробуйте ещё раз.'), h('a', { class: 'btn', href: back }, '← Назад')));
    return;
  }
  if (app.routeId !== my) return;
  const acc = preview ? null : courseAccess(app.store.me(), discipline);
  if (!preview && !acc.visible) {
    app.root.replaceChildren(h('div', { class: 'card' }, h('p', {}, '🔒 Эта дисциплина недоступна для вашей группы.'), h('a', { class: 'btn', href: '#/' }, '← На главную')));
    return;
  }
  if (!preview && !isLessonOpen(acc, n)) {
    app.root.replaceChildren(h('div', { class: 'card' }, h('p', {}, '🔒 Это занятие пока закрыто преподавателем.'), h('a', { class: 'btn', href: back }, '← К карте курса')));
    return;
  }
  const deadline = preview ? null : deadlineInfo(acc, n);
  // блок оценки преподавателя для ручного задания; оценки берём из кэша (обновляются при входе и на карте курса)
  const teacherBlock = t => {
    if (preview) return '';
    const g = teacherGrade(app.store.grades(), lessonKey(discipline, n), t.id);
    if (!g) return '';
    return h('div', { class: 'fb teacher' },
      h('strong', {}, `Оценка преподавателя: ${g.score} из ${t.points ?? 1}`),
      g.comment ? h('p', { class: 'teacher-comment' }, g.comment) : '');
  };
  const deadlineNote = () => {
    if (!deadline) return '';
    return deadline.overdue
      ? h('p', { class: 'hint deadline overdue' }, '⏰ Срок сдачи прошёл. Работу можно сдать — она будет с отметкой «после срока».')
      : h('p', { class: 'hint deadline' }, `⏰ Срок сдачи: до ${deadline.label}`);
  };

  const key = preview ? `${discipline}/0` : lessonKey(discipline, n);
  // Комментарий преподавателя группе (myGrades.comments): сначала из кэша api, затем фоновое обновление (не чаще раза в минуту).
  // Слот пуст, пока комментария нет (CSS .gc-slot:empty скрывает его), поэтому вёрстка занятия без комментария не меняется.
  const commentSlot = () => {
    const slot = h('div', { class: 'gc-slot' });
    if (preview || !app.api.groupComments) return slot;
    const draw = c => slot.replaceChildren(groupCommentCard(c[key]));
    draw(app.api.groupComments());
    app.api.myComments(60000).then(c => { if (app.routeId === my) draw(c); }, () => { /* нет связи: останется то, что уже показано */ });
    return slot;
  };
  const draft = repairDraft(app.store.getDraft(key), lesson);
  // Владелец занятия — студент, под которым оно открыто. Если в другой вкладке сменили аккаунт, чужие данные не пишем и не отправляем.
  const owner = preview ? null : app.store.studentId();
  const ownerChanged = () => !preview && identityChanged(owner, app.store.studentId());
  let evicted = false;
  let closed = false; // черновик сдан или очищен: поздние ответы (загрузка файла) больше не пишутся
  const evict = () => {
    if (evicted) return;
    evicted = true;
    app.flash = 'Вы вышли из аккаунта в другой вкладке. Войдите снова.';
    app.go('/login');
  };
  const saveDraft = (k, d) => { if (ownerChanged()) { evict(); return; } app.store.setDraft(k, d); };
  const save = () => saveDraft(key, draft);
  const view = h('div', { class: 'lesson' });
  app.root.replaceChildren(view);
  const who = CHARACTERS[lesson.story.from];
  const v2 = isV2(lesson);
  const v4 = isV4(lesson);
  // занятие с вариантами практики (📱 телефон / 💻 ПК): после лекции студент выбирает вариант (стадия 'choose')
  const withVariants = v2 && hasVariants(lesson);
  // задания практики выбранного варианта (у занятия без вариантов — вся практика)
  // у v4 порядок такой: базовые задания, затем ⭐
  const practiceOf = v => (v4 ? practiceV4(lesson, v) : practiceTasks(lesson, v));
  const practice = () => practiceOf(draft.variant);
  const VARIANTS = {
    phone: { icon: '📱', title: 'С телефона', desc: 'Всё прямо на сайте, с любого устройства.', short: 'с телефона' },
    pc: { icon: '💻', title: 'За компьютером', desc: 'Работа в программах: код, нейросети, файлы.', short: 'за компьютером' },
  };

  const header = () => h('header', { class: 'lesson-head' },
    h('a', { href: back, class: 'back' }, preview ? '← Главная' : '← Карта курса'),
    h('div', { class: 'lesson-meta' }, `${preview ? 'Демо' : course.code} · ПЗ №${lesson.number} · Тема ${lesson.topic}`),
    h('h1', { class: 'display lesson-title' }, lesson.title),
    v4 ? h('div', { class: 'lesson-stage' }, h('span', { class: 'pill' }, stageLabel(lesson, draft.stage, { section: draft.section, adv: isAdv(practice()[draft.index]) }))) : '');

  // Раскладка шага занятия: aside — справочная колонка, main — текущий шаг.
  // От 1100 px это две колонки (см. css/app.css), ниже — одна колонка в порядке aside → main.
  // kind — стадия ('lecture', 'practice', …): от неё зависит, что прилипает и что скрыто на телефоне.
  const grid = (kind, aside, main, asideLabel) => {
    view.classList.add('split');
    return h('div', { class: `lesson-grid ${kind}${aside ? '' : ' solo'}` },
      aside ? h('aside', { class: 'lesson-aside', 'aria-label': asideLabel }, aside) : '',
      h('section', { class: 'lesson-main' }, main));
  };

  // контекст экранов v4 (./lesson-v4.js): они вызываются из show() и task()
  const v4ctx = () => ({
    view, lesson, course, acc, draft, save, show, header, tools, grid, mountTask, deadlineNote, preview, plural, practice, switchVariant,
    openGlossary, submit: submitV4, openHomework, commentSlot,
    // ДЗ (./homework.js): свой черновик, лимит попыток — в store
    app, key, discipline, back, saveDraft, ownerChanged, evict, isActive: () => app.routeId === my && !evicted,
    // тот, кто уже сдавал это ПЗ, видит на входе кнопку «📝 Домашнее задание»
    canHomework: hasHomework(lesson) && (preview ? false : app.store.progress(key) != null),
  });
  const openHomework = level => homeworkV4(v4ctx(), level);

  function show() {
    view.replaceChildren();
    view.className = 'lesson';
    window.scrollTo(0, 0);
    // практика без выбранного варианта невозможна — сначала выбор
    if (withVariants && !draft.variant && (draft.stage === 'task' || draft.stage === 'finish' || draft.stage === 'safety')) draft.stage = 'choose';
    if (v4) {
      // вход, цель, разминка, инструктаж и заставка ⭐ — в ./lesson-v4.js; лекция, выбор варианта, практика и итоги — здесь
      const screens = {
        intro: () => introV4(v4ctx()), goal: () => goalV4(v4ctx()), warmup: () => warmupV4(v4ctx()),
        lecture, choose, safety: () => safetyV4(v4ctx()), task, reflect: () => reflectV4(v4ctx()),
        finish: () => reflectV4(v4ctx()), // у v4 'finish' — «сдаётся»; если сдача не дошла до конца, после перезагрузки снова итоги с кнопкой «Сдать работу»
      };
      (screens[draft.stage] || screens.intro)();
      return;
    }
    ({ intro, lecture, choose, task, finish }[draft.stage] || intro)();
  }

  // ---------- окно поверх занятия (словарь, чтение лекции) ----------
  function openModal(title, content) {
    const prev = document.activeElement;
    const onKey = e => {
      if (!overlay.isConnected) { document.removeEventListener('keydown', onKey); return; }
      if (e.key === 'Escape') close();
    };
    function close() {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      if (prev && prev.focus && prev.isConnected) prev.focus();
    }
    const closeBtn = h('button', { class: 'btn small modal-close', type: 'button', 'aria-label': 'Закрыть', onclick: close }, '✕');
    const bodyEl = h('div', { class: 'modal-body' }, content);
    const overlay = h('div', { class: 'modal-overlay', onclick: e => { if (e.target === overlay) close(); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { class: 'modal-head' }, h('h2', {}, title), closeBtn), bodyEl));
    document.addEventListener('keydown', onKey);
    view.append(overlay);
    closeBtn.focus();
    return bodyEl;
  }

  function openGlossary() {
    const items = sortedGlossary(lesson);
    openModal('📖 Термины', items.length
      ? h('dl', { class: 'glossary' }, items.flatMap(g => [h('dt', {}, g.term), h('dd', { html: mdInline(g.def) })]))
      : h('p', { class: 'muted' }, 'В этом занятии нет словаря.'));
  }

  // чтение лекции без вопросов (во время практики)
  function openLectureReader() {
    const secs = lesson.lecture;
    let cur = 0;
    const box = h('div');
    let bodyEl;
    const draw = () => box.replaceChildren(
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Разделы лекции' }, secs.map((s, i) => h('button', {
        type: 'button', class: `btn small${i === cur ? ' on' : ''}`, 'aria-pressed': String(i === cur), 'aria-label': `Раздел ${i + 1}: ${s.title}`,
        onclick: () => { cur = i; draw(); if (bodyEl) bodyEl.scrollTop = 0; },
      }, String(i + 1)))),
      h('h2', { class: 'lec-title' }, `${cur + 1}. ${secs[cur].title}`),
      h('div', { class: 'lecture-body', html: md(secs[cur].body) }));
    draw();
    bodyEl = openModal('📚 Лекция', box);
  }

  // окно «📋 Критерии» (v4): баллы, шкала отметки, правило ⭐ для выбранного варианта
  const openCriteria = () => openModal('📋 Критерии', criteriaCard(lesson, draft.variant));

  // hasSheet: рядом есть шпаргалка — на широком экране она заменяет «Термины» и «Лекция»; withCriteria (v4) — кнопка «📋 Критерии», она остаётся
  const tools = (withLecture, hasSheet, withCriteria) => h('div', { class: `lesson-tools${hasSheet ? ' has-sheet' : ''}${withCriteria ? ' has-crit' : ''}` },
    h('button', { class: 'btn small', type: 'button', onclick: openGlossary }, '📖 Термины'),
    withLecture ? h('button', { class: 'btn small', type: 'button', onclick: openLectureReader }, '📚 Лекция') : '',
    withCriteria ? h('button', { class: 'btn small tool-crit', type: 'button', onclick: openCriteria }, '📋 Критерии') : '');

  // шпаргалка практики для широкого экрана: разделы лекции (раскрываются по нажатию) и словарь; у v1 — теория
  function buildSheet() {
    if (!v2) return lesson.theory ? [h('h2', { class: 'sheet-title' }, 'Шпаргалка'), h('div', { class: 'lecture-body', html: md(lesson.theory) })] : null;
    const secs = Array.isArray(lesson.lecture) ? lesson.lecture : [];
    const gl = sortedGlossary(lesson);
    if (!secs.length && !gl.length) return null;
    return [
      h('h2', { class: 'sheet-title' }, 'Шпаргалка'),
      secs.length ? h('div', { class: 'sheet-secs' }, secs.map((s, i) => h('details', { class: 'sheet-sec' },
        h('summary', {}, h('span', { class: 'sheet-num', 'aria-hidden': 'true' }, String(i + 1)), h('span', { class: 'sheet-name' }, s.title)),
        h('div', { class: 'lecture-body', html: md(s.body) })))) : '',
      gl.length ? [h('h3', { class: 'sheet-sub' }, 'Термины'),
        h('dl', { class: 'glossary' }, gl.flatMap(g => [h('dt', {}, g.term), h('dd', { html: mdInline(g.def) })]))] : '',
    ];
  }

  // шпаргалку строим один раз: при переходе между заданиями раскрытые разделы остаются раскрытыми
  let sheetCache;
  const cheatSheet = () => {
    if (sheetCache === undefined) { const c = buildSheet(); sheetCache = c ? h('div', { class: 'sheet' }, c) : null; }
    return sheetCache;
  };

  const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
  const tasksLabel = v => { const c = practiceTasks(lesson, v).length; return `${c} ${plural(c, 'задание', 'задания', 'заданий')}`; };
  // куда ведёт «К практике»: у занятия с вариантами без выбранного варианта — на экран выбора;
  // у v4 без вариантов экран 'choose' — это критерии с кнопкой «К инструктажу →»
  const practiceStage = () => (withVariants && !draft.variant ? 'choose' : v4 && !draft.safetyOk ? (withVariants ? 'safety' : 'choose') : 'task');

  function intro() {
    if (v2) {
      const m = lesson.minutes || {};
      const secs = lesson.lecture;
      add(view, header(),
        h('div', { class: 'story' }, h('div', { class: 'avatar', 'aria-hidden': 'true' }, who.avatar),
          h('div', { class: 'bubble' }, h('div', { class: 'who' }, `${who.name}, ${who.role}`), h('div', { html: md(lesson.story.text) }))),
        commentSlot(),
        h('div', { class: 'card' },
          h('p', {}, `📘 Лекция: ${secs.length} ${plural(secs.length, 'раздел', 'раздела', 'разделов')}, примерно ${m.theory ?? 25} минут. После каждого раздела — контрольные вопросы.`),
          withVariants
            ? h('p', {}, `🛠 Практика: примерно ${m.practice ?? 50} минут, на выбор ${VARIANTS.phone.short} (${tasksLabel('phone')}) или ${VARIANTS.pc.short} (${tasksLabel('pc')}).`)
            : h('p', {}, `🛠 Практика: ${lesson.tasks.length} заданий, примерно ${m.practice ?? 50} минут.`)),
        deadlineNote(),
        h('button', { class: 'btn primary big', type: 'button', onclick: () => { draft.stage = 'lecture'; save(); show(); } }, 'Начать лекцию →'));
      return;
    }
    add(view, header(),
      h('div', { class: 'story' }, h('div', { class: 'avatar', 'aria-hidden': 'true' }, who.avatar),
        h('div', { class: 'bubble' }, h('div', { class: 'who' }, `${who.name}, ${who.role}`), h('div', { html: md(lesson.story.text) }))),
      commentSlot(),
      h('details', { class: 'theory card', open: true }, h('summary', {}, '📘 Шпаргалка'), h('div', { html: md(lesson.theory) })),
      h('p', { class: 'hint' }, `Заданий: ${lesson.tasks.length} · примерно ${lesson.minutes ?? 35} минут`),
      deadlineNote(),
      h('button', { class: 'btn primary big', type: 'button', onclick: () => { draft.stage = 'task'; save(); show(); } }, 'Начать →'));
  }

  // Общая логика задания (практика и контрольные вопросы лекции): отрисовка, «Проверить», «Пропустить», обратная связь.
  // ui: { body, feedback, footer, lockedFooter?() — содержимое подвала после проверки, onLock(), onSkip(), skipConfirm?, noSkip? — без «Пропустить» }
  // ui.draft / ui.save / ui.isActive / ui.redraw — необязательно: ДЗ v4 хранит ответы в своём черновике (ключ "<ПЗ>#hw")
  function mountTask(t, ui) {
    const type = TASK_TYPES[t.type];
    const D = ui.draft || draft;
    const S = ui.save || save;
    const active = ui.isActive || (() => !closed && app.routeId === my);
    const redraw = ui.redraw || show;
    // задание занято (идёт загрузка файла): «Сохранить ответ» и «Пропустить» недоступны
    let busy = false;
    // для задания file: загрузка в хранилище от имени студента; в демо-занятии загрузки нет
    const extra = {
      demo: preview,
      store: preview ? null : app.store, // для «Открыть в песочнице» в заданиях python/terminal
      setBusy: b => { busy = !!b; if (!D.locked[t.id]) drawFooter(); },
      upload: preview ? null : file => uploadFile(app.api, { discipline, lesson: lesson.number, taskId: t.id, file, accept: t.accept, maxMb: t.maxMb }, (...a) => fetch(...a)),
    };
    const { body, feedback, footer } = ui;
    const showFeedback = r => {
      if (type.manual && D.answers[t.id] === null) {
        feedback.replaceChildren(h('div', { class: 'fb wrong' }, h('strong', {}, 'Задание пропущено'), h('p', {}, 'За него 0 баллов.')));
        return;
      }
      if (type.manual) {
        feedback.replaceChildren(h('div', { class: 'fb manual' }, h('strong', {}, '📨 Ответ сохранён'), h('p', {}, 'Его проверит преподаватель после сдачи работы.'), t.explain ? h('div', { html: md(t.explain) }) : ''), teacherBlock(t));
        return;
      }
      const cls = r.score >= r.max ? 'right' : r.score > 0 ? 'partial' : 'wrong';
      feedback.replaceChildren(h('div', { class: `fb ${cls}` },
        h('strong', {}, { right: '✓ Отлично!', partial: '◐ Частично верно', wrong: '✗ Не совсем' }[cls]), ' ',
        h('span', { class: 'fb-score' }, `${r.score} из ${r.max} б.`),
        t.explain ? h('div', { html: md(t.explain) }) : ''));
      if (cls === 'right') celebrate(feedback);
    };
    function lock() {
      if (busy) return;
      D.locked[t.id] = true;
      S();
      body.replaceChildren();
      type.render(t, body, { ...extra, answer: D.answers[t.id], onChange: () => {}, locked: true });
      showFeedback(type.check(t, D.answers[t.id]));
      drawFooter();
      if (ui.onLock) ui.onLock();
    }
    function skip() {
      if (busy || ui.noSkip) return;
      if (!confirm(ui.skipConfirm || 'Пропустить задание? За него будет 0 баллов, вернуться к нему нельзя.')) return;
      if (!type.manual || D.answers[t.id] === undefined) D.answers[t.id] = null;
      D.locked[t.id] = true;
      S();
      ui.onSkip();
    }
    function drawFooter() {
      if (D.locked[t.id]) { footer.replaceChildren(ui.lockedFooter ? ui.lockedFooter() : ''); return; }
      footer.replaceChildren(
        h('button', { class: 'btn primary big', type: 'button', disabled: busy || !type.ready(t, D.answers[t.id]), onclick: lock }, type.manual ? 'Сохранить ответ' : 'Проверить'),
        ui.noSkip ? '' : h('button', { class: 'link-btn', type: 'button', disabled: busy, onclick: skip }, 'Пропустить задание'));
    }
    const locked = !!D.locked[t.id];
    // ответ может прийти после сохранения/пропуска задания, сдачи работы или ухода с экрана — тогда он не пишется
    const onChange = answerWriter(D, t.id, { isActive: active, onWrite: () => { S(); drawFooter(); } });
    try {
      type.render(t, body, { ...extra, answer: D.answers[t.id], locked, onChange: locked ? () => {} : onChange });
      if (locked) showFeedback(type.check(t, D.answers[t.id]));
      drawFooter();
    } catch (e) {
      // устаревший ответ (занятие изменили) — сбрасываем его; без ответа ошибку не прячем, чтобы не зациклиться
      if (D.answers[t.id] === undefined && !D.locked[t.id]) throw e;
      console.error(e);
      delete D.answers[t.id];
      delete D.locked[t.id];
      S();
      redraw();
    }
  }

  // ---------- лекция (v2): один раздел за раз, затем его контрольные вопросы ----------
  function lecture() {
    const secs = lesson.lecture;
    const N = secs.length;
    if (!N) { draft.stage = practiceStage(); save(); show(); return; }
    const k = draft.section;
    const s = secs[k];
    const checks = Array.isArray(s.check) ? s.check : [];
    const minutes = readMinutes(wordCount(s.body));
    const bar = h('div', { class: 'bar' });
    const progress = h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Прогресс лекции', 'aria-valuemin': '0', 'aria-valuemax': '100' }, bar);
    const checksBox = h('div', { class: 'lec-checks' });
    const nav = h('div', { class: 'lec-nav' });
    const doneCount = () => checks.filter(c => draft.locked[c.id]).length;
    const allDone = () => doneCount() === checks.length;
    const refresh = () => {
      const pct = Math.round((k + (checks.length ? doneCount() / checks.length : 1)) / N * 100);
      bar.style.width = `${pct}%`;
      progress.setAttribute('aria-valuenow', String(pct));
      nav.replaceChildren(
        k > 0 ? h('button', { class: 'btn ghost big', type: 'button', onclick: () => go(k - 1) }, `← Назад к разделу ${k}`) : '',
        h('button', { class: 'btn primary big', type: 'button', disabled: !allDone(), onclick: () => (k === N - 1 ? toPractice() : go(k + 1)) }, k === N - 1 ? 'К практике →' : 'Дальше →'),
        allDone() ? '' : h('p', { class: 'hint' }, 'Ответьте на контрольные вопросы или пропустите их — тогда можно идти дальше.'));
    };
    const go = i => { draft.section = i; save(); show(); };
    const toPractice = () => { draft.stage = practiceStage(); save(); show(); };

    let shown = 0;
    function mountCard(i) {
      const t = checks[i];
      const body = h('div', { class: 'task-body' });
      const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
      const footer = h('div', { class: 'task-footer' });
      const card = h('div', { class: 'card lec-check' },
        h('div', { class: 'task-title' }, h('span', {}, `Контрольный вопрос ${i + 1} из ${checks.length}`), h('span', { class: 'pill pts' }, `${t.points ?? 1} б.`)),
        h('div', { class: 'task-text', html: md(t.text) }), body, feedback, footer);
      checksBox.append(card);
      const ui = {
        body, feedback, footer,
        onLock: () => { revealNext(true); refresh(); },
        onSkip: () => { body.replaceChildren(); feedback.replaceChildren(); mountTask(t, ui); revealNext(true); refresh(); },
      };
      mountTask(t, ui);
      return card;
    }
    function revealNext(scroll) {
      let added = null;
      while (shown < checks.length && (shown === 0 || draft.locked[checks[shown - 1].id])) { added = mountCard(shown); shown++; }
      if (scroll && added && added.scrollIntoView) added.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    add(view, header(), tools(false), progress,
      grid('lecture', [
        v4 ? '' : h('div', { class: 'lec-step' }, `Раздел ${k + 1} из ${N} · ≈ ${minutes} мин`), // у v4 то же самое пишет строка этапа в шапке
        h('h2', { class: 'lec-title' }, s.title),
        h('div', { class: 'lecture-body', html: md(s.body) }),
      ], [
        checks.length ? h('div', { class: 'lec-checks-head' }, h('h3', {}, '✅ Проверьте себя')) : '',
        checksBox, nav,
      ], 'Текст раздела'));
    revealNext(false);
    refresh();
  }

  // ---------- выбор варианта практики (занятие с вариантами) ----------
  let chooseFrom = null; // этап и задание, с которых открыли «Сменить вариант»
  function choose() {
    // на широком экране предлагаем 💻, но выбирает студент
    const wide = typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1100px)').matches;
    const pick = v => {
      draft.variant = v;
      // к первому незакрытому заданию варианта (ответы на общие задания сохраняются);
      // если закрыты все задания варианта — сразу к итогам.
      // v4: практика открывается только после допуска по ОТ/ТБ — пока safetyOk не выдан, сначала инструктаж
      // (допуск не зависит от варианта и при смене варианта не сбрасывается; но правила нового варианта, которых студент не видел,
      // показываем на экране инструктажа: ответы уже закрыты, остаётся «К практике →»)
      const first = practiceOf(v).findIndex(t => !draft.locked[t.id]);
      draft.index = first >= 0 ? first : 0;
      draft.stage = v4 && (!draft.safetyOk || hasUnseenRules(lesson, draft, v)) ? 'safety' : first >= 0 ? 'task' : v4 ? 'reflect' : 'finish';
      chooseFrom = null;
      save();
      show();
    };
    const opt = v => {
      const o = VARIANTS[v];
      const sel = draft.variant === v;
      const suggested = !draft.variant && wide && v === 'pc';
      return h('button', {
        type: 'button', class: `variant-opt${sel ? ' sel' : ''}${suggested ? ' suggested' : ''}`, 'aria-pressed': String(sel), onclick: () => pick(v),
      },
      h('span', { class: 'variant-ico', 'aria-hidden': 'true' }, o.icon),
      h('span', { class: 'variant-txt' },
        h('span', { class: 'variant-title' }, o.title),
        h('span', { class: 'variant-desc' }, o.desc),
        h('span', { class: 'variant-count' }, tasksLabel(v)),
        sel ? h('span', { class: 'pill variant-tag' }, 'Текущий вариант') : suggested ? h('span', { class: 'pill variant-tag' }, 'Удобно на компьютере') : ''));
    };
    // «← Вернуться» — только когда вариант уже выбран (экран открыт через «Сменить вариант»): ничего не меняет
    const backBtn = draft.variant ? h('button', { class: 'btn ghost big choose-back', type: 'button', onclick: () => {
      const from = chooseFrom || (v4 && !draft.safetyOk ? { stage: 'safety', index: 0 } : practice().every(t => draft.locked[t.id]) ? { stage: v4 ? 'reflect' : 'finish', index: 0 } : { stage: 'task', index: Math.max(0, practice().findIndex(t => !draft.locked[t.id])) });
      chooseFrom = null;
      draft.stage = from.stage;
      draft.index = from.index;
      save();
      show();
    } }, '← Вернуться') : '';
    // v4 без вариантов: экран 'choose' — только критерии и «К инструктажу →»
    const toSafety = () => {
      const first = practice().findIndex(t => !draft.locked[t.id]);
      draft.index = first >= 0 ? first : 0;
      draft.stage = !draft.safetyOk ? 'safety' : first >= 0 ? 'task' : 'reflect';
      save();
      show();
    };
    if (v4 && !withVariants) {
      add(view, header(), tools(true),
        grid('choose', null, [
          criteriaCard(lesson, undefined),
          h('p', { class: 'muted choose-lead' }, 'Лекция пройдена. Дальше короткий инструктаж по охране труда и технике безопасности, затем практика.'),
          h('button', { class: 'btn primary big', type: 'button', onclick: toSafety }, 'К инструктажу →'),
          deadlineNote(),
        ]));
      return;
    }
    add(view, header(), tools(true),
      grid('choose', null, [
        v4 ? criteriaCard(lesson, draft.variant) : '',
        h('h2', { class: 'choose-title' }, 'Как вы выполняете практику?'),
        h('p', { class: 'muted choose-lead' }, draft.variant
          ? 'Ответы на общие задания сохранятся. Задания другого варианта в сдачу не попадут.'
          : 'Лекция пройдена. Выберите, где удобнее работать: вариант можно сменить, пока работа не сдана.'),
        h('div', { class: 'variant-choice', role: 'group', 'aria-label': 'Вариант практики' }, opt('phone'), opt('pc')),
        deadlineNote(),
        backBtn,
      ]));
  }

  // ссылка «Сменить вариант» под заданием и на итогах (пока работа не сдана)
  const switchVariant = () => (withVariants && draft.variant ? h('button', { class: 'link-btn variant-switch', type: 'button', onclick: () => {
    if (!confirm('Сменить вариант? Ответы на общие задания сохранятся.')) return;
    chooseFrom = { stage: draft.stage, index: draft.index }; // куда вернёт «← Вернуться»
    draft.stage = 'choose';
    save();
    show();
  } }, `Сменить вариант (сейчас: ${VARIANTS[draft.variant].icon} ${VARIANTS[draft.variant].short})`) : '');

  // пилюля баллов задания; у ⭐ заданий v4 перед ней пилюля «⭐»
  function pointsPill(t, type, star) {
    const pts = h('span', { class: 'pill pts' }, `${t.variant === 'pc' ? '💻 ПК-задание · ' : ''}${type.manual ? `${t.points ?? 1} б. · проверит преподаватель` : `${t.points ?? 1} б.`}`);
    return star ? h('span', { class: 'task-pills' }, h('span', { class: 'pill adv' }, '⭐'), pts) : pts;
  }

  function task() {
    const tasks = practice();
    const total = tasks.length;
    // v4: перед первым ⭐ заданием — заставка с выбором «Начать ⭐» / «Пропустить ⭐»
    if (v4 && advIntroNeeded(tasks, draft.index, draft.advIntro)) { advIntroV4(v4ctx()); return; }
    const t = tasks[draft.index];
    // v4: нумерация внутри группы — базовые «Задание k из B», ⭐ «⭐ Задание j из M»
    const advList = v4 ? tasks.filter(isAdv) : [];
    const isStar = v4 && isAdv(t);
    const groupN = isStar ? advList.length : total - advList.length;
    const groupI = isStar ? draft.index - (total - advList.length) : draft.index;
    const type = TASK_TYPES[t.type];
    const body = h('div', { class: 'task-body' });
    const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
    const footer = h('div', { class: 'task-footer' });
    const pct = Math.round(draft.index / total * 100);
    const caseDef = t.case && Array.isArray(lesson.cases) ? lesson.cases.find(c => c && c.id === t.case) : null;
    // кейс раскрыт у первого задания кейса и свёрнут у следующих
    const caseBlock = caseDef
      ? h('details', { class: 'case card', open: tasks.findIndex(x => x.case === t.case) === draft.index },
        h('summary', {}, `Кейс: ${caseDef.title}`), h('div', { html: md(caseDef.text) }))
      : '';
    const sheet = cheatSheet();
    add(view, header(), v2 ? tools(true, !!sheet, v4) : '',
      grid('practice', sheet, [
        h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Прогресс практики', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, h('div', { class: 'bar', style: `width:${pct}%` })),
        h('div', { class: 'task-title' }, h('span', {}, v4 ? `${isStar ? '⭐ Задание' : 'Практика · задание'} ${groupI + 1} из ${groupN}` : `${v2 ? 'Практика · задание' : 'Задание'} ${draft.index + 1} из ${total}`),
          pointsPill(t, type, isStar)),
        caseBlock,
        h('div', { class: 'task-text', html: md(t.text) }), body, feedback, footer, switchVariant(),
      ], 'Шпаргалка'));

    const next = () => {
      if (draft.index === total - 1) draft.stage = v4 ? 'reflect' : 'finish'; else draft.index++;
      save();
      show();
    };
    mountTask(t, {
      body, feedback, footer, onSkip: next,
      lockedFooter: () => h('button', { class: 'btn primary big', type: 'button', onclick: next }, draft.index === total - 1 ? 'К итогам →' : 'Дальше →'),
    });
  }

  function finish() {
    const { grade, answers: subAnswers, texts: subTexts } = submissionParts(lesson, draft);
    const all = allTasks(lesson, draft.variant);
    const errLine = h('p', { class: 'error', role: 'alert' });
    const submitBtn = h('button', { class: 'btn primary big', type: 'button', onclick: submitNow }, preview ? 'Завершить демо' : '📤 Сдать работу');
    add(view, header(),
      h('div', { class: 'card result' },
        withVariants ? h('span', { class: 'pill' }, `${VARIANTS[draft.variant].icon} Вариант: ${VARIANTS[draft.variant].short}`) : '',
        h('div', { class: 'big-score' }, `${grade.score} / ${grade.max}`),
        h('p', { class: 'muted' }, 'баллов по автопроверке'),
        grade.manualMax ? h('p', { class: 'hint' }, `+ до ${grade.manualMax} б. после проверки преподавателем`) : '',
        h('ol', { class: 'result-items' }, grade.items.map((it, i) => {
          if (!it.manual) return h('li', {}, `${it.score} из ${it.max} б.`);
          const g = preview ? null : teacherGrade(app.store.grades(), lessonKey(discipline, n), it.id);
          return h('li', {}, g ? `Оценка преподавателя: ${g.score} из ${all[i].points ?? 1}` : '📨 на проверке у преподавателя',
            g && g.comment ? h('div', { class: 'teacher-comment' }, g.comment) : '');
        }))),
      deadlineNote(),
      submitBtn, errLine,
      h('button', { class: 'btn ghost big', type: 'button', onclick: () => { draft.stage = 'task'; draft.index = 0; save(); show(); } }, '↩ Просмотреть задания'),
      switchVariant());

    function submitNow() { return doSubmit({ submitBtn, errLine, grade, subAnswers, subTexts }); }
  }

  // Сдача занятия: общая для v2 (кнопка на экране finish) и v4 (кнопка «Сдать работу» на экране итогов).
  // Для v4 к сдаче добавляется поле v4, а после сдачи показывается отметка и ДЗ.
  async function doSubmit({ submitBtn, errLine, grade, subAnswers, subTexts }) {
    submitBtn.disabled = true;
    errLine.textContent = '';
    if (preview) {
      closed = true;
      app.store.clearDraft(key);
      if (!v4) { app.go('/'); return; }
      view.replaceChildren(done({ demo: true, grade }));
      window.scrollTo(0, 0);
      return;
    }
    if (ownerChanged()) { evict(); return; } // аккаунт сменили в другой вкладке: работа остаётся в черновике владельца
    if (!app.store.session()) { // сессия пропала (выход в другой вкладке): работа остаётся в черновике
      app.flash = 'Войдите, чтобы сдать работу';
      app.go(`/login?next=${encodeURIComponent(`/d/${discipline}/${n}`)}`);
      return;
    }
    let sub, gain, badges, levelUp;
    try {
      sub = buildSubmission({
        profile: app.store.profile(), discipline, lesson, grade, startedAt: draft.startedAt, variant: draft.variant,
        answers: subAnswers, texts: subTexts, v4: v4 ? v4Submission(lesson, draft, grade) : undefined,
      });
      gain = xpGain(app.store.progress(key), grade);
      const before = levelFor(app.store.state().xp);
      app.store.recordResult(key, { score: grade.score, max: grade.max, at: new Date().toISOString() });
      app.store.addXp(gain);
      badges = app.store.addBadges(newBadges(app.store.state(), { perfectTypes: grade.perfectTypes }));
      const after = levelFor(app.store.state().xp);
      levelUp = after.index > before.index ? after : null;
      closed = true;
      app.store.clearDraft(key);
      app.submittedKey = key; // если сессия истечёт при отправке, вход вернёт студента на карту курса, а не в сданное занятие
    } catch (e) {
      submitBtn.disabled = false;
      errLine.textContent = `Не удалось сдать работу: ${e?.message || e}. Попробуйте ещё раз.`;
      return;
    }
    submitBtn.textContent = 'Отправляем…';
    const { sent, limit, hold, rejected } = await app.submitter.submit(sub);
    if (app.routeId !== my) return; // например, сессия истекла: сдача в очереди, студента ждёт экран входа
    if (sent && pulse) { submittedOk = true; pulse.kick(); } // доска: сервер принял сдачу → этап «сдал»
    view.replaceChildren(done({ sent, limit, hold, rejected, subId: sub.id, gain, badges, levelUp, perfect: grade.max > 0 && grade.score === grade.max, grade }));
    window.scrollTo(0, 0);
  }

  // v4: «Сдать работу» на экране итогов; оценка и ответы берутся из черновика
  function submitV4(submitBtn, errLine) {
    const { grade, answers: subAnswers, texts: subTexts } = submissionParts(lesson, draft);
    return doSubmit({ submitBtn, errLine, grade, subAnswers, subTexts });
  }

  function done({ sent, limit, hold, rejected, subId, gain, badges, levelUp, perfect, grade, demo }) {
    // v4: отметка и ДЗ после сдачи (в демо — без отправки; отметка предварительная, пока есть ручные задания)
    if (v4 && demo) {
      return h('div', { class: 'done' },
        h('div', { class: 'done-icon', 'aria-hidden': 'true' }, '🎓'),
        h('h1', {}, 'Демо пройдено'),
        h('p', {}, 'Так выглядит экран после сдачи. Результат никуда не отправлен.'),
        markCard(grade, 'Ваша отметка'),
        hasHomework(lesson) ? homeworkChooser(v4ctx(), openHomework) : '',
        h('a', { class: 'btn primary big', href: '#/' }, 'На главную'));
    }
    const v4blocks = v4 && grade && !(rejected !== undefined)
      ? [markCard(grade, 'Ваша отметка'), hasHomework(lesson) ? homeworkChooser(v4ctx(), openHomework) : ''] : [];
    // rejected — сервер отказал (повреждённая сдача): никакого «сдано», только причина и просьба сообщить преподавателю
    const failed = rejected !== undefined;
    // работа осталась в очереди из-за сбоя (сеть, таймаут, ошибка сервера, busy): показываем живой статус повторов
    const queued = !sent && !failed && !limit && !hold;
    const icon = h('div', { class: 'done-icon', 'aria-hidden': 'true' }, sent ? '🎉' : failed ? '⚠️' : '💾');
    const title = h('h1', {}, sent ? 'Работа сдана!' : failed ? 'Работа не принята' : 'Работа сохранена на телефоне');
    const text = h('p', { role: failed ? 'alert' : null }, sent ? 'Результат уже в таблице преподавателя.'
      : failed ? `Сервер не принял работу: ${rejectText(rejected)} — сообщите преподавателю.`
        : limit ? `${LIMIT_TEXT}. Не очищайте данные браузера.`
          : hold ? `${holdText(hold)}. Не очищайте данные браузера.`
            : 'Работа сохранена на телефоне и отправится сама.');
    const live = queued ? queuedLive(app, { id: subId, parts: { icon, title, text } }) : null;
    const box = h('div', { class: 'done' },
      icon, title, text,
      live ? live.nodes : '',
      deadline && deadline.overdue ? h('p', { class: 'hint' }, 'Работа сдана после срока — преподаватель увидит отметку.') : '',
      commentSlot(),
      ...v4blocks,
      h('div', { class: 'xp-gain' }, gain ? `+${gain} XP` : 'XP начисляются за улучшение результата'),
      levelUp ? h('div', { class: 'card level-up' }, `⬆ Новый уровень: ${levelUp.title}!`) : '',
      badges.length ? h('div', { class: 'card' }, h('h2', {}, 'Новые значки'), h('div', { class: 'badges' }, badges.map(id => BADGES.find(b => b.id === id)).map(b =>
        h('div', { class: 'badge got' }, h('div', { class: 'badge-icon', 'aria-hidden': 'true' }, b.icon), h('div', { class: 'badge-title' }, b.title), h('div', { class: 'badge-desc' }, b.desc))))) : '',
      h('a', { class: 'btn primary big', href: back }, 'К карте курса'),
      h('a', { class: 'btn ghost big', href: '#/' }, 'На главную'));
    if (!failed && (perfect || levelUp || badges.length)) setTimeout(() => celebrate(box), 50);
    return box;
  }

  // Пульс для доски преподавателя (v4, студенческая сессия): этап, баллы, уход со страницы. Сам останавливается, когда экран сменился.
  let submittedOk = false, pulse = null;
  if (v4 && !preview && app.store.session()) {
    submittedOk = app.store.progress(key) != null; // сдано раньше: сразу «сдал»
    pulse = startLivePulse({
      api: app.api, d: discipline, n, active: () => app.routeId === my && !evicted,
      getState: () => {
        if (!submittedOk) return { stage: stageOf(lesson, draft), ...scoreOf(lesson, draft) };
        const p = app.store.progress(key);
        const s = p && Number.isFinite(p.best) && Number.isFinite(p.max) ? { score: p.best, max: p.max, pc: draft.variant === 'pc' } : scoreOf(lesson, draft);
        return { stage: 'done', ...s };
      },
    });
  }

  show();
}
