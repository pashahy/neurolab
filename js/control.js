// Контрольная: чистая логика клиента. Сервер (myControl / controlStart) отдаёт настройки и серверное время начала;
// здесь ответ проверяется, считается остаток времени, задания перемешиваются детерминированно от ID студента, решается,
// скрыты ли ответы. Экран и таймер — в js/ui/control.js.

const DISCS = ['dup01', 'dup03'];

export const CONTROL_HIDDEN_TEXT = 'Результат и правильные ответы будут доступны после окончания контрольной.';

const posInt = v => Number.isInteger(v) && v > 0;
const timeOrNull = v => (Number.isFinite(v) && v > 0 ? v : null);

// Ответ сервера -> { offset, controls: [...] }; offset = серверное время минус часы телефона (мс). Неверный ответ -> null.
export function normalizeControl(resp, receivedAt = Date.now()) {
  if (!resp || resp.ok !== true || !Array.isArray(resp.controls) || !Number.isFinite(resp.now)) return null;
  const controls = [];
  resp.controls.forEach(x => {
    if (!x || !DISCS.includes(x.d) || !posInt(x.n) || !posInt(x.minutes)) return;
    controls.push({
      d: x.d, n: x.n, minutes: x.minutes, until: timeOrNull(typeof x.until === 'number' ? x.until : Date.parse(x.until)),
      ended: x.ended === true, closed: x.closed === true, started: timeOrNull(x.started), endsAt: timeOrNull(x.endsAt), done: x.done === true,
    });
  });
  return { offset: resp.now - receivedAt, controls };
}

export const controlFor = (info, d, n) => (info && info.controls.find(c => c.d === d && c.n === Number(n))) || null;

export const serverNow = (info, now = Date.now()) => now + (info ? info.offset : 0);

// Остаток времени студента, мс (не меньше 0); null — контрольная не начата.
export function remainingMs(ctl, info, now = Date.now()) {
  if (!ctl || !ctl.endsAt) return null;
  return Math.max(0, ctl.endsAt - serverNow(info, now));
}

// Фаза экрана: 'ended' — контрольная окончена для всех (ответы можно показывать, ПЗ идёт как обычно);
// 'done' — студент уже сдал; 'start' — ещё не начата и начать можно; 'late' — не начата, окно начала закрыто;
// 'running' — идёт время; 'timeup' — время студента вышло, а сдачи нет (автосдача сработает на экране).
export function controlPhase(ctl, info, now = Date.now()) {
  if (!ctl) return 'none';
  if (ctl.ended) return 'ended';
  if (ctl.done) return 'done';
  if (!ctl.started) return ctl.until && serverNow(info, now) > ctl.until ? 'late' : 'start';
  return remainingMs(ctl, info, now) > 0 ? 'running' : 'timeup';
}

// Ответы и решения скрыты, пока контрольная идёт (и пока студент в ней), — до окончания.
export const answersHidden = ctl => !!ctl && !ctl.ended;

export function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const p = n => (n < 10 ? '0' : '') + n;
  const h = Math.floor(s / 3600);
  return h ? `${h}:${p(Math.floor(s % 3600 / 60))}:${p(s % 60)}` : `${p(Math.floor(s / 60))}:${p(s % 60)}`;
}

// ---------- перемешивание ----------

// Числовой отпечаток строки (FNV-1a, 32 бита).
export function hashSeed(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Перемешивание Фишера-Йетса; одинаковые (arr, seed) дают одинаковый порядок.
export function shuffleSeeded(arr, seed) {
  const out = arr.slice();
  const r = rng(hashSeed(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = out[i]; out[i] = out[j]; out[j] = t;
  }
  return out;
}

// Порядок практики для студента. Группы (базовые и ⭐) перемешиваются отдельно и остаются на своих местах (v4: сначала базовые, потом ⭐);
// задания командного кейса (t.case) остаются на местах, как в файле. Состав заданий не меняется: баллы и черновик считаются по id.
export function orderPractice(tasks, studentId, lessonKey, isAdvFn) {
  const list = Array.isArray(tasks) ? tasks : [];
  const adv = isAdvFn || (() => false);
  const movable = t => t && !t.case;
  const out = list.slice();
  [false, true].forEach(star => {
    const slots = [];
    list.forEach((t, i) => { if (movable(t) && !!adv(t) === star) slots.push(i); });
    const mixed = shuffleSeeded(slots.map(i => list[i]), `${studentId}|${lessonKey}|${star ? 'adv' : 'base'}`);
    slots.forEach((slot, k) => { out[slot] = mixed[k]; });
  });
  return out;
}

// ---------- обмен с сервером ----------

// Настройки контрольных и начало студента или null (нет связи, старый сервер, ошибка).
export async function fetchControl(api) {
  try { return normalizeControl(await api.call('myControl')); } catch (e) { return null; }
}

// Зафиксировать начало на сервере. { ok: true, info-patch } или { ok: false, error, network }.
export async function startControl(api, d, n) {
  try {
    const r = await api.call('controlStart', { discipline: d, lesson: n });
    const info = normalizeControl({ ok: true, now: r.now, controls: r.control ? [r.control] : [] });
    return { ok: !!(info && info.controls[0]), info, error: info && info.controls[0] ? '' : 'Нет ответа сервера' };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : 'Ошибка', network: !!(e && e.network) };
  }
}

