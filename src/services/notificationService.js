import { mockDb } from './mockDb'
import { mockRequest } from './apiClient'

export const notificationService = {
  async markRead(id) {
    return mockRequest(() => mockDb.write('notifications', (list) => list.map((n) => (n.id === id ? { ...n, read: true } : n))), { latency: 80 })
  },

  async markAllRead() {
    return mockRequest(() => mockDb.write('notifications', (list) => list.map((n) => ({ ...n, read: true }))), { latency: 150 })
  },

  async dismiss(id) {
    return mockRequest(() => mockDb.write('notifications', (list) => list.filter((n) => n.id !== id)), { latency: 80 })
  },
}
