// Песочница: текст полосы этапов загрузки Python и пакетов («✓ Python → pandas… → numpy»).
export const PKG_FAIL_TEXT = 'Не хватило интернета, чтобы скачать pandas (~10 МБ). Попробуй через Wi-Fi.';
export const RETRY_TEXT = 'Повторить';

// packages: ['pandas','numpy']; update(stage, text) возвращает строку для статуса.
export function createStages(packages) {
  const names = ['Python'].concat(packages);
  const done = { Python: false };
  let current = 'Python';
  const render = () => names.map(n => (done[n] ? '✓ ' + n : n === current ? 'Загружаю ' + n + '…' : n + '…')).join(' → ');
  return {
    update(stage, text) {
      if (stage === 'packages') {
        done.Python = true;
        const m = /^Loaded (.+)$/.exec(String(text || ''));
        if (m) m[1].split(',').forEach(s => { const n = s.trim(); if (names.indexOf(n) > 0) done[n] = true; });
        current = names.filter(n => !done[n])[0] || '';
      }
      return render();
    },
  };
}
