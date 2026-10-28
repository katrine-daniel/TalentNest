import { dataStore } from '@/services/storage/dataStore'
import { mockRequest } from '@/services/api/apiClient'

/**
 * In-app notifications. Email delivery (per the notification preferences) needs a
 * server-side sender and is not performed from the browser.
 */
export const notificationService = {
  async markRead(id: string) {
    return mockRequest(() => dataStore.write('notifications', (list) => list.map((n) => (n.id === id ? { ...n, read: true } : n))), { latency: 80 })
  },

  /** Marks the given notifications (the ones visible to the current user) as read. */
  async markAllRead(ids: string[]) {
    const set = new Set(ids)
    return mockRequest(() => dataStore.write('notifications', (list) => list.map((n) => (set.has(n.id) ? { ...n, read: true } : n))), { latency: 150 })
  },

  async dismiss(id: string) {
    return mockRequest(() => dataStore.write('notifications', (list) => list.filter((n) => n.id !== id)), { latency: 80 })
  },
}
