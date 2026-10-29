// Контрольная (экраны): начало, «уже сдана / закончилась / нужна связь», таймер и заглушка скрытого ответа.
// Логика — js/control.js; сервер — controlStart / myControl (Code.gs). Подключение к занятию — в js/ui/lesson.js (controlSetup).
import { h } from '../util/dom.js';
import { fetchControl, startControl, controlFor, controlPhase, remainingMs, answersHidden, fmtClock, CONTROL_HIDDEN_TEXT } from '../control.js';

const STORE_KEY = 'neurolab.control.seen';
const safeStorage = () => { try { return globalThis.localStorage; } catch { return null; } };

// Какие ПЗ были контрольными (запоминается на телефоне): без связи экран не должен пропускать студента в обычное занятие.
function seenRead(who) {
  try { const o = JSON.parse(safeStorage().getItem(STORE_KEY)); return o && o.who === who && Array.isArray(o.keys) ? o.keys : []; } catch { return []; }
}
function seenWrite(who, keys) {
  try { safeStorage().setItem(STORE_KEY, JSON.stringify({ who, keys })); } catch { /* без хранилища */ }
}

const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);

function card(back, ...children) {
  return h('div', { class: 'card ctl-card' }, ...children, h('a', { class: 'btn ghost big', href: back }, '← К карте курса'));
}

// -> null (обычное занятие) | { screen } (вместо занятия) | { run } (занятие идёт как контрольная)
// run: { ctl, info, seed, sealed(), refresh() }
export async function controlSetup({ app, discipline, n, key, rerun }) {
  const back = `#/d/${discipline}`;
  const who = app.store.studentId();
  const info = await fetchControl(app.api);
  const tag = `${discipline}/${n}`;
  if (!info) {
    // нет связи или старый сервер: если это ПЗ уже было контрольным, нужна связь (иначе сдача всё равно будет отклонена)
    if (seenRead(who).includes(tag)) {
      return { screen: card(back, h('h1', {}, 'Контрольная: нужна связь'), h('p', {}, 'Чтобы открыть контрольную, подключитесь к интернету. Время начинается только на сервере.'),
        h('button', { class: 'btn primary big', type: 'button', onclick: rerun }, 'Повторить')) };
    }
    return null;
  }
  const ctl = controlFor(info, discipline, n);
  const keys = seenRead(who);
  if (ctl && !keys.includes(tag)) seenWrite(who, keys.concat(tag));
  if (!ctl) return null;
  const phase = controlPhase(ctl, info);
  if (phase === 'done') {
    return { screen: card(back, h('div', { class: 'done-icon', 'aria-hidden': 'true' }, '✅'), h('h1', {}, 'Контрольная сдана'),
      h('p', {}, ctl.ended ? 'Контрольная окончена. Результат — на карте курса и в профиле.' : CONTROL_HIDDEN_TEXT)) };
  }
  if (phase === 'ended' && !ctl.started) {
    return { screen: card(back, h('h1', {}, 'Контрольная закончилась'), h('p', {}, 'Вы не начинали её вовремя. Обратитесь к преподавателю.')) };
  }
  if (phase === 'late') {
    return { screen: card(back, h('h1', {}, 'Время начала истекло'), h('p', {}, 'Окно для начала контрольной закрыто. Обратитесь к преподавателю.')) };
  }
  if (phase === 'start') {
    const err = h('p', { class: 'error', role: 'alert' });
    const btn = h('button', { class: 'btn primary big', type: 'button' }, 'Начать контрольную');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      err.textContent = '';
      const r = await startControl(app.api, discipline, n);
      if (!r.ok) {
        btn.disabled = false;
        err.textContent = r.network ? 'Нет связи: чтобы начать, нужен интернет. Подключитесь и повторите.' : r.error;
        return;
      }
      app.store.clearDraft(key); // старые ответы (обычное прохождение до контрольной) не переносятся
      rerun();
    });
    return { screen: card(back, h('h1', {}, 'Контрольная'),
      h('ul', { class: 'ctl-rules' },
        h('li', {}, `Время: ${ctl.minutes} ${plural(ctl.minutes, 'минута', 'минуты', 'минут')}. Оно идёт по часам сервера, даже если закрыть страницу.`),
        h('li', {}, 'Одна попытка: после сдачи вернуться и переделать нельзя.'),
        h('li', {}, 'Порядок заданий у каждого свой. Правильные ответы и баллы скрыты до окончания контрольной.'),
        h('li', {}, 'Когда время выйдет, работа отправится сама.'),
        h('li', {}, 'Начать можно только при подключении к интернету.')),
      btn, err) };
  }
  // running / timeup / ended (начата, не сдана): занятие идёт; ответы скрыты, пока контрольная не окончена
  const run = {
    ctl, info, seed: who,
    sealed: () => answersHidden(ctl),
    refresh: async () => { // раз в полминуты: преподаватель мог закрыть контрольную
      const fresh = await fetchControl(app.api);
      const c = fresh && controlFor(fresh, discipline, n);
      if (c) { ctl.ended = c.ended; ctl.closed = c.closed; ctl.done = c.done; run.info = fresh; run.ctl.endsAt = c.endsAt || ctl.endsAt; }
    },
  };
  return { run };
}

