import { DEFAULT_ROLE_PERMISSIONS } from '@/utils/permissions'

export const mockAssessmentTemplates = [
  {
    id: 'at-coding',
    name: 'Coding Assessment — Web Stack',
    type: 'Coding',
    durationMin: 90,
    passMark: 65,
    questionCount: 4,
    workflowTemplateIds: ['wf-dev'],
    provider: 'Internal (mock)',
  },
  {
    id: 'at-comm',
    name: 'Communication & Voice Assessment',
    type: 'Communication',
    durationMin: 40,
    passMark: 70,
    questionCount: 25,
    workflowTemplateIds: ['wf-cc'],
    provider: 'Internal (mock)',
  },
  {
    id: 'at-travel',
    name: 'Travel Knowledge Assessment',
    type: 'Domain knowledge',
    durationMin: 45,
    passMark: 60,
    questionCount: 30,
    workflowTemplateIds: ['wf-travel'],
    provider: 'Internal (mock)',
  },
  {
    id: 'at-gds',
    name: 'GDS & Reservations Test',
    type: 'Domain knowledge',
    durationMin: 45,
    passMark: 60,
    questionCount: 25,
    workflowTemplateIds: ['wf-hotel'],
    provider: 'Internal (mock)',
  },
  {
    id: 'at-rate',
    name: 'Rate Analysis Case Study',
    type: 'Case study',
    durationMin: 120,
    passMark: 70,
    questionCount: 3,
    workflowTemplateIds: ['wf-ofr'],
    provider: 'Internal (mock)',
  },
  {
    id: 'at-typing',
    name: 'Typing & Email Writing',
    type: 'Skills',
    durationMin: 20,
    passMark: 60,
    questionCount: 2,
    workflowTemplateIds: ['wf-cc'],
    provider: 'Internal (mock)',
  },
]

export const ASSESSMENT_TYPES = ['Coding', 'Communication', 'Domain knowledge', 'Case study', 'Skills', 'Aptitude']

export const mockScorecards = [
  {
    id: 'sc-tech',
    name: 'Technical Interview',
    criteria: [
      { id: 'c-ps', name: 'Problem solving', weight: 30 },
      { id: 'c-cq', name: 'Code quality', weight: 25 },
      { id: 'c-sd', name: 'System design', weight: 25 },
      { id: 'c-cm', name: 'Communication', weight: 20 },
    ],
  },
  {
    id: 'sc-voice',
    name: 'Team Lead / Voice Interview',
    criteria: [
      { id: 'c-va', name: 'Voice & clarity', weight: 30 },
      { id: 'c-em', name: 'Customer empathy', weight: 25 },
      { id: 'c-li', name: 'Active listening', weight: 25 },
      { id: 'c-pa', name: 'Process aptitude', weight: 20 },
    ],
  },
  {
    id: 'sc-ops',
    name: 'Operations / Manager Interview',
    criteria: [
      { id: 'c-dk', name: 'Domain knowledge', weight: 35 },
      { id: 'c-gd', name: 'Systems proficiency', weight: 25 },
      { id: 'c-ac', name: 'Accuracy', weight: 20 },
      { id: 'c-co', name: 'Customer orientation', weight: 20 },
    ],
  },
  {
    id: 'sc-hr',
    name: 'HR Interview',
    criteria: [
      { id: 'c-cu', name: 'Culture alignment', weight: 30 },
      { id: 'c-mo', name: 'Motivation', weight: 25 },
      { id: 'c-st', name: 'Stability', weight: 25 },
      { id: 'c-cf', name: 'Compensation fit', weight: 20 },
    ],
  },
]

export const mockNotificationPrefs = [
  { key: 'application.new', label: 'New application received', description: 'When a candidate applies to a vacancy you own.', email: true, inApp: true },
  { key: 'interview.reminder', label: 'Interview reminders', description: '24 hours and 1 hour before interviews you are part of.', email: true, inApp: true },
  { key: 'feedback.overdue', label: 'Overdue feedback', description: 'When interview feedback is pending for more than 24 hours.', email: true, inApp: true },
  { key: 'assessment.submitted', label: 'Assessment submitted', description: 'When a candidate completes an assigned assessment.', email: false, inApp: true },
  { key: 'offer.response', label: 'Offer responses', description: 'When a candidate accepts, declines or negotiates.', email: true, inApp: true },
  { key: 'stage.moved', label: 'Stage changes', description: 'When candidates in your vacancies change stage.', email: false, inApp: true },
  { key: 'digest.weekly', label: 'Weekly hiring digest', description: 'Monday summary of pipeline health and open actions.', email: true, inApp: false },
]

export const mockSettingsMeta = {
  rolePermissions: DEFAULT_ROLE_PERMISSIONS,
}

export const ONBOARDING_TASKS = [
  'Offer letter signed',
  'Documents verified (ID, education, experience)',
  'Background verification initiated',
  'Workstation / headset allocated',
  'System & email access created',
  'Induction scheduled',
]

/** Picks the scorecard that fits an interview stage name. */
export function scorecardForStage(stageName = '') {
  const s = stageName.toLowerCase()
  if (s.includes('hr')) return 'sc-hr'
  if (s.includes('team lead')) return 'sc-voice'
  if (s.includes('technical')) return 'sc-tech'
  return 'sc-ops'
}

export const ASSESSMENT_FOR_WORKFLOW = {
  'wf-dev': 'at-coding',
  'wf-cc': 'at-comm',
  'wf-travel': 'at-travel',
  'wf-hotel': 'at-gds',
  'wf-ofr': 'at-rate',
}
