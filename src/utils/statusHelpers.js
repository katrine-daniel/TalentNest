/**
 * Single source of truth for status labels and colour tones.
 * Tones map to StatusBadge styles; colours are used only where they add clarity.
 */

export const STAGE_TYPES = {
  application: { label: 'Application', tone: 'neutral', dot: 'bg-gray-400', rank: 0 },
  screening: { label: 'Screening', tone: 'blue', dot: 'bg-sky-500', rank: 1 },
  assessment: { label: 'Assessment', tone: 'amber', dot: 'bg-amber-500', rank: 2 },
  interview: { label: 'Interview', tone: 'brand', dot: 'bg-brand-500', rank: 3 },
  decision: { label: 'Decision', tone: 'indigo', dot: 'bg-indigo-500', rank: 4 },
  offer: { label: 'Offer', tone: 'teal', dot: 'bg-teal-500', rank: 5 },
  hired: { label: 'Hired', tone: 'green', dot: 'bg-emerald-500', rank: 6 },
}

export const STAGE_TYPE_OPTIONS = Object.entries(STAGE_TYPES).map(([value, meta]) => ({ value, label: meta.label }))

export const APPLICATION_STATUS = {
  active: { label: 'Active', tone: 'blue' },
  hired: { label: 'Hired', tone: 'green' },
  rejected: { label: 'Not progressed', tone: 'red' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
}

export const JOB_STATUS = {
  open: { label: 'Open', tone: 'green' },
  draft: { label: 'Draft', tone: 'neutral' },
  'on-hold': { label: 'On hold', tone: 'amber' },
  closed: { label: 'Closed', tone: 'red' },
}

export const INTERVIEW_STATUS = {
  scheduled: { label: 'Scheduled', tone: 'blue' },
  completed: { label: 'Completed', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  'no-show': { label: 'No-show', tone: 'red' },
}

export const ATTENDANCE_STATUS = {
  pending: { label: 'Awaiting confirmation', tone: 'neutral' },
  confirmed: { label: 'Confirmed', tone: 'blue' },
  attended: { label: 'Attended', tone: 'green' },
  'no-show': { label: 'No-show', tone: 'red' },
}

export const ASSESSMENT_STATUS = {
  pending: { label: 'Not started', tone: 'neutral' },
  'in-progress': { label: 'In progress', tone: 'blue' },
  submitted: { label: 'Awaiting review', tone: 'amber' },
  evaluated: { label: 'Evaluated', tone: 'green' },
  expired: { label: 'Expired', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

export const OFFER_STATUS = {
  draft: { label: 'Draft', tone: 'neutral' },
  sent: { label: 'Awaiting response', tone: 'amber' },
  negotiating: { label: 'Negotiating', tone: 'blue' },
  accepted: { label: 'Accepted', tone: 'green' },
  declined: { label: 'Declined', tone: 'red' },
}

export const USER_STATUS = {
  active: { label: 'Active', tone: 'green' },
  invited: { label: 'Invited', tone: 'amber' },
  deactivated: { label: 'Deactivated', tone: 'neutral' },
}

const REGISTRY = {
  stage: STAGE_TYPES,
  application: APPLICATION_STATUS,
  job: JOB_STATUS,
  interview: INTERVIEW_STATUS,
  attendance: ATTENDANCE_STATUS,
  assessment: ASSESSMENT_STATUS,
  offer: OFFER_STATUS,
  user: USER_STATUS,
}

export function getStatusMeta(kind, value) {
  return REGISTRY[kind]?.[value] ?? { label: value ?? '—', tone: 'neutral' }
}

export function toOptions(kind) {
  return Object.entries(REGISTRY[kind]).map(([value, meta]) => ({ value, label: meta.label }))
}

export function stageRank(type) {
  return STAGE_TYPES[type]?.rank ?? 0
}

/** Interview type accents in the calendar (kept to a small, distinguishable set). */
export const EVENT_ACCENTS = {
  technical: { label: 'Technical / Operations', className: 'border-brand-500 bg-brand-50 text-brand-800', dot: 'bg-brand-500' },
  manager: { label: 'Team lead / Manager', className: 'border-sky-500 bg-sky-50 text-sky-900', dot: 'bg-sky-500' },
  hr: { label: 'HR interview', className: 'border-teal-500 bg-teal-50 text-teal-900', dot: 'bg-teal-500' },
  assessment: { label: 'Assessment deadline', className: 'border-amber-500 bg-amber-50 text-amber-900 border-dashed', dot: 'bg-amber-500' },
}

export function interviewAccent(stageName = '') {
  const s = stageName.toLowerCase()
  if (s.includes('hr')) return 'hr'
  if (s.includes('lead') || s.includes('manager')) return 'manager'
  return 'technical'
}
