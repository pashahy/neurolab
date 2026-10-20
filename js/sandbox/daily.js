// Задача дня: состояние карточки, тексты итога и панель сдачи (Python и терминал).
import { h } from '../util/dom.js';
import { md } from '../util/text.js';
import { runPython } from '../tasks/python-runner.js';
import { sandboxApi } from './api.js';
import { submitSandbox, buildSandboxSolution } from './submit-sbx.js';
import { createSandboxStorage } from './storage.js';
import { mountHints } from './hints.js';
import { STALE_TEXT, rejectText, moscowDate, bonusPoints, awardSandboxBadges } from './sbx-extra.js';

export const CLOSED_TEXT = 'Игра спит до 5:00 — инструменты работают';
export const HELD_TEXT = 'Игра спит до 5:00. Решение уйдёт утром и засчитается, если это задача сегодняшнего дня.';
export const QUEUED_TEXT = 'Решение отправится, когда появится связь';
export const NEED_NET_TEXT = 'Нужна сеть, чтобы получить проверочные данные';
export const NO_TASK_TEXT = 'Задач на сегодня нет — загляни в песочницу';
export const DISCIPLINE_NAMES = { dup01: 'ДУП.01', dup03: 'ДУП.03' };

// closed — игра закрыта ночью; none — на сегодня задачи нет; solved — уже решена; open — можно решать
export function cardState(task, today) {
  if (today && today.closed) return 'closed';
  if (!task) return 'none';
  if (task.solved) return 'solved';
  return 'open';
}

export const taskPoints = task => (task && task.star ? 20 : 10);

// Что сказать после сдачи: { kind: 'ok' | 'fail' | 'queued' | 'held' | 'rejected', text, failed? }
export function outcomeView(sub) {
  if (!sub) return { kind: 'fail', text: 'Что-то пошло не так' };
  if (sub.state === 'queued') return { kind: 'queued', text: QUEUED_TEXT };
  if (sub.state === 'held') return { kind: 'held', text: sub.reason === 'lesson' ? 'Игра на паузе, пока идёт пара — решение уйдёт после пары' : HELD_TEXT };
  if (sub.state === 'rejected') return { kind: 'rejected', text: rejectText(sub.error) };
  const r = sub.result || {};
  if (r.correct) {
    if (r.already) return { kind: 'ok', text: 'Эта задача уже решена — очки были начислены раньше', points: 0, already: true };
    const ok = { kind: 'ok', text: 'Верно!', points: Number(r.points) || 0, bonus: bonusPoints(r.bonus), streak: Number(r.streak) || 0 };
    if (Number(r.hintsUsed) > 0) ok.hintsUsed = Number(r.hintsUsed);
    if (r.chapter && typeof r.chapter === 'object') ok.chapter = { id: Number(r.chapter.id) || 0, points: Number(r.chapter.points) || 0 }; // квест: глава пройдена
    return ok;
  }
  const failed = Array.isArray(r.failed) ? r.failed : [];
  if (r.score !== undefined && r.min !== undefined) { // задание-промпт: порог по оценке, а не номера проверок
    return { kind: 'fail', failed, text: `Оценка промпта ${Number(r.score)} из 100, нужно не меньше ${Number(r.min)}. Поправь промпт и сдай ещё раз` };
  }
  return { kind: 'fail', failed, text: failed.length ? `Не прошли проверки № ${failed.map(i => Number(i) + 1).join(', ')}. Проверь и сдай ещё раз` : 'Пока не сходится. Проверь и сдай ещё раз' };
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// конфетти на canvas, до 1,2 с; при prefers-reduced-motion — ничего
export function confetti(host) {
  if (reduced() || typeof requestAnimationFrame !== 'function') return;
  const cv = h('canvas', { class: 'sbx-confetti', 'aria-hidden': 'true' });
  const w = host.clientWidth || 320;
  const ht = Math.max(host.clientHeight, 200);
  cv.width = w; cv.height = ht;
  host.append(cv);
  const ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) { cv.remove(); return; }
  const colors = ['#6d5dfc', '#a64ef0', '#e2559c', '#ff7a59', '#22c55e'];
  const ps = [];
  for (let i = 0; i < 46; i++) {
    ps.push({ x: w / 2, y: ht * 0.35, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 7 - 2, s: 4 + Math.random() * 4, c: colors[i % colors.length], r: Math.random() * 6 });
  }
  const t0 = Date.now();
  const step = () => {
    const t = Date.now() - t0;
    if (t > 1200) { cv.remove(); return; }
    ctx.clearRect(0, 0, w, ht);
    ctx.globalAlpha = Math.min(1, (1200 - t) / 400);
    ps.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.r += 0.2;
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x, p.y, p.s, p.s * 0.6);
    });
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// счётчик очков: от 0 до value за ~0,6 с. Итог пишем сразу; анимируем только на видимой вкладке,
// а таймер на ~0,7 с всегда оставляет итоговое значение (в фоне requestAnimationFrame не срабатывает).
export function countUp(el, value, label) {
  const fmt = n => `+${n} ${label}`;
  el.textContent = fmt(value);
  const visible = typeof document !== 'undefined' && document.visibilityState === 'visible';
  if (reduced() || typeof requestAnimationFrame !== 'function' || !visible || value <= 0) return;
  const t0 = Date.now();
  let over = false;
  const step = () => {
    if (over) return;
    const k = Math.min(1, (Date.now() - t0) / 600);
    el.textContent = fmt(Math.round(value * k));
    if (k < 1) requestAnimationFrame(step);
  };
  setTimeout(() => { over = true; el.textContent = fmt(value); }, 700);
  step();
}

