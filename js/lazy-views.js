import { h } from './util/dom.js';

const styleOrder = ['lesson-v5', 'admin', 'board', 'sandbox', 'team', 'themes', 'portfolio'];
const styleLoads = new Map();
const styleLink = name => document.head.querySelector(`link[rel="stylesheet"][href="css/${name}.css"]`);

function loadStyle(name) {
  if (styleLoads.has(name)) return styleLoads.get(name);
  if (styleLink(name)) return Promise.resolve();
  const link = h('link', { rel: 'stylesheet', href: `css/${name}.css` });
  const before = styleOrder.slice(styleOrder.indexOf(name) + 1).map(styleLink).find(Boolean);
  const loaded = new Promise((resolve, reject) => {
    link.onload = resolve;
    link.onerror = () => {
      styleLoads.delete(name);
      link.remove();
      reject(new Error('Не удалось загрузить оформление страницы'));
    };
  });
  styleLoads.set(name, loaded);
  document.head.insertBefore(link, before || null);
  return loaded;
}

function adminStyles([section]) {
  if (section === 'board') return ['admin', 'board', 'team'];
  if (section === 'live') return ['admin', 'board'];
  if (section === 'sandbox') return ['admin', 'sandbox'];
  return ['admin'];
}

const screens = {
  home: { load: () => import('./ui/home.js'), render: 'renderHome' },
  course: { load: () => import('./ui/course.js'), render: 'renderCourse' },
  lesson: { load: () => import('./ui/lesson.js'), render: 'renderLesson', styles: () => ['lesson-v5', 'team'] },
  presentation: { load: () => import('./ui/lesson-v5.js'), render: 'renderPresentation', styles: () => ['lesson-v5'] },
  profile: { load: () => import('./ui/profile.js'), render: 'renderProfile' },
  rating: { load: () => import('./ui/rating.js'), render: 'renderRating' },
  portfolio: { load: () => import('./ui/portfolio.js'), render: 'renderPortfolio', styles: () => ['portfolio'] },
  sandbox: { load: () => import('./ui/sandbox.js'), render: 'renderSandbox', styles: () => ['sandbox'] },
  cheatsheet: { load: () => import('./ui/cheatsheet.js'), render: 'renderCheatsheet' },
  admin: { load: () => import('./admin/app.js'), render: 'renderAdmin', styles: adminStyles },
};

// Загрузчик экрана не держит вход. Ответ старого маршрута не может перерисовать новый.
export function createViewRenderer(app, extra = {}) {
  const views = Object.assign({}, screens, extra);
  return async function renderView(name, ...args) {
    const id = app.routeId;
    const view = views[name];
    if (!view) throw new Error('Неизвестный экран');
    const loading = app.root && !app.root.firstChild ? h('p', { class: 'loading', role: 'status' }, 'Открываем страницу…') : null;
    if (loading) app.root.append(loading);
    const [module] = await Promise.all([view.load(), ...(view.styles?.(...args) || []).map(loadStyle)]);
    if (app.routeId !== id) return;
    if (loading && loading.isConnected) loading.remove();
    return module[view.render](app, ...args);
  };
}
