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
      save(seed)
      return seed
    },
    async persist(_prev, next) {
      save(next)
    },
  }
}

let timer: ReturnType<typeof setTimeout> | null = null
function save(db: Database) {
  if (timer) clearTimeout(timer)
  // Coalesce bursts of writes; tests run synchronously.
  const write = () => {
    try {
      localStorage.setItem(STORAGE_KEYS.demoData, JSON.stringify(db))
    } catch (error) {
      console.warn('[demo] could not save to localStorage', error)
    }
  }
  if (import.meta.env.MODE === 'test') write()
  else timer = setTimeout(write, 150)
}

export function resetDemoData() {
  localStorage.removeItem(STORAGE_KEYS.demoData)
}
