import { h } from './util/dom.js';

const screens = {
  home: { load: () => import('./ui/home.js'), render: 'renderHome' },
  course: { load: () => import('./ui/course.js'), render: 'renderCourse' },
  lesson: { load: () => import('./ui/lesson.js'), render: 'renderLesson' },
  presentation: { load: () => import('./ui/lesson-v5.js'), render: 'renderPresentation' },
  profile: { load: () => import('./ui/profile.js'), render: 'renderProfile' },
  rating: { load: () => import('./ui/rating.js'), render: 'renderRating' },
  portfolio: { load: () => import('./ui/portfolio.js'), render: 'renderPortfolio' },
  sandbox: { load: () => import('./ui/sandbox.js'), render: 'renderSandbox' },
  cheatsheet: { load: () => import('./ui/cheatsheet.js'), render: 'renderCheatsheet' },
  admin: { load: () => import('./admin/app.js'), render: 'renderAdmin' },
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
    const module = await view.load();
    if (app.routeId !== id) return;
    if (loading && loading.isConnected) loading.remove();
    return module[view.render](app, ...args);
  };
}
