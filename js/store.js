import { newBadges } from './gamification.js';
import { homeworkMark } from './hw-mark.js';

const KEY = 'neurolab.v1';

export const lessonKey = (d, n) => `${d}/${n}`;
// ключ черновика ДЗ — в новом модуле hw-submit.js (в кэше телефона нет его старой копии); здесь только повторный экспорт
export { homeworkDraftKey } from './hw-submit.js';

export function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: k => void m.delete(k) };
}

export function safeLocalStorage() {
  try {
    const s = globalThis.localStorage;
    s.setItem('__t', '1'); s.removeItem('__t');
    return s;
  } catch { return memoryStorage(); }
}

const emptyBucket = () => ({ progress: {}, drafts: {}, hw: {}, xp: 0, badges: [], days: [] });
const empty = () => ({ session: null, me: null, grades: null, adminToken: null, byStudent: Object.create(null), queue: [], configCache: null });

// сохранённые данные могли испортиться или остаться от старой версии — берём только поля нужного типа
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string' && v !== '';
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Запись ДЗ одного ПЗ: { best, max, level, mark, attempts, at, xpScore }; битые записи отбрасываются.
// best/max/level/mark — ОДНА попытка, лучшая по отметке, затем по баллу (как на сервере); xpScore — наибольший балл по всем попыткам
// (от него считается XP: round(xpScore × 5)), не меньше best; у записи старой версии без xpScore он равен best.
const cleanHw = r => (isObj(r) && Number.isFinite(r.best) && Number.isFinite(r.max) && Number.isInteger(r.attempts) && r.attempts >= 0
  ? {
    best: r.best, max: r.max, level: r.level === 'adv' ? 'adv' : 'base', mark: [0, 3, 4, 5].includes(r.mark) ? r.mark : 0, attempts: r.attempts,
    at: typeof r.at === 'string' ? r.at : null, xpScore: Number.isFinite(r.xpScore) ? Math.max(r.xpScore, r.best) : r.best,
  }
  : null);

function sanitizeBucket(raw) {
  const out = emptyBucket();
  if (!isObj(raw)) return out;
  if (isObj(raw.progress)) out.progress = raw.progress;
  if (isObj(raw.drafts)) out.drafts = raw.drafts;
  if (isObj(raw.hw)) for (const k of Object.keys(raw.hw)) { const r = cleanHw(raw.hw[k]); if (r && k !== '__proto__') out.hw[k] = r; }
  if (Number.isFinite(raw.xp)) out.xp = raw.xp;
  for (const k of ['badges', 'days']) if (Array.isArray(raw[k])) out[k] = raw[k];
  return out;
}

// Ответ сервера myProgress -> проверенные поля или null (не тот ответ). Записи с неверным ключом или баллами
// отбрасываются; perfectTypes — объединение по всем ПЗ (для значков за типы заданий).
const PROGRESS_KEY = /^[a-z0-9]+\/\d{1,3}$/;
const timeOf = v => { const t = typeof v === 'string' ? Date.parse(v) : NaN; return isNaN(t) ? null : t; };
// ДЗ ПЗ в ответе сервера: progress[k].hw = { best, max, mark, level, attempts, xpScore } -> запись ДЗ (как cleanHw, но без `at`) или null;
// сервер старой версии не присылает xpScore — тогда он равен best
const cleanServerHw = r => (isObj(r) && Number.isFinite(r.best) && Number.isFinite(r.max) && Number.isInteger(r.attempts) && r.attempts >= 0
  && (r.level === 'base' || r.level === 'adv') && [0, 3, 4, 5].includes(r.mark)
  ? { best: r.best, max: r.max, level: r.level, mark: r.mark, attempts: r.attempts, at: null, xpScore: Number.isFinite(r.xpScore) ? Math.max(r.xpScore, r.best) : r.best }
  : null);
// попытка a лучше b: отметка выше, при равной отметке — выше балл (best)
const hwBetter = (a, b) => a.mark > b.mark || (a.mark === b.mark && a.best > b.best);
// запись согласована сама с собой: отметка — та, что даёт её результат (запись, собранная прежней версией из двух попыток, — нет)
const hwSound = r => r.mark === homeworkMark({ score: r.best, max: r.max, level: r.level });

