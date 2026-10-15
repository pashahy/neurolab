// API песочницы: тонкие обёртки над api.call. Закрытое окно (ошибка closed) — не исключение, а { closed: true }.
export function sandboxApi(api) {
  const guard = async fn => {
    try { return await fn(); } catch (e) {
      if (e && e.message === 'closed') return { closed: true };
      throw e;
    }
  };
  return {
    today: () => guard(() => api.call('sandboxToday')),
    attempt: (d, taskId) => guard(() => api.call('sandboxAttempt', { d, taskId })),
  };
}
