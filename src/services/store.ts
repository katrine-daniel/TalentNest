/**
 * Application data store.
 *
 * Holds the organization's data in memory and notifies subscribers (React via
 * useSyncExternalStore). Every write goes through `commit`, which hands the changed
 * collections to the active persistence driver:
 *  - demo driver: saves the whole data set to localStorage (this browser only)
 *  - supabase driver: upserts/deletes the changed rows; RLS decides what is allowed
 */
import type { Collection, Database } from '@/domain/types'

export interface PersistenceDriver {
  kind: 'demo' | 'supabase'
  load(): Promise<Database>
  persist(prev: Database, next: Database, changed: ReadonlySet<Collection | 'organization'>): Promise<void>
}

type Listener = () => void

interface State {
  db: Database | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  driver: PersistenceDriver['kind'] | null
}

let state: State = { db: null, status: 'idle', error: null, driver: null }
let driver: PersistenceDriver | null = null
const listeners = new Set<Listener>()
const errorListeners = new Set<(message: string) => void>()
let writeChain: Promise<void> = Promise.resolve()

function emit() {
  for (const l of listeners) l()
}

function set(next: Partial<State>) {
  state = { ...state, ...next }
  emit()
}

export const store = {
  subscribe(listener: Listener) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  getState: () => state,

  /** Current data; throws if the store has not loaded (services run only after load). */
  get db(): Database {
    if (!state.db) throw new Error('Data is not loaded yet.')
    return state.db
  },

  onPersistError(listener: (message: string) => void) {
    errorListeners.add(listener)
    return () => {
      errorListeners.delete(listener)
    }
  },

  async connect(next: PersistenceDriver) {
    driver = next
    set({ status: 'loading', error: null, driver: next.kind })
    try {
      const db = await next.load()
      if (driver !== next) return
      set({ db, status: 'ready' })
    } catch (error) {
      set({ status: 'error', error: error instanceof Error ? error.message : 'Could not load data.' })
    }
  },

  disconnect() {
    driver = null
    set({ db: null, status: 'idle', error: null, driver: null })
  },

  /**
   * Applies a change. `mutate` receives the current data and returns the next version;
   * collections that change must be replaced (not mutated in place).
   */
  commit(mutate: (db: Database) => Database) {
    const prev = this.db
    const next = mutate(prev)
    if (next === prev) return
    const changed = new Set<Collection | 'organization'>()
    for (const key of Object.keys(next) as Array<keyof Database>) {
      if (key !== 'version' && next[key] !== prev[key]) changed.add(key as Collection | 'organization')
    }
    set({ db: next })
    const active = driver
    if (!active || !changed.size) return
    writeChain = writeChain
      .then(() => active.persist(prev, next, changed))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Changes could not be saved.'
        console.error('[store] persist failed', error)
        for (const l of errorListeners) l(message)
      })
  },

  /** Resolves when queued writes have been sent (used by tests and before sign-out). */
  flush: () => writeChain,
}

// ------------------------------------------------------------------ helpers for services
export function replaceById<T extends { id: string }>(list: readonly T[], id: string, update: (item: T) => T): T[] {
  let found = false
  const next = list.map((item) => {
    if (item.id !== id) return item
    found = true
    return update(item)
  })
  if (!found) throw new ServiceError('The record no longer exists.', 'not_found')
  return next
}

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly code: 'forbidden' | 'invalid' | 'not_found' | 'conflict' | 'unavailable' = 'invalid',
  ) {
    super(message)
    this.name = 'ServiceError'
  }
}
