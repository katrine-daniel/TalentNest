// Role permission model. The UI uses it to decide what to offer; the database
// enforces equivalent rules in Row Level Security policies (supabase/migrations).
import type { Role } from '@/types/domain'

export const ROLES: Role[] = ['Admin', 'Recruiter', 'Hiring Manager', 'Interviewer']

export const PERMISSIONS = [
  { key: 'candidates.manage', label: 'Create & edit candidates', group: 'Candidates' },
  { key: 'candidates.notes.restricted', label: 'Read & write restricted notes', group: 'Candidates' },
  { key: 'pipeline.move', label: 'Move candidates between stages', group: 'Candidates' },
  { key: 'talent.manage', label: 'Manage talent pools & saved searches', group: 'Candidates' },
  { key: 'jobs.manage', label: 'Create & edit vacancies', group: 'Vacancies' },
  { key: 'requisitions.create', label: 'Raise job requisitions', group: 'Vacancies' },
  { key: 'requisitions.approve', label: 'Approve or reject requisitions', group: 'Vacancies' },
  { key: 'interviews.schedule', label: 'Schedule interviews & assessments', group: 'Scheduling' },
  { key: 'feedback.submit', label: 'Submit interview feedback', group: 'Scheduling' },
  { key: 'offers.manage', label: 'Create & update offers', group: 'Offers' },
  { key: 'onboarding.manage', label: 'Manage onboarding plans', group: 'Offers' },
  { key: 'analytics.view', label: 'View reports & analytics', group: 'Insights' },
  { key: 'ai.use', label: 'Use AI hiring assistant', group: 'Insights' },
  { key: 'automation.manage', label: 'Manage automation rules', group: 'Administration' },
  { key: 'settings.manage', label: 'Manage settings & users', group: 'Administration' },
] as const

export type Permission = (typeof PERMISSIONS)[number]['key']

const ALL = PERMISSIONS.map((p) => p.key) as Permission[]

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  Admin: ALL,
  Recruiter: [
    'candidates.manage',
    'candidates.notes.restricted',
    'pipeline.move',
    'talent.manage',
    'jobs.manage',
    'requisitions.create',
    'interviews.schedule',
    'feedback.submit',
    'offers.manage',
    'onboarding.manage',
    'analytics.view',
    'ai.use',
  ],
  'Hiring Manager': [
    'pipeline.move',
    'requisitions.create',
    'requisitions.approve',
    'interviews.schedule',
    'feedback.submit',
    'onboarding.manage',
    'analytics.view',
    'ai.use',
  ],
  Interviewer: ['feedback.submit'],
}

export function hasPermission(matrix: Partial<Record<Role, readonly string[]>> | null | undefined, role: Role, permission: Permission): boolean {
  if (role === 'Admin') return true
  return Boolean(matrix?.[role]?.includes(permission))
}