function cleanServerProgress(data) {
  if (!isObj(data) || data.ok !== true || !isObj(data.progress)) return null;
  const progress = {};
  const hw = {};
  const perfectTypes = [];
  Object.keys(data.progress).forEach(k => {
    const p = data.progress[k];
    if (!PROGRESS_KEY.test(k) || !isObj(p) || !Number.isFinite(p.best) || !Number.isFinite(p.max)) return;
    const h = cleanServerHw(p.hw);
    if (h) hw[k] = h;
    // ПЗ без сдач занятия, только с ДЗ (сервер присылает его с нулями): записи прогресса занятия не создаём
    if (h && p.attempts === 0) return;
    progress[k] = {
      best: p.best, max: p.max, attempts: Number.isFinite(p.attempts) ? p.attempts : 0,
      perfect: p.perfect === true, at: timeOf(p.lastAt) === null ? null : p.lastAt,
    };
    if (Array.isArray(p.perfectTypes)) p.perfectTypes.forEach(t => { if (isStr(t) && !perfectTypes.includes(t)) perfectTypes.push(t); });
  });
  return {
    progress,
    hw,
    xp: Number.isFinite(data.xp) && data.xp > 0 ? data.xp : 0,
    days: Array.isArray(data.days) ? data.days.filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) : [],
    perfectTypes,
  };
}

function sanitizeStudent(s) {
  if (!isObj(s) || !isStr(s.id)) return null;
  const str = v => (typeof v === 'string' ? v : '');
  return { id: s.id, name: str(s.name), group: str(s.group), login: str(s.login) };
}

// Хранилище v1 (progress/xp/... на верхнем уровне, без byStudent) не привязано к студенту — начинаем с пустого состояния.
function sanitize(raw) {
  const out = empty();
  if (!isObj(raw)) return out;
  if (isObj(raw.session) && isStr(raw.session.token)) {
    const student = sanitizeStudent(raw.session.student);
    if (student) out.session = { token: raw.session.token, student };
  }
  if (out.session && isObj(raw.me)) out.me = raw.me;
  if (out.session && isObj(raw.grades)) out.grades = raw.grades;
  if (isStr(raw.adminToken)) out.adminToken = raw.adminToken;
  if (isObj(raw.byStudent)) for (const id of Object.keys(raw.byStudent)) out.byStudent[id] = sanitizeBucket(raw.byStudent[id]);
  // сдачи без studentId нельзя отнести к студенту — отправлять их было бы нечем
  if (Array.isArray(raw.queue)) out.queue = raw.queue.filter(q => isObj(q) && isStr(q.id) && isStr(q.studentId));
  if (isObj(raw.configCache)) out.configCache = raw.configCache;
  return out;
}

