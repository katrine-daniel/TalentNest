import type { EntityRef, ID, TriggerType } from '@/domain/types'
import { takeQueuedEvents } from './activity'

export interface DomainEvent {
  type: TriggerType
  entity: EntityRef | null
  /** Employee the event concerns, for condition fields and assignee targets. */
  employeeId: ID | null
  actorId: ID | null
  /** Extra values exposed to rule conditions and message templates. */
  data: Record<string, string | number | null>
}

type Handler = (event: DomainEvent) => void
const handlers = new Set<Handler>()

export const events = {
  subscribe(handler: Handler) {
    handlers.add(handler)
    return () => {
      handlers.delete(handler)
    }
  },
  /** Publishes events queued by the last service call. */
  flush() {
    for (const event of takeQueuedEvents()) for (const h of handlers) h(event)
  },
}
