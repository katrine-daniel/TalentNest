import { dataStore } from '@/services/storage/dataStore'
import { createId } from '@/utils/ids'

const MAX_ACTIVITIES = 1000
const MAX_NOTIFICATIONS = 300

/** Records an audit/activity entry. Called by services after a successful mutation. */
export function logActivity({
  type,
  text,
  actorId = null,
  candidateId = null,
  jobId = null,
}: {
  type: string
  text: string
  actorId?: string | null
  candidateId?: string | null
  jobId?: string | null
}) {
  dataStore.write('activities', (list) =>
    [{ id: createId('act'), at: new Date().toISOString(), type, text, actorId, candidateId, jobId }, ...list].slice(0, MAX_ACTIVITIES),
  )
}

/** In-app notification. `userId` targets one person; omit it to notify the whole organization. */
export function pushNotification({
  type,
  title,
  body,
  link,
  userId = null,
}: {
  type: string
  title: string
  body: string
  link?: string
  userId?: string | null
}) {
  dataStore.write('notifications', (list) =>
    [{ id: createId('ntf'), type, title, body, link, userId, at: new Date().toISOString(), read: false }, ...list].slice(0, MAX_NOTIFICATIONS),
  )
}

export function candidateName(candidateId: string) {
  const c = dataStore.read('candidates').find((x) => x.id === candidateId)
  return c ? `${c.firstName} ${c.lastName}` : 'Candidate'
}
