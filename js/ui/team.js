// B8: «Открытое занятие» — командный кейс на экране практики студента (спецификация § 10).
// createTeamCtl — состояние команды на ПЗ (teamState раз в 12 с только на экране ожидания и в плашке координатора);
// gate(c, t) вызывается из task() на задании кейса и либо рисует экран команды вместо задания (true), либо пропускает (false);
// banner / footer — плашка и подвал на самих заданиях кейса. c — контекст экрана: { view, header, tools, grid, draft, save, show, practice, lesson, isActive }.
import { h, add } from '../util/dom.js';
import { errText } from './login.js';
import {
  TEAM_ROLES, JOIN_ROLES, TEAM_POLL_MS, TEAM_MIN, TEAM_MAX, teamScreen, memberLines, parseCode, roleLabel, applyTeamResult, readyToSubmitCase, caseSubmission, nextNonCaseIndex,
} from '../team-model.js';

const RETRY_MS = 20000;

export function createTeamCtl({ api, d, n, storage, key }) {
  const aloneKey = `team:alone:${key}`;
  const readAlone = () => { try { return storage && storage.getItem(aloneKey) === '1'; } catch { return false; } };
  const st = { loaded: false, enabled: false, team: null, alone: readAlone(), fresh: false, failedAt: 0 };
  let inflight = null;
  const apply = r => { st.loaded = true; st.failedAt = 0; st.enabled = !!(r && r.enabled); st.team = r && r.team ? r.team : null; };
  const load = () => {
    if (inflight) return inflight;
    inflight = (async () => {
      try { apply(await api.call('teamState', { d, n })); } catch (e) {
        // нет связи или старый сервер: задание идёт как обычно, повтор не раньше чем через RETRY_MS
        st.loaded = true; st.enabled = false; st.failedAt = Date.now();
      } finally { inflight = null; }
    })();
    return inflight;
  };
  const needLoad = () => !st.loaded || (st.failedAt > 0 && Date.now() - st.failedAt > RETRY_MS);
  const act = async (action, body) => { const r = await api.call(action, Object.assign({ d, n }, body)); if (r.team !== undefined) st.team = r.team || null; return r; };
  return {
    st, load, needLoad,
    create: async () => { const r = await act('teamCreate', {}); st.fresh = !r.duplicate; return r; },
    join: (code, role) => act('teamJoin', { code, role }),
    leave: async () => { const r = await api.call('teamLeave', { d, n }); st.team = null; st.fresh = false; return r; },
    submitCase: payload => act('teamSubmitCase', payload),
    chooseAlone: () => { st.alone = true; try { if (storage) storage.setItem(aloneKey, '1'); } catch { /* запомнится только на этот вход */ } },
  };
}

// ---------- общие куски ----------

function roleCard(role) {
  const r = TEAM_ROLES[role];
  if (!r) return '';
  return h('div', { class: 'team-role card' },
    h('h3', {}, `${r.icon} ${r.title}`),
    h('ul', { class: 'team-duties' }, r.duties.map((x, i) => h('li', {}, h('label', {}, h('input', { type: 'checkbox', 'aria-label': x, id: `duty-${role}-${i}` }), ' ', x)))));
}

function membersBox(team) {
  return h('div', { class: 'team-members', 'aria-live': 'polite' },
    h('h3', {}, `Команда ${team.code} · ${team.members.length} из ${TEAM_MAX}`),
    h('ul', {}, memberLines(team).map(x => h('li', {}, x))));
}

function leaveButton(ctl, c, errBox) {
  return h('button', { class: 'btn ghost', type: 'button', onclick: async e => {
    if (!confirm('Выйти из команды? Вернуться можно по коду, пока кейс не сдан.')) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    errBox.textContent = '';
    try { await ctl.leave(); if (c.isActive()) c.show(); } catch (er) { errBox.textContent = errText(er); btn.disabled = false; }
  } }, 'Выйти из команды');
}

// ---------- экран «Работаем в команде» ----------

