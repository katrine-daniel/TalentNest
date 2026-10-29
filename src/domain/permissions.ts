/**
 * Role-based access control.
 *
 * The same rules exist in the database (supabase/migrations: RLS policies and
 * `has_permission`); this module mirrors them so the UI can hide what a user cannot do.
 * The UI checks are a convenience — the database is the enforcement point.
 */
import type { Account, Database, Employee, HRRequest, ID, LeaveRequest, Role } from './types'

export const ROLE_LABELS: Record<Role, string> = {
  employee: 'Employee',
  manager: 'Manager',
  hr_specialist: 'HR Specialist',
  hr_admin: 'HR Administrator',
  org_admin: 'Organization Administrator',
}

export const PERMISSIONS = {
  'people.view_all': 'View every employee in the directory',
  'people.view_sensitive': 'View personal contact, date of birth and emergency contacts',
  'people.manage': 'Create, edit, import and deactivate employee records',
  'requests.handle': 'Work the HR service queue and see internal notes',
  'requests.view_all': 'See every employee request',
  'leave.manage': 'Adjust leave balances and decide any leave request',
  'lifecycle.manage': 'Start and manage onboarding and offboarding',
  'policies.manage': 'Draft, review and publish company policies',
  'automation.manage': 'Create and change workflow rules',
  'analytics.view': 'View workforce analytics',
  'org.manage': 'Configure the organization, request types and leave types',
  'audit.view': 'View the audit log',
  'accounts.manage': 'Invite users and change roles',
} as const

export type Permission = keyof typeof PERMISSIONS

const HR_CORE: Permission[] = [
  'people.view_all',
  'people.view_sensitive',
  'people.manage',
  'requests.handle',
  'requests.view_all',
  'leave.manage',
  'lifecycle.manage',
  'analytics.view',
]

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  employee: [],
  manager: ['analytics.view'],
  hr_specialist: HR_CORE,
  hr_admin: [...HR_CORE, 'policies.manage', 'automation.manage', 'org.manage', 'audit.view'],
  org_admin: Object.keys(PERMISSIONS) as Permission[],
}

export function can(account: Pick<Account, 'role'> | null | undefined, permission: Permission): boolean {
  return Boolean(account && ROLE_PERMISSIONS[account.role].includes(permission))
}

export const isHR = (account: Pick<Account, 'role'> | null | undefined) => can(account, 'requests.handle')

/** Ids of every employee reporting to `managerEmployeeId`, directly or indirectly. */
export function reportIds(employees: readonly Employee[], managerEmployeeId: ID | null): Set<ID> {
  const out = new Set<ID>()
  if (!managerEmployeeId) return out
  const byManager = new Map<ID, Employee[]>()
  for (const e of employees) if (e.managerId) byManager.set(e.managerId, [...(byManager.get(e.managerId) ?? []), e])
  const queue = [managerEmployeeId]
  while (queue.length) {
    const id = queue.shift() as ID
    for (const r of byManager.get(id) ?? []) {
      if (!out.has(r.id)) {
        out.add(r.id)
        queue.push(r.id)
      }
    }
  }
  return out
}

/** Directory visibility: HR sees everyone; others see colleagues' work profiles (not sensitive fields). */
export function canViewEmployee(account: Account, _employee: Employee): boolean {
  // Work profiles (name, title, department, manager, work email) are visible to all members,
  // like a company directory. Sensitive fields are filtered by `canViewSensitive`.
  return account.status === 'active'
}

export function canViewSensitive(account: Account, employee: Employee): boolean {
  return can(account, 'people.view_sensitive') || account.employeeId === employee.id
}

/** Managers see employment details (status, history, documents) of their reporting line. */
export function canViewEmploymentDetails(account: Account, employee: Employee, db: Pick<Database, 'employees'>): boolean {
  if (can(account, 'people.view_all') || account.employeeId === employee.id) return true
  return account.role === 'manager' && reportIds(db.employees, account.employeeId).has(employee.id)
}

export function canViewRequest(account: Account, request: HRRequest, db: Pick<Database, 'employees'>): boolean {
  if (can(account, 'requests.view_all')) return true
  if (request.requesterId === account.id || request.employeeId === account.employeeId) return true
  // Approvers can see requests they are asked to decide.
  if (request.approvals.some((s) => s.approverIds.includes(account.id) || s.delegatedTo === account.id)) return true
  return account.role === 'manager' && reportIds(db.employees, account.employeeId).has(request.employeeId)
}

export function canViewLeave(account: Account, leave: LeaveRequest, db: Pick<Database, 'employees'>): boolean {
  if (can(account, 'leave.manage')) return true
  if (leave.employeeId === account.employeeId) return true
  if (leave.approvals.some((s) => s.approverIds.includes(account.id) || s.delegatedTo === account.id)) return true
  return account.role === 'manager' && reportIds(db.employees, account.employeeId).has(leave.employeeId)
}
