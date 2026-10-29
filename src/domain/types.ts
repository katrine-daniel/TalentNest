/**
 * PeopleOS domain model.
 *
 * Records are plain JSON so the same shapes work in the demo store (localStorage) and in
 * Supabase (snake_case columns, see supabase/migrations). Dates are ISO strings; calendar
 * dates (no time) use `YYYY-MM-DD`.
 */

export type ID = string
export type ISODateTime = string
/** Calendar date, `YYYY-MM-DD`. */
export type ISODate = string

// ------------------------------------------------------------------ access
export type Role = 'employee' | 'manager' | 'hr_specialist' | 'hr_admin' | 'org_admin'

export interface Account {
  id: ID
  /** Employee record of this person, if they are an employee of the organization. */
  employeeId: ID | null
  name: string
  email: string
  role: Role
  status: 'active' | 'invited' | 'suspended'
}

// ------------------------------------------------------------------ organization
export interface Organization {
  id: ID
  name: string
  industry: string
  timezone: string
  /** ISO 3166 country of the primary entity — used only for display; no country rules are assumed. */
  country: string
  weekStartsOn: 0 | 1
  terminology: { employee: string; employees: string; department: string; location: string }
}

export interface Department {
  id: ID
  name: string
  code: string
  headEmployeeId: ID | null
}

export interface Team {
  id: ID
  name: string
  departmentId: ID
  leadEmployeeId: ID | null
}

export interface Location {
  id: ID
  name: string
  city: string
  country: string
  timezone: string
}

export interface EmploymentType {
  id: ID
  name: string
  /** Leave entitlements are pro-rated by this factor (1 = full time). */
  fte: number
}

export interface WorkSchedule {
  id: ID
  name: string
  /** Working weekdays, 0 = Sunday … 6 = Saturday. */
  workingDays: number[]
  hoursPerDay: number
  kind: 'fixed' | 'rotating' | 'flexible'
}

export interface Holiday {
  id: ID
  date: ISODate
  name: string
  /** null = applies to every location. */
  locationId: ID | null
}

// ------------------------------------------------------------------ people
export type EmployeeStatus = 'pre_boarding' | 'active' | 'on_leave' | 'offboarding' | 'terminated'

export interface EmergencyContact {
  name: string
  relationship: string
  phone: string
}

export interface EmployeeDocument {
  id: ID
  name: string
  kind: 'contract' | 'id_proof' | 'certificate' | 'policy_ack' | 'letter' | 'other'
  fileId: string | null
  size: number
  uploadedAt: ISODateTime
  uploadedBy: ID
  expiresOn: ISODate | null
}

export interface Equipment {
  id: ID
  item: string
  assetTag: string
  assignedOn: ISODate
  returnedOn: ISODate | null
}

export interface ChangeEntry {
  id: ID
  at: ISODateTime
  by: ID | null
  /** e.g. "Department", "Status". */
  field: string
  from: string | null
  to: string | null
  note?: string
}

export interface Employee {
  id: ID
  employeeNo: string
  firstName: string
  lastName: string
  preferredName: string | null
  workEmail: string
  /** Sensitive: visible to the employee, HR roles. */
  personalEmail: string | null
  /** Sensitive. */
  phone: string | null
  title: string
  departmentId: ID
  teamId: ID | null
  managerId: ID | null
  employmentTypeId: ID
  locationId: ID
  scheduleId: ID
  joinDate: ISODate
  /** Last working day when offboarding/terminated. */
  endDate: ISODate | null
  status: EmployeeStatus
  /** Sensitive. */
  dateOfBirth: ISODate | null
  /** Sensitive. */
  emergencyContact: EmergencyContact | null
  documents: EmployeeDocument[]
  equipment: Equipment[]
  history: ChangeEntry[]
  createdAt: ISODateTime
}

// ------------------------------------------------------------------ approvals (shared)
export type ApproverRule = 'manager' | 'department_head' | 'hr' | 'specific'

export interface ApprovalStage {
  id: ID
  name: string
  rule: ApproverRule
  /** For rule `specific`. */
  accountId?: ID | null
}