function chooseScreen(ctl, c) {
  const err = h('p', { class: 'error', role: 'alert' });
  const code = h('input', { type: 'text', inputmode: 'numeric', maxlength: '4', autocomplete: 'off', name: 'team-code', id: 'team-code', placeholder: '4 цифры', 'aria-label': 'Код команды' });
  let role = 'executor';
  const roleBtns = JOIN_ROLES.map(r => h('label', { class: 'team-role-pick' },
    h('input', { type: 'radio', name: 'team-role', value: r, checked: r === role, onchange: () => { role = r; } }), ` ${roleLabel(r)}`));
  const busy = (btn, fn) => async () => {
    err.textContent = '';
    btn.disabled = true;
    try { await fn(); if (c.isActive()) c.show(); } catch (e) { err.textContent = errText(e); btn.disabled = false; }
  };
  const createBtn = h('button', { class: 'btn primary big', type: 'button' }, 'Создать команду');
  createBtn.addEventListener('click', busy(createBtn, () => ctl.create()));
  const joinBtn = h('button', { class: 'btn big', type: 'button' }, 'Войти по коду');
  joinBtn.addEventListener('click', async () => {
    const v = parseCode(code.value);
    if (!v) { err.textContent = 'Код — четыре цифры'; return; }
    await busy(joinBtn, () => ctl.join(v, role))();
  });
  const aloneBtn = h('button', { class: 'link-btn', type: 'button', onclick: () => { ctl.chooseAlone(); c.show(); } }, 'Работать одному');
  add(c.view, c.header(), c.tools(true),
    c.grid('choose', null, [
      h('h2', { class: 'choose-title' }, '👥 Работаем в команде'),
      h('p', { class: 'muted choose-lead' }, `Дальше кейс — его решает команда из ${TEAM_MIN}–${TEAM_MAX} человек. Роли распределите сами; ответы вводит координатор.`),
      h('div', { class: 'card team-actions' },
        h('h3', {}, 'Вы создаёте команду?'),
        h('p', { class: 'hint' }, 'Вы станете координатором. Код покажем на следующем экране — назовите его одногруппникам.'),
        createBtn),
      h('div', { class: 'card team-actions' },
        h('h3', {}, 'Вас позвали в команду?'),
        h('label', { class: 'field', for: 'team-code' }, h('span', {}, 'Код команды'), code),
        h('div', { class: 'team-role-picks', role: 'group', 'aria-label': 'Ваша роль' }, roleBtns),
        joinBtn),
      err,
      h('p', { class: 'hint' }, 'Нет команды (например, нечётное число студентов)? Кейс можно решить самому.'),
      aloneBtn,
      h('h3', { class: 'team-roles-title' }, 'Роли в команде'),
      h('div', { class: 'team-roles' }, Object.keys(TEAM_ROLES).map(roleCard)),
    ]));
}

// Команда создана: код и состав, пока коллеги входят. Дальше — задания кейса.
function lobbyScreen(ctl, c) {
  const team = ctl.st.team;
  add(c.view, c.header(), c.tools(true),
    c.grid('choose', null, [
      h('h2', { class: 'choose-title' }, '✅ Команда создана'),
      h('div', { class: 'card team-code-card' }, h('div', { class: 'muted' }, 'Код команды'), h('div', { class: 'team-code', 'aria-label': `Код команды ${team.code.split('').join(' ')}` }, team.code),
        h('p', { class: 'hint' }, `Назовите код одногруппникам: они выберут «Войти по коду». Код действует 3 часа. В команде ${TEAM_MIN}–${TEAM_MAX} человека.`)),
      roleCard('coordinator'),
      h('button', { class: 'btn primary big', type: 'button', onclick: () => { ctl.st.fresh = false; c.show(); } }, 'К заданиям кейса →'),
    ]));
}

// Участник ждёт, пока координатор сдаст кейс: роль, чек-лист, состав; обновление раз в TEAM_POLL_MS.
function waitScreen(ctl, c) {
  const team = ctl.st.team;
  const err = h('p', { class: 'error', role: 'alert' });
  const live = h('div', { class: 'team-live' });
  const draw = () => {
    const t = ctl.st.team;
    if (!t) return;
    live.replaceChildren(
      h('p', { class: 'team-note' }, `Кейс выполняет команда (координатор — ${t.coordinatorName || '—'}). Когда координатор сдаст кейс, ответы команды появятся здесь сами.`),
      membersBox(t));
  };
  const box = h('div', { class: 'team-wait' });
  add(c.view, c.header(), c.tools(true),
    c.grid('choose', null, [
      h('h2', { class: 'choose-title' }, '👥 Кейс выполняет команда'),
      box,
    ]));
  // остальную практику участник выполняет сам (§ 10): к заданиям после кейса можно перейти, не дожидаясь координатора
  const skipBtn = h('button', { class: 'btn big', type: 'button', onclick: () => {
    const i = nextNonCaseIndex(c.practice(), c.draft.index);
    if (i >= 0) c.draft.index = i; else c.draft.stage = 'reflect';
    c.save();
    c.show();
  } }, 'Пока перейти к остальным заданиям →');
  box.append(live, roleCard(team.role), skipBtn, err, leaveButton(ctl, c, err),
    h('p', { class: 'hint' }, 'Страница обновляется сама раз в 12 секунд. К заданиям кейса можно вернуться, когда координатор его сдаст.'));
  draw();
  const tick = async () => {
    if (!box.isConnected || !c.isActive()) return;
    if (!document.hidden) {
      await ctl.load();
      if (!box.isConnected || !c.isActive()) return;
      if (teamScreen(ctl.st) !== 'wait') { c.show(); return; }
      draw();
    }
    setTimeout(tick, TEAM_POLL_MS);
  };
  setTimeout(tick, TEAM_POLL_MS);
}

