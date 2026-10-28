import { beforeEach, describe, expect, it } from 'vitest'
import { conditionMatches, dedupeKey, validateRule } from '@/features/automation/automationEngine'
import { handleEvent, previewRule, runScheduledChecks } from '@/features/automation/automationService'
import { automationRuleService } from '@/features/automation/automationRuleService'
import { candidateService } from '@/features/candidates/candidateService'
import type { AutomationRule } from '@/types/domain'
import { ADMIN, RECRUITER, db, loadFreshDemo } from './helpers'

beforeEach(async () => {
  await loadFreshDemo()
})

const baseRule: Omit<AutomationRule, 'id' | 'createdAt' | 'updatedAt' | 'createdById'> = {
  name: 'Referral fast-track',
  description: '',
  trigger: 'application.created',
  conditions: [{ field: 'candidate.source', operator: 'equals', value: 'Referral' }],
  actions: [{ type: 'notify', userId: 'recruiter', message: 'Referral from {candidate} for {job}' }],
  enabled: true,
}

describe('automation engine', () => {
  it('validates rules with actionable messages', () => {
    const data = db()
    expect(validateRule(baseRule, data).valid).toBe(true)
    const bad = validateRule({ ...baseRule, name: '', actions: [], conditions: [{ field: 'hoursOverdue', operator: 'gte', value: 'x' }] }, data)
    expect(bad.errors).toEqual(expect.arrayContaining(['Give the rule a name.', 'Add at least one action.']))
    expect(bad.errors.join(' ')).toMatch(/not available for this trigger/)
    expect(bad.errors.join(' ')).toMatch(/needs a number/)
  })

  it('evaluates condition operators', () => {
    const ctx = { 'candidate.experienceYears': 4, 'job.title': 'Travel Consultant' }
    expect(conditionMatches({ field: 'candidate.experienceYears', operator: 'gte', value: '3' }, ctx)).toBe(true)
    expect(conditionMatches({ field: 'candidate.experienceYears', operator: 'lte', value: '3' }, ctx)).toBe(false)
    expect(conditionMatches({ field: 'job.title', operator: 'contains', value: 'travel' }, ctx)).toBe(true)
    expect(conditionMatches({ field: 'job.title', operator: 'not_equals', value: 'travel consultant' }, ctx)).toBe(false)
    expect(conditionMatches({ field: 'missing', operator: 'equals', value: 'x' }, ctx)).toBe(false)
  })

  it('creates the screening task exactly once per application', async () => {
    const job = db().jobs.find((j) => j.status === 'open')!
    const c = await candidateService.create({ firstName: 'Auto', lastName: 'Mated', email: 'auto@example.test', jobId: job.id }, { actorId: RECRUITER })
    const app = db().applications.find((a) => a.candidateId === c.id)!
    expect(db().tasks.filter((t) => t.applicationId === app.id && /Screening call/.test(t.title))).toHaveLength(1)
    // Replaying the same event is skipped by duplicate prevention.
    const event = {
      type: 'application.created' as const,
      entityId: app.id,
      actorId: RECRUITER,
      context: { applicationId: app.id, candidateId: c.id, jobId: job.id },
    }
    handleEvent(event)
    expect(db().tasks.filter((t) => t.applicationId === app.id && /Screening call/.test(t.title))).toHaveLength(1)
    expect(db().automationRuns[0]).toMatchObject({ status: 'skipped' })
    expect(dedupeKey('r', { ...event, type: 'stage.changed', context: { stageId: 's1' } })).toBe(`r:stage.changed:${app.id}@s1`)
  })

  it('ignores disabled rules and previews without side effects', async () => {
    const rule = await automationRuleService.create(baseRule, { actorId: ADMIN })
    await automationRuleService.setEnabled('rule-screen-task', false, { actorId: ADMIN })
    const job = db().jobs.find((j) => j.status === 'open')!
    const before = db().tasks.length
    const c = await candidateService.create(
      { firstName: 'Ref', lastName: 'Erral', email: 'ref@example.test', source: 'Referral', jobId: job.id },
      { actorId: RECRUITER },
    )
    expect(db().tasks.length).toBe(before)
    expect(db().notifications.some((n) => n.title === 'Referral fast-track' && n.body.includes('Ref Erral'))).toBe(true)

    const app = db().applications.find((a) => a.candidateId === c.id)!
    const notifications = db().notifications.length
    const preview = previewRule(
      { ...rule, conditions: [{ field: 'candidate.source', operator: 'equals', value: 'LinkedIn' }] },
      { type: 'application.created', entityId: app.id, actorId: null, context: { applicationId: app.id } },
    )
    expect(preview.matches).toBe(false)
    expect(preview.failingConditions).toHaveLength(1)
    expect(db().notifications.length).toBe(notifications)
  })

  it('runs the scheduled overdue-feedback check', () => {
    const count = runScheduledChecks()
    expect(count).toBeGreaterThan(0)
    expect(db().automationRuns.some((r) => r.trigger === 'feedback.overdue' && r.status === 'success')).toBe(true)
  })
})
