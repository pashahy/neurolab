import { h } from '../util/dom.js';
import { parseImport } from './parse.js';
import { confirmDialog, infoDialog, select, fmtTime, hashQuery, loading, loadError, emptyBox } from './common.js';
import { errText } from '../ui/login.js';

const ST_NEW = 'новый';
const ST_BLOCKED = 'заблокирован';
const MAX_FILE = 1024 * 1024;
const PREVIEW_ROWS = 100;

// Выдаваемые данные входа: логин и одноразовый пароль крупно
function credentialsBox(name, group, login, oneTime) {
  return h('div', { class: 'cred' },
    h('div', {}, name, group ? `, ${group}` : ''),
    h('div', {}, 'Логин: ', h('strong', { class: 'mono' }, login)),
    h('div', {}, 'Одноразовый пароль: ', h('strong', { class: 'mono big-pw' }, oneTime)));
}

export async function renderStudents(ctx, main) {
  const state = { group: '', students: [], panel: '', result: null };
  const listBox = h('div', {}, loading());
  const toolbar = h('div', { class: 'card admin-tools' });
  const panelBox = h('div');
  const resultBox = h('div');
  const status = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
  main.replaceChildren(toolbar, panelBox, resultBox, status, listBox);

  async function load(keepStatus) {
    if (!keepStatus) status.textContent = '';
    try {
      const d = await ctx.call('adminStudents');
      if (!ctx.alive()) return;
      state.students = Array.isArray(d.students) ? d.students : [];
      if (state.group && !state.students.some(s => s.group === state.group)) state.group = '';
      drawToolbar();
      drawList();
    } catch (e) {
      if (!ctx.alive() || (e && e.handled)) return;
      listBox.replaceChildren(loadError(errText(e), () => { listBox.replaceChildren(loading()); load(); }));
    }
  }

  const groupsOf = () => Array.from(new Set(state.students.map(s => s.group))).sort();
  const visible = () => state.students.filter(s => !state.group || s.group === state.group);

  function drawToolbar() {
    const groups = groupsOf();
    const newCount = visible().filter(s => s.status === ST_NEW).length;
    toolbar.replaceChildren(
      h('div', { class: 'tools-row' },
        h('label', { class: 'field inline' }, h('span', {}, 'Группа'),
          select([{ value: '', label: 'Все группы' }].concat(groups.map(g => ({ value: g, label: g }))), state.group, v => { state.group = v; drawToolbar(); drawList(); })),
        h('div', { class: 'tools-count' }, `Студентов: ${visible().length}`)),
      h('div', { class: 'row' },
        h('button', { class: `btn small${state.panel === 'add' ? ' primary' : ''}`, type: 'button', 'aria-expanded': String(state.panel === 'add'), onclick: () => openPanel('add') }, '➕ Добавить студента'),
        h('button', { class: `btn small${state.panel === 'import' ? ' primary' : ''}`, type: 'button', 'aria-expanded': String(state.panel === 'import'), onclick: () => openPanel('import') }, '📥 Импорт'),
        h('a', { class: 'btn small', href: `#${hashQuery('/admin/cards', { group: state.group })}` }, `🖨 Карточки для печати${newCount ? ` (${newCount})` : ''}`)));
  }

  function openPanel(name) {
    state.panel = state.panel === name ? '' : name;
    panelBox.replaceChildren();
    if (state.panel === 'add') panelBox.append(addForm());
    if (state.panel === 'import') panelBox.append(importForm());
    drawToolbar();
  }

  // withPasswords: показывать логины и одноразовые пароли (для одного студента); после массового импорта — только счётчики
  function showResult(r, label, withPasswords) {
    state.result = r;
    const added = r.added || [];
    const skipped = r.skipped || [];
    const errors = r.errors || [];
    const groups = Array.from(new Set(added.map(a => a.group)));
    resultBox.replaceChildren(h('div', { class: 'card result-card', role: 'status' },
      h('h2', {}, label),
      h('p', {}, `Добавлено: ${added.length}. Пропущено (уже есть): ${skipped.length}.${errors.length ? ` Строк с ошибками: ${errors.length}.` : ''}`),
      added.length && withPasswords ? h('div', { class: 'table-wrap' }, h('table', { class: 'rtable' },
        h('thead', {}, h('tr', {}, ['ФИО', 'Группа', 'Логин', 'Одноразовый пароль'].map(t => h('th', {}, t)))),
        h('tbody', {}, added.map(a => h('tr', {},
          h('td', { 'data-label': 'ФИО' }, a.name), h('td', { 'data-label': 'Группа' }, a.group),
          h('td', { 'data-label': 'Логин', class: 'mono' }, a.login), h('td', { 'data-label': 'Пароль', class: 'mono' }, a.oneTime)))))) : '',
      skipped.length ? h('details', {}, h('summary', {}, `Пропущены: ${skipped.length}`), h('ul', {}, skipped.map(s => h('li', {}, `${s.name}, ${s.group}`)))) : '',
      added.length && !withPasswords ? h('p', { class: 'hint' }, 'Одноразовые пароли — на карточках: нажмите «Печать карточек».') : '',
      errors.length ? h('details', { open: true }, h('summary', {}, `Ошибки: ${errors.length}`), h('ul', {}, errors.map(e => h('li', {}, `Строка ${e.line}: ${e.reason}`)))) : '',
      h('div', { class: 'row' },
        added.length ? h('a', { class: 'btn primary', href: `#${hashQuery('/admin/cards', { group: groups.length === 1 ? groups[0] : '' })}` }, '🖨 Печать карточек') : '',
        h('button', { class: 'btn', type: 'button', onclick: () => { resultBox.replaceChildren(); state.result = null; } }, 'Скрыть'))));
  }

  function addForm() {
    const name = h('input', { name: 'name', required: true, autocomplete: 'off', maxlength: '200', placeholder: 'Фамилия Имя Отчество' });
    const group = h('input', { name: 'group', required: true, autocomplete: 'off', maxlength: '50', list: 'admin-groups', placeholder: 'Например, ИИ112-26' });
    const err = h('p', { class: 'error', role: 'alert' });
    const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Добавить');
    return h('form', {
      class: 'card form',
      onsubmit: async e => {
        e.preventDefault();
        err.textContent = '';
        const rows = [{ name: name.value.trim(), group: group.value.trim() }];
        btn.disabled = true;
        try {
          const r = await ctx.call('adminAddStudents', { rows });
          if (!ctx.alive()) return;
          if (!r.added.length && !r.errors.length) err.textContent = 'Такой студент в этой группе уже есть';
          else if (!r.added.length) err.textContent = `Не добавлено: ${r.errors.map(x => x.reason).join('; ')}`;
          else { name.value = ''; showResult(r, 'Студент добавлен', true); load(true); }
        } catch (x) { ctx.fail(x, err); } finally { btn.disabled = false; }
      },
    }, h('h2', {}, 'Добавить студента'),
    h('label', { class: 'field' }, h('span', {}, 'ФИО'), name),
    h('label', { class: 'field' }, h('span', {}, 'Группа'), group),
    h('datalist', { id: 'admin-groups' }, groupsOf().map(g => h('option', { value: g }))),
    err, btn);
  }

  function importForm() {
    const ta = h('textarea', { rows: 6, name: 'importText', spellcheck: 'false', 'aria-label': 'Список студентов', placeholder: 'Иванов Иван Иванович;ИИ112-26\nПетрова Анна Сергеевна;ИИ112-26' });
    const file = h('input', { type: 'file', accept: '.csv,.txt,.tsv,text/csv,text/plain', 'aria-label': 'Файл со списком' });
    const preview = h('div', { class: 'import-preview', 'aria-live': 'polite' });
    const err = h('p', { class: 'error', role: 'alert' });
    const btn = h('button', { class: 'btn primary', type: 'button', disabled: true }, 'Импортировать');
    let parsed = { rows: [], errors: [] };
    let warn = '';

    function update() {
      parsed = parseImport(ta.value);
      const p = parsed;
      preview.replaceChildren(
        warn ? h('p', { class: 'error' }, warn) : '',
        ta.value.trim() ? h('p', {}, `Распознано строк: ${p.rows.length}. Ошибок: ${p.errors.length}.`) : h('p', { class: 'hint' }, 'Формат строки: ФИО;Группа (можно табуляцию или запятую перед группой). Первая строка «ФИО;Группа» пропускается.'),
        p.rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'rtable compact' },
          h('thead', {}, h('tr', {}, h('th', {}, 'ФИО'), h('th', {}, 'Группа'))),
          h('tbody', {}, p.rows.slice(0, PREVIEW_ROWS).map(r => h('tr', {}, h('td', { 'data-label': 'ФИО' }, r.name), h('td', { 'data-label': 'Группа' }, r.group)))))) : '',
        p.rows.length > PREVIEW_ROWS ? h('p', { class: 'hint' }, `… и ещё ${p.rows.length - PREVIEW_ROWS}`) : '',
        p.errors.length ? h('ul', { class: 'error-list' }, p.errors.map(x => h('li', {}, `Строка ${x.line}: ${x.reason}`))) : '');
      btn.disabled = !p.rows.length;
    }
    ta.addEventListener('input', () => { warn = ''; update(); });
    file.addEventListener('change', () => {
      const f = file.files && file.files[0];
      if (!f) return;
      if (f.size > MAX_FILE) { warn = 'Файл больше 1 МБ — это не список студентов'; update(); return; }
      const reader = new FileReader();
      reader.onload = () => {
        let t = String(reader.result || '');
        if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1); // BOM
        ta.value = t;
        warn = t.indexOf('�') >= 0 ? 'Похоже, файл не в кодировке UTF-8: часть символов не прочитана. Сохраните его как «UTF-8» и выберите заново.' : '';
        update();
      };
      reader.onerror = () => { warn = 'Не удалось прочитать файл'; update(); };
      reader.readAsText(f, 'UTF-8');
    });
    btn.addEventListener('click', async () => {
      err.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Импортируем…';
      try {
        // сервер разбирает текст тем же правилом и перепроверяет список
        const r = await ctx.call('adminAddStudents', { text: ta.value });
        if (!ctx.alive()) return;
        showResult(r, 'Импорт выполнен', false);
        ta.value = ''; file.value = ''; warn = '';
        update();
        load(true);
      } catch (x) { ctx.fail(x, err); btn.disabled = !parsed.rows.length; } finally { btn.textContent = 'Импортировать'; }
    });
    update();
    return h('div', { class: 'card form' }, h('h2', {}, 'Импорт списка'),
      h('label', { class: 'field' }, h('span', {}, 'Вставьте список или выберите файл (.csv, .txt, UTF-8)'), ta),
      h('label', { class: 'field' }, file),
      preview, err, btn);
  }

  async function act(s, job, okText) {
    status.textContent = '';
    try {
      await job();
      if (!ctx.alive()) return;
      status.textContent = okText;
      await load(true);
    } catch (e) { ctx.fail(e, status); }
  }

  async function resetPassword(s) {
    const yes = await confirmDialog({
      title: 'Сбросить пароль?',
      body: `${s.name} (${s.group}) потеряет доступ, пока не войдёт по новому одноразовому паролю. Его текущие сеансы будут завершены. Если студент заблокирован, сброс пароля его разблокирует.`,
      ok: 'Сбросить пароль',
    });
    if (!yes) return;
    status.textContent = '';
    try {
      const r = await ctx.call('adminResetStudent', { studentId: s.id });
      if (!ctx.alive()) return;
      await load(true);
      await infoDialog({ title: 'Новый одноразовый пароль', body: [credentialsBox(r.name || s.name, r.group || s.group, r.login || s.login, r.oneTime), h('p', { class: 'hint' }, 'Пароль показан один раз — передайте его студенту (или напечатайте карточку).')] });
    } catch (e) { ctx.fail(e, status); }
  }

  async function toggleBlock(s) {
    const blocked = s.status === ST_BLOCKED;
    if (!blocked) {
      const yes = await confirmDialog({ title: 'Заблокировать студента?', body: `${s.name} (${s.group}) не сможет войти, его сеансы завершатся.`, ok: 'Заблокировать', danger: true });
      if (!yes) return;
    }
    await act(s, () => ctx.call('adminSetStatus', { studentId: s.id, status: blocked ? 'активен' : ST_BLOCKED }), blocked ? `${s.name}: разблокирован` : `${s.name}: заблокирован`);
  }

  async function remove(s) {
    const yes = await confirmDialog({ title: 'Удалить студента?', body: `Удалить «${s.name}», группа ${s.group}? Учётная запись исчезнет, а его сдачи останутся в таблице «Ответы». Отменить нельзя.`, ok: 'Удалить', danger: true });
    if (!yes) return;
    await act(s, () => ctx.call('adminDeleteStudent', { studentId: s.id }), `${s.name}: удалён`);
  }

  function drawList() {
    const list = visible();
    if (!state.students.length) { listBox.replaceChildren(emptyBox('Студентов пока нет. Добавьте одного или импортируйте список.')); return; }
    const badge = s => h('span', { class: `badge-st st-${s.status === ST_NEW ? 'new' : s.status === ST_BLOCKED ? 'blocked' : 'active'}` },
      s.status === ST_NEW ? 'новый (ещё не входил)' : s.status);
    listBox.replaceChildren(h('div', { class: 'table-wrap' }, h('table', { class: 'rtable students-table' },
      h('thead', {}, h('tr', {}, ['ФИО', 'Группа', 'Логин', 'Статус', 'Последняя сдача', 'Действия'].map(t => h('th', {}, t)))),
      h('tbody', {}, list.map(s => h('tr', { 'data-id': s.id },
        h('td', { 'data-label': 'ФИО', class: 'cell-name' }, s.name),
        h('td', { 'data-label': 'Группа' }, s.group),
        h('td', { 'data-label': 'Логин', class: 'mono' }, s.login),
        h('td', { 'data-label': 'Статус' }, badge(s)),
        h('td', { 'data-label': 'Последняя сдача' }, fmtTime(s.lastSubmission) || '—'),
        h('td', { class: 'cell-actions' }, h('div', { class: 'row' },
          h('button', { class: 'btn small', type: 'button', onclick: () => resetPassword(s) }, 'Сбросить пароль'),
          h('button', { class: 'btn small', type: 'button', onclick: () => toggleBlock(s) }, s.status === ST_BLOCKED ? 'Разблокировать' : 'Заблокировать'),
          h('button', { class: 'btn small danger-ghost', type: 'button', onclick: () => remove(s) }, 'Удалить')))))))));
  }

  await load();
}
