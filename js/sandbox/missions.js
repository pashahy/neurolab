// Мини-миссии терминала: прогресс, разблокировка, проверка целей. Чистая логика без DOM.
import { createShell, checkGoal } from '../sim/shell.js';

const K_DONE = 'sandbox:missions';
const missionKey = id => `sandbox:mission:${id}`;
const HISTORY_MAX = 200;

// Хранение в черновиках студента: { done: [id] } и история каждой миссии.
export function createMissionStorage(store) {
  return {
    loadDone() {
      const v = store.getDraft(K_DONE);
      const raw = v && Array.isArray(v.done) ? v.done : [];
      return raw.filter((x, i) => typeof x === 'string' && raw.indexOf(x) === i);
    },
    // true — миссия засчитана впервые
    markDone(id) {
      const done = this.loadDone();
      if (done.indexOf(id) >= 0) return false;
      store.setDraft(K_DONE, { done: done.concat(id) });
      return true;
    },
    loadHistory(id) {
      const v = store.getDraft(missionKey(id));
      return v && Array.isArray(v.history) ? v.history.filter(x => typeof x === 'string').slice(-HISTORY_MAX) : [];
    },
    saveHistory(id, history) {
      store.setDraft(missionKey(id), { history: (Array.isArray(history) ? history : []).slice(-HISTORY_MAX) });
    },
  };
}

export const missionState = mstorage => ({ done: mstorage.loadDone() });

// Первая миссия открыта всегда, остальные — после прохождения предыдущей.
export function isUnlocked(missions, done, id) {
  const i = missions.findIndex(m => m.id === id);
  if (i < 0) return false;
  return i === 0 || done.indexOf(missions[i - 1].id) >= 0;
}

// Оболочка миссии после повтора команд (историю не выполненных заново команд берём как есть).
export function replayMission(def, commands) {
  const sh = createShell(def.setup || {});
  for (const c of commands || []) sh.exec(c);
  return sh;
}

export function checkMission(def, shell) {
  const goals = def.goals.map(g => checkGoal(shell, g));
  return { goals, all: goals.length > 0 && goals.every(Boolean) };
}

// Итог проверки: засчитывает миссию, если цели выполнены. isNew — засчитана впервые, allDone — пройдены все миссии.
export function finishMission(missions, mstorage, def, shell) {
  if (!checkMission(def, shell).all) return { passed: false, isNew: false, allDone: false };
  const isNew = mstorage.markDone(def.id);
  const done = mstorage.loadDone();
  return { passed: true, isNew, allDone: missions.every(m => done.indexOf(m.id) >= 0) };
}
