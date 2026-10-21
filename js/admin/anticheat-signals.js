// Сигналы защиты баллов (сервер кладёт `signals: string[]` рядом с признаком suspicious): подписи и чипы для админ-панели.
// Отдельный НОВЫЙ модуль (у сайта нет версионирования — см. js/hw-submit.js). Неизвестный код показываем как есть.
import { h } from '../util/dom.js';

export const SIGNAL_LABELS = {
  score: 'баллы клиента ≠ серверные',
  noopen: 'сдача без открытия',
  fast: 'слишком быстро',
  burst: 'несколько ПЗ за минуту',
  samedur: 'одинаковая длительность серии',
  nokeys: 'нет ключей — баллы клиента',
  client: 'Python/терминал — баллы клиента',
  noanswers: 'ДЗ без ответов',
};
export const SIGNALS_HINT = 'Повод присмотреться, не доказательство';

// массив строк-кодов из ответа сервера; поля нет или не массив — пусто (ничего не меняется)
export function signalCodes(signals) {
  return Array.isArray(signals) ? signals.filter(c => typeof c === 'string' && c) : [];
}
export const signalLabel = code => (Object.prototype.hasOwnProperty.call(SIGNAL_LABELS, code) ? SIGNAL_LABELS[code] : code);
export const signalTexts = signals => signalCodes(signals).map(signalLabel);

// чипы сигналов; без сигналов — '' (add/h такое пропускают)
export function signalChips(signals) {
  const codes = signalCodes(signals);
  if (!codes.length) return '';
  return h('span', { class: 'sig-chips', title: SIGNALS_HINT },
    codes.map(c => h('span', { class: 'sig-chip', title: `${signalLabel(c)}. ${SIGNALS_HINT}` }, signalLabel(c))));
}
