import { h, add } from '../util/dom.js';
import { pts } from './common.js';
import { FILE_EXTS, MAX_FILE_MB, UPLOAD_MSG, allowedExts, limitMb, checkFile, cleanName, fileExt } from '../upload.js';

// Задание с загрузкой файла (ПК-вариант). Ответ: { key, name, size, ext, uploadedAt }.
// render получает в ctx функцию upload(file) -> Promise<ответ> (js/ui/lesson.js); в демо-занятии
// (ctx.demo или нет upload) файл не загружается: ответ — только имя и размер выбранного файла.
const hasFiles = dt => !!(dt && dt.types && Array.prototype.indexOf.call(dt.types, 'Files') >= 0);
const kb = size => Math.max(1, Math.ceil((Number(size) || 0) / 1024));

export default {
  manual: true,
  validate(t) {
    const e = [];
    const acc = t.accept;
    if (!Array.isArray(acc) || !acc.length || !acc.every(x => FILE_EXTS.includes(x))) {
      e.push(`file: accept — непустой список расширений без точки из: ${FILE_EXTS.join(', ')}`);
    }
    if (t.maxMb !== undefined && !(typeof t.maxMb === 'number' && t.maxMb >= 1 && t.maxMb <= MAX_FILE_MB)) e.push(`file: maxMb — от 1 до ${MAX_FILE_MB}`);
    const p = pts(t);
    if (!(typeof p === 'number' && p >= 3 && p <= 5)) e.push('file: points — от 3 до 5');
    if (t.rubric !== undefined && !(Array.isArray(t.rubric) && t.rubric.every(r => typeof r === 'string' && r.trim()))) e.push('file: rubric — список строк');
    if (t.note !== undefined && typeof t.note !== 'string') e.push('file: note — строка');
    return e;
  },
  ready: (t, a) => !!(a && a.key),
  check: t => ({ score: 0, max: pts(t), manual: true }),
  toText: (t, a) => (a && a.key ? `Файл: ${a.name} (${kb(a.size)} КБ)` : ''),
  render(t, el, { answer, onChange, locked, upload, demo, setBusy: notifyBusy }) {
    const accept = allowedExts(t.accept);
    const maxMb = limitMb(t.maxMb);
    const isDemo = !!demo || typeof upload !== 'function';
    let current = answer && answer.key ? answer : null;
    const status = h('div', { class: 'file-status', role: 'status', 'aria-live': 'polite' });
    const done = a => h('div', { class: 'file-done' },
      h('span', { class: 'file-icon', 'aria-hidden': 'true' }, '📄'),
      h('span', { class: 'file-name' }, a.name),
      h('span', { class: 'file-ok' }, a.demo ? '✓ выбран' : '✓ загружен'),
      h('span', { class: 'file-size' }, `${kb(a.size)} КБ`));
    const showDone = () => status.replaceChildren(current ? done(current) : '');
    const rubric = t.rubric ? h('div', { class: 'rubric' }, h('strong', {}, 'Критерии оценки:'), h('ul', {}, t.rubric.map(r => h('li', {}, r)))) : '';

    if (locked) {
      if (current) showDone();
      else status.append(h('p', { class: 'muted' }, 'Файл не загружен.'));
      add(el, rubric, status);
      return;
    }

    const input = h('input', { type: 'file', class: 'file-input', accept: accept.map(x => `.${x}`).join(',') });
    const label = h('span', {}, current ? '📎 Заменить файл' : '📎 Выбрать файл');
    const pick = h('label', { class: 'btn file-pick' }, input, label);
    const zone = h('div', { class: 'file-drop' },
      pick,
      h('p', { class: 'hint file-drop-hint' }, 'или перетащите файл сюда'),
      h('p', { class: 'hint' }, `Форматы: ${accept.join(', ')} · до ${maxMb} МБ`));
    let busy = false;
    const setBusy = b => {
      busy = b;
      if (typeof notifyBusy === 'function') notifyBusy(b); // lesson.js блокирует «Сохранить ответ» и «Пропустить»
      input.disabled = b;
      pick.classList.toggle('disabled', b);
      zone.setAttribute('aria-busy', b ? 'true' : 'false');
    };
    const showError = msg => {
      status.replaceChildren(h('p', { class: 'file-error' }, msg));
      if (current) status.append(done(current), h('p', { class: 'hint' }, 'В ответе остаётся этот файл.'));
    };

    async function take(file) {
      if (!file || busy) return;
      const problem = checkFile(file, { accept, maxMb });
      if (problem) { showError(problem === UPLOAD_MSG.ext ? `${problem}. Нужен файл: ${accept.join(', ')}` : problem); return; }
      if (isDemo) {
        current = { key: 'demo', name: cleanName(file.name), size: file.size, ext: fileExt(file.name), uploadedAt: new Date().toISOString(), demo: true };
        onChange(current);
        label.textContent = '📎 Заменить файл';
        showDone();
        return;
      }
      setBusy(true);
      status.replaceChildren(h('div', { class: 'file-progress' },
        h('span', {}, `Загружаем «${cleanName(file.name)}»…`),
        h('div', { class: 'file-bar', 'aria-hidden': 'true' })));
      try {
        current = await upload(file);
        onChange(current);
        label.textContent = '📎 Заменить файл';
        showDone();
      } catch (e) {
        showError((e && e.message) || UPLOAD_MSG.failed);
      } finally {
        setBusy(false);
      }
    }

    // значение поля сбрасывается сразу (File остаётся доступен): повторный выбор того же файла снова вызовет change
    // при любом исходе — ошибке формата, демо, загрузке
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      input.value = '';
      take(f);
    });
    const over = on => e => { e.preventDefault(); if (!busy) zone.classList.toggle('over', on); };
    zone.addEventListener('dragenter', over(true));
    zone.addEventListener('dragover', over(true));
    zone.addEventListener('dragleave', over(false));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('over');
      take(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
    });

    // файл, брошенный мимо зоны, браузер открыл бы вместо страницы: пока задание на экране, такие drop гасим;
    // после ухода с задания (zone отсоединена) обработчики снимают себя сами
    if (typeof document !== 'undefined') {
      const guard = e => {
        if (!zone.isConnected) {
          document.removeEventListener('dragover', guard);
          document.removeEventListener('drop', guard);
          return;
        }
        if (hasFiles(e.dataTransfer)) e.preventDefault();
      };
      document.addEventListener('dragover', guard);
      document.addEventListener('drop', guard);
    }

    if (current) showDone();
    else if (!isDemo && typeof navigator !== 'undefined' && navigator.onLine === false) status.append(h('p', { class: 'hint' }, UPLOAD_MSG.offline));
    add(el,
      t.note ? h('p', { class: 'hint file-note' }, `💡 ${t.note}`) : '',
      rubric,
      isDemo ? h('p', { class: 'hint file-demo' }, 'В демо-занятии файл не загружается') : '',
      zone, status);
  },
};
