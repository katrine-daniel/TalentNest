/**
 * Domain model for TalentNest.
 *
 * These types describe the records held by the data store (demo or Supabase).
 * Field names are camelCase in the app; the Supabase driver maps them to
 * snake_case columns (see supabase/migrations and services/storage/rowMapping.ts).
 */

export type ID = string
export type ISODate = string

export type Role = 'Admin' | 'Recruiter' | 'Hiring Manager' | 'Interviewer'

export type StageType = 'application' | 'screening' | 'assessment' | 'interview' | 'decision' | 'offer' | 'hired'

export interface Organization {
  id: ID
  name: string
}

export interface User {
  id: ID
  name: string
  email: string
  title: string
  role: Role
  departmentId: ID | null
  status: 'active' | 'invited' | 'deactivated'
}

export interface Department {
  id: ID
  name: string
  code: string
  headId: ID | null
  color: string
}

export interface Stage {
  id: ID
  name: string
  type: StageType
}

export interface WorkflowTemplate {
  id: ID
  name: string
  description: string
  stages: Array<{ key: string; name: string; type: StageType }>
}

export type JobStatus = 'open' | 'draft' | 'on-hold' | 'closed'

export interface Job {
  id: ID
  title: string
  departmentId: ID
  category: string
  location: string
  workMode: string
  employmentType: string
  workflowTemplateId: ID
  hiringManagerId: ID
  recruiterId: ID
  status: JobStatus
  openings: number
  experienceMin: number
  experienceMax: number
  salaryMin: number
  salaryMax: number
  skills: string[]
  description: string
  stages: Stage[]
  requisitionId?: ID | null
  createdAt: ISODate
}

export type RequisitionStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'revision-requested'

export interface RequisitionEvent {
  id: ID
  action: 'created' | 'submitted' | 'approved' | 'rejected' | 'revision-requested' | 'edited' | 'linked'
  byId: ID | null
  at: ISODate
  comment: string
}

export interface Requisition {
  id: ID
  title: string
  departmentId: ID
  justification: string
  headcount: number
  budgetMin: number
  budgetMax: number
  hiringManagerId: ID
  approverId: ID
  status: RequisitionStatus
  jobId: ID | null
  createdById: ID
  createdAt: ISODate
  updatedAt: ISODate
  history: RequisitionEvent[]
}

export interface ExperienceEntry {
  id: ID
  title: string
  company: string
  start: string
  end: string
  summary: string
}

export interface EducationEntry {
  id: ID
  degree: string
  institution: string
  year: string
}

export interface CandidateNote {
  id: ID
  authorId: ID | null
  text: string
  at: ISODate
  /** `restricted` notes are visible to Admins and Recruiters only. */
  visibility?: 'team' | 'restricted'
  mentions?: ID[]
}

export interface StoredFileRef {
  fileId?: ID
  fileName: string
  size: number
  mimeType?: string
  uploadedAt: ISODate
}

export interface Candidate {
  id: ID
  ref: string
  firstName: string
  lastName: string
  email: string
  phone: string
  location: string
  currentTitle: string
  currentCompany: string
  experienceYears: number
  noticePeriod: string
  expectedSalary: number
  source: string
  recruiterId: ID
  skills: string[]
  languages: string[]
  experience: ExperienceEntry[]
  education: EducationEntry[]
  notes: CandidateNote[]
  tags?: string[]
  resume: StoredFileRef | null
  createdAt: ISODate
}

export type ApplicationStatus = 'active' | 'hired' | 'rejected' | 'withdrawn'

export interface StageEvent {
  id: ID
  kind: 'applied' | 'moved' | 'hired' | 'rejected' | 'restored'
  fromStageId: ID | null
  toStageId: ID
  at: ISODate
  byId: ID | null
  note: string
}

export interface Application {
  id: ID
  candidateId: ID
  jobId: ID
  stageId: ID
  status: ApplicationStatus
  rating: number | null
  appliedAt: ISODate
  updatedAt: ISODate
  history: StageEvent[]
}

export interface Interview {
  id: ID
  applicationId: ID
  candidateId: ID
  jobId: ID
  stageId: ID
  stageName: string
  start: ISODate
  durationMin: number
  interviewerIds: ID[]
  mode: 'Video' | 'In person' | 'Phone'
  location: string
  scorecardId: ID
  status: 'scheduled' | 'completed' | 'cancelled' | 'no-show'
  attendance: 'pending' | 'confirmed' | 'attended' | 'no-show'
  reminderSentAt: ISODate | null
  cancelReason: string | null
  notes?: string
  createdById: ID
  createdAt: ISODate
}

export type Recommendation = 'strong-yes' | 'yes' | 'no' | 'strong-no'

/** One interviewer's scorecard for one interview. */
export interface InterviewFeedback {
  id: ID
  interviewId: ID
  interviewerId: ID
  status: 'draft' | 'submitted'
  ratings: Record<ID, number>
  /** Evidence for each rating, keyed by criterion id. */
  evidence: Record<ID, string>
  recommendation: Recommendation | null
  strengths: string
  concerns: string
  summary: string
  updatedAt: ISODate
  submittedAt: ISODate | null
}

export interface ScorecardTemplate {
  id: ID
  name: string
  criteria: Array<{ id: ID; name: string; weight: number; description?: string }>
}

export interface AssessmentTemplate {
  id: ID
  name: string
  type: string
  durationMin: number
  passMark: number
  questionCount: number
  workflowTemplateIds: ID[]
  provider: string
}

