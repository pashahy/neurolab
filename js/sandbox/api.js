// API песочницы: тонкие обёртки над api.call. Закрытое окно (ошибка closed) — не исключение, а { closed: true }.
export function sandboxApi(api) {
  const guard = async fn => {
    try { return await fn(); } catch (e) {
      if (e && e.message === 'closed') return e.reason ? { closed: true, reason: e.reason } : { closed: true };
      throw e;
    }
  };
  return {
    today: () => guard(() => api.call('sandboxToday')),
    attempt: (d, taskId, source) => guard(() => api.call('sandboxAttempt', source ? { d, taskId, source } : { d, taskId })),
    tree: d => guard(() => api.call('sandboxTree', { d })),
    quest: d => guard(() => api.call('sandboxQuest', d ? { d } : {})),
    hint: (d, taskId, n) => guard(() => api.call('sandboxHint', { d, taskId, n })),
    freeHint: (source, d, taskId, n) => guard(() => api.call('sandboxFreeHint', { source, d, taskId, n })),
    archive: () => guard(() => api.call('sandboxArchive', {})),
  };
}
