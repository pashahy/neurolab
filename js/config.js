// Адрес веб-приложения Google Apps Script (см. docs/setup-google-sheet.md).
const PROD_URL = 'https://script.google.com/macros/s/AKfycbx2oeTkGceJ0XBgQ9k9jyLHwl9kfib95sBa8sMXs7elAxBZ__5OxjSK0s8pEwrgwhishA/exec';
// локально (tools/dev-server.js) API отвечает на том же хосте по /api
const isLocal = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export const API_URL = isLocal ? '/api' : PROD_URL;

export const DISCIPLINES = ['dup01', 'dup03'];
