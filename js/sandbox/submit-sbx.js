// Сдача песочницы через общую очередь отправки (kind: 'sbx' -> действие sandboxSolve, поле solution).

export function buildSandboxSolution({ d, taskId, date, token, outputs, history, now = Date.now(), rnd = Math.random }) {
  const s = {
    id: `${now.toString(36)}-${Math.floor(rnd() * 1e9).toString(36)}`,
    kind: 'sbx',
    d,
    taskId,
    date,
  };
  if (token !== undefined) s.token = token;
  if (outputs !== undefined) s.outputs = outputs;
  if (history !== undefined) s.history = history;
  return s;
}

// Ставит работу в очередь и ждёт первого прохода.
//   { state: 'done', result } — сервер принял, result = { correct, points, bonus, streak, freeze, failed, already };
//   { state: 'queued' } — не дошло (сеть, busy, нет сессии): останется в очереди с тем же id;
//   { state: 'rejected', error } — сервер отклонил, работа убрана; { state: 'held', error } — ждёт в очереди без таймера.
export async function submitSandbox(submitter, solution) {
  const r = await submitter.submit(solution);
  if (r.rejected !== undefined) return { state: 'rejected', error: r.rejected };
  if (r.hold !== undefined) return { state: 'held', error: r.hold };
  if (r.sent) {
    const o = submitter.outcome(solution.id);
    return { state: 'done', result: (o && o.result) || {} };
  }
  return { state: 'queued' };
}
