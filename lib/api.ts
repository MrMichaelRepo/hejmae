// Typed client-side fetch helper. All API endpoints return either
// { data: T } / { ok: true, ... } on success, or { error: { code, message } }
// on failure. This wraps that contract.

export class ApiError extends Error {
  status: number
  code: string
  details?: unknown
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

interface ApiSuccess<T> {
  data?: T
  ok?: boolean
  [key: string]: unknown
}

interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiSuccess<T>> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  // Bounce to sign-in on auth failures so dashboard pages don't spin forever
  // when a session expired. Skip the bounce for portal endpoints which use
  // magic-link auth instead of Clerk.
  if (
    res.status === 401 &&
    typeof window !== 'undefined' &&
    !path.startsWith('/api/portal/')
  ) {
    window.location.href = '/sign-in'
    // Throw anyway so callers stop waiting.
    throw new ApiError(401, 'unauthorized', 'Not signed in')
  }
  const text = await res.text()
  const body = text ? JSON.parse(text) : {}
  if (!res.ok) {
    const e = (body as ApiErrorBody).error
    throw new ApiError(
      res.status,
      e?.code ?? 'unknown',
      e?.message ?? `HTTP ${res.status}`,
      e?.details,
    )
  }
  return body as ApiSuccess<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
