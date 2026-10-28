/**
 * Maps app records (camelCase) to Supabase rows (snake_case) and back.
 * Only top-level keys are converted; nested objects are stored as jsonb unchanged.
 */
import type { CollectionName } from '@/types/domain'

export const TABLES: Record<Exclude<CollectionName, 'settings' | 'users'>, string> = {
  departments: 'departments',
  workflowTemplates: 'workflow_templates',
  jobs: 'jobs',
  requisitions: 'requisitions',
  candidates: 'candidates',
  applications: 'applications',
  interviews: 'interviews',
  interviewFeedback: 'interview_feedback',
  assessments: 'assessments',
  offers: 'offers',
  onboardingPlans: 'onboarding_plans',
  onboardingTemplates: 'onboarding_templates',
  tasks: 'tasks',
  talentPools: 'talent_pools',
  savedSearches: 'saved_searches',
  automationRules: 'automation_rules',
  automationRuns: 'automation_runs',
  activities: 'activities',
  notifications: 'notifications',
  assessmentTemplates: 'assessment_templates',
  scorecards: 'scorecard_templates',
}

export const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
export const toCamel = (key: string) => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())

export function toRow(record: object, orgId: string): Record<string, unknown> {
  const row: Record<string, unknown> = { org_id: orgId }
  for (const [k, v] of Object.entries(record)) row[toSnake(k)] = v === undefined ? null : v
  return row
}

export function fromRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (k === 'org_id') continue
    out[toCamel(k)] = v
  }
  return out as T
}

interface WithId {
  id: string
}

/** Computes the rows to upsert and the ids to delete between two versions of a collection. */
export function diffCollection<T extends WithId>(prev: readonly T[], next: readonly T[]) {
  const prevById = new Map(prev.map((r) => [r.id, r]))
  const nextIds = new Set(next.map((r) => r.id))
  const upserts = next.filter((r) => {
    const before = prevById.get(r.id)
    if (!before) return true
    // Unchanged records keep their object identity, so the cheap check usually suffices.
    return before !== r && JSON.stringify(before) !== JSON.stringify(r)
  })
  const deletes = prev.filter((r) => !nextIds.has(r.id)).map((r) => r.id)
  return { upserts, deletes }
}
