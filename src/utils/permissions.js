// UI-level permission model. This only shapes what the interface offers —
// real authorization must be enforced by the backend on every request.

export const ROLES = ['Admin', 'Recruiter', 'Hiring Manager', 'Interviewer']

export const PERMISSIONS = [
  { key: 'candidates.manage', label: 'Create & edit candidates', group: 'Candidates' },
  { key: 'pipeline.move', label: 'Move candidates between stages', group: 'Candidates' },
  { key: 'jobs.manage', label: 'Create & edit vacancies', group: 'Vacancies' },
  { key: 'interviews.schedule', label: 'Schedule interviews & assessments', group: 'Scheduling' },
  { key: 'feedback.submit', label: 'Submit interview feedback', group: 'Scheduling' },
  { key: 'offers.manage', label: 'Create & update offers', group: 'Offers' },
  { key: 'analytics.view', label: 'View reports & analytics', group: 'Insights' },
  { key: 'ai.use', label: 'Use AI hiring assistant', group: 'Insights' },
  { key: 'settings.manage', label: 'Manage settings & users', group: 'Administration' },
]

export const DEFAULT_ROLE_PERMISSIONS = {
  Admin: PERMISSIONS.map((p) => p.key),
  Recruiter: ['candidates.manage', 'pipeline.move', 'jobs.manage', 'interviews.schedule', 'feedback.submit', 'offers.manage', 'analytics.view', 'ai.use'],
  'Hiring Manager': ['pipeline.move', 'interviews.schedule', 'feedback.submit', 'analytics.view', 'ai.use'],
  Interviewer: ['feedback.submit'],
}

export function hasPermission(matrix, role, permission) {
  if (role === 'Admin') return true
  return Boolean(matrix?.[role]?.includes(permission))
}
