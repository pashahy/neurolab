import { createStore } from './store.js';
import { createSubmitter } from './submit.js';
import { createApi } from './api.js';
import { createProgressSync } from './progress-sync.js';
import { createRefreshGate, createRatingLoader, watchSubmissions } from './refresh-gate.js';
import { createAccountRefresh } from './account-refresh.js';
import { liveCapable } from './submit-status.js';
import { API_URL } from './config.js';
import { h } from './util/dom.js';
import { safeNext, expiryNext, identityChanged } from './nav.js';
import { lessonKey } from './store.js';
import { renderLogin } from './ui/login.js';
import { renderProfile } from './ui/profile.js';
import { renderHome } from './ui/home.js';
import { renderCourse } from './ui/course.js';
import { renderLesson } from './ui/lesson.js';
import { renderRating } from './ui/rating.js';
import { renderAdmin } from './admin/app.js';

const store = createStore();
const LOGIN_WAIT_MS = 10000; // сколько вход ждёт me, прежде чем открыть экран (обновление продолжится в фоне)
const CACHED_WAIT_MS = 4000; // с сохранённым me проверка доступа на занятии ждёт сервер недолго
const delay = ms => new Promise(r => setTimeout(r, ms));

const app = {
  store,
  flash: '', // сообщение для экрана входа («Сессия истекла…»)
  adminFlash: '', // то же для формы входа администратора
  api: createApi({ url: API_URL, getToken: () => store.session()?.token ?? null, getAdminToken: () => store.adminToken() }),
  root: document.getElementById('app'),
  routeId: 0,
  go(path) { if (location.hash.replace(/^#/, '') === path) route(); else location.hash = path; },
  rerender: () => route(),
  submittedKey: null, // ключ занятия, работа по которому только что сдана (для возврата после истечения сессии)
};
app.submitter = createSubmitter({ store, url: API_URL, onAuthRequired: () => app.authExpired() });
// Тяжёлые фоновые запросы (оценки, прогресс, рейтинг) — не чаще раза в минуту на студента; пока идёт отправка его работ
// (запрос в полёте или ждёт повтор, не дольше 5 сбоев подряд) оценки и прогресс откладываются, чтобы сдаче досталась
// мощность сервера. me (доступ к занятиям) обновляется всегда, с паузой 15 с.
app.refreshGate = createRefreshGate();
// старая копия submit.js из кэша телефона может не знать busy(): тогда фоновые запросы не откладываются
const submitBusy = () => typeof app.submitter.busy === 'function' && app.submitter.busy();
// прогресс с сервера (другие устройства): при входе и на главной и карте курса, не чаще раза в 2 минуты на студента
app.syncProgress = createProgressSync({ api: app.api, store, onAuth: () => app.authExpired(), isBusy: submitBusy });
app.loadRating = createRatingLoader({ api: app.api, gate: app.refreshGate, getStudentId: () => store.studentId() }).load;

const currentPath = () => (location.hash.replace(/^#/, '') || '/').split('?')[0];

// сессия недействительна: неотправленные работы остаются в очереди, студент входит заново
app.authExpired = function authExpired() {
  if (!store.session()) return;
  const p = currentPath().split('/').filter(Boolean);
  if (p[0] === 'admin') { store.clearSession(); return; } // админ-панель работает без студенческой сессии: на экран входа не уводим
  const key = p[0] === 'd' && p[1] && p[2] ? lessonKey(p[1], p[2]) : null;
  const next = expiryNext(currentPath(), { draft: key !== null && store.getDraft(key) != null, submitted: key !== null && app.submittedKey === key });
  store.clearSession();
  app.flash = 'Сессия истекла, войдите снова';
  app.go(`/login?next=${encodeURIComponent(next)}`);
};

// me + оценки; true, если данные изменились (подробности и паузы — в account-refresh.js)
app.refreshAccount = createAccountRefresh({ api: app.api, store, gate: app.refreshGate, isBusy: submitBusy, onAuth: () => app.authExpired() });

// Собственная сдача студента принята: оценки, прогресс и рейтинг обновляем сразу (без пауз), когда отправка затихла
function refreshAfterSubmit() {
  const sid = store.studentId();
  if (sid === null) return;
  app.refreshGate.reset(sid);
  Promise.all([app.refreshAccount({ force: true }), app.syncProgress({ force: true })]).then(([acc, prog]) => {
    if (acc || prog) rerenderIfStill(app.routeId);
  });
}
if (liveCapable(app.submitter)) watchSubmissions({ submitter: app.submitter, run: refreshAfterSubmit });

// Доступ нельзя проверить без me. С сохранённым me ждём сервер не дольше maxWaitMs (дальше работаем с кэшем,
// обновление идёт в фоне); без кэша ждём ответ полностью. false — проверить доступ не удалось.
app.ensureAccess = async function ensureAccess({ maxWaitMs = 0 } = {}) {
  const p = app.refreshAccount();
  if (maxWaitMs > 0 && store.me()) await Promise.race([p, delay(maxWaitMs)]); else await p;
  return !!store.me();
};

app.finishLogin = async function finishLogin(r, next) {
  store.setSession({ token: r.token, student: r.student });
  app.flash = '';
  // ждём me не дольше LOGIN_WAIT_MS, потом открываем экран; обновление продолжается в фоне.
  // Прогресс с сервера — сразу после входа, без паузы syncProgress.
  let synced = false;
  const prog = app.syncProgress({ force: true });
  prog.then(() => { synced = true; });
  await Promise.race([Promise.all([app.refreshAccount({ force: true }), prog]), delay(LOGIN_WAIT_MS)]);
  // прогресс не успел к открытию экрана — первый экран после входа перерисуется один раз, когда он придёт (route)
  loginSync = synced ? null : { promise: prog, token: r.token };
  // принудительный проход (не автоматический): очередь только что вошедшего студента не должна ждать чужой запрос,
  // ещё идущий на общем телефоне; плашка очереди обновляется сама
  app.submitter.flush();
  app.go(safeNext(next));
};
let loginSync = null; // { promise, token } — синхронизация прогресса при входе, ещё не дошедшая до экрана

app.logout = function logout() {
  app.api.logout().catch(() => {}); // токен подставляется сразу; без сети выходим локально
  loginSync = null;
  store.clearSession(); // очередь неотправленных работ остаётся — её отправит вход того же студента
  app.flash = '';
  app.go('/login');
};

function showError(e) {
  console.error(e);
  app.root.replaceChildren(h('div', { class: 'card' },
    h('p', {}, 'Что-то пошло не так. Обновите страницу. Если ошибка повторяется — сообщите преподавателю.'),
    h('pre', { class: 'py-err' }, String(e?.message || e)),
    h('a', { class: 'btn', href: '#/' }, 'На главную')));
}

// отправка очереди; если число неотправленных изменилось, экран (баннер на главной) перерисовывается
// Автоматический повод (запуск, online, возврат на вкладку): проходы объединяются и не обгоняют расписание повторов
function flushUI() {
  const before = app.submitter.pending();
  return app.submitter.flush({ auto: true }).then(() => {
    if (app.submitter.pending() === before) return;
    const [a, , c] = currentPath().split('/').filter(Boolean);
    if (isDemo(a) || a === 'login' || a === 'admin' || (a === 'd' && c)) return;
    route();
  });
}

// обновление данных на экранах, где доступ и оценки видны сразу; занятие в процессе не перерисовываем.
// На главной и карте курса — ещё и прогресс с сервера (syncProgress сам ограничивает частоту).
function softRefresh(id, { force = false } = {}) {
  const [a0, b0, c0] = currentPath().split('/').filter(Boolean);
  const withProgress = !a0 || (a0 === 'd' && !!b0 && !c0);
  Promise.all([app.refreshAccount({ force }), withProgress ? app.syncProgress() : false]).then(([acc, prog]) => {
    if (acc || prog) rerenderIfStill(id);
  });
}

// Перерисовка экрана id после фонового обновления: только если он ещё открыт (второй вызов для того же экрана
// уже ничего не делает — route() сменил routeId) и это не занятие, вход, админ-панель или демо.
function rerenderIfStill(id) {
  if (app.routeId !== id) return;
  const [a, , c] = currentPath().split('/').filter(Boolean);
  if (isDemo(a) || a === 'login' || a === 'admin' || (a === 'd' && c)) return;
  route();
}

// демо-занятия (#/demo, #/demo2) доступны без входа
const isDemo = a => a === 'demo' || a === 'demo2';

function route() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const q = raw.indexOf('?');
  const path = q < 0 ? raw : raw.slice(0, q);
  const query = new URLSearchParams(q < 0 ? '' : raw.slice(q + 1));
  const [a, b, c] = path.split('/').filter(Boolean);
  const session = store.session();
  if (!isDemo(a) && a !== 'login' && a !== 'admin' && !session) { location.replace(`#/login?next=${encodeURIComponent(path)}`); return; }
  if (a === 'login' && session) { location.replace(`#${safeNext(query.get('next'))}`); return; }
  app.routeId++;
  shownStudent = store.studentId();
  const id = app.routeId;
  app.submittedKey = null;
  app.root.replaceChildren();
  app.root.classList.toggle('admin-root', a === 'admin');
  document.body.classList.toggle('no-orbs', a === 'admin'); // без светящихся пятен на экранах админ-панели
  const lessonRoute = a === 'd' && b && c;
  // главная и карта курса: на широком экране контейнер до 1200 px
  app.root.classList.toggle('wide', !lessonRoute && !isDemo(a) && !['login', 'admin', 'rating', 'profile'].includes(a));
  window.scrollTo(0, 0);
  const needsMe = a !== 'login' && !isDemo(a) && a !== 'rating' && a !== 'profile'; // главная, карта курса, занятие
  const render = () => {
    if (a === 'd' && b && c) return renderLesson(app, b, Number(c));
    if (a === 'd' && b) return renderCourse(app, b);
    return renderHome(app);
  };
  let job;
  if (a === 'admin') job = renderAdmin(app, path.split('/').filter(Boolean).slice(1), query);
  else if (a === 'login') job = renderLogin(app, { next: safeNext(query.get('next')) });
  else if (isDemo(a)) job = renderLesson(app, a, 0); // демо доступно без входа
  else if (a === 'rating') job = renderRating(app);
  else if (a === 'profile') job = renderProfile(app);
  else if (!lessonRoute && store.me()) { job = render(); } // главная и карта: показываем сохранённое, обновляем в фоне
  else job = gated(id, lessonRoute, render);
  if (a !== 'login' && !isDemo(a) && a !== 'admin' && !lessonRoute && !(needsMe && !store.me())) softRefresh(id);
  if (loginSync && a !== 'login') { // первый экран после медленного входа
    const ls = loginSync;
    loginSync = null;
    if (session && session.token === ls.token) ls.promise.then(changed => { if (changed) rerenderIfStill(id); });
  }
  Promise.resolve(job).catch(e => { if (app.routeId === id) showError(e); else console.error(e); });
}

// Занятие (и главная без me) открываем только после проверки доступа: пока me неизвестен, ничего не показываем.
async function gated(id, lessonRoute, render) {
  app.root.replaceChildren(h('p', { class: 'loading' }, 'Проверяем доступ…'));
  const ok = await app.ensureAccess({ maxWaitMs: CACHED_WAIT_MS });
  if (app.routeId !== id || !store.session()) return; // за это время ушли на другой экран или сессия истекла
  app.root.replaceChildren();
  if (!ok) {
    app.root.replaceChildren(h('div', { class: 'card' },
      h('p', {}, 'Нет связи — не удалось проверить доступ'),
      h('p', { class: 'hint' }, 'Проверьте интернет и повторите. Без проверки занятия не открываются.'),
      h('button', { class: 'btn primary big', type: 'button', onclick: () => app.rerender() }, 'Повторить'),
      h('a', { class: 'btn ghost big', href: '#/profile' }, 'Профиль')));
    return;
  }
  return render();
}

// Другая вкладка сменила аккаунт: хранилище уже подхватило сессию (его слушатель зарегистрирован раньше), экран перерисовываем.
// Админ-панель и демо от студенческой сессии не зависят.
let shownStudent = store.studentId();
window.addEventListener('storage', () => {
  const now = store.studentId();
  if (!identityChanged(shownStudent, now)) return;
  shownStudent = now;
  const a = currentPath().split('/').filter(Boolean)[0];
  if (a === 'admin' || isDemo(a)) return;
  if (now === null) app.flash = 'Вы вышли из аккаунта в другой вкладке. Войдите снова.';
  route();
});

window.addEventListener('hashchange', route);
// Возврат в сеть и на вкладку обновляют данные не принудительно: тяжёлые запросы подчиняются паузам и пропускаются,
// пока идёт отправка работ. Повторы отправки идут по своему расписанию (автоматический проход его не обгоняет).
// После возвращения сети отправка начинается через случайные 0–3 с: класс на одном Wi-Fi возвращается одновременно.
window.addEventListener('online', () => {
  setTimeout(() => { flushUI(); softRefresh(app.routeId); }, Math.floor(Math.random() * 3000));
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  flushUI();
  softRefresh(app.routeId);
});
route();
flushUI();
