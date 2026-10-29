/** Joins class names, skipping falsy values. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

let counter = 0
/** Collision-resistant id for client-created records. */
export function createId(prefix: string): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)
  counter = (counter + 1) % 1296
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36).padStart(2, '0')}${rand}`
}

export const nowISO = () => new Date().toISOString()

export function fullName(p: { firstName: string; lastName: string; preferredName?: string | null }): string {
  return `${p.preferredName || p.firstName} ${p.lastName}`
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('')
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export function groupCount<T>(items: readonly T[], key: (t: T) => string): Map<string, number> {
  const m = new Map<string, number>()
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1)
  return m
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${String(x)}`)
}