export type ApprovalDecision = 'pending' | 'approved' | 'rejected' | 'changes_requested' | 'skipped'

export interface ApprovalStep {
  id: ID
  stageName: string
  rule: ApproverRule
  /** Accounts allowed to decide this step (resolved when the step becomes active). */
  approverIds: ID[]
  /** Set when an approver delegated the step. */
  delegatedTo: ID | null
  decision: ApprovalDecision
  decidedBy: ID | null
  decidedAt: ISODateTime | null
  comment: string
}

export interface TimelineEntry {
  id: ID
  at: ISODateTime
  by: ID | null
  text: string
}

// ------------------------------------------------------------------ service desk & requests
export type RequestCategory =
  'leave' | 'payroll' | 'benefits' | 'letters' | 'documents' | 'equipment' | 'policy' | 'onboarding' | 'records' | 'work_arrangement' | 'general'

export interface RequestType {
  id: ID
  name: string
  category: RequestCategory
  description: string
  /** Approval chain; empty = handled by HR without approval. */
  approvalChain: ApprovalStage[]
  /** Target time to resolve, in business hours. */
  slaHours: number
  defaultPriority: Priority
  /** Whether employees can raise it for themselves from the service portal. */
  selfService: boolean
  active: boolean
  /** Record update requests carry proposed field changes. */
  kind: 'service' | 'record_update' | 'equipment' | 'document'
}

export type Priority = 'low' | 'normal' | 'high' | 'urgent'

export type RequestStatus =
  'open' | 'in_progress' | 'waiting_on_employee' | 'pending_approval' | 'changes_requested' | 'approved' | 'rejected' | 'resolved' | 'closed' | 'cancelled'

export interface RequestComment {
  id: ID
  authorId: ID
  text: string
  /** Internal notes are visible to HR roles only. */
  internal: boolean
  at: ISODateTime
}

export interface Attachment {
  id: ID
  name: string
  size: number
  mimeType: string
  fileId: string
  uploadedBy: ID
  uploadedAt: ISODateTime
}

export interface HRRequest {
  id: ID
  number: string
  typeId: ID
  category: RequestCategory
  subject: string
  description: string
  /** Account that raised it. */
  requesterId: ID
  /** Employee the request is about. */
  employeeId: ID
  priority: Priority
  status: RequestStatus
  assigneeId: ID | null
  dueAt: ISODateTime
  /** Record update requests: proposed field → value. */
  proposedChanges: Record<string, string> | null
  approvals: ApprovalStep[]
  comments: RequestComment[]
  attachments: Attachment[]
  timeline: TimelineEntry[]
  resolution: string | null
  escalatedAt: ISODateTime | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
  resolvedAt: ISODateTime | null
}

// ------------------------------------------------------------------ leave
export interface LeaveType {
  id: ID
  name: string
  code: string
  /** Days per year at fte 1. 0 with `unlimited` false means unpaid / not tracked against a balance. */
  annualDays: number
  tracked: boolean
  carryOverMax: number
  allowNegative: boolean
  requiresAttachmentAfterDays: number | null
  approvalChain: ApprovalStage[]
  color: string
  active: boolean
}

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested' | 'cancelled'

