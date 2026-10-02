import { h, add, celebrate } from '../util/dom.js';
import { md, mdInline } from '../util/text.js';
import { TASK_TYPES } from '../tasks/registry.js';
import { gradeLesson, lessonTexts } from '../grading.js';
import { isV2, allTasks, wordCount, readMinutes, sortedGlossary } from '../lesson-model.js';
import { loadCourse, loadLesson, isLessonOpen, courseAccess, deadlineInfo, teacherGrade } from '../content.js';
import { lessonKey } from '../store.js';
import { identityChanged } from '../nav.js';
import { repairDraft } from '../draft.js';
import { xpGain, levelFor, newBadges, BADGES } from '../gamification.js';
import { buildSubmission } from '../submit.js';
import { CHARACTERS } from '../../content/story.js';

export async function renderLesson(app, discipline, n) {
  const my = app.routeId;
  const preview = discipline === 'demo' || discipline === 'demo2';
  const back = preview ? '#/' : `#/d/${discipline}`;
  app.root.append(h('p', { class: 'loading' }, 'Загрузка занятия…'));
  let course = null;
  let lesson;
  try {
    if (preview) lesson = (await import(discipline === 'demo2' ? '../../content/demo-v2.js' : '../../content/demo.js')).default;
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
  const draft = repairDraft(app.store.getDraft(key), lesson);
  // Владелец занятия — студент, под которым оно открыто. Если в другой вкладке сменили аккаунт, чужие данные не пишем и не отправляем.
  const owner = preview ? null : app.store.studentId();
  const ownerChanged = () => !preview && identityChanged(owner, app.store.studentId());
  let evicted = false;
  const evict = () => {
    if (evicted) return;
    evicted = true;
    app.flash = 'Вы вышли из аккаунта в другой вкладке. Войдите снова.';
    app.go('/login');
  };
  const save = () => { if (ownerChanged()) { evict(); return; } app.store.setDraft(key, draft); };
  const view = h('div', { class: 'lesson' });
  app.root.replaceChildren(view);
  const who = CHARACTERS[lesson.story.from];
  const v2 = isV2(lesson);
  const all = allTasks(lesson);
  const total = lesson.tasks.length;

  const header = () => h('header', { class: 'lesson-head' },
    h('a', { href: back, class: 'back' }, preview ? '← Главная' : '← Карта курса'),
    h('div', { class: 'lesson-meta' }, `${preview ? 'Демо' : course.code} · ПЗ №${lesson.number} · Тема ${lesson.topic}`),
    h('h1', {}, lesson.title));

  function show() {
    view.replaceChildren();
    window.scrollTo(0, 0);
    ({ intro, lecture, task, finish }[draft.stage] || intro)();
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

  const tools = withLecture => h('div', { class: 'lesson-tools' },
    h('button', { class: 'btn small', type: 'button', onclick: openGlossary }, '📖 Термины'),
    withLecture ? h('button', { class: 'btn small', type: 'button', onclick: openLectureReader }, '📚 Лекция') : '');

  const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);

  function intro() {
    if (v2) {
      const m = lesson.minutes || {};
      const secs = lesson.lecture;
      add(view, header(),
        h('div', { class: 'story' }, h('div', { class: 'avatar', 'aria-hidden': 'true' }, who.avatar),
          h('div', { class: 'bubble' }, h('div', { class: 'who' }, `${who.name}, ${who.role}`), h('div', { html: md(lesson.story.text) }))),
        h('div', { class: 'card' },
          h('p', {}, `📘 Лекция: ${secs.length} ${plural(secs.length, 'раздел', 'раздела', 'разделов')}, примерно ${m.theory ?? 25} минут. После каждого раздела — контрольные вопросы.`),
          h('p', {}, `🛠 Практика: ${total} заданий, примерно ${m.practice ?? 50} минут.`)),
        deadlineNote(),
        h('button', { class: 'btn primary big', type: 'button', onclick: () => { draft.stage = 'lecture'; save(); show(); } }, 'Начать лекцию →'));
      return;
    }
    add(view, header(),
      h('div', { class: 'story' }, h('div', { class: 'avatar', 'aria-hidden': 'true' }, who.avatar),
        h('div', { class: 'bubble' }, h('div', { class: 'who' }, `${who.name}, ${who.role}`), h('div', { html: md(lesson.story.text) }))),
      h('details', { class: 'theory card', open: true }, h('summary', {}, '📘 Шпаргалка'), h('div', { html: md(lesson.theory) })),
      h('p', { class: 'hint' }, `Заданий: ${total} · примерно ${lesson.minutes ?? 35} минут`),
      deadlineNote(),
      h('button', { class: 'btn primary big', type: 'button', onclick: () => { draft.stage = 'task'; save(); show(); } }, 'Начать →'));
  }

  // Общая логика задания (практика и контрольные вопросы лекции): отрисовка, «Проверить», «Пропустить», обратная связь.
  // ui: { body, feedback, footer, lockedFooter?() — содержимое подвала после проверки, onLock(), onSkip() }
  function mountTask(t, ui) {
    const type = TASK_TYPES[t.type];
    const { body, feedback, footer } = ui;
    const showFeedback = r => {
      if (type.manual && draft.answers[t.id] === null) {
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
      draft.locked[t.id] = true;
      save();
      body.replaceChildren();
      type.render(t, body, { answer: draft.answers[t.id], onChange: () => {}, locked: true });
      showFeedback(type.check(t, draft.answers[t.id]));
      drawFooter();
      if (ui.onLock) ui.onLock();
    }
    function skip() {
      if (!confirm('Пропустить задание? За него будет 0 баллов, вернуться к нему нельзя.')) return;
      if (!type.manual || draft.answers[t.id] === undefined) draft.answers[t.id] = null;
      draft.locked[t.id] = true;
      save();
      ui.onSkip();
    }
    function drawFooter() {
      if (draft.locked[t.id]) { footer.replaceChildren(ui.lockedFooter ? ui.lockedFooter() : ''); return; }
      footer.replaceChildren(
        h('button', { class: 'btn primary big', type: 'button', disabled: !type.ready(t, draft.answers[t.id]), onclick: lock }, type.manual ? 'Сохранить ответ' : 'Проверить'),
        h('button', { class: 'link-btn', type: 'button', onclick: skip }, 'Пропустить задание'));
    }
    const locked = !!draft.locked[t.id];
    const onChange = a => { draft.answers[t.id] = a; save(); drawFooter(); };
    try {
      type.render(t, body, { answer: draft.answers[t.id], locked, onChange: locked ? () => {} : onChange });
      if (locked) showFeedback(type.check(t, draft.answers[t.id]));
      drawFooter();
    } catch (e) {
      // устаревший ответ (занятие изменили) — сбрасываем его; без ответа ошибку не прячем, чтобы не зациклиться
      if (draft.answers[t.id] === undefined && !draft.locked[t.id]) throw e;
      console.error(e);
      delete draft.answers[t.id];
      delete draft.locked[t.id];
      save();
      show();
    }
  }

  // ---------- лекция (v2): один раздел за раз, затем его контрольные вопросы ----------
  function lecture() {
    const secs = lesson.lecture;
    const N = secs.length;
    if (!N) { draft.stage = 'task'; save(); task(); return; }
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
    const toPractice = () => { draft.stage = 'task'; save(); show(); };

    let shown = 0;
    function mountCard(i) {
      const t = checks[i];
      const body = h('div', { class: 'task-body' });
      const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
      const footer = h('div', { class: 'task-footer' });
      const card = h('div', { class: 'card lec-check' },
        h('div', { class: 'task-title' }, h('span', {}, `Контрольный вопрос ${i + 1} из ${checks.length}`), h('span', { class: 'pts' }, `${t.points ?? 1} б.`)),
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
      h('div', { class: 'lec-step' }, `Раздел ${k + 1} из ${N} · ≈ ${minutes} мин`),
      h('h2', { class: 'lec-title' }, s.title),
      h('div', { class: 'lecture-body', html: md(s.body) }),
      checks.length ? h('div', { class: 'lec-checks-head' }, h('h3', {}, '✅ Проверьте себя')) : '',
      checksBox, nav);
    revealNext(false);
    refresh();
  }

  function task() {
    const t = lesson.tasks[draft.index];
    const type = TASK_TYPES[t.type];
    const body = h('div', { class: 'task-body' });
    const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
    const footer = h('div', { class: 'task-footer' });
    const pct = Math.round(draft.index / total * 100);
    const caseDef = t.case && Array.isArray(lesson.cases) ? lesson.cases.find(c => c && c.id === t.case) : null;
    // кейс раскрыт у первого задания кейса и свёрнут у следующих
    const caseBlock = caseDef
      ? h('details', { class: 'case card', open: lesson.tasks.findIndex(x => x.case === t.case) === draft.index },
        h('summary', {}, `Кейс: ${caseDef.title}`), h('div', { html: md(caseDef.text) }))
      : '';
    add(view, header(), v2 ? tools(true) : '',
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, h('div', { class: 'bar', style: `width:${pct}%` })),
      h('div', { class: 'task-title' }, h('span', {}, `${v2 ? 'Практика · задание' : 'Задание'} ${draft.index + 1} из ${total}`),
        h('span', { class: 'pts' }, type.manual ? `${t.points ?? 1} б. · проверит преподаватель` : `${t.points ?? 1} б.`)),
      caseBlock,
      h('div', { class: 'task-text', html: md(t.text) }), body, feedback, footer);

    const next = () => {
      if (draft.index === total - 1) draft.stage = 'finish'; else draft.index++;
      save();
      show();
    };
    mountTask(t, {
      body, feedback, footer, onSkip: next,
      lockedFooter: () => h('button', { class: 'btn primary big', type: 'button', onclick: next }, draft.index === total - 1 ? 'К итогам →' : 'Дальше →'),
    });
  }

  function finish() {
    const grade = gradeLesson(lesson, draft.answers);
    const errLine = h('p', { class: 'error', role: 'alert' });
    const submitBtn = h('button', { class: 'btn primary big', type: 'button', onclick: submitNow }, preview ? 'Завершить демо' : '📤 Сдать работу');
    add(view, header(),
      h('div', { class: 'card result' },
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
      h('button', { class: 'btn ghost big', type: 'button', onclick: () => { draft.stage = 'task'; draft.index = 0; save(); show(); } }, '↩ Просмотреть задания'));

    async function submitNow() {
      submitBtn.disabled = true;
      errLine.textContent = '';
      if (preview) { app.store.clearDraft(key); app.go('/'); return; }
      if (ownerChanged()) { evict(); return; } // аккаунт сменили в другой вкладке: работа остаётся в черновике владельца
      if (!app.store.session()) { // сессия пропала (выход в другой вкладке): работа остаётся в черновике
        app.flash = 'Войдите, чтобы сдать работу';
        app.go(`/login?next=${encodeURIComponent(`/d/${discipline}/${n}`)}`);
        return;
      }
      let sub, gain, badges, levelUp;
      try {
        sub = buildSubmission({ profile: app.store.profile(), discipline, lesson, answers: draft.answers, grade, texts: lessonTexts(lesson, draft.answers), startedAt: draft.startedAt });
        gain = xpGain(app.store.progress(key), grade);
        const before = levelFor(app.store.state().xp);
        app.store.recordResult(key, { score: grade.score, max: grade.max, at: new Date().toISOString() });
        app.store.addXp(gain);
        badges = app.store.addBadges(newBadges(app.store.state(), { perfectTypes: grade.perfectTypes }));
        const after = levelFor(app.store.state().xp);
        levelUp = after.index > before.index ? after : null;
        app.store.clearDraft(key);
        app.submittedKey = key; // если сессия истечёт при отправке, вход вернёт студента на карту курса, а не в сданное занятие
      } catch (e) {
        submitBtn.disabled = false;
        errLine.textContent = `Не удалось сдать работу: ${e?.message || e}. Попробуйте ещё раз.`;
        return;
      }
      submitBtn.textContent = 'Отправляем…';
      const { sent } = await app.submitter.submit(sub);
      if (app.routeId !== my) return; // например, сессия истекла: сдача в очереди, студента ждёт экран входа
      view.replaceChildren(done({ sent, gain, badges, levelUp, perfect: grade.max > 0 && grade.score === grade.max }));
      window.scrollTo(0, 0);
    }
  }

  function done({ sent, gain, badges, levelUp, perfect }) {
    const box = h('div', { class: 'done' },
      h('div', { class: 'done-icon', 'aria-hidden': 'true' }, sent ? '🎉' : '💾'),
      h('h1', {}, sent ? 'Работа сдана!' : 'Работа сохранена на телефоне'),
      h('p', {}, sent ? 'Результат уже в таблице преподавателя.' : 'Сейчас нет связи с сервером. Работа отправится автоматически, когда появится интернет — просто откройте сайт ещё раз. Не очищайте данные браузера.'),
      deadline && deadline.overdue ? h('p', { class: 'hint' }, 'Работа сдана после срока — преподаватель увидит отметку.') : '',
      h('div', { class: 'xp-gain' }, gain ? `+${gain} XP` : 'XP начисляются за улучшение результата'),
      levelUp ? h('div', { class: 'card level-up' }, `⬆ Новый уровень: ${levelUp.title}!`) : '',
      badges.length ? h('div', { class: 'card' }, h('h2', {}, 'Новые значки'), h('div', { class: 'badges' }, badges.map(id => BADGES.find(b => b.id === id)).map(b =>
        h('div', { class: 'badge got' }, h('div', { class: 'badge-icon', 'aria-hidden': 'true' }, b.icon), h('div', { class: 'badge-title' }, b.title), h('div', { class: 'badge-desc' }, b.desc))))) : '',
      h('a', { class: 'btn primary big', href: back }, 'К карте курса'),
      h('a', { class: 'btn ghost big', href: '#/' }, 'На главную'));
    if (perfect || levelUp || badges.length) setTimeout(() => celebrate(box), 50);
    return box;
  }

  show();
}
