export const isV5 = lesson => !!lesson && lesson.version === 5;

export function briefingErrors(briefing) {
  const errors = [];
  const text = v => typeof v === 'string' && v.trim().length > 0;
  if (!briefing || typeof briefing !== 'object' || Array.isArray(briefing)) return ['briefing — обязательная вводная теория v5'];
  if (!text(briefing.title)) errors.push('briefing.title — заголовок вводной теории');
  if (!text(briefing.lead)) errors.push('briefing.lead — главная идея занятия');
  if (!Number.isFinite(briefing.minutes) || briefing.minutes < 5 || briefing.minutes > 15) errors.push('briefing.minutes — от 5 до 15 минут');
  if (!Array.isArray(briefing.sections) || briefing.sections.length < 3 || briefing.sections.length > 7) errors.push('briefing.sections — от 3 до 7 кратких блоков, включая разобранный пример');
  else briefing.sections.forEach((s, i) => {
    if (!s || !text(s.title) || !text(s.body)) errors.push(`briefing.sections[${i}] — нужны title и body`);
  });
  if (!Array.isArray(briefing.questions) || briefing.questions.length < 2 || briefing.questions.length > 4 || !briefing.questions.every(text)) errors.push('briefing.questions — от 2 до 4 вопросов для обсуждения');
  if (!text(briefing.start)) errors.push('briefing.start — с чего начать самостоятельную работу');
  if (briefing.presentation !== undefined && (!Array.isArray(briefing.presentation) || briefing.presentation.length < 2 || briefing.presentation.length > 4 || briefing.presentation.some(s => !s || !text(s.title) || !text(s.body)))) errors.push('briefing.presentation — 2–4 экрана с title и body');
  return errors;
}

export function briefingSlides(lesson) {
  const b = lesson.briefing;
  if (Array.isArray(b.presentation) && b.presentation.length) return b.presentation;
  return [
    { title: b.title, body: b.lead, label: `Вводная теория · ${b.minutes} мин` },
    ...b.sections,
    { title: 'Что осталось непонятным?', questions: b.questions, label: 'Обсудим перед практикой' },
    { title: 'Самостоятельная работа', body: b.start, label: 'Дальше — в своём темпе' },
  ];
}
