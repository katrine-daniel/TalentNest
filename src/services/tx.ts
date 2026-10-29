import type { Account, Database } from '@/domain/types'
import { can, type Permission } from '@/domain/permissions'
import { events } from './events'
import { ServiceError, store } from './store'

/** Applies a change and then publishes the domain events it queued (for automation). */
export function transact(mutate: (db: Database) => Database) {
  store.commit(mutate)
  events.flush()
}

export function requirePermission(actor: Account, permission: Permission, message = 'You do not have permission to do this.') {
  if (!can(actor, permission)) throw new ServiceError(message, 'forbidden')
}

export function required(value: string | null | undefined, label: string): string {
  const v = (value ?? '').trim()
  if (!v) throw new ServiceError(`${label} is required.`)
  return v
}
