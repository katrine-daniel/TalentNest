import { env } from '@/config/env'
import { dataStore } from '@/services/storage/dataStore'

export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export class ServiceError extends Error {
  readonly code: string
  constructor(message: string, code = 'invalid') {
    super(message)
    this.name = 'ServiceError'
    this.code = code
  }
}

/**
 * Runs a service command against the data store. In the demo workspace a short
 * latency is simulated so loading states are visible; with Supabase the store
 * persists in the background and no artificial delay is added.
 *
 * (Historical name: kept as `mockRequest` so existing services did not need renaming.)
 */
export async function mockRequest<T>(operation: () => T, { latency = 320 }: { latency?: number } = {}): Promise<T> {
  if (dataStore.getSnapshot().driver === 'demo' && latency > 0 && import.meta.env.MODE !== 'test') await delay(latency)
  return operation()
}

/** Minimal HTTP client for a custom REST backend (VITE_API_BASE_URL). */
export async function http<T = unknown>(
  path: string,
  { method = 'GET', body, headers }: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T | null> {
  if (!env.apiBaseUrl) throw new ServiceError('VITE_API_BASE_URL is not configured.', 'not-configured')
  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    // Never surface raw server errors to users; log details for developers only.
    console.error(`[http] ${method} ${path} failed`, response.status, await response.text().catch(() => ''))
    throw new ServiceError(`Request failed (${response.status})`, 'http')
  }
  return response.status === 204 ? null : ((await response.json()) as T)
}
