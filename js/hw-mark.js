// Отметка за ДЗ (формат v4) — чистая функция без зависимостей: её используют и js/grading.js, и js/store.js
// (проверка согласованности записи ДЗ при слиянии с сервером). Серверная копия — homeworkMark_ в apps-script/Code.gs (сверяется тестом).
// «5» — только ⭐ ≥ 85 %; «4» — ⭐ ≥ 70 % или базовое ≥ 85 %; «3» — ≥ 50 %.
export function homeworkMark({ score, max, level }) {
  const pct = max > 0 ? Math.round(score / max * 1000) / 10 : 0;
  const adv = level === 'adv';
  if (adv && pct >= 85) return 5;
  if ((adv && pct >= 70) || pct >= 85) return 4;
  if (pct >= 50) return 3;
  return 0;
}
