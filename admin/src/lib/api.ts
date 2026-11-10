import type {
  Announcement,
  AnnouncementInput,
  Captcha,
  GithubReleaseItem,
  GithubSyncInput,
  GithubSyncResult,
  LoginInput,
  LoginResponse,
  Mirror,
  MirrorInput,
  Overview,
  PasswordInput,
  Release,
  ReleaseInput,
  Session,
  Settings,
  SettingsInput,
} from './types'

const TOKEN_KEY = 'shenv.admin.token'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(value: string | null): void {
  try {
    if (value) window.localStorage.setItem(TOKEN_KEY, value)
    else window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* localStorage 不可用时保持内存态，登录态仅当前标签页有效 */
  }
}

type UnauthorizedHandler = () => void

let unauthorizedHandler: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler
}

function extractError(payload: unknown): string | null {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const value = (payload as { error?: unknown }).error
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function defaultMessage(status: number): string {
  switch (status) {
    case 400:
      return '请求参数有误'
    case 401:
      return '登录状态已失效，请重新登录'
    case 403:
      return '没有权限执行该操作'
    case 404:
      return '请求的资源不存在'
    case 429:
      return '操作过于频繁，请稍后再试'
    case 500:
      return '服务端处理失败'
    case 502:
      return 'GitHub 上游服务不可用'
    case 503:
      return '服务暂不可用，请稍后再试'
    default:
      return '请求失败，请稍后重试'
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return '请求失败，请稍后重试'
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  auth?: boolean
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const withAuth = options.auth !== false

  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (withAuth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw new ApiError(0, '网络错误，无法连接更新服务')
  }

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text) as unknown
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    if (response.status === 401 && withAuth) {
      setToken(null)
      unauthorizedHandler?.()
    }
    throw new ApiError(response.status, extractError(payload) ?? defaultMessage(response.status))
  }

  return payload as T
}

export const api = {
  captcha: () => request<Captcha>('/api/auth/captcha', { auth: false }),
  login: (input: LoginInput) =>
    request<LoginResponse>('/api/auth/login', { method: 'POST', body: input, auth: false }),
  session: () => request<Session>('/api/admin/session'),
  changePassword: (input: PasswordInput) =>
    request<{ ok?: boolean }>('/api/admin/password', { method: 'POST', body: input }),

  overview: () => request<Overview>('/api/admin/overview'),

  release: {
    get: () => request<Release>('/api/admin/release'),
    save: (input: ReleaseInput) => request<Release>('/api/admin/release', { method: 'PUT', body: input }),
    syncGithub: (input: GithubSyncInput) =>
      request<GithubSyncResult>('/api/admin/release/sync-github', { method: 'POST', body: input }),
    githubReleases: (limit = 20) =>
      request<{ items: GithubReleaseItem[] }>(`/api/admin/github/releases?limit=${limit}`),
  },

  announcements: {
    list: () => request<{ items: Announcement[] }>('/api/admin/announcements'),
    create: (input: AnnouncementInput) =>
      request<Announcement>('/api/admin/announcements', { method: 'POST', body: input }),
    update: (id: number, input: AnnouncementInput) =>
      request<Announcement>(`/api/admin/announcements/${id}`, { method: 'PUT', body: input }),
    remove: (id: number) =>
      request<{ ok?: boolean }>(`/api/admin/announcements/${id}`, { method: 'DELETE' }),
  },

  mirrors: {
    list: () => request<{ items: Mirror[] }>('/api/admin/mirrors'),
    create: (input: MirrorInput) => request<Mirror>('/api/admin/mirrors', { method: 'POST', body: input }),
    update: (id: number, input: MirrorInput) =>
      request<Mirror>(`/api/admin/mirrors/${id}`, { method: 'PUT', body: input }),
    remove: (id: number) => request<{ ok?: boolean }>(`/api/admin/mirrors/${id}`, { method: 'DELETE' }),
  },

  settings: {
    get: () => request<Settings>('/api/admin/settings'),
    save: (input: SettingsInput) =>
      request<Settings>('/api/admin/settings', { method: 'PUT', body: input }),
  },
}
