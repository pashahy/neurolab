// Хранение песочницы в черновиках студента (store.getDraft/setDraft).
const K = { py: 'sandbox:py', term: 'sandbox:term', from: 'sandbox:from', stats: 'sandbox:stats' };
const HISTORY_MAX = 200;
const DEFAULT_PACKAGES = [];

export const dailyKey = (d, id) => `sandbox:daily:${d}:${id}`;

export function createSandboxStorage(store) {
  return {
    loadPy() {
      const v = store.getDraft(K.py);
      return {
        code: v && typeof v.code === 'string' ? v.code : '',
        packages: v && Array.isArray(v.packages) ? v.packages.slice() : DEFAULT_PACKAGES.slice(),
      };
    },
    savePy(v) {
      store.setDraft(K.py, { code: String((v && v.code) || ''), packages: Array.isArray(v && v.packages) ? v.packages.slice() : [] });
    },
    loadTerm() {
      const v = store.getDraft(K.term);
      return { history: v && Array.isArray(v.history) ? v.history.slice(-HISTORY_MAX) : [] };
    },
    saveTerm(v) {
      const h = Array.isArray(v && v.history) ? v.history : [];
      store.setDraft(K.term, { history: h.slice(-HISTORY_MAX) });
    },
    // передача из другого экрана («открыть в песочнице»): читает и удаляет
    takeFrom() {
      const v = store.getDraft(K.from);
      if (!v) return null;
      store.clearDraft(K.from);
      return v;
    },
    putFrom(v) { store.setDraft(K.from, v); },
    saveStats({ solved, starSolved, bestStreak }) { store.setDraft(K.stats, { solved, starSolved, bestStreak }); },
    loadStats() { return store.getDraft(K.stats); },
    loadDaily: (d, id) => store.getDraft(dailyKey(d, id)),
    saveDaily: (d, id, v) => store.setDraft(dailyKey(d, id), v),
  };
}
