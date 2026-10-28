import { beforeEach, describe, expect, it } from 'vitest'
import { getFunnel, getOfferStats, getOverallTimeToHire, rate } from '@/features/analytics/analyticsService'
import { EMPTY_QUERY, searchTalent } from '@/features/talent/talentService'
import { buildComparison, summarise } from '@/features/compare/compareSelectors'
import { DEFAULT_ROLE_PERMISSIONS, hasPermission } from '@/utils/permissions'
import { assertCanPublish } from '@/features/jobs/jobService'
import type { Database } from '@/types/domain'
import { loadFreshDemo } from './helpers'

let data: Database
beforeEach(async () => {
  data = await loadFreshDemo()
})

describe('analytics', () => {
  it('returns null instead of 0% when a rate has no denominator', () => {
    expect(rate(0, 0)).toBeNull()
    expect(rate(1, 4)).toBe(25)
  })

  it('offer acceptance excludes offers still awaiting a response', () => {
    const offers = data.offers.map((o, i) => ({ ...o, status: (['accepted', 'declined', 'sent', 'draft'] as const)[i % 4] ?? 'draft' }))
    const stats = getOfferStats({ ...data, offers })
    expect(stats.acceptanceRate).toBe(rate(stats.accepted, stats.accepted + stats.declined))
    expect(getOfferStats({ ...data, offers: offers.filter((o) => o.status === 'sent') }).acceptanceRate).toBeNull()
  })

  it('time to hire is null when nobody has been hired', () => {
    const applications = data.applications.map((a) => ({ ...a, status: 'active' as const }))
    expect(getOverallTimeToHire({ ...data, applications })).toEqual({ hires: 0, days: null })
  })

  it('funnel counts never increase from one step to the next', () => {
    const counts = getFunnel(data).map((s) => s.count)
    counts.slice(1).forEach((c, i) => expect(c).toBeLessThanOrEqual(counts[i]!))
    expect(counts[0]).toBe(data.applications.length)
  })
})

describe('talent search', () => {
  it('an empty query returns every candidate', () => {
    expect(searchTalent(EMPTY_QUERY, data)).toHaveLength(data.candidates.length)
  })

  it('combines filters with AND and reports skill coverage', () => {
    const target = data.candidates.find((c) => c.skills.length >= 2)!
    const results = searchTalent({ ...EMPTY_QUERY, skills: [target.skills[0]!.toUpperCase(), 'definitely-not-a-skill'], location: target.location }, data)
    expect(results.some((r) => r.candidate.id === target.id)).toBe(true)
    results.forEach((r) => {
      expect(r.candidate.location.toLowerCase()).toContain(target.location.toLowerCase())
      expect(r.skillCoverage).toBeGreaterThan(0)
      expect(r.skillCoverage).toBeLessThanOrEqual(0.5)
    })
  })

  it('respects the experience range', () => {
    const results = searchTalent({ ...EMPTY_QUERY, minExperience: 3, maxExperience: 5 }, data)
    expect(results.every((r) => r.candidate.experienceYears >= 3 && r.candidate.experienceYears <= 5)).toBe(true)
  })
})

describe('comparison', () => {
  it('builds one column per application and never produces an overall score', () => {
    const job = data.jobs.find((j) => data.applications.filter((a) => a.jobId === j.id).length >= 2)!
    const apps = data.applications.filter((a) => a.jobId === job.id).slice(0, 3)
    const columns = buildComparison(job, apps, { ...data, feedback: data.interviewFeedback })
    expect(columns).toHaveLength(apps.length)
    columns.forEach((c) => {
      expect(c.matchedSkills.length + c.missingSkills.length).toBe(job.skills.length)
      expect(c).not.toHaveProperty('score')
    })
    const notes = summarise(columns, job)
    notes.forEach((n) => expect(n).not.toMatch(/\b(best|hire|recommend(ed)?|winner)\b/i))
  })
})

describe('permissions', () => {
  it('admin has everything; interviewers cannot approve requisitions or manage automation', () => {
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS, 'Admin', 'automation.manage')).toBe(true)
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS, 'Interviewer', 'requisitions.approve')).toBe(false)
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS, 'Interviewer', 'automation.manage')).toBe(false)
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS, 'Interviewer', 'candidates.notes.restricted')).toBe(false)
  })

  it('a custom matrix overrides defaults for non-admin roles', () => {
    expect(hasPermission({ Recruiter: [] }, 'Recruiter', 'candidates.manage')).toBe(false)
  })
})

describe('vacancy publishing', () => {
  it('requires an approved, linked requisition only when opening the vacancy', () => {
    const approved = data.requisitions.find((r) => r.status === 'approved')!
    const pending = data.requisitions.find((r) => r.status !== 'approved')!
    expect(() => assertCanPublish({ requisitionId: null, status: 'draft' }, 'draft')).not.toThrow()
    expect(() => assertCanPublish({ requisitionId: null, status: 'draft' }, 'open')).toThrow(/approved requisition/)
    expect(() => assertCanPublish({ requisitionId: pending.id, status: 'draft' }, 'open')).toThrow(/must be approved/)
    expect(() => assertCanPublish({ requisitionId: approved.id, status: 'draft' }, 'open')).not.toThrow()
  })
})
