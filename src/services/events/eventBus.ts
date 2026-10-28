/**
 * In-process domain events. Services publish after a successful change; the
 * automation engine subscribes. Events are not durable — in Supabase mode the
 * equivalent server-side triggers are documented in docs/architecture.md.
 */
import type { AutomationTrigger } from '@/types/domain'

export interface DomainEvent {
  type: AutomationTrigger
  /** Primary record the event is about (application, interview or offer id). */
  entityId: string
  actorId: string | null
  context: {
    applicationId?: string
    candidateId?: string
    jobId?: string
    stageId?: string
    interviewId?: string
    offerId?: string
    hoursOverdue?: number
  }
}

type Handler = (event: DomainEvent) => void | Promise<void>

const handlers = new Set<Handler>()

export const eventBus = {
  subscribe(handler: Handler) {
    handlers.add(handler)
    return () => {
      handlers.delete(handler)
    }
  },
  async publish(event: DomainEvent) {
    for (const h of handlers) {
      try {
        await h(event)
      } catch (error) {
        // A failing subscriber must never break the action that triggered it.
        console.error('[events] handler failed for', event.type, error)
      }
    }
  },
}