export function createStore(storage = safeLocalStorage()) {
  let st = empty();
  try { const raw = storage.getItem(KEY); if (raw) st = sanitize(JSON.parse(raw)); } catch { st = empty(); }
  let anon = emptyBucket(); // без сессии прогресс живёт только в памяти

  // Несколько вкладок пишут в один JSON. Чтобы вкладка не затирала чужие изменения, перед записью её данные
  // сливаются с сохранённым: поля, которые эта вкладка не меняла, берутся из хранилища.
  // dirty — что изменила именно эта вкладка с последней успешной записи.
  const dirty = { admin: false, session: false, me: false, grades: false, config: false, buckets: new Set(), qAdd: new Set(), qDel: new Set() };
  const clearDirty = () => {
    dirty.admin = dirty.session = dirty.me = dirty.grades = dirty.config = false;
    dirty.buckets.clear(); dirty.qAdd.clear(); dirty.qDel.clear();
  };
  const readDisk = () => { try { const raw = storage.getItem(KEY); return raw ? sanitize(JSON.parse(raw)) : null; } catch { return null; } };

  function mergeFrom(disk) {
    if (!disk) return;
    if (!dirty.admin) st.adminToken = disk.adminToken;
    if (!dirty.session) st.session = disk.session;
    if (!dirty.me) st.me = disk.me;
    if (!dirty.grades) st.grades = disk.grades;
    if (!st.session || (st.me && st.me.student && st.me.student.id !== st.session.student.id)) st.me = null;
    if (!st.session) st.grades = null;
    if (!dirty.config) st.configCache = disk.configCache;
    // очередь: объединение по id; снятое с очереди здесь остаётся снятым, снятое в другой вкладке не возвращается
    const byId = new Map();
    disk.queue.forEach(q => { if (!dirty.qDel.has(q.id)) byId.set(q.id, q); });
    st.queue.forEach(q => { if (dirty.qAdd.has(q.id) && !byId.has(q.id)) byId.set(q.id, q); });
    st.queue = Array.from(byId.values());
    // разделы студентов: для изменённых здесь — наш, для остальных — из хранилища
    const merged = Object.create(null);
    Object.keys(disk.byStudent).forEach(id => { merged[id] = disk.byStudent[id]; });
    dirty.buckets.forEach(id => { if (own(st.byStudent, id)) merged[id] = st.byStudent[id]; });
    st.byStudent = merged;
  }
  const save = () => {
    try {
      mergeFrom(readDisk());
      storage.setItem(KEY, JSON.stringify(st));
      clearDirty();
    } catch { /* квота/приватный режим — работаем в памяти */ }
  };
  const sync = () => mergeFrom(readDisk()); // подхватить изменения других вкладок (событие 'storage')
  const touch = () => { if (st.session) dirty.buckets.add(st.session.student.id); };
  if (storage === globalThis.localStorage && typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('storage', e => { if (e.key === null || e.key === KEY) sync(); });
  }

  const studentId = () => (st.session ? st.session.student.id : null);
  // раздел текущего студента; без сессии — пустой раздел в памяти
  function bucket() {
    const id = studentId();
    if (id === null) return anon;
    if (!own(st.byStudent, id)) st.byStudent[id] = emptyBucket();
    return st.byStudent[id];
  }

  return {
    // данные текущего студента + общие поля
    state: () => Object.assign({}, bucket(), { session: st.session, me: st.me, grades: st.grades, queue: st.queue, configCache: st.configCache }),
    session: () => st.session,
    setSession({ token, student }) {
      const s = sanitizeStudent(student);
      if (!isStr(token) || !s) throw new Error('Неверная сессия');
      if (studentId() !== s.id) { st.me = null; st.grades = null; dirty.me = dirty.grades = true; }
      st.session = { token, student: s };
      dirty.session = true;
      anon = emptyBucket();
      save();
      return st.session;
    },
    clearSession() { st.session = null; st.me = null; st.grades = null; dirty.session = dirty.me = dirty.grades = true; anon = emptyBucket(); save(); },
    me: () => st.me,
    setMe(m) { st.me = isObj(m) ? m : null; dirty.me = true; save(); },
    // оценки преподавателя текущего студента: {'dup03/21': {submissionId, items: {taskId: {score, comment}}}}
    grades: () => st.grades,
    setGrades(g) { st.grades = st.session && isObj(g) ? g : null; dirty.grades = true; save(); },
    adminToken: () => st.adminToken,
    setAdminToken(t) { st.adminToken = isStr(t) ? t : null; dirty.admin = true; save(); },
    clearAdminToken() { st.adminToken = null; dirty.admin = true; save(); },
    studentId,
    profile: () => (st.session ? st.session.student : null),
    getDraft: key => bucket().drafts[key] ?? null,
    setDraft(key, draft) { bucket().drafts[key] = draft; touch(); save(); },
    clearDraft(key) { delete bucket().drafts[key]; touch(); save(); },
    progress: key => bucket().progress[key] ?? null,
    recordResult(key, { score, max, at }) {
      const b = bucket();
      const prev = b.progress[key];
      b.progress[key] = {
        best: Math.max(prev?.best ?? 0, score),
        max,
        attempts: (prev?.attempts ?? 0) + 1,
        perfect: !!prev?.perfect || (max > 0 && score === max),
        at,
      };
      const day = String(at).slice(0, 10);
      if (!b.days.includes(day)) b.days.push(day);
      touch();
      save();
      return b.progress[key];
    },
    // ДЗ формата v4: { best, max, level, mark, attempts, at, xpScore } по ПЗ. Попытки считаются на устройстве (лимит 3 проверяет и сервер).
    // best/max/level/mark — одна попытка: лучшая по отметке, затем по баллу (при равенстве остаётся прежняя), как на сервере.
    // XP: round(xpScore × 5), где xpScore — наибольший балл по всем попыткам (не убывает, даже если у лучшей по отметке попытки балл
    // меньше); добавляется прирост сверх уже начисленного; gain в ответе — прирост этой попытки.
    homework: key => (own(bucket().hw, key) ? bucket().hw[key] : null),
    recordHomework(key, { score, max, level, mark, at }) {
      const b = bucket();
      const prev = own(b.hw, key) ? b.hw[key] : null;
      const better = !prev || hwBetter({ mark, best: score }, prev);
      const prevXp = prev ? prev.xpScore : 0;
      const rec = {
        best: better ? score : prev.best,
        max: better ? max : prev.max,
        level: better ? level : prev.level,
        mark: better ? mark : prev.mark,
        attempts: (prev ? prev.attempts : 0) + 1,
        at,
        xpScore: Math.max(prevXp, score),
      };
      b.hw[key] = rec;
      const gain = Math.max(0, Math.round(rec.xpScore * 5) - Math.round(prevXp * 5));
      b.xp += gain;
      touch();
      save();
      return Object.assign({}, rec, { gain });
    },
    // Слияние прогресса с сервера (другое устройство) с локальным; true — что-то изменилось.
    // forStudentId — для кого запрашивали: ответ сливается, только если и запрос, и ответ — для текущего студента.
    // По ПЗ: лучший балл и число попыток — больше из двух, perfect — у любого, max — с сервера, время — позднее;
    // ПЗ, которых нет на сервере (офлайн-очередь), остаются. Дни — объединение, XP — больший (локальный может быть
    // впереди только из-за очереди). Значки: прежние + те, что открывает объединённое состояние.
    // ДЗ (progress[k].hw) сливается в раздел hw: см. комментарий ниже.
    mergeServerProgress(data, forStudentId) {
      const id = studentId();
      if (id === null || !isStr(forStudentId) || forStudentId !== id || !isObj(data) || data.studentId !== id) return false;
      const srv = cleanServerProgress(data);
      if (!srv) return false;
      const b = bucket();
      const before = JSON.stringify([b.progress, b.hw, b.xp, b.badges, b.days]);
      // ДЗ: попытки и xpScore — больше из двух; результат (best, max, level, mark) целиком у записи с лучшей отметкой, при равной — с
      // большим баллом; при полном равенстве остаётся локальная запись (повторное слияние ничего не меняет). Локальная запись, не
      // согласованная сама с собой (отметка не та, что даёт её результат: прежняя версия склеивала лучший балл одной попытки с лучшей
      // отметкой другой), уступает серверной безусловно — гибрид чинится.
      Object.keys(srv.hw).forEach(k => {
        const sh = srv.hw[k];
        const lh = own(b.hw, k) ? b.hw[k] : null;
        if (!lh) { b.hw[k] = sh; return; }
        const win = !hwSound(lh) || hwBetter(sh, lh) ? sh : lh;
        b.hw[k] = {
          best: win.best, max: win.max, level: win.level, mark: win.mark,
          attempts: Math.max(lh.attempts, sh.attempts), at: lh.at, xpScore: Math.max(lh.xpScore, sh.xpScore),
        };
      });
      Object.keys(srv.progress).forEach(k => {
        const sp = srv.progress[k];
        const lp = own(b.progress, k) && isObj(b.progress[k]) ? b.progress[k] : null;
        if (!lp) { b.progress[k] = sp; return; }
        const la = timeOf(lp.at);
        const sa = timeOf(sp.at);
        b.progress[k] = {
          best: Math.max(Number.isFinite(lp.best) ? lp.best : 0, sp.best),
          max: sp.max,
          attempts: Math.max(Number.isFinite(lp.attempts) ? lp.attempts : 0, sp.attempts),
          perfect: !!lp.perfect || sp.perfect,
          at: sa !== null && (la === null || sa > la) ? sp.at : lp.at,
        };
      });
      const extraDays = srv.days.filter((d, i) => !b.days.includes(d) && srv.days.indexOf(d) === i);
      if (extraDays.length) b.days = b.days.concat(extraDays).sort();
      b.xp = Math.max(b.xp, srv.xp);
      const fresh = newBadges(b, { perfectTypes: srv.perfectTypes });
      if (fresh.length) b.badges = b.badges.concat(fresh);
      const changed = JSON.stringify([b.progress, b.hw, b.xp, b.badges, b.days]) !== before;
      if (changed) { touch(); save(); }
      return changed;
    },
    addXp(n) { const b = bucket(); b.xp += n; touch(); save(); return b.xp; },
    addBadges(ids) {
      const b = bucket();
      const fresh = ids.filter(id => !b.badges.includes(id));
      b.badges.push(...fresh);
      touch();
      save();
      return fresh;
    },
    enqueue(item) { if (!st.queue.some(q => q.id === item.id)) st.queue.push(item); dirty.qAdd.add(item.id); dirty.qDel.delete(item.id); save(); },
    dequeue(id) { st.queue = st.queue.filter(q => q.id !== id); dirty.qDel.add(id); dirty.qAdd.delete(id); save(); },
    queue: () => st.queue,
    getConfigCache: () => st.configCache,
    setConfigCache(cfg) { st.configCache = cfg; dirty.config = true; save(); },
    sync,
  };
}