export interface Assessment {
  id: ID
  applicationId: ID
  candidateId: ID
  jobId: ID
  stageId: ID
  templateId: ID
  assignedAt: ISODate
  deadline: ISODate
  assignedById: ID
  status: 'pending' | 'in-progress' | 'submitted' | 'evaluated' | 'expired' | 'cancelled'
  score: number | null
  completedAt: ISODate | null
  reminderSentAt: ISODate | null
  evaluatorId?: ID
  notes: string
}

export interface Offer {
  id: ID
  applicationId: ID
  candidateId: ID
  jobId: ID
  salary: number
  joiningBonus: number
  startDate: ISODate
  expiresAt: ISODate
  status: 'draft' | 'sent' | 'negotiating' | 'accepted' | 'declined'
  sentAt: ISODate | null
  respondedAt: ISODate | null
  notes: string
  createdAt: ISODate
  createdById: ID
}

export interface OnboardingTask {
  id: ID
  label: string
  ownerId: ID | null
  dueDate: ISODate | null
  done: boolean
  completedAt: ISODate | null
  requiresDocument: boolean
  document: StoredFileRef | null
}

export interface OnboardingPlan {
  id: ID
  offerId: ID
  candidateId: ID
  jobId: ID
  startDate: ISODate
  status: 'not-started' | 'in-progress' | 'blocked' | 'completed'
  tasks: OnboardingTask[]
  history: Array<{ id: ID; at: ISODate; byId: ID | null; text: string }>
  createdAt: ISODate
  completedAt: ISODate | null
}

export interface OnboardingTemplate {
  id: ID
  name: string
  tasks: Array<{ id: ID; label: string; ownerRole: Role | null; dueOffsetDays: number; requiresDocument: boolean }>
}

export interface Task {
  id: ID
  title: string
  assigneeId: ID | null
  dueDate: ISODate | null
  status: 'open' | 'done'
  candidateId: ID | null
  applicationId: ID | null
  createdById: ID | null
  createdAt: ISODate
  completedAt: ISODate | null
  /** Set when an automation created the task, for duplicate prevention. */
  sourceKey?: string | null
}

export interface TalentPool {
  id: ID
  name: string
  description: string
  candidateIds: ID[]
  createdById: ID
  createdAt: ISODate
}

export interface SavedSearch {
  id: ID
  name: string
  query: TalentSearchQuery
  createdById: ID
  createdAt: ISODate
}

export interface TalentSearchQuery {
  text: string
  skills: string[]
  location: string
  minExperience: number | null
  maxExperience: number | null
  pastRole: string
}

export type AutomationTrigger = 'application.created' | 'stage.changed' | 'interview.completed' | 'offer.accepted' | 'feedback.overdue'

export type ConditionOperator = 'equals' | 'not_equals' | 'contains' | 'gte' | 'lte'

export interface AutomationCondition {
  field: string
  operator: ConditionOperator
  value: string
}

export type AutomationAction =
  | { type: 'assign_recruiter'; userId: ID }
  | { type: 'create_task'; title: string; assignTo: 'recruiter' | 'hiring_manager' | ID; dueInDays: number }
  | { type: 'notify'; userId: 'recruiter' | 'hiring_manager' | ID; message: string }
  | { type: 'create_onboarding_plan'; templateId: ID }

export interface AutomationRule {
  id: ID
  name: string
  description: string
  trigger: AutomationTrigger
  conditions: AutomationCondition[]
  actions: AutomationAction[]
  enabled: boolean
  createdById: ID
  createdAt: ISODate
  updatedAt: ISODate
}

export interface AutomationRun {
  id: ID
  ruleId: ID
  ruleName: string
  trigger: AutomationTrigger
  entityId: ID
  at: ISODate
  status: 'success' | 'skipped' | 'failed' | 'dry-run'
  detail: string
  actions: string[]
}

export interface Activity {
  id: ID
  at: ISODate
  type: string
  actorId: ID | null
  candidateId: ID | null
  jobId: ID | null
  text: string
}

export interface Notification {
  id: ID
  type: string
  title: string
  body: string
  at: ISODate
  read: boolean
  link?: string
  /** Recipient; null means everyone in the organization. */
  userId?: ID | null
}

export interface NotificationPref {
  key: string
  label: string
  description: string
  email: boolean
  inApp: boolean
}

export interface OrgSettings {
  rolePermissions: Record<Role, string[]>
  notificationPrefs: NotificationPref[]
}

/** The full set of collections the data store holds for one organization. */
export interface Database {
  version: number
  seededAt?: ISODate
  users: User[]
  departments: Department[]
  workflowTemplates: WorkflowTemplate[]
  jobs: Job[]
  requisitions: Requisition[]
  candidates: Candidate[]
  applications: Application[]
  interviews: Interview[]
  interviewFeedback: InterviewFeedback[]
  assessments: Assessment[]
  offers: Offer[]
  onboardingPlans: OnboardingPlan[]
  onboardingTemplates: OnboardingTemplate[]
  tasks: Task[]
  talentPools: TalentPool[]
  savedSearches: SavedSearch[]
  automationRules: AutomationRule[]
  automationRuns: AutomationRun[]
  activities: Activity[]
  notifications: Notification[]
  assessmentTemplates: AssessmentTemplate[]
  scorecards: ScorecardTemplate[]
  settings: OrgSettings
}

export type CollectionName = Exclude<keyof Database, 'version' | 'seededAt'>
