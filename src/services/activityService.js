import { mockDb } from '@/services/storage/mockDb'
import { createId } from '@/utils/ids'

/** Records an activity entry. Called by other services after a successful mutation. */
export function logActivity({ type, text, actorId = null, candidateId = null, jobId = null }) {
  mockDb.write('activities', (list) => [{ id: createId('act'), at: new Date().toISOString(), type, text, actorId, candidateId, jobId }, ...list])
}

export function pushNotification({ type, title, body, link }) {
  mockDb.write('notifications', (list) => [{ id: createId('ntf'), type, title, body, link, at: new Date().toISOString(), read: false }, ...list])
}

export function candidateName(candidateId) {
  const c = mockDb.read('candidates').find((x) => x.id === candidateId)
  return c ? `${c.firstName} ${c.lastName}` : 'Candidate'
}
