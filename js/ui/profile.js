import { h, add } from '../util/dom.js';
import { weakSpotsCard } from './weak-spots.js';
import { installHint } from '../pwa.js';
import { AVATARS, avatarUrl, defaultAvatar } from '../avatars.js';
import { LAB_AVATARS } from '../avatars-v2.js';
import { titleView } from '../sandbox/title-view.js';
import { THEMES, FRAMES, isUnlocked, lockText, applyTheme, storedTheme, saveTheme, frameClass } from '../sandbox/cosmetics.js';

// Косметика профиля: «Тема» (только на телефоне), «Рамка» и «Аватар» (хранит сервер). Закрытое показывает «Откроется на уровне «…»».
// Уровень считается по опыту: с сервера (рейтинг группы — по нему сервер и проверяет), пока нет связи — по опыту на телефоне.
function cosmetics(app, p) {
  const state = {
    xp: Number(app.store.state().xp) || 0,
    avatar: defaultAvatar(p.id),
    frame: 'none',
    theme: storedTheme(app.store),
  };
  let busy = false;
  const status = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' }, '');
  const big = h('img', { class: 'avatar-big', src: avatarUrl(state.avatar), alt: '', width: 96, height: 96 });
  const sample = h('img', { class: 'cos-sample', src: avatarUrl(state.avatar), alt: '', width: 44, height: 44 });

  // кнопка-вариант: закрытая остаётся в фокусе (aria-disabled), нажатие объясняет, когда откроется
  const option = (item, onPick, content) => {
    const b = h('button', { type: 'button', class: content.cls, 'aria-pressed': 'false', title: item.title }, content.children);
    b.addEventListener('click', () => {
      if (!isUnlocked(item, state.xp)) { status.textContent = lockText(item); return; }
      onPick();
    });
    return { item, el: b };
  };
  const label = (item, extra) => {
    const open = isUnlocked(item, state.xp);
    return [h('span', {}, item.title), h('small', {}, open ? (extra || '') : lockText(item))];
  };

  const themeOpts = THEMES.map(t => option(t, () => { state.theme = t.code; saveTheme(app.store, t.code); applyTheme(document.documentElement, t.code); mark(); status.textContent = 'Тема включена'; },
    { cls: 'cos-opt', children: [] }));
  const frameOpts = FRAMES.map(f => option(f, () => save({ frame: f.code }), { cls: 'cos-opt', children: [] }));
  const mkAvatar = a => option(a, () => save({ avatar: a.code }),
    { cls: 'avatar-opt', children: [h('img', { src: avatarUrl(a.code), alt: '', width: 64, height: 64, loading: 'lazy' })] });
  const baseOpts = AVATARS.map(a => mkAvatar({ code: a.code, title: a.title, level: 0 }));
  const labOpts = LAB_AVATARS.map(mkAvatar);

  const titleName = h('span', { class: 'title-name' });
  const titleFill = h('div', { class: 'title-bar-fill' });
  const titleTrack = h('div', { class: 'title-bar-track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, titleFill);
  const titleNote = h('p', { class: 'title-note' });
  function markTitle() {
    const v = titleView(state.xp);
    titleName.textContent = v.title;
    titleFill.style.width = v.percent + '%';
    titleTrack.setAttribute('aria-valuenow', String(v.percent));
    titleTrack.setAttribute('aria-label', 'Прогресс до следующего титула');
    titleNote.textContent = v.text;
  }

  function mark() {
    markTitle();
    big.setAttribute('src', avatarUrl(state.avatar));
    sample.setAttribute('src', avatarUrl(state.avatar));
    big.className = ('avatar-big ' + frameClass(state.frame)).trim();
    sample.className = ('cos-sample ' + frameClass(state.frame)).trim();
    const paint = (list, isCurrent, withText) => list.forEach(x => {
      const open = isUnlocked(x.item, state.xp);
      x.el.setAttribute('aria-pressed', isCurrent(x.item) ? 'true' : 'false');
      if (open) x.el.removeAttribute('aria-disabled'); else x.el.setAttribute('aria-disabled', 'true');
      if (withText) x.el.replaceChildren.apply(x.el, label(x.item, isCurrent(x.item) ? 'Выбрано' : ''));
      else if (!open) x.el.setAttribute('aria-label', x.item.title + '. ' + lockText(x.item));
      else x.el.setAttribute('aria-label', x.item.title);
      const lock = x.el.querySelector('.avatar-lock');
      if (!withText) { if (!open && !lock) x.el.appendChild(h('span', { class: 'avatar-lock', 'aria-hidden': 'true' }, '🔒')); if (open && lock) lock.remove(); }
    });
    paint(themeOpts, t => t.code === state.theme, true);
    paint(frameOpts, f => f.code === state.frame, true);
    paint(baseOpts.concat(labOpts), a => a.code === state.avatar, false);
  }

  async function save(change) {
    if (busy) return;
    const prev = { avatar: state.avatar, frame: state.frame };
    const next = { avatar: change.avatar || state.avatar, frame: change.frame || state.frame };
    if (next.avatar === prev.avatar && next.frame === prev.frame) return;
    busy = true;
    state.avatar = next.avatar;
    state.frame = next.frame;
    mark();
    status.textContent = 'Сохраняю…';
    try {
      const r = await app.api.call('setAvatar', { avatar: next.avatar, frame: next.frame });
      if (r && r.avatar) state.avatar = r.avatar;
      state.frame = r && r.frame ? r.frame : 'none';
      status.textContent = 'Сохранено';
    } catch (e) {
      state.avatar = prev.avatar;
      state.frame = prev.frame;
      status.textContent = e && /^locked/.test(String(e.message)) ? 'Это ещё закрыто: нужен уровень выше' : 'Не сохранилось, попробуй позже';
    }
    busy = false;
    mark();
  }

  mark();
  // выбранные раньше аватар и рамка приходят с сервера; без связи остаются по умолчанию
  app.api.call('me').then(r => {
    if (busy || !r) return;
    if (r.avatar) state.avatar = r.avatar;
    if (r.frame) state.frame = r.frame;
    mark();
  }, () => { /* нет связи */ });
  // опыт из рейтинга группы (на сервере кэш): по нему сервер открывает аватары и рамки
  app.api.call('rating').then(r => {
    if (r && r.me && Number.isFinite(r.me.xp)) { state.xp = Math.max(state.xp, r.me.xp); mark(); }
  }, () => { /* нет связи: считаем по опыту на телефоне */ });

  const themeCard = h('section', { class: 'card avatar-card cos-card', 'aria-label': 'Тема' },
    h('h2', { class: 'avatar-title' }, 'Тема'),
    h('p', { class: 'hint' }, 'Оформление приложения. Она хранится только на этом телефоне.'),
    h('div', { class: 'cos-grid' }, themeOpts.map(x => x.el)));
  const frameCard = h('section', { class: 'card avatar-card cos-card', 'aria-label': 'Рамка' },
    h('h2', { class: 'avatar-title' }, 'Рамка'),
    h('div', { class: 'avatar-cur' }, sample, h('p', { class: 'hint' }, 'Её видно на доске и в зале славы.')),
    h('div', { class: 'cos-grid' }, frameOpts.map(x => x.el)));
  const avatarCard = h('section', { class: 'card avatar-card', 'aria-label': 'Аватар' },
    h('h2', { class: 'avatar-title' }, 'Аватар'),
    h('div', { class: 'avatar-cur' }, big, h('p', { class: 'hint' }, 'Он виден в зале славы песочницы.')),
    h('div', { class: 'avatar-grid' }, baseOpts.map(x => x.el)),
    h('h3', { class: 'avatar-lab-head' }, 'Лаборатория'),
    h('div', { class: 'avatar-grid' }, labOpts.map(x => x.el)),
    status);
  const titleCard = h('section', { class: 'card avatar-card', 'aria-label': 'Титул' },
    h('h2', { class: 'avatar-title' }, 'Титул'),
    h('div', { class: 'title-bar' }, titleName, titleTrack, titleNote),
    h('p', { class: 'hint' }, 'Титул растёт вместе с опытом. Его видно в зале славы и на доске, имени там нет.'));
  return [titleCard, themeCard, frameCard, avatarCard];
}

export function renderProfile(app) {
  const p = app.store.profile();
  const pending = app.submitter.pending();
  const confirmBox = h('div', { class: 'card warn', role: 'alertdialog', 'aria-label': 'Подтверждение выхода' });
  confirmBox.hidden = true;
  const exitBtn = h('button', { class: 'btn big', type: 'button' }, 'Выйти');
  exitBtn.addEventListener('click', () => {
    exitBtn.hidden = true;
    confirmBox.hidden = false;
    confirmBox.replaceChildren(
      h('p', {}, h('strong', {}, 'Выйти из аккаунта?')),
      pending
        ? h('p', {}, `⚠ Не отправлено работ: ${pending}. Они сохранятся на этом телефоне и уйдут, когда вы снова войдёте под своим логином.`)
        : h('p', { class: 'hint' }, 'Ваш прогресс сохранится на этом устройстве: после входа под своим логином всё вернётся.'),
      h('button', { class: 'btn primary big', type: 'button', onclick: () => app.logout() }, 'Да, выйти'),
      h('button', { class: 'btn ghost big', type: 'button', onclick: () => { confirmBox.hidden = true; exitBtn.hidden = false; } }, 'Отмена'));
  });
  const row = (k, v) => h('div', { class: 'kv' }, h('dt', {}, k), h('dd', {}, v || '—'));
  add(app.root,
    h('a', { href: '#/', class: 'back' }, '← Главная'),
    h('h1', { class: 'display' }, 'Профиль'),
    h('dl', { class: 'card profile' }, row('ФИО', p.name), row('Группа', p.group), row('Логин', p.login)),
    weakSpotsCard(app),
    h('a', { class: 'btn big', href: '#/portfolio' }, 'Портфолио'),
    ...cosmetics(app, p),
    pending ? h('p', { class: 'hint' }, `⏳ Не отправлено работ: ${pending}.`) : '',
    installHint() || '',
    exitBtn, confirmBox);
}
