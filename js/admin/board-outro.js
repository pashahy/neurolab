// B6: «Итог пары» на доске (частые ошибки, умею/частично/пока нет, облако фраз «в следующий раз я…», комментарий группе)
// и поле «Комментарий группе» на «Моём экране». Данные — ответ boardOutro (сводка занятия, кэш сервера 60 с). Имён нет нигде.
import { h } from '../util/dom.js';
import { loadLesson } from '../content.js';
import { cloudWords } from './board-live.js';
import { taskLabel, COMMENT_LIMIT } from './summary.js';

export const OUTRO_POLL_MS = 60000;
const LEVELS = ['умею', 'частично', 'пока нет'];
const LEVEL_CLASS = ['ok', 'part', 'bad'];
const STOP = new Set(['что', 'это', 'как', 'для', 'при', 'или', 'так', 'его', 'они', 'она', 'оно', 'все', 'всё', 'был', 'была', 'были', 'буду', 'будет', 'будем', 'нужно', 'надо', 'ещё', 'еще', 'если', 'тоже', 'чтобы', 'когда', 'тогда', 'меня', 'мне', 'мой', 'моя', 'мои', 'себя', 'без', 'над', 'под', 'про', 'нет', 'уже', 'только', 'очень', 'можно', 'более', 'свой', 'свою', 'свои', 'этот', 'эти', 'этого', 'того', 'там', 'тут', 'вот', 'потом', 'сразу', 'раз', 'следующий']);

const arr = v => (Array.isArray(v) ? v : []);
const num = v => (typeof v === 'number' && isFinite(v) && v > 0 ? v : 0);

// Частые ошибки: до limit автозаданий с наименьшей долей баллов (порядок сервера), подписи — по файлу занятия.
export function topMistakes(d, lesson, limit = 5) {
  return arr(d && d.mistakes).filter(m => m && typeof m.id === 'string').slice(0, limit).map(m => {
    const t = taskLabel(lesson, m.id);
    return { id: m.id, name: t.name, text: t.text, pct: Math.max(0, Math.min(100, num(m.avgPct))) };
  });
}

// Распределение «умею / частично / пока нет» по задачам цели: строки { label, counts [3], pct [3] (доли), total }.
export function reflectionRows(d, lesson, limit = 6) {
  const goalTasks = arr(lesson && lesson.goal && lesson.goal.tasks);
  return arr(d && d.reflection && d.reflection.tasks).slice(0, limit).map((t, k) => {
    const counts = LEVELS.map((_, i) => num(arr(t)[i]));
    const total = counts.reduce((a, b) => a + b, 0);
    const pct = counts.map(c => (total ? Math.round(c / total * 100) : 0));
    const label = typeof goalTasks[k] === 'string' && goalTasks[k].trim() ? goalTasks[k].trim() : `Задача ${k + 1}`;
    return { label, counts, pct, total };
  });
}

// Облако фраз: слова из «в следующий раз я…» по числу фраз, где они встретились (слово в одной фразе считается раз).
// Короткие и служебные слова отбрасываются. Результат — [{ w, n, size }] по убыванию частоты, не больше limit.
// Нецензурные фразы сервер отфильтровывает до ответа (фильтр облака B4).
export function phraseCloud(next, limit = 40, minPx = 24, maxPx = 72) {
  const count = new Map();
  arr(next).forEach(p => {
    if (typeof p !== 'string') return;
    const seen = new Set();
    p.toLowerCase().replace(/ё/g, 'е').split(/[^\p{L}\p{N}-]+/u).forEach(w0 => {
      const w = w0.replace(/^-+|-+$/g, '');
      if (w.length < 3 || w.length > 30 || STOP.has(w) || /^\d+$/.test(w) || seen.has(w)) return;
      seen.add(w);
      count.set(w, (count.get(w) || 0) + 1);
    });
  });
  const words = Array.from(count, ([w, n]) => ({ w, n })).sort((a, b) => b.n - a.n || (a.w < b.w ? -1 : a.w > b.w ? 1 : 0)).slice(0, limit);
  return cloudWords({ words }, minPx, maxPx);
}

// Состояние поля комментария: длина без крайних пробелов, превышение, можно ли сохранять.
export function commentState(text, saved) {
  const t = String(text == null ? '' : text).trim();
  return { len: t.length, over: t.length > COMMENT_LIMIT, canSave: t.length <= COMMENT_LIMIT && t !== String(saved == null ? '' : saved).trim() };
}

const empty = text => h('p', { class: 'outro-empty' }, text);
function card(node, heading, ...content) { node.replaceChildren(h('h3', {}, heading), ...content); }

