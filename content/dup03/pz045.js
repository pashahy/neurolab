// Сайт обновился: этот путь читают только старые версии страницы.
try { const k = 'nl-sealed-reload'; const t = Number(sessionStorage.getItem(k)) || 0; if (Date.now() - t > 60000) { sessionStorage.setItem(k, String(Date.now())); location.reload(); } } catch (e) { /* нет sessionStorage */ }
throw new Error('Сайт обновился — обновите страницу');
