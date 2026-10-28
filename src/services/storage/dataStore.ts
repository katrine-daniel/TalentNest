/**
 * Application data store.
 *
 * Holds the current organization's records in memory, exposes them to React via
 * `subscribe`/`getSnapshot` (useSyncExternalStore) and forwards every change to a
 * persistence driver:
 *   - demoDriver: seeded sample data persisted to this browser only (localStorage).
 *   - supabaseDriver: PostgreSQL via Supabase, scoped to the signed-in user's organization.
 *
 * Services mutate data only through `write`, so swapping the driver never requires
 * changes to screens or business logic.
 */
import type { CollectionName, Database } from '@/types/domain'

export type StoreStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface StoreSnapshot {
  status: StoreStatus
  error: Error | null
  data: Database | null
  driver: PersistenceDriver['kind'] | null
}

export interface PersistenceDriver {
  readonly kind: 'demo' | 'supabase'
  load(): Promise<Database>
  /** Persists the change from `prev` to `next` for one collection. */
  persist<K extends CollectionName>(collection: K, prev: Database[K], next: Database[K]): Promise<void>
  /** Restores a clean data set (demo only). */
  reset?(): Promise<Database>
}

type Listener = () => void
type PersistErrorListener = (error: Error, collection: CollectionName) => void

let snapshot: StoreSnapshot = { status: 'idle', error: null, data: null, driver: null }
let driver: PersistenceDriver | null = null
let loadPromise: Promise<void> | null = null
const listeners = new Set<Listener>()
const errorListeners = new Set<PersistErrorListener>()
const pendingWrites = new Set<Promise<void>>()

function setSnapshot(next: StoreSnapshot) {
  snapshot = next
  listeners.forEach((l) => l())
}

export const dataStore = {
  subscribe(listener: Listener) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  getSnapshot(): StoreSnapshot {
    return snapshot
  },

  /** Reports failed background writes (e.g. network errors) so the UI can tell the user. */
  onPersistError(listener: PersistErrorListener) {
    errorListeners.add(listener)
    return () => {
      errorListeners.delete(listener)
    }
  },

  /** Selects the persistence driver and loads its data. Re-running with a new driver reloads. */
  async connect(nextDriver: PersistenceDriver, { force = false } = {}) {
    if (driver === nextDriver && !force && (snapshot.status === 'ready' || loadPromise)) return loadPromise ?? undefined
    driver = nextDriver
    setSnapshot({ status: 'loading', error: null, data: null, driver: nextDriver.kind })
    loadPromise = (async () => {
      try {
        const data = await nextDriver.load()
        if (driver !== nextDriver) return
        setSnapshot({ status: 'ready', error: null, data, driver: nextDriver.kind })
      } catch (error) {
        if (driver !== nextDriver) return
        setSnapshot({ status: 'error', error: error instanceof Error ? error : new Error(String(error)), data: null, driver: nextDriver.kind })
      } finally {
        loadPromise = null
      }
    })()
    return loadPromise
  },

  /** Clears all in-memory data (sign-out). */
  disconnect() {
    driver = null
    setSnapshot({ status: 'idle', error: null, data: null, driver: null })
  },

  read<K extends CollectionName>(collection: K): Database[K] {
    if (!snapshot.data) throw new Error('Data has not loaded yet')
    return snapshot.data[collection]
  },

  /** Immutably replaces a collection, notifies subscribers, then persists in the background. */
  write<K extends CollectionName>(collection: K, updater: (current: Database[K]) => Database[K]): Database[K] {
    if (!snapshot.data || !driver) throw new Error('Data has not loaded yet')
    const prev = snapshot.data[collection]
    const next = updater(prev)
    if (next === prev) return next
    setSnapshot({ ...snapshot, data: { ...snapshot.data, [collection]: next } })
    const active = driver
    const write = active.persist(collection, prev, next).catch((error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error))
      errorListeners.forEach((l) => l(err, collection))
    })
    pendingWrites.add(write)
    void write.finally(() => pendingWrites.delete(write))
    return next
  },

  /** Resolves once all in-flight writes have finished (used by tests and before sign-out). */
  async flush() {
    await Promise.all([...pendingWrites])
  },

  async reset() {
    if (!driver?.reset) throw new Error('Reset is only available in demo mode')
    const data = await driver.reset()
    setSnapshot({ status: 'ready', error: null, data, driver: driver.kind })
  },
}

/** @deprecated Use `dataStore`. Kept so older modules keep working during migration. */
export const mockDb = dataStore
