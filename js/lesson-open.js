// Сигнал серверу «студент открыл ПЗ» (действие lessonOpen): от него сервер считает длительность работы.
// Отдельный НОВЫЙ модуль намеренно: у сайта нет версионирования, а в кэше телефона могут быть старые копии api.js/lesson.js
// (tests/busy-text.test.js). «Выстрелил и забыл»: ничего не ждём, ошибки и офлайн молча игнорируем, экран не страдает.
const reported = new Set(); // 'd/n' — один раз за загрузку страницы

export function reportLessonOpen({ api, discipline, lesson }) {
  try {
    const n = Number(lesson);
    if (!api || typeof api.call !== 'function' || !discipline || !isFinite(n)) return false;
    const key = `${discipline}/${n}`;
    if (reported.has(key)) return false;
    reported.add(key);
    const p = api.call('lessonOpen', { discipline, lesson: n });
    if (p && typeof p.then === 'function') p.then(() => {}, () => {});
    return true;
  } catch (e) {
    return false;
  }
}

export function resetLessonOpenForTests() { reported.clear(); }
