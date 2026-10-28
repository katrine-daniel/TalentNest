/**
 * Starter configuration for a brand-new organization: reusable templates and
 * settings only. No candidates, jobs or other sample records — production data
 * must never be mixed with demo data.
 */
import { mockWorkflowTemplates } from './mockWorkflows'
import { mockAssessmentTemplates, mockScorecards, mockNotificationPrefs } from './mockSettings'
import { DEFAULT_ROLE_PERMISSIONS } from '@/utils/permissions'
import type { AutomationRule, Database, OnboardingTemplate, Role } from '@/types/domain'

export const DEFAULT_ONBOARDING_TEMPLATES: OnboardingTemplate[] = [
  {
    id: 'obt-standard',
    name: 'Standard onboarding',
    tasks: [
      { id: 'obt-s1', label: 'Offer letter signed', ownerRole: 'Recruiter', dueOffsetDays: -14, requiresDocument: true },
      { id: 'obt-s2', label: 'Identity & education documents verified', ownerRole: 'Recruiter', dueOffsetDays: -10, requiresDocument: true },
      { id: 'obt-s3', label: 'Background verification initiated', ownerRole: 'Recruiter', dueOffsetDays: -10, requiresDocument: false },
      { id: 'obt-s4', label: 'Workstation / headset allocated', ownerRole: 'Hiring Manager', dueOffsetDays: -3, requiresDocument: false },
      { id: 'obt-s5', label: 'System & email access created', ownerRole: 'Admin', dueOffsetDays: -2, requiresDocument: false },
      { id: 'obt-s6', label: 'Induction session scheduled', ownerRole: 'Hiring Manager', dueOffsetDays: 0, requiresDocument: false },
    ],
  },
]

export function defaultAutomationRules(ownerId: string, now = new Date().toISOString()): AutomationRule[] {
  return [
    {
      id: 'rule-screen-task',
      name: 'Screening task for new applicants',
      description: 'Creates a screening-call task for the vacancy recruiter whenever someone applies.',
      trigger: 'application.created',
      conditions: [],
      actions: [{ type: 'create_task', title: 'Screening call with {candidate}', assignTo: 'recruiter', dueInDays: 2 }],
      enabled: true,
      createdById: ownerId,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'rule-interview-prep',
      name: 'Prepare interviewers at interview stage',
      description: 'When a candidate reaches an interview stage, ask the hiring manager to confirm the panel.',
      trigger: 'stage.changed',
      conditions: [{ field: 'stage.type', operator: 'equals', value: 'interview' }],
      actions: [{ type: 'create_task', title: 'Confirm interview panel for {candidate}', assignTo: 'hiring_manager', dueInDays: 1 }],
      enabled: true,
      createdById: ownerId,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'rule-feedback-overdue',
      name: 'Remind about overdue feedback',
      description: 'Notifies the vacancy recruiter when interview feedback is more than 24 hours late.',
      trigger: 'feedback.overdue',
      conditions: [{ field: 'hoursOverdue', operator: 'gte', value: '24' }],
      actions: [{ type: 'notify', userId: 'recruiter', message: 'Feedback for {candidate} ({stage}) is overdue.' }],
      enabled: true,
      createdById: ownerId,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'rule-onboarding',
      name: 'Start onboarding after offer acceptance',
      description: 'Creates the standard onboarding checklist when an offer is accepted.',
      trigger: 'offer.accepted',
      conditions: [],
      actions: [{ type: 'create_onboarding_plan', templateId: 'obt-standard' }],
      enabled: true,
      createdById: ownerId,
      createdAt: now,
      updatedAt: now,
    },
  ]
}

/** Collections every organization starts with. */
export function createOrgDefaults(ownerId: string): Omit<Database, 'version' | 'users'> {
  return {
    departments: [],
    workflowTemplates: mockWorkflowTemplates,
    jobs: [],
    requisitions: [],
    candidates: [],
    applications: [],
    interviews: [],
    interviewFeedback: [],
    assessments: [],
    offers: [],
    onboardingPlans: [],
    onboardingTemplates: DEFAULT_ONBOARDING_TEMPLATES,
    tasks: [],
    talentPools: [],
    savedSearches: [],
    automationRules: defaultAutomationRules(ownerId),
    automationRuns: [],
    activities: [],
    notifications: [],
    assessmentTemplates: mockAssessmentTemplates,
    scorecards: mockScorecards,
    settings: { rolePermissions: DEFAULT_ROLE_PERMISSIONS as Record<Role, string[]>, notificationPrefs: mockNotificationPrefs },
  }
}
