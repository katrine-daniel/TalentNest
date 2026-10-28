import { env } from '@/config/env'

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Wraps a mock operation with realistic latency. Every service routes through this
 * so swapping to the real backend is a one-place change per service function.
 */
export async function mockRequest(operation, { latency = 320 } = {}) {
  await delay(latency)
  return operation()
}

/** Minimal HTTP client for the future backend. Not used while env.useMockApi is true. */
export async function http(path, { method = 'GET', body, headers } = {}) {
  if (!env.apiBaseUrl) {
    throw new Error('VITE_API_BASE_URL is not configured — the app is running on the mock data layer.')
  }
  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `Request failed with status ${response.status}`)
  }
  return response.status === 204 ? null : response.json()
}

export class ServiceError extends Error {
  constructor(message, code = 'invalid') {
    super(message)
    this.code = code
  }
}
