import { h } from '../util/dom.js';
import { passwordField, errText } from '../ui/login.js';
import { checkStorage } from '../upload.js';
import { loadError } from './common.js';

const DEFAULT_ENDPOINT = 'https://storage.yandexcloud.net';
// Скрипт таблицы v2 не знает действий хранилища и отвечает «unknown action».
export const OLD_SERVER_MSG = 'Скрипт таблицы не обновлён до v3 — см. docs/setup-google-sheet.md, раздел «Обновление до v3»';
function oldServer(e) {
  if (e && !e.network && e.message === 'unknown action') e.message = OLD_SERVER_MSG;
  return e;
}
// запрос администратора (ctx.guard) с понятным текстом для старого скрипта
const guarded = (ctx, job) => ctx.guard(job).catch(e => { throw oldServer(e); });
const DEFAULT_REGION = 'ru-central1';
let uid = 0;

// #/admin/settings: блок «Хранилище файлов» — статус, форма ключей Yandex Object Storage, кнопка «Проверить».
// Сервер никогда не отдаёт секретный ключ (и ID ключа): поле секрета пустое, после сохранения стирается.
export async function renderSettings(ctx, main) {
  let view;
  try { view = await guarded(ctx, () => ctx.app.api.adminStorage()); } catch (e) {
    if (!ctx.alive() || (e && e.handled)) return;
    main.replaceChildren(loadError(errText(e), () => ctx.rerender()));
    return;
  }
  if (!ctx.alive()) return;
  main.replaceChildren(storageCard(ctx, view));
}

function storageCard(ctx, initial) {
  const id = `st-${++uid}`;
  let view = initial;
  const status = h('div', { class: 'storage-status', role: 'status', 'aria-live': 'polite' });
  const formTitle = h('h3', {});
  const drawStatus = () => {
    const issued = Number(view.issued) || 0;
    formTitle.textContent = view.configured ? 'Изменить ключи' : 'Подключить хранилище';
    status.replaceChildren(
      view.configured
        ? h('p', { class: 'storage-state on' }, h('span', { 'aria-hidden': 'true' }, '● '), 'Подключено: ', h('strong', { class: 'mono' }, String(view.bucket || '')))
        : h('p', { class: 'storage-state off' }, h('span', { 'aria-hidden': 'true' }, '○ '), 'Не подключено'),
      h('p', { class: 'hint' }, `Выдано разрешений на загрузку: ${issued}`));
  };

  const text = (name, label, value, attrs) => {
    const input = h('input', Object.assign({
      id: `${id}-${name}`, name, type: 'text', autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', value: value || '',
    }, attrs || {}));
    return { input, field: h('label', { class: 'field', for: input.id }, h('span', {}, label), input) };
  };
  const keyId = text('s3KeyId', 'ID ключа', '', { required: true, placeholder: 'YCAJE…' });
  // new-password: менеджер паролей не предлагает сохранить секретный ключ и не подставляет сохранённый пароль
  const secret = passwordField('Секретный ключ', { name: 's3Secret', autocomplete: 'new-password' });
  const bucket = text('s3Bucket', 'Бакет', view.bucket, { required: true });
  const endpoint = text('s3Endpoint', 'Endpoint', view.endpoint || DEFAULT_ENDPOINT, { inputmode: 'url' });
  const region = text('s3Region', 'Регион', view.region || DEFAULT_REGION);
  const secretHint = h('p', { class: 'hint' });
  const syncSecret = () => {
    secret.input.required = !view.configured;
    secretHint.textContent = view.configured
      ? 'Ключи с сервера не показываются. Новый ключ: введите и ID ключа, и секретный ключ. Чтобы сменить только бакет или адрес, введите текущий ID ключа, а секретный ключ можно оставить пустым — сохранится прежний.'
      : 'Ключи — из статического ключа сервисного аккаунта (см. инструкцию docs/setup-object-storage.md). Никому их не пересылайте.';
  };
  const err = h('p', { class: 'error', role: 'alert' });
  const ok = h('p', { class: 'ok-text', role: 'status' });
  const save = h('button', { class: 'btn primary', type: 'submit' }, 'Сохранить');

  const form = h('form', {
    class: 'form storage-form', autocomplete: 'off',
    onsubmit: async e => {
      e.preventDefault();
      err.textContent = ''; ok.textContent = '';
      const body = {
        keyId: keyId.input.value.trim(), secret: secret.input.value.trim(), bucket: bucket.input.value.trim(),
        endpoint: endpoint.input.value.trim(), region: region.input.value.trim(),
      };
      if (!body.keyId) { err.textContent = 'Введите ID ключа'; return; }
      if (!body.secret && !view.configured) { err.textContent = 'Введите секретный ключ'; return; }
      if (!body.bucket) { err.textContent = 'Введите имя бакета'; return; }
      if (!body.secret) delete body.secret; // не указан — сервер оставит прежний
      save.disabled = true;
      try {
        const r = await guarded(ctx, () => ctx.app.api.adminSetStorage(body));
        secret.input.value = ''; // секрет нигде не храним и в поле не оставляем
        if (!ctx.alive()) return;
        view = r;
        keyId.input.value = '';
        drawStatus();
        syncSecret();
        ok.textContent = 'Сохранено. Нажмите «Проверить».';
      } catch (x) {
        ctx.fail(x, err);
      } finally {
        save.disabled = false;
      }
    },
  }, keyId.field, secret.field, secretHint, bucket.field, endpoint.field, region.field, err, ok, h('div', { class: 'row' }, save));

  const checkMsg = h('p', { class: 'storage-check', role: 'status', 'aria-live': 'polite' });
  const check = h('button', { class: 'btn', type: 'button' }, 'Проверить');
  check.addEventListener('click', async () => {
    check.disabled = true;
    checkMsg.className = 'storage-check';
    checkMsg.textContent = 'Проверяем: загружаем тестовый файл и читаем его…';
    try {
      const r = await checkStorage({ adminCheckUpload: () => guarded(ctx, () => ctx.app.api.adminCheckUpload()) });
      if (!ctx.alive()) return;
      checkMsg.className = `storage-check ${r.ok ? 'good' : 'bad'}`;
      checkMsg.textContent = r.ok ? `✓ ${r.message}` : `✗ ${r.message}`;
    } catch (e) {
      if (!ctx.alive() || (e && e.handled)) return;
      checkMsg.className = 'storage-check bad';
      checkMsg.textContent = `✗ ${errText(e)}`;
    } finally {
      check.disabled = false;
    }
  });

  drawStatus();
  syncSecret();
  return h('section', { class: 'card storage-card' },
    h('h2', {}, 'Хранилище файлов'),
    h('p', { class: 'hint' }, 'Сюда студенты загружают файлы ПК-заданий (Yandex Object Storage). Пошаговая инструкция — docs/setup-object-storage.md.'),
    status,
    h('div', { class: 'row storage-actions' }, check),
    checkMsg,
    formTitle,
    form,
    h('p', { class: 'hint' }, '⚠️ Напомните студентам: не загружать документы с паспортными и другими личными данными.'));
}
