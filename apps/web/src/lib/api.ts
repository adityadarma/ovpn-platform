import { useAuthStore } from '@/store/auth.store'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().token

  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  if (options?.body) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...options?.headers as Record<string, string>,
    },
  })

  if (res.status === 401) {
    useAuthStore.getState().logout()
    if (typeof window !== 'undefined') window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: `HTTP ${res.status}` }))
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T = void>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
}