export interface LeaveRequest {
  id: ID
  employeeId: ID
  leaveTypeId: ID
  startDate: ISODate
  endDate: ISODate
  halfDayStart: boolean
  halfDayEnd: boolean
  /** Working days deducted, computed from the employee's schedule and holidays. */
  days: number
  reason: string
  status: LeaveStatus
  approvals: ApprovalStep[]
  timeline: TimelineEntry[]
  requestedBy: ID
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

/** Opening balances and adjustments (e.g. carry-over, manual corrections). */
export interface LeaveAdjustment {
  id: ID
  employeeId: ID
  leaveTypeId: ID
  year: number
  days: number
  reason: string
  by: ID
  at: ISODateTime
}

// ------------------------------------------------------------------ lifecycle
export type LifecycleKind = 'onboarding' | 'offboarding'
export type TaskOwner = 'hr' | 'manager' | 'it' | 'employee' | 'facilities' | 'finance'

export interface LifecycleTemplateTask {
  id: ID
  title: string
  owner: TaskOwner
  /** Days relative to the start date (joining date or last working day). */
  offsetDays: number
  requiresDocument: boolean
  /** Tasks representing an external action (e.g. revoke access) — checklist only unless integrated. */
  externalAction: boolean
}

export interface LifecycleTemplate {
  id: ID
  kind: LifecycleKind
  name: string
  /** Filters; null matches any. The most specific active template is suggested. */
  departmentId: ID | null
  locationId: ID | null
  employmentTypeId: ID | null
  tasks: LifecycleTemplateTask[]
  active: boolean
}

export interface LifecycleTask {
  id: ID
  title: string
  owner: TaskOwner
  assigneeId: ID | null
  dueDate: ISODate
  status: 'open' | 'done' | 'skipped'
  requiresDocument: boolean
  externalAction: boolean
  documentId: ID | null
  completedAt: ISODateTime | null
  completedBy: ID | null
  note: string
}

export interface LifecycleCase {
  id: ID
  kind: LifecycleKind
  employeeId: ID
  templateId: ID
  /** Joining date (onboarding) or last working day (offboarding). */
  keyDate: ISODate
  status: 'active' | 'completed' | 'cancelled'
  tasks: LifecycleTask[]
  timeline: TimelineEntry[]
  createdBy: ID | null
  createdAt: ISODateTime
  completedAt: ISODateTime | null
}

// ------------------------------------------------------------------ tasks (generic)
export interface Task {
  id: ID
  title: string
  description: string
  assigneeId: ID | null
  dueDate: ISODate | null
  status: 'open' | 'done'
  priority: Priority
  /** What the task is about, for linking. */
  link: EntityRef | null
  /** Automation idempotency key. */
  sourceKey: string | null
  createdBy: ID | null
  createdAt: ISODateTime
  completedAt: ISODateTime | null
}

export interface EntityRef {
  type: 'employee' | 'request' | 'leave' | 'lifecycle' | 'policy'
  id: ID
}

// ------------------------------------------------------------------ policies
export type PolicyStatus = 'draft' | 'in_review' | 'published' | 'archived'

export interface PolicyVersion {
  version: number
  body: string
  effectiveDate: ISODate
  changeNote: string
  createdBy: ID
  createdAt: ISODateTime
  publishedAt: ISODateTime | null
  publishedBy: ID | null
}

export interface Policy {
  id: ID
  title: string
  category: string
  tags: string[]
  summary: string
  ownerId: ID
  status: PolicyStatus
  /** Version currently in force (published) — null until first publication. */
  publishedVersion: number | null
  versions: PolicyVersion[]
  requiresAcknowledgment: boolean
  /** null = everyone; otherwise department ids. */
  audienceDepartmentIds: ID[] | null
  reviewBy: ISODate | null
  updatedAt: ISODateTime
}

export interface PolicyAcknowledgment {
  id: ID
  policyId: ID
  version: number
  employeeId: ID
  at: ISODateTime
}

export interface Announcement {
  id: ID
  title: string
  body: string
  authorId: ID
  publishedAt: ISODateTime
  audienceDepartmentIds: ID[] | null
}

// ------------------------------------------------------------------ automation
export type TriggerType =
  | 'employee.created'
  | 'employee.joined'
  | 'employee.department_changed'
  | 'request.submitted'
  | 'request.decided'
  | 'leave.submitted'
  | 'leave.decided'
  | 'task.overdue'
  | 'document.expiring'
  | 'onboarding.started'
  | 'schedule.daily'

export interface RuleCondition {
  field: string
  operator: 'equals' | 'not_equals' | 'in' | 'contains' | 'gte' | 'lte'
  value: string
}

export type RuleAction =
  | { type: 'create_task'; title: string; assignTo: AssigneeTarget; dueInDays: number; priority: Priority }
  | { type: 'notify'; to: AssigneeTarget; title: string; message: string }
  | { type: 'send_email'; to: AssigneeTarget; subject: string; body: string }
  | { type: 'request_approval'; requestTypeId: ID; subject: string }
  | { type: 'update_employee'; field: 'status' | 'teamId' | 'scheduleId'; value: string }
  | { type: 'start_lifecycle'; kind: LifecycleKind; templateId: ID | null }

/** Who an action targets, resolved from the event's records. */
export type AssigneeTarget = 'employee' | 'manager' | 'hr_queue' | 'department_head' | `account:${string}`

export interface WorkflowRule {
  id: ID
  name: string
  description: string
  trigger: TriggerType
  conditions: RuleCondition[]
  actions: RuleAction[]
  enabled: boolean
  /** Failed runs are retried up to this many attempts. */
  maxAttempts: number
  createdBy: ID
  createdAt: ISODateTime
  updatedAt: ISODateTime
  changeLog: TimelineEntry[]
}

export interface WorkflowRun {
  id: ID
  ruleId: ID
  ruleName: string
  trigger: TriggerType
  entity: EntityRef | null
  dedupeKey: string
  status: 'succeeded' | 'failed' | 'test'
  attempts: number
  /** The triggering event, kept so failed runs can be retried. */
  event: { employeeId: ID | null; data: Record<string, string | number | null> } | null
  /** One line per action, in order. `skipped` = not possible in this environment (e.g. no email provider). */
  results: Array<{ action: RuleAction['type']; outcome: 'done' | 'skipped' | 'failed'; message: string }>
  error: string | null
  executor: 'browser' | 'server'
  at: ISODateTime
}

// ------------------------------------------------------------------ notifications, inbox, audit
export interface Notification {
  id: ID
  accountId: ID
  title: string
  body: string
  link: string | null
  read: boolean
  at: ISODateTime
  kind: 'request' | 'leave' | 'lifecycle' | 'policy' | 'task' | 'automation' | 'system'
}

export interface NotificationPreference {
  /** `<accountId>:<kind>` */
  id: string
  accountId: ID
  kind: Notification['kind']
  inApp: boolean
  email: boolean
}

/** Per-user inbox state layered over derived inbox items. */
export interface InboxState {
  id: ID
  accountId: ID
  itemKey: string
  snoozedUntil: ISODateTime | null
}

export interface AuditEvent {
  id: ID
  at: ISODateTime
  actorId: ID | null
  action: string
  entity: EntityRef | { type: 'organization' | 'rule' | 'settings' | 'account'; id: ID }
  summary: string
}

// ------------------------------------------------------------------ assistant
export interface AssistantCitation {
  kind: 'policy' | 'record'
  label: string
  /** e.g. "v3 · effective 2026-01-01". */
  detail: string
  href: string
}

export interface AssistantMessage {
  id: ID
  role: 'user' | 'assistant'
  text: string
  at: ISODateTime
  citations: AssistantCitation[]
  /** Facts vs. suggestions are rendered separately. */
  suggestions: string[]
  actions: Array<{ label: string; href: string; requiresConfirmation: boolean }>
  /** demo = rule-based engine; records = computed from the user's records; ai = server-side AI provider. */
  source: 'demo' | 'records' | 'ai' | null
}

export interface Conversation {
  id: ID
  accountId: ID
  title: string
  messages: AssistantMessage[]
  updatedAt: ISODateTime
}

// ------------------------------------------------------------------ database
export interface Database {
  version: number
  organization: Organization
  accounts: Account[]
  departments: Department[]
  teams: Team[]
  locations: Location[]
  employmentTypes: EmploymentType[]
  schedules: WorkSchedule[]
  holidays: Holiday[]
  employees: Employee[]
  requestTypes: RequestType[]
  requests: HRRequest[]
  leaveTypes: LeaveType[]
  leaveRequests: LeaveRequest[]
  leaveAdjustments: LeaveAdjustment[]
  lifecycleTemplates: LifecycleTemplate[]
  lifecycleCases: LifecycleCase[]
  tasks: Task[]
  policies: Policy[]
  policyAcks: PolicyAcknowledgment[]
  announcements: Announcement[]
  rules: WorkflowRule[]
  runs: WorkflowRun[]
  notifications: Notification[]
  notificationPrefs: NotificationPreference[]
  inboxState: InboxState[]
  audit: AuditEvent[]
  conversations: Conversation[]
}

export type Collection = Exclude<keyof Database, 'version' | 'organization'>