// Плавающий таймер. onExpire вызывается один раз: время студента вышло или контрольную закрыл преподаватель.
export function mountControlTimer(run, { active, onExpire }) {
  const box = h('div', { class: 'ctl-timer', role: 'timer', 'aria-live': 'off' });
  document.body.append(box);
  let fired = false;
  let lastPoll = Date.now();
  const stop = () => { clearInterval(iv); box.remove(); };
  const tick = () => {
    if (!active()) { stop(); return; }
    const left = remainingMs(run.ctl, run.info);
    const over = left === 0 || run.ctl.ended;
    box.textContent = over ? 'Время вышло' : `⏱ ${fmtClock(left)}`;
    box.classList.toggle('low', !over && left < 5 * 60000);
    if (over && !fired) { fired = true; onExpire(); }
    if (!over && Date.now() - lastPoll > 30000) { lastPoll = Date.now(); run.refresh().catch(() => { /* нет связи: считаем по своим часам */ }); }
  };
  const iv = setInterval(tick, 500);
  tick();
  return { stop };
}

// Вместо проверенного задания: ответ принят, правильный вариант и баллы не показываются.
export function sealedAnswer(body, feedback) {
  body.replaceChildren(h('div', { class: 'fb manual ctl-sealed' }, h('strong', {}, '🔒 Ответ принят'), h('p', {}, CONTROL_HIDDEN_TEXT)));
  feedback.replaceChildren();
}

// Рефлексия v4 при скрытых ответах: «В следующий раз…» не спрашивается (иначе по требованию текста видно, что были ошибки).
export function sealedNext(refl, min) {
  if (typeof refl.next !== 'string' || refl.next.trim().length < min) refl.next = 'Контрольная: итоги после окончания'.padEnd(min, '.');
}

export function sealedResultCard() {
  return h('div', { class: 'card result ctl-sealed' }, h('h2', {}, '🔒 Работа готова к сдаче'), h('p', { class: 'muted' }, CONTROL_HIDDEN_TEXT));
}

export function controlDoneBox(back, sent) {
  return h('div', { class: 'done' },
    h('div', { class: 'done-icon', 'aria-hidden': 'true' }, sent ? '✅' : '💾'),
    h('h1', {}, sent ? 'Контрольная сдана' : 'Контрольная сохранена на телефоне'),
    h('p', {}, sent ? CONTROL_HIDDEN_TEXT : 'Работа отправится сама, когда появится связь. Не очищайте данные браузера.'),
    h('a', { class: 'btn primary big', href: back }, 'К карте курса'));
}
