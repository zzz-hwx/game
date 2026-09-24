export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly status = 0) {
    super(message);
    this.name = 'ApiError';
  }
}
const messages: Record<string, string> = {
  invalid_input: '提交的数据不符合要求，未保存。',
  invalid_records: '游戏数据无效，请检查本机记录。',
  payload_too_large: '存档超过 512 KB，请先在 2048 中整理不再需要的手动存档。',
  account_changed: '登录账号已变化，请刷新账号信息后再操作。',
  snapshot_conflict: '该备份编号已存在且内容不同，原备份未被覆盖。',
  storage_unavailable: '云存储暂时不可用，请稍后重新读取。',
  write_result_unknown: '保存结果尚未确认，请检查保存结果，不要重复上传。',
};

export async function requestJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers, credentials: 'same-origin', signal: init.signal ?? AbortSignal.timeout(25_000) });
  } catch {
    throw new ApiError('网络请求未完成，请重新读取；保存操作不要重复提交。', 'network_error');
  }
  if (response.status === 401 || response.status === 403) {
    throw new ApiError(response.status === 401 ? '请先登录 Qoder 账号。' : '无法验证访问权限，请检查登录状态。', 'access_denied', response.status);
  }
  if (response.redirected || !response.headers.get('content-type')?.includes('application/json')) {
    throw new ApiError('云服务尚未就绪或登录已失效；本机游戏不受影响。', 'invalid_response', response.status);
  }
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new ApiError('云服务响应无法解析，请重新读取。', 'invalid_response', response.status); }
  const body = data && typeof data === 'object' ? data as Record<string, unknown> : null;
  const code = typeof body?.error === 'string' ? body.error
    : (!response.ok || body?.ok === false) && typeof body?.code === 'string' ? body.code
    : response.ok ? null : 'request_failed';
  if (!response.ok || body?.ok === false || code) {
    const resolved = code ?? 'request_failed';
    throw new ApiError(Object.hasOwn(messages, resolved) ? messages[resolved] : '云服务暂时无法完成操作，请稍后重新读取。', resolved, response.status);
  }
  return data;
}

export function isWriteOutcomeUnknown(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  if (error.status === 401 || error.status === 403 || error.code === 'write_rejected') return false;
  return ['network_error', 'invalid_response', 'write_result_unknown'].includes(error.code) || error.status >= 500;
}
