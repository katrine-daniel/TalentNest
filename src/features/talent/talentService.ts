/**
 * Talent rediscovery: searching past and present candidates, saved searches and
 * reusable talent pools.
 */
import { dataStore } from '@/services/storage/dataStore'
import { mockRequest, ServiceError } from '@/services/api/apiClient'
import { createId } from '@/utils/ids'
import type { Application, Candidate, Job, TalentPool, TalentSearchQuery } from '@/types/domain'

export const EMPTY_QUERY: TalentSearchQuery = { text: '', skills: [], location: '', minExperience: null, maxExperience: null, pastRole: '' }

export interface TalentResult {
  candidate: Candidate
  matchedSkills: string[]
  pastRoles: string[]
  appliedTo: string[]
  /** Share of requested skills the candidate lists (only when skills were requested). */
  skillCoverage: number | null
}

const has = (hay: string, needle: string) => hay.toLowerCase().includes(needle.trim().toLowerCase())

/** Pure search over candidates; every filter is optional and combined with AND. */
export function searchTalent(
  query: TalentSearchQuery,
  data: { candidates: readonly Candidate[]; applications: readonly Application[]; jobs: readonly Job[] },
): TalentResult[] {
  const jobsById = new Map(data.jobs.map((j) => [j.id, j]))
  return data.candidates
    .map((c) => {
      const apps = data.applications.filter((a) => a.candidateId === c.id)
      const appliedTo = apps.map((a) => jobsById.get(a.jobId)?.title).filter((t): t is string => Boolean(t))
      const pastRoles = [c.currentTitle, ...c.experience.map((e) => e.title)].filter(Boolean)
      const matchedSkills = query.skills.filter((s) => c.skills.some((cs) => cs.toLowerCase() === s.toLowerCase()))
      return { candidate: c, matchedSkills, pastRoles, appliedTo, skillCoverage: query.skills.length ? matchedSkills.length / query.skills.length : null }
    })
    .filter(({ candidate: c, matchedSkills, pastRoles, appliedTo }) => {
      if (query.text && ![`${c.firstName} ${c.lastName}`, c.email, c.ref, c.currentTitle, ...(c.tags ?? []), ...c.skills].some((h) => has(h, query.text)))
        return false
      if (query.skills.length && matchedSkills.length === 0) return false
      if (query.location && !has(c.location, query.location)) return false
      if (query.minExperience !== null && c.experienceYears < query.minExperience) return false
      if (query.maxExperience !== null && c.experienceYears > query.maxExperience) return false
      if (query.pastRole && ![...pastRoles, ...appliedTo].some((r) => has(r, query.pastRole))) return false
      return true
    })
}

function patchPool(id: string, updater: (p: TalentPool) => TalentPool) {
  let updated: TalentPool | undefined
  dataStore.write('talentPools', (list) => list.map((p) => (p.id === id ? (updated = updater(p)) : p)))
  if (!updated) throw new ServiceError('Talent pool not found', 'not-found')
  return updated
}

export const talentService = {
  async createPool({ name, description }: { name: string; description: string }, { actorId }: { actorId: string }) {
    if (name.trim().length < 3) throw new ServiceError('Pool name must be at least 3 characters')
    if (dataStore.read('talentPools').some((p) => p.name.toLowerCase() === name.trim().toLowerCase()))
      throw new ServiceError('A pool with this name already exists')
    return mockRequest(() => {
      const pool: TalentPool = {
        id: createId('pool'),
        name: name.trim(),
        description: description.trim(),
        candidateIds: [],
        createdById: actorId,
        createdAt: new Date().toISOString(),
      }
      dataStore.write('talentPools', (list) => [...list, pool])
      return pool
    })
  },

  async deletePool(id: string) {
    return mockRequest(() => dataStore.write('talentPools', (list) => list.filter((p) => p.id !== id)))
  },

  /** Adds candidates, ignoring ones already in the pool; returns how many were new. */
  async addToPool(poolId: string, candidateIds: string[]) {
    return mockRequest(
      () => {
        let added = 0
        patchPool(poolId, (p) => {
          const next = new Set(p.candidateIds)
          candidateIds.forEach((id) => {
            if (!next.has(id)) {
              next.add(id)
              added += 1
            }
          })
          return { ...p, candidateIds: [...next] }
        })
        return added
      },
      { latency: 150 },
    )
  },

  async removeFromPool(poolId: string, candidateId: string) {
    return mockRequest(() => patchPool(poolId, (p) => ({ ...p, candidateIds: p.candidateIds.filter((id) => id !== candidateId) })), { latency: 120 })
  },

  async saveSearch(name: string, query: TalentSearchQuery, { actorId }: { actorId: string }) {
    if (name.trim().length < 3) throw new ServiceError('Name the search (3+ characters)')
    return mockRequest(() => {
      const saved = { id: createId('ss'), name: name.trim(), query, createdById: actorId, createdAt: new Date().toISOString() }
      dataStore.write('savedSearches', (list) => [saved, ...list])
      return saved
    })
  },

  async deleteSearch(id: string) {
    return mockRequest(() => dataStore.write('savedSearches', (list) => list.filter((s) => s.id !== id)))
  },
}
