import { STORAGE_KEYS } from '@/config/env'
import { createSeed, SEED_VERSION } from '@/data/seed'
import type { Database } from '@/domain/types'
import type { PersistenceDriver } from './store'

/** Demo persistence: the whole fictional data set lives in this browser's localStorage. */
export function createDemoDriver(): PersistenceDriver {
  return {
    kind: 'demo',
    async load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.demoData)
        if (raw) {
          const parsed = JSON.parse(raw) as Database
          if (parsed.version === SEED_VERSION && Array.isArray(parsed.employees)) return parsed
        }
      } catch {
        // Corrupt or unavailable storage: fall through to a fresh data set.
      }
      const seed = createSeed()
      try {
        save(seed)
      } catch {
        // Storage unavailable: the demo still runs in memory; later writes report the problem.
      }
      return seed
    },
    async persist(_prev, next) {
      save(next)
    },
  }
}

/**
 * Writes synchronously: a delayed write would be lost if the user navigates away, reloads or switches
 * account right after a change. A failed write (e.g. storage full) is reported to the user by the store.
 */
function save(db: Database) {
  try {
    localStorage.setItem(STORAGE_KEYS.demoData, JSON.stringify(db))
  } catch (error) {
    throw new Error(`The demo data could not be saved in this browser (${error instanceof Error ? error.name : 'storage error'}).`)
  }
}

export function resetDemoData() {
  localStorage.removeItem(STORAGE_KEYS.demoData)
}
