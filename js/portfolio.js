// Портфолио студента: чистая логика отбора лучших работ и итогов (без DOM и сети).
export const PORTFOLIO_LIMIT = 10;

const KEY = /^(dup\d{2})\/(\d{1,3})$/;
const own = (o, k) => !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);

export function parseKey(k) {
  const m = KEY.exec(String(k));
  return m ? { d: m[1], n: Number(m[2]) } : null;
}

// оценка преподавателя за ПЗ из ответа myGrades: { items: { id: { score } } } -> сумма баллов или null
export function teacherTotal(grades, key) {
  if (!own(grades, key) || !grades[key] || typeof grades[key].items !== 'object' || !grades[key].items) return null;
  const items = grades[key].items;
  let sum = 0, count = 0;
  Object.keys(items).forEach(id => {
    const s = Number(items[id] && items[id].score);
    if (Number.isFinite(s)) { sum += s; count++; }
  });
  return count ? Math.round(sum * 100) / 100 : null;
}

const pct = (best, max) => (max > 0 ? Math.max(0, Math.min(100, Math.round(best / max * 100))) : 0);

// state: { progress, hw, grades }; titles: { 'dup01/1': 'Название' } (необязательно)
// -> { works: [все сданные ПЗ], best: [до limit лучших], byDiscipline: { dup01: { done, avg } }, done, avg }
export function buildPortfolio(state, titles, limit = PORTFOLIO_LIMIT) {
  const st = state || {};
  const progress = st.progress && typeof st.progress === 'object' ? st.progress : {};
  const hw = st.hw && typeof st.hw === 'object' ? st.hw : {};
  const works = [];
  Object.keys(progress).forEach(key => {
    const k = parseKey(key);
    const p = progress[key];
    if (!k || !p || !Number.isFinite(p.best)) return;
    const hwRec = own(hw, key) ? hw[key] : null;
    const max = Number(p.max) || 0;
    works.push({
      key, d: k.d, n: k.n,
      title: (titles && titles[key]) || `ПЗ ${k.n}`,
      best: p.best, max, percent: pct(p.best, max),
      perfect: !!p.perfect || (max > 0 && p.best === max),
      at: typeof p.at === 'string' ? p.at : null,
      teacher: teacherTotal(st.grades, key),
      hwMark: hwRec && [3, 4, 5].includes(hwRec.mark) ? hwRec.mark : null,
    });
  });
  const cmp = (a, b) => (Number(b.perfect) - Number(a.perfect)) || (b.percent - a.percent)
    || ((b.teacher === null ? -1 : b.teacher) - (a.teacher === null ? -1 : a.teacher))
    || ((b.hwMark || 0) - (a.hwMark || 0))
    || String(b.at || '').localeCompare(String(a.at || '')) || (a.n - b.n);
  const best = works.slice().sort(cmp).slice(0, Math.max(0, limit));
  const byDiscipline = {};
  works.forEach(w => {
    const e = byDiscipline[w.d] || (byDiscipline[w.d] = { done: 0, sum: 0 });
    e.done++; e.sum += w.percent;
  });
  Object.keys(byDiscipline).forEach(d => { const e = byDiscipline[d]; e.avg = e.done ? Math.round(e.sum / e.done) : 0; delete e.sum; });
  const avg = works.length ? Math.round(works.reduce((s, w) => s + w.percent, 0) / works.length) : 0;
  return { works, best, byDiscipline, done: works.length, avg };
}

const p2 = v => String(v).padStart(2, '0');
// ISO-время (или Date) -> 'ДД.ММ.ГГГГ' по ЛОКАЛЬНОМУ времени; дата без времени ('ГГГГ-ММ-ДД') берётся как есть; пусто, если даты нет
export function fmtDate(at) {
  if (!at) return '';
  const s = String(at);
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (plain) return `${plain[3]}.${plain[2]}.${plain[1]}`;
  const d = at instanceof Date ? at : new Date(s);
  return Number.isNaN(d.getTime()) ? '' : `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

// «1 балл», «2 балла», «5 баллов», «1,5 балла»
export function ballsText(n) {
  const x = Number(n);
  if (!Number.isInteger(x)) return `${String(x).replace('.', ',')} балла`;
  const a = Math.abs(x) % 100, b = a % 10;
  return `${x} ${a > 10 && a < 20 ? 'баллов' : b === 1 ? 'балл' : b >= 2 && b <= 4 ? 'балла' : 'баллов'}`;
}
