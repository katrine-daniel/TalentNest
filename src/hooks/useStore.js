import { useMemo, useSyncExternalStore } from 'react'
import { mockDb } from '@/services/mockDb'

const EMPTY = Object.freeze([])

function useSnapshot() {
  return useSyncExternalStore(mockDb.subscribe, mockDb.getSnapshot)
}

export function useDbStatus() {
  const { status, error } = useSnapshot()
  return { status, error, ready: status === 'ready', loading: status === 'idle' || status === 'loading' }
}

/** Subscribes to one collection of the (mock) data store. */
export function useCollection(name) {
  const snapshot = useSnapshot()
  return snapshot.data?.[name] ?? EMPTY
}

export function useSettings() {
  return useSnapshot().data?.settings ?? null
}

/** Full data object — used by reporting selectors that span collections. */
export function useDbData() {
  return useSnapshot().data
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

export function fullName(candidate) {
  return candidate ? `${candidate.firstName} ${candidate.lastName}` : 'Unknown candidate'
}
