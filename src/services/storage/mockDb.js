/**
 * DEMO-ONLY in-browser data store.
 *
 * Holds the seeded demo data set, persists changes to localStorage so the demo
 * survives a refresh, and notifies React subscribers (see hooks/useStore.js).
 * This is NOT production storage — when a backend exists, services should call
 * the HTTP client in apiClient.js and this module can be removed.
 */
import { createSeed, SEED_VERSION } from '@/data/seed'
import { DEMO_STORAGE_KEY } from '@/config/env'

const INITIAL_LOAD_LATENCY = 550

let snapshot = { status: 'idle', error: null, data: null }
const listeners = new Set()

function emit() {
  listeners.forEach((listener) => listener())
}

function setSnapshot(next) {
  snapshot = next
  emit()
}

function readPersisted() {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.version === SEED_VERSION ? parsed : null
  } catch {
    return null
  }
}

function persist(data) {
  try {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Storage may be full or blocked (private mode). The demo keeps working in memory.
  }
}

export const mockDb = {
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  getSnapshot() {
    return snapshot
  },

  async load() {
    if (snapshot.status === 'loading' || snapshot.status === 'ready') return
    setSnapshot({ status: 'loading', error: null, data: null })
    await new Promise((r) => setTimeout(r, INITIAL_LOAD_LATENCY))
    try {
      const data = readPersisted() ?? createSeed()
      persist(data)
      setSnapshot({ status: 'ready', error: null, data })
    } catch (error) {
      setSnapshot({ status: 'error', error, data: null })
    }
  },

  /** Returns the current value of a collection (read-only usage). */
  read(collection) {
    if (!snapshot.data) throw new Error('Demo data has not loaded yet')
    return snapshot.data[collection]
  },

  /** Immutably replaces a collection using an updater and notifies subscribers. */
  write(collection, updater) {
    if (!snapshot.data) throw new Error('Demo data has not loaded yet')
    const next = updater(snapshot.data[collection])
    const data = { ...snapshot.data, [collection]: next }
    persist(data)
    setSnapshot({ ...snapshot, data })
    return next
  },

  /** Restores the original seeded demo data set. */
  reset() {
    const data = createSeed()
    persist(data)
    setSnapshot({ status: 'ready', error: null, data })
  },
}
