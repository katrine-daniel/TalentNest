import { Link } from 'react-router-dom'
import { AlertTriangle, Clock } from 'lucide-react'
import { Badge, type Tone } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Layout'
import { describeDue, formatDateTime } from '@/lib/dates'
import { cn, fullName } from '@/lib/utils'
import type { Employee, EmployeeStatus, LeaveStatus, Policy, Priority, RequestStatus } from '@/domain/types'
import { STATUS_LABELS } from '@/services/requests'
import { LEAVE_STATUS_LABELS } from '@/services/leave'
import { POLICY_STATUS_LABELS } from '@/services/policies'

const REQUEST_TONES: Record<RequestStatus, Tone> = {
  open: 'info',
  in_progress: 'brand',
  waiting_on_employee: 'warning',
  pending_approval: 'warning',
  changes_requested: 'warning',
  approved: 'success',
  rejected: 'danger',
  resolved: 'success',
  closed: 'neutral',
  cancelled: 'neutral',
}
export const RequestStatusBadge = ({ status }: { status: RequestStatus }) => <Badge tone={REQUEST_TONES[status]}>{STATUS_LABELS[status]}</Badge>

const LEAVE_TONES: Record<LeaveStatus, Tone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  changes_requested: 'warning',
  cancelled: 'neutral',
}
export const LeaveStatusBadge = ({ status }: { status: LeaveStatus }) => <Badge tone={LEAVE_TONES[status]}>{LEAVE_STATUS_LABELS[status]}</Badge>

const EMP: Record<EmployeeStatus, [string, Tone]> = {
  pre_boarding: ['Pre-boarding', 'info'],
  active: ['Active', 'success'],
  on_leave: ['On leave', 'brand'],
  offboarding: ['Offboarding', 'warning'],
  terminated: ['Former employee', 'neutral'],
}
export const EmployeeStatusBadge = ({ status }: { status: EmployeeStatus }) => <Badge tone={EMP[status][1]}>{EMP[status][0]}</Badge>
export const employeeStatusLabel = (s: EmployeeStatus) => EMP[s][0]

const POLICY_TONES: Record<Policy['status'], Tone> = { draft: 'neutral', in_review: 'warning', published: 'success', archived: 'neutral' }
export const PolicyStatusBadge = ({ status }: { status: Policy['status'] }) => <Badge tone={POLICY_TONES[status]}>{POLICY_STATUS_LABELS[status]}</Badge>

const PRIORITY: Record<Priority, [string, Tone]> = {
  urgent: ['Urgent', 'danger'],
  high: ['High', 'warning'],
  normal: ['Normal', 'neutral'],
  low: ['Low', 'neutral'],
}
export function PriorityBadge({ priority, hideNormal }: { priority: Priority; hideNormal?: boolean }) {
  if (hideNormal && (priority === 'normal' || priority === 'low')) return null
  return <Badge tone={PRIORITY[priority][1]}>{PRIORITY[priority][0]}</Badge>
}

export function PersonCell({ employee, sub, link = true }: { employee: Employee | null | undefined; sub?: string; link?: boolean }) {
  if (!employee) return <span className="text-muted">—</span>
  const name = fullName(employee)
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar name={name} size="sm" />
      <span className="min-w-0">
        {link ? (
          <Link to={`/people/${employee.id}`} className="text-ink block truncate font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
            {name}
          </Link>
        ) : (
          <span className="text-ink block truncate font-medium">{name}</span>
        )}
        <span className="text-muted block truncate text-xs">{sub ?? employee.title}</span>
      </span>
    </span>
  )
}

/** Due label for a calendar date or timestamp. Overdue states use an icon plus text, not colour alone. */
export function DueLabel({ due, done }: { due: string | null; done?: boolean }) {
  if (!due) return <span className="text-muted">—</span>
  if (done) return <span className="text-muted">{due.length === 10 ? due : formatDateTime(due)}</span>
  if (due.length > 10) {
    const overdue = new Date(due).getTime() < Date.now()
    return (
      <span
        className={cn('inline-flex items-center gap-1 whitespace-nowrap', overdue ? 'text-danger font-medium' : 'text-ink-soft')}
        title={formatDateTime(due)}
      >
        {overdue ? <AlertTriangle size={13} aria-hidden /> : <Clock size={13} className="text-muted" aria-hidden />}
        {overdue ? 'Overdue' : formatDateTime(due)}
      </span>
    )
  }
  const d = describeDue(due)
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap', d.overdue ? 'text-danger font-medium' : d.soon ? 'text-warning' : 'text-ink-soft')}>
      {d.overdue && <AlertTriangle size={13} aria-hidden />}
      {d.label}
    </span>
  )
}

export const CATEGORY_LABELS: Record<string, string> = {
  leave: 'Leave & attendance',
  payroll: 'Payroll',
  benefits: 'Benefits',
  letters: 'Employment letters',
  documents: 'Documents',
  equipment: 'Equipment',
  policy: 'Policy questions',
  onboarding: 'Onboarding support',
  records: 'Personal details',
  work_arrangement: 'Work arrangements',
  general: 'General',
}
