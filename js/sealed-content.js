// Загрузчик занятий для студентского и админского кода (этап 2 защиты оценок).
// На запечатанном сайте есть content/sealed.js (признак) — занятие берётся из content/<d>/s/pzNNN.js (без ключей и пояснений);
// без признака (npm run serve, демо) — прежний полный файл, и всё проверяется локально, как раньше.
// Каждый вызов отдаёт СВЕЖУЮ копию занятия: восстановление заданий (restoreTask) меняет объект на месте, и открытые ответы одной
// попытки не должны переходить в следующую (модуль импортируется один раз, копия — на каждое открытие экрана).
import { DISCIPLINES } from './config.js';
import { lessonFile } from './content.js';
import { taskLists } from './seal-model.js';

const clone = v => JSON.parse(JSON.stringify(v));

const DEFAULT_IMPORT = {
  mark: () => import('../content/sealed.js'),
  sealed: (d, file) => import(`../content/${d}/s/${file}`),
  plain: (d, file) => import(`../content/${d}/${file}`),
};

// loader с подменяемым импортом (для тестов). Признак сайта запоминается, только когда получен (сбой сети не запоминается).
export function createLessonLoader(imp = DEFAULT_IMPORT) {
  let sealedSite = null; // true | false — после первого определённого ответа
  const mods = {};
  async function isSealedSite() {
    if (sealedSite !== null) return sealedSite;
    try {
      const m = await imp.mark();
      sealedSite = !!(m && m.default && m.default.v);
    } catch (e) {
      // файла нет (npm run serve → 404) — прежний путь; не запоминаем, чтобы случайный сбой сети не закрепился на всю сессию
      return false;
    }
    return sealedSite;
  }
  return async function load(d, n) {
    if (!DISCIPLINES.includes(d) || !Number.isInteger(n) || n < 1) throw new Error('Неверный адрес занятия');
    const sealed = await isSealedSite();
    const file = lessonFile(n);
    const k = `${sealed ? 's' : 'p'}/${d}/${n}`;
    if (!mods[k]) {
      mods[k] = (sealed ? imp.sealed(d, file) : imp.plain(d, file)).then(m => m.default, e => { delete mods[k]; throw e; });
    }
    return clone(await mods[k]);
  };
}

const defaultLoader = createLessonLoader();
export const loadSealedLesson = (d, n) => defaultLoader(d, n);

// Запечатано ли занятие: у запечатанных заданий есть подпись sg (sealTask ставит её всем заданиям)
const sealedMemo = new WeakMap();
export function isSealedLesson(lesson) {
  if (!lesson || typeof lesson !== 'object') return false;
  if (!sealedMemo.has(lesson)) sealedMemo.set(lesson, taskLists(lesson).some(l => l.some(t => t && typeof t.sg === 'string')));
  return sealedMemo.get(lesson);
}
