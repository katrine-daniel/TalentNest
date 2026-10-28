import { useMemo, useSyncExternalStore } from 'react'
import { dataStore } from '@/services/storage/dataStore'
import type { Candidate, CollectionName, Database, OrgSettings } from '@/types/domain'

const EMPTY: readonly never[] = Object.freeze([])

function useSnapshot() {
  return useSyncExternalStore(dataStore.subscribe, dataStore.getSnapshot)
}

export function useDbStatus() {
  const { status, error, driver } = useSnapshot()
  return { status, error, driver, ready: status === 'ready', loading: status === 'idle' || status === 'loading' }
}

/** Subscribes to one collection of the data store. */
export function useCollection<K extends Exclude<CollectionName, 'settings'>>(name: K): Database[K] {
  const snapshot = useSnapshot()
  return (snapshot.data?.[name] ?? EMPTY) as Database[K]
}

export function useSettings(): OrgSettings | null {
  return useSnapshot().data?.settings ?? null
}

/** Full data object — used by reporting selectors that span collections. */
export function useDbData(): Database {
  const data = useSnapshot().data
  // Screens render only after the store is ready (see ProtectedLayout).
  if (!data) throw new Error('useDbData used before data loaded')
  return data
}

/** Memoised id → record maps for fast lookups in tables and cards. */
export function useLookups() {
  const jobs = useCollection('jobs')
  const users = useCollection('users')
  const candidates = useCollection('candidates')
  const departments = useCollection('departments')
  const assessmentTemplates = useCollection('assessmentTemplates')
  const scorecards = useCollection('scorecards')
  return useMemo(
    () => ({
      jobsById: new Map(jobs.map((j) => [j.id, j])),
      usersById: new Map(users.map((u) => [u.id, u])),
      candidatesById: new Map(candidates.map((c) => [c.id, c])),
      departmentsById: new Map(departments.map((d) => [d.id, d])),
      templatesById: new Map(assessmentTemplates.map((t) => [t.id, t])),
      scorecardsById: new Map(scorecards.map((s) => [s.id, s])),
    }),
    [jobs, users, candidates, departments, assessmentTemplates, scorecards],
  )
}

export function fullName(candidate: Pick<Candidate, 'firstName' | 'lastName'> | null | undefined) {
  return candidate ? `${candidate.firstName} ${candidate.lastName}` : 'Unknown candidate'
}