const KIND_TITLE = { py: 'Python', term: 'Терминал', prompt: 'Промпт', api: 'API', docker: 'Docker' };
const LIVE_KEY = { py: 'python', term: 'terminal', prompt: 'extra', api: 'extra', docker: 'extra' }; // где задача лежит в ответе today

// Панель задачи: условие, кнопка «Сдать», итог. deps (необязательно): { app } — иначе берётся opts.app.
// opts: { d, task, kind: 'py'|'term'|'prompt'|'api'|'docker', getCode?, getHistory?, getBlocks?, getApiHistory?, app, onResult? }
// prompt: getBlocks() -> блоки; api: getApiHistory() -> [{ method, path, body }] (+ поле ответа, если у задачи hasAnswer); docker: getHistory() как у терминала
export function mountDailyPanel(container, opts) {
  const { d, task, kind, app } = opts;
  const quest = opts.source === 'quest'; // шаг квеста: очки только за главу целиком
  const tree = opts.source === 'tree' || quest; // челлендж дерева навыков и шаг квеста: без даты, подсказок и серии
  const treeSrc = tree ? opts.source : undefined;
  const api = sandboxApi(app.api);
  const storage = createSandboxStorage(app.store);
  const result = h('div', { class: 'sbx-result', role: 'status', 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn primary big', type: 'button' }, quest ? 'Сдать шаг' : tree ? 'Сдать челлендж' : 'Сдать задачу дня');
  const hintHost = h('div', { class: 'sbx-hint-host' });
  const textBox = h('div', { class: 'sbx-task-text', html: md(task.text || '') });
  const wantsAnswer = kind === 'api' && !!task.hasAnswer;
  const draft = storage.loadDaily(d, task.id) || {};
  const answerIn = wantsAnswer ? h('input', {
    class: 'sbx-answer', type: 'text', maxlength: '200', 'aria-label': 'Ответ', placeholder: 'Ответ на вопрос задачи',
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', value: typeof draft.answer === 'string' ? draft.answer : '',
    oninput: e => storage.saveDaily(d, task.id, { answer: e.target.value }),
  }) : null;
  const box = h('section', { class: 'card sbx-daily' },
    h('div', { class: 'sbx-daily-head' },
      h('span', { class: 'sbx-pill' }, KIND_TITLE[kind] || ''),
      quest ? h('span', { class: 'sbx-pts' }, 'Очки — за главу')
        : tree ? (task.star ? h('span', { class: 'sbx-star', title: 'Со звёздочкой: 10 очков' }, '⭐ 10 очков') : h('span', { class: 'sbx-pts' }, '5 очков'))
        : task.star ? h('span', { class: 'sbx-star', title: 'Со звёздочкой: 20 очков' }, '⭐ 20 очков') : h('span', { class: 'sbx-pts' }, '10 очков')),
    h('h2', { class: 'sbx-daily-title' }, task.title),
    textBox, hintHost, answerIn, btn, result);
  container.append(box);
  const hints = mountHints(hintHost, { app, d, task, source: treeSrc });
  let busy = false;
  let solution = null; // та же сдача (тот же id) при повторной отправке из очереди

  const say = (cls, text) => { result.className = `sbx-result ${cls}`; result.textContent = text; };

  async function collect() {
    // дата берётся из дня задачи; страница могла дожить до новой даты (по Москве) — тогда заново спрашиваем сервер
    if (!tree && (!opts.date || opts.date !== moscowDate())) {
      const t = await api.today();
      if (t.closed) return { stop: t.reason === 'lesson' ? 'Игра на паузе, пока идёт пара — инструменты работают' : CLOSED_TEXT };
      const cur = ((t.disciplines && t.disciplines[d]) || {})[LIVE_KEY[kind] || 'terminal'];
      if (!cur || cur.id !== task.id) return { stop: STALE_TEXT };
      opts.date = t.date;
    }
    if (kind === 'py') {
      const a = await api.attempt(d, task.id, treeSrc);
      if (a.closed) return { stop: a.reason === 'lesson' ? 'Игра на паузе, пока идёт пара — решение уйдёт после пары' : CLOSED_TEXT, held: true };
      const runs = (a.inputs || []).map(stdin => ({ stdin }));
      const code = opts.getCode ? opts.getCode() : '';
      const pk = storage.loadPy().packages;
      const { results } = await runPython(code, runs, pk.length ? { packages: pk } : undefined);
      const outputs = results.map(r => (r && r.ok ? String(r.output || '') : ''));
      return { sol: buildSandboxSolution({ d, taskId: task.id, date: opts.date, token: a.token, outputs, source: treeSrc }) };
    }
    if (kind === 'prompt') {
      return { sol: buildSandboxSolution({ d, taskId: task.id, date: opts.date, blocks: opts.getBlocks ? opts.getBlocks() : {}, source: treeSrc }) };
    }
    if (kind === 'api') {
      const reqs = (opts.getApiHistory ? opts.getApiHistory() : []).slice(-100).map(e => ({ method: String(e.method), path: String(e.path), body: typeof e.body === 'string' ? e.body : '' }));
      return { sol: buildSandboxSolution({ d, taskId: task.id, date: opts.date, history: reqs, answer: answerIn ? String(answerIn.value).slice(0, 200) : undefined, source: treeSrc }) };
    }
    const history = opts.getHistory ? opts.getHistory() : [];
    return { sol: buildSandboxSolution({ d, taskId: task.id, date: opts.date, history: history.slice(-200).map(c => String(c).slice(0, 500)), source: treeSrc }) };
  }

  async function submit() {
    if (busy) return null;
    busy = true; btn.disabled = true;
    say('wait', kind === 'py' ? 'Проверяем решение…' : 'Отправляем…');
    let out;
    try {
      if (!solution) {
        const c = await collect();
        if (c.stop) { say('held', c.stop); return { state: 'held' }; }
        solution = c.sol;
      }
      const sub = await submitSandbox(app.submitter, solution);
      if (sub.state === 'held') { // очередь хранит только error: причину паузы спрашиваем у сервера
        try { const t = await api.today(); if (t && t.reason) sub.reason = t.reason; } catch (e) { /* текст по умолчанию */ }
      }
      if (sub.state !== 'queued') solution = null; // queued оставляем: повтор уйдёт с тем же id
      out = outcomeView(sub);
      let earned = [];
      if (sub.state === 'done' && sub.result && sub.result.stats) {
        storage.saveStats(sub.result.stats);
        earned = awardSandboxBadges(app.store);
      }
      show(out, sub, earned);
      if (quest && out.kind === 'ok' && typeof CustomEvent === 'function') box.dispatchEvent(new CustomEvent('quest-step', { bubbles: true, detail: { ok: true, already: !!out.already, chapter: out.chapter || null } }));
      if (out.kind === 'fail' && sub.state === 'done') hints.fail();
      if (out.kind === 'ok') hints.done();
      if (opts.onResult) opts.onResult(sub);
      return sub;
    } catch (e) {
      if (kind === 'py' && e && (e.network || /fetch|network|Failed/i.test(String(e.message)))) say('bad', NEED_NET_TEXT);
      else say('bad', 'Не получилось проверить. Попробуй ещё раз');
      return { state: 'error' };
    } finally {
      busy = false; btn.disabled = false;
    }
  }

  function show(v, sub, earned) {
    result.className = `sbx-result ${v.kind}`;
    result.replaceChildren();
    if (quest && v.kind === 'ok' && !v.already) {
      result.append(h('p', { class: 'sbx-ok-title' }, v.chapter ? `Верно! Глава ${v.chapter.id} пройдена` : 'Верно! Шаг пройден'));
      if (v.chapter) {
        const cp = h('div', { class: 'sbx-points' });
        result.append(cp);
        countUp(cp, v.chapter.points, 'очков за главу');
      }
      btn.hidden = true;
      confetti(box);
      return;
    }
    if (v.kind === 'ok' && !v.already) {
      const pts = h('div', { class: 'sbx-points' });
      result.append(h('p', { class: 'sbx-ok-title' }, v.text), pts);
      countUp(pts, v.points, v.hintsUsed ? 'очков (с подсказкой)' : 'очков');
      if (v.bonus) result.append(h('p', { class: 'sbx-bonus' }, `Бонус за серию: +${v.bonus}`));
      if (v.streak) result.append(h('p', { class: 'sbx-flame pop' }, `🔥 Серия ${v.streak}`));
      (earned || []).forEach(b => result.append(h('p', { class: 'sbx-badge pop' }, `${b.icon} Новый значок: ${b.title}`)));
      btn.hidden = true;
      confetti(box);
      return;
    }
    if (v.kind === 'ok') { result.append(h('p', {}, v.text)); btn.hidden = true; return; }
    result.append(h('p', {}, v.text));
    if (v.kind === 'rejected' || v.kind === 'fail') btn.textContent = 'Решить ещё раз';
    if (v.kind === 'queued' || v.kind === 'held') btn.hidden = true;
  }

  btn.addEventListener('click', submit);
  return { submit };
}
