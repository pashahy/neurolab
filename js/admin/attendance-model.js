// Автопосещаемость (клиент): чистая логика без DOM. Статусы считает сервер (adminAttendance в Code.gs); здесь только
// подписи, ручная правка, итоги и время по Москве (UTC+3, без перехода на летнее время — как на сервере).
export const ATT_STATUS = {
  present: { label: 'был', cls: 'att-present' },
  late: { label: 'опоздал', cls: 'att-late' },
  absent: { label: 'не был', cls: 'att-absent' },
};
export const ATT_ORDER = ['present', 'late', 'absent'];
const MSK = 3 * 3600 * 1000;
const pad2 = v => String(v).padStart(2, '0');

export const isStatus = s => ATT_ORDER.indexOf(s) >= 0;
export const nextStatus = s => ATT_ORDER[(Math.max(ATT_ORDER.indexOf(s), 0) + 1) % ATT_ORDER.length];

// Статус строки с учётом ручных правок { id: status }
export function effectiveStatus(row, over) {
  const o = over && Object.prototype.hasOwnProperty.call(over, row.id) ? over[row.id] : null;
  return isStatus(o) ? o : (isStatus(row.status) ? row.status : 'absent');
}

export function countStatuses(rows, over) {
  const c = { present: 0, late: 0, absent: 0 };
  (rows || []).forEach(r => { c[effectiveStatus(r, over)]++; });
  return c;
}

// мс -> { date: 'ГГГГ-ММ-ДД', time: 'ЧЧ:ММ' } по Москве
export function moscowParts(ms) {
  const d = new Date(ms + MSK);
  return { date: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`, time: `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}` };
}

// ISO -> 'ЧЧ:ММ' по Москве; пусто, если времени нет
export function moscowTime(iso) {
  const t = iso ? new Date(iso).getTime() : NaN;
  return isNaN(t) ? '' : moscowParts(t).time;
}

// Только заданные значения правок, отличающиеся от расчёта сервера
export function diffOverrides(rows, over) {
  const out = {};
  (rows || []).forEach(r => {
    if (over && Object.prototype.hasOwnProperty.call(over, r.id) && isStatus(over[r.id]) && over[r.id] !== r.status) out[r.id] = over[r.id];
  });
  return out;
}
