// Экспорт из песочницы и переход «Открыть в песочнице» из заданий ПЗ.
import { h } from '../util/dom.js';

export const OPEN_TEXT = 'Открыть в песочнице';
export const DOWNLOAD_PY_TEXT = 'Скачать .py';
export const DOWNLOAD_HISTORY_TEXT = 'Скачать историю .txt';

// команды истории с «$ », по строке; пустая история — пустая строка
export function historyText(history) {
  return (Array.isArray(history) ? history : []).map(c => `$ ${c}\n`).join('');
}

// скачивание текста файлом: Blob + a[download]
export function exportText(name, text) {
  const url = URL.createObjectURL(new Blob([String(text)], { type: 'text/plain;charset=utf-8' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Кнопка в задании ПЗ: кладёт данные в sandbox:from и открывает инструмент песочницы.
// Модуль хранения грузится по требованию: у телефона в кэше могут лежать старые копии остальных модулей.
// getPayload() → { kind, code | setup }; route — 'py' | 'term'. Код и черновик ПЗ не меняются.
export function openInSandboxButton(store, route, getPayload) {
  return h('button', {
    type: 'button', class: 'btn ghost small open-sbx',
    onclick: async () => {
      try {
        const { createSandboxStorage } = await import('./storage.js');
        createSandboxStorage(store).putFrom(getPayload());
        location.hash = `#/sandbox/${route}?from=1`;
      } catch (e) { /* без песочницы остаёмся в ПЗ */ }
    },
  }, OPEN_TEXT);
}
