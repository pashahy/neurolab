// «Команды» («Открытое занятие», B8): составы команд на доске (аватары и роли, без имён) и на «Моём экране» (с именами).
// Модель (teamSections) — чистая функция; teamsPanel / teamsOverlay рисуют DOM и опрашивают boardTeams, пока окно открыто.
import { h } from '../util/dom.js';
import { avatarUrl, defaultAvatar } from '../avatars.js';
import { frameClass } from '../sandbox/cosmetics.js';
import { errText } from '../ui/login.js';
import { roleLabel } from '../team-model.js';

export const TEAMS_REFRESH_MS = 12000;

const list = v => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []);
const img = e => avatarUrl(e.avatar || defaultAvatar(''));
const fr = (o, e) => { if (frameClass(e.frame)) o.frame = e.frame; return o; }; // рамка студента (если выбрана) идёт вместе со строкой

// -> { enabled, summary, teams: [{ title, submitted, members: [{ img, alt, label, role }] }], alone: [{ img, alt, label }] }
export function teamSections(data, names) {
  const d = data && typeof data === 'object' ? data : {};
  const mem = e => fr({ img: img(e), alt: names && e.name ? String(e.name) : '', label: names && e.name ? String(e.name) : '', role: roleLabel(e.role) }, e);
  const teams = list(d.teams).map((t, i) => ({
    title: `Команда ${i + 1}`, submitted: t.submitted === true, members: list(t.members).map(mem),
  }));
  const alone = list(d.alone).map(e => fr({ img: img(e), alt: names && e.name ? String(e.name) : '', label: names && e.name ? String(e.name) : '' }, e));
  const done = teams.filter(t => t.submitted).length;
  const summary = teams.length
    ? `Команд: ${teams.length} · кейс сдан: ${done} · без команды: ${alone.length}`
    : `Команд пока нет · без команды: ${alone.length}`;
  return { enabled: d.enabled === true, summary, teams, alone };
}

function teamEl(t) {
  return h('article', { class: `board-team${t.submitted ? ' submitted' : ''}` },
    h('h3', {}, t.title, t.submitted ? ' ✓ кейс сдан' : ''),
    h('div', { class: 'board-team-members' }, t.members.map(m => h('div', { class: 'board-team-member' },
      h('img', { class: ('av ' + frameClass(m.frame)).trim(), src: m.img, alt: m.alt, width: '56', height: '56', draggable: 'false' }),
      h('span', {}, m.label ? h('strong', {}, m.label) : null, m.label ? h('br') : null, m.role)))));
}

function bodyEls(model) {
  if (!model.enabled) return [h('p', { class: 'hall-empty' }, 'Режим «🎓 Открытое занятие» для этого ПЗ не включён (вкладка «Доступ»).')];
  return [
    h('p', { class: 'board-teams-sum' }, model.summary),
    h('div', { class: 'board-teams' }, model.teams.map(teamEl),
      model.alone.length ? h('div', { class: 'board-team-alone' }, 'Без команды: ',
        model.alone.map(a => h('img', { class: ('av ' + frameClass(a.frame)).trim(), src: a.img, alt: a.alt, title: a.label || '', width: '40', height: '40', draggable: 'false' }))) : null),
  ];
}

// Панель: { el, open(), close() }. names — с именами («Мой экран»); alive() — маршрут жив.
export function teamsPanel(ctx, { group, d, n, names, alive }) {
  const body = h('div', { class: 'teams-body' });
  const note = h('p', { class: 'hall-note', role: 'status' });
  const el = h('div', { class: 'hall-box' }, body, note);
  let timer = null;
  let seq = 0;
  async function load() {
    const me = ++seq;
    try {
      const r = await ctx.call('boardTeams', Object.assign({ group, discipline: d, lesson: n }, names ? { names: true } : {}));
      if (me !== seq || !alive()) return;
      body.replaceChildren(...bodyEls(teamSections(r, names)));
      note.textContent = '';
    } catch (e) {
      if (me !== seq || !alive() || (e && e.handled)) return;
      note.textContent = body.childNodes.length ? 'Нет связи, показаны прошлые данные.' : `Не получилось загрузить: ${errText(e)}`;
    }
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => { if (!alive()) return; if (!document.hidden) load(); schedule(); }, TEAMS_REFRESH_MS);
  }
  return {
    el,
    open() { note.textContent = 'Загружаем…'; load(); schedule(); },
    close() { clearTimeout(timer); seq++; },
  };
}

// Доска: кнопка в шапке + полноэкранное окно «Команды» (аватары и роли, без имён).
export function teamsOverlay(ctx, { group, d, n, alive, host, button }) {
  const panel = teamsPanel(ctx, { group, d, n, names: false, alive });
  const close = h('button', { class: 'defense-btn', type: 'button' }, 'Закрыть');
  const box = h('div', { class: 'hall-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Команды' },
    h('h1', { class: 'hall-title' }, '👥 Команды'), panel.el, h('div', { class: 'defense-actions' }, close));
  const overlay = h('div', { class: 'defense-overlay hall-overlay', hidden: true }, box);
  host.append(overlay);
  function shut() { overlay.hidden = true; panel.close(); button.focus(); }
  button.addEventListener('click', () => { overlay.hidden = false; panel.open(); close.focus(); });
  close.addEventListener('click', shut);
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') shut(); });
}
