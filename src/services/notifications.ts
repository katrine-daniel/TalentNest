import { createId, nowISO } from '@/lib/utils'
import type { Account, ID, Notification } from '@/domain/types'
import { replaceById, ServiceError, store } from './store'
import { transact } from './tx'

export const NOTIFICATION_KINDS: Array<{ kind: Notification['kind']; label: string }> = [
  { kind: 'request', label: 'Service requests' },
  { kind: 'leave', label: 'Leave' },
  { kind: 'lifecycle', label: 'Onboarding and offboarding' },
  { kind: 'policy', label: 'Policies' },
  { kind: 'task', label: 'Tasks' },
  { kind: 'automation', label: 'Automation' },
  { kind: 'system', label: 'System' },
]

export function markRead(actor: Account, id: ID, read = true) {
  const n = store.db.notifications.find((x) => x.id === id)
  if (!n || n.accountId !== actor.id) throw new ServiceError('Notification not found.', 'not_found')
  transact((d) => ({ ...d, notifications: replaceById(d.notifications, id, (x) => ({ ...x, read })) }))
}

export function markAllRead(actor: Account) {
  transact((d) => ({ ...d, notifications: d.notifications.map((n) => (n.accountId === actor.id && !n.read ? { ...n, read: true } : n)) }))
}

export function setPreference(actor: Account, kind: Notification['kind'], channel: 'inApp' | 'email', value: boolean) {
  transact((d) => {
    const existing = d.notificationPrefs.find((p) => p.accountId === actor.id && p.kind === kind)
    const pref = { accountId: actor.id, kind, inApp: existing?.inApp ?? true, email: existing?.email ?? false, [channel]: value }
    return { ...d, notificationPrefs: [...d.notificationPrefs.filter((p) => !(p.accountId === actor.id && p.kind === kind)), pref] }
  })
}

/** Snoozes or un-snoozes a derived inbox item for this account. */
export function snoozeInboxItem(actor: Account, itemKey: string, until: string | null) {
  transact((d) => {
    const rest = d.inboxState.filter((s) => !(s.accountId === actor.id && s.itemKey === itemKey))
    return { ...d, inboxState: until ? [...rest, { id: createId('ibx'), accountId: actor.id, itemKey, snoozedUntil: until }] : rest }
  })
}

export const nowStamp = nowISO
