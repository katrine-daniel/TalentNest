/**
 * Side-effect helpers shared by services: audit events, notifications and domain events.
 * They return updated collections so a service can apply everything in one commit.
 */
import { createId, nowISO } from '@/lib/utils'
import type { AuditEvent, Database, ID, Notification } from '@/domain/types'
import type { DomainEvent } from './events'

export function withAudit(db: Database, actorId: ID | null, action: string, entity: AuditEvent['entity'], summary: string): Database {
  const event: AuditEvent = { id: createId('aud'), at: nowISO(), actorId, action, entity, summary }
  return { ...db, audit: [event, ...db.audit].slice(0, 2000) }
}

export function withNotifications(db: Database, items: Array<Omit<Notification, 'id' | 'at' | 'read'>>): Database {
  const unique = items.filter((n, i, all) => n.accountId && all.findIndex((x) => x.accountId === n.accountId && x.title === n.title) === i)
  if (!unique.length) return db
  // Respect per-user in-app preferences (default on).
  const allowed = unique.filter((n) => db.notificationPrefs.find((p) => p.accountId === n.accountId && p.kind === n.kind)?.inApp !== false)
  const created = allowed.map((n) => ({ ...n, id: createId('ntf'), at: nowISO(), read: false }))
  return { ...db, notifications: [...created, ...db.notifications].slice(0, 1500) }
}

/** Domain events queued during a commit; published after it so automation sees the new state. */
const pending: DomainEvent[] = []
export function queueEvent(event: DomainEvent) {
  pending.push(event)
}
export function takeQueuedEvents(): DomainEvent[] {
  return pending.splice(0, pending.length)
}
