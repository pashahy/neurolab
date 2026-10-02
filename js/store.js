const KEY = 'neurolab.v1';

export const lessonKey = (d, n) => `${d}/${n}`;

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

const emptyBucket = () => ({ progress: {}, drafts: {}, xp: 0, badges: [], days: [] });
const empty = () => ({ session: null, me: null, grades: null, adminToken: null, byStudent: Object.create(null), queue: [], configCache: null });

// сохранённые данные могли испортиться или остаться от старой версии — берём только поля нужного типа
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string' && v !== '';
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function sanitizeBucket(raw) {
  const out = emptyBucket();
  if (!isObj(raw)) return out;
  if (isObj(raw.progress)) out.progress = raw.progress;
  if (isObj(raw.drafts)) out.drafts = raw.drafts;
  if (Number.isFinite(raw.xp)) out.xp = raw.xp;
  for (const k of ['badges', 'days']) if (Array.isArray(raw[k])) out[k] = raw[k];
  return out;
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
