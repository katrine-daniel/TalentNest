/**
 * Demo persistence: seeded sample data stored in this browser's localStorage.
 * Nothing leaves the browser. Used when Supabase is not configured, or when a
 * visitor chooses "Explore the demo workspace" on the sign-in screen.
 */
import { createSeed, SEED_VERSION } from '@/data/seed'
import { DEMO_STORAGE_KEY } from '@/config/env'
import type { Database } from '@/types/domain'
import type { PersistenceDriver } from './dataStore'

const SIMULATED_LATENCY_MS = 450

/** The seed generator is plain JS; its output matches the Database shape. */
const seed = (): Database => createSeed() as unknown as Database

function readPersisted(): Database | null {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Database
    return parsed?.version === SEED_VERSION ? parsed : null
  } catch {
    return null
  }
}

function save(data: Database) {
  try {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Storage may be full or blocked (private mode); the demo keeps working in memory.
  }
}

export function createDemoDriver({ latencyMs = SIMULATED_LATENCY_MS } = {}): PersistenceDriver {
  let current: Database | null = null
  return {
    kind: 'demo',
    async load() {
      if (latencyMs) await new Promise((r) => setTimeout(r, latencyMs))
      const data = readPersisted() ?? seed()
      current = data
      save(data)
      return data
    },
    async persist(collection, _prev, next) {
      const base = current ?? readPersisted() ?? seed()
      current = { ...base, [collection]: next }
      save(current)
    },
    async reset() {
      const data = seed()
      current = data
      save(data)
      return data
    },
  }
}