// ---------- на заданиях кейса ----------

export function gate(ctl, c, t) {
  if (!t || !t.case) return false;
  if (ctl.needLoad()) {
    add(c.view, c.header(), h('p', { class: 'loading' }, 'Загрузка…'));
    ctl.load().then(() => { if (c.isActive()) c.show(); });
    return true;
  }
  const scr = teamScreen(ctl.st);
  if (scr === 'choose' && c.draft.locked[t.id]) return false; // задание уже решено до включения команд: просмотр без экрана выбора
  if (scr === 'choose') { chooseScreen(ctl, c); return true; }
  if (scr === 'wait') { waitScreen(ctl, c); return true; }
  if (scr === 'work' && ctl.st.fresh) { lobbyScreen(ctl, c); return true; }
  if (scr === 'done' && applyTeamResult(c.draft, c.practice(), ctl.st.team.result, { coordinator: ctl.st.team.coordinator })) c.save();
  return false;
}

// Плашка над заданием кейса: роль координатора и состав (обновляется), либо «выполнено командой».
export function banner(ctl, c, t) {
  if (!t || !t.case) return '';
  const scr = teamScreen(ctl.st);
  const team = ctl.st.team;
  if (scr === 'done') {
    return h('div', { class: 'card team-banner done' },
      `✅ Кейс выполнен командой · координатор ${team.coordinatorName || '—'}${team.result ? ` · баллы команды: ${team.result.points}` : ''}.`);
  }
  if (scr !== 'work') return '';
  const err = h('p', { class: 'error', role: 'alert' });
  const body = h('div', { class: 'team-banner-body' });
  const draw = () => {
    const tm = ctl.st.team;
    if (!tm) return;
    body.replaceChildren(
      h('strong', {}, `🧭 Вы координатор · код команды ${tm.code}`),
      h('ul', { class: 'team-lines' }, memberLines(tm).map(x => h('li', {}, x))),
      tm.members.length < TEAM_MIN ? h('p', { class: 'hint' }, `Для сдачи кейса нужно хотя бы ${TEAM_MIN} человека: назовите код одногруппнику.`) : '');
  };
  const box = h('div', { class: 'card team-banner' }, body, h('p', { class: 'hint' }, 'Вы вводите ответы команды; исполнитель предлагает, проверяющий сверяет с условием. После последнего задания кейса нажмите «Сдать кейс команды».'),
    err, leaveButton(ctl, c, err));
  draw();
  const tick = async () => {
    if (!box.isConnected || !c.isActive()) return;
    if (!document.hidden) {
      await ctl.load();
      if (!box.isConnected || !c.isActive()) return;
      if (teamScreen(ctl.st) !== 'work') return;
      draw();
    }
    setTimeout(tick, TEAM_POLL_MS);
  };
  setTimeout(tick, TEAM_POLL_MS);
  return box;
}

// Подвал закрытого задания кейса: у координатора после последнего задания — «Сдать кейс команды», иначе обычное «Дальше».
export function footer(ctl, c, t, next, normal) {
  if (teamScreen(ctl.st) !== 'work' || !t || !t.case || !readyToSubmitCase(c.practice(), c.draft, c.draft.index)) return normal();
  const err = h('p', { class: 'error', role: 'alert' });
  const btn = h('button', { class: 'btn primary big', type: 'button' }, '📤 Сдать кейс команды');
  btn.addEventListener('click', async () => {
    if (!confirm('Сдать кейс команды? После сдачи ответы изменить нельзя.')) return;
    err.textContent = '';
    btn.disabled = true;
    try {
      await ctl.submitCase(caseSubmission(c.lesson, c.draft));
      if (c.isActive()) next();
    } catch (e) { err.textContent = errText(e); btn.disabled = false; }
  });
  return h('div', {}, btn, err, h('p', { class: 'hint' }, 'Остальных участников ждут ответы команды; остальную практику каждый сдаёт сам.'));
}