// Панель доски. call(action, body) — ctx.call; ref — { group, discipline, lesson }.
// Возвращает { el, open(), close(), isOpen(), onToTiles(fn) }; пока открыта — обновляется раз в OUTRO_POLL_MS.
export function createOutroPanel({ call, ref, alive = () => true }) {
  let opened = false, timer = null, busy = false, lesson = null, lessonTried = false, onToTiles = null;
  const status = h('p', { class: 'outro-status', role: 'status' });
  const title = h('h2', { class: 'outro-title' }, '🏁 Итог пары');
  const back = h('button', { class: 'board-ia', type: 'button' }, 'к плиткам');
  back.addEventListener('click', () => { if (onToTiles) onToTiles(); });
  const head = h('div', { class: 'outro-head' }, title, status, back);
  const mistakes = h('section', { class: 'outro-card outro-mistakes' });
  const refl = h('section', { class: 'outro-card outro-refl' });
  const cloud = h('section', { class: 'outro-card outro-cloud' });
  const comment = h('section', { class: 'outro-card outro-comment' });
  const el = h('section', { class: 'outro', 'aria-label': 'Итог пары' }, head, h('div', { class: 'outro-grid' }, mistakes, refl, cloud, comment));

  function paint(d) {
    const count = num(d && d.count);
    title.textContent = `🏁 Итог пары · сдали: ${count}`;
    const mis = topMistakes(d, lesson);
    card(mistakes, 'Частые ошибки', mis.length
      ? h('ol', { class: 'outro-list' }, mis.map(m => h('li', { class: 'outro-row' },
        h('div', { class: 'outro-label' }, h('strong', {}, m.name), m.text ? ` · ${m.text}` : ''),
        h('div', { class: 'outro-bar' }, h('span', { style: `width:${m.pct}%` })),
        h('div', { class: 'outro-num' }, `${m.pct}%`))))
      : empty('Пока недостаточно данных'));
    const rows = reflectionRows(d, lesson);
    card(refl, 'Умею / частично / пока нет', rows.some(r => r.total)
      ? h('ul', { class: 'outro-list' }, rows.map(r => h('li', { class: 'outro-row' },
        h('div', { class: 'outro-label' }, r.label),
        h('div', { class: 'outro-stack', role: 'img', 'aria-label': LEVELS.map((l, i) => `${l}: ${r.counts[i]}`).join(', ') },
          r.counts.map((c, i) => (c ? h('span', { class: `seg ${LEVEL_CLASS[i]}`, style: `width:${r.pct[i]}%` }, String(c)) : ''))))))
      : empty('Никто ещё не оценил себя'),
      h('p', { class: 'outro-legend' }, LEVELS.map((l, i) => h('span', { class: `lg ${LEVEL_CLASS[i]}` }, l))));
    const words = phraseCloud(d && d.reflection && d.reflection.next);
    card(cloud, 'В следующий раз я…', words.length
      ? h('div', { class: 'outro-words' }, words.map(w => h('span', { class: 'outro-word', style: `font-size:${w.size}px` }, w.w)))
      : empty('Пока никто не написал'));
    const text = d && typeof d.comment === 'string' ? d.comment.trim() : '';
    card(comment, 'Комментарий группе', text ? h('p', { class: 'outro-text' }, text) : empty('Комментария нет: его можно написать на «Моём экране»'));
  }

  async function load() {
    if (busy || !opened) return;
    busy = true;
    try {
      if (!lessonTried) {
        lessonTried = true;
        try { lesson = await loadLesson(ref.discipline, ref.lesson); } catch (e) { lesson = null; /* без файла — подписи по id */ }
      }
      const d = await call('boardOutro', ref);
      if (!alive() || !opened) return;
      if (d && d.ok === false) { status.textContent = d.error || 'Не получилось'; return; }
      status.textContent = '';
      paint(d);
    } catch (e) {
      if (alive() && !(e && e.handled)) status.textContent = 'нет связи';
    } finally { busy = false; }
  }

  card(mistakes, 'Частые ошибки', empty('Загружаем…'));
  card(refl, 'Умею / частично / пока нет', empty('Загружаем…'));
  card(cloud, 'В следующий раз я…', empty('Загружаем…'));
  card(comment, 'Комментарий группе', empty('Загружаем…'));

  return {
    el,
    isOpen: () => opened,
    onToTiles(fn) { onToTiles = fn; },
    open() {
      if (opened) return;
      opened = true;
      load();
      timer = setInterval(() => {
        if (!alive()) { clearInterval(timer); opened = false; return; }
        if (!document.hidden) load();
      }, OUTRO_POLL_MS);
    },
    close() { opened = false; clearInterval(timer); timer = null; },
  };
}

// Поле «Комментарий группе» для «Моего экрана»: до COMMENT_LIMIT символов, «Сохранить» -> adminGroupComment; на доске виден сразу.
export function createCommentForm({ call, ref, alive = () => true }) {
  let saved = '';
  const area = h('textarea', { rows: '3', class: 'outro-area', 'aria-label': 'Комментарий группе' });
  const count = h('span', { class: 'hint' });
  const status = h('p', { class: 'hint', role: 'status' });
  const btn = h('button', { class: 'btn primary small', type: 'button' }, 'Сохранить');
  function refresh() {
    const s = commentState(area.value, saved);
    count.textContent = `${s.len} / ${COMMENT_LIMIT}`;
    btn.disabled = !s.canSave;
  }
  area.addEventListener('input', () => { status.textContent = ''; refresh(); });
  btn.addEventListener('click', async () => {
    const text = area.value.trim();
    if (commentState(text, saved).over) return;
    btn.disabled = true;
    status.textContent = 'Сохраняем…';
    try {
      const r = await call('adminGroupComment', { ...ref, text });
      if (!alive()) return;
      if (r && r.ok === false) { status.textContent = r.error || 'Не получилось'; return; }
      saved = text;
      area.value = text;
      status.textContent = text ? 'Сохранено: комментарий уже на доске и у студентов.' : 'Комментарий удалён.';
    } catch (e) {
      if (alive() && !(e && e.handled)) status.textContent = (e && e.message) || 'Нет связи';
    } finally { if (alive()) refresh(); }
  });
  refresh();
  // текущий комментарий подставляем после загрузки (из кэша сервера)
  call('boardOutro', ref).then(d => {
    if (!alive() || !d || d.ok === false || area.value) return;
    saved = typeof d.comment === 'string' ? d.comment.trim() : '';
    area.value = saved;
    refresh();
  }, () => { /* поле работает и без подгрузки */ });
  return h('div', { class: 'outro-form' }, h('h3', {}, 'Комментарий группе'), area, h('div', { class: 'outro-form-foot' }, count, btn), status);
}
