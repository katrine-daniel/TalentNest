/**
 * Organization configuration: profile, departments, teams, locations, employment types,
 * schedules, holidays, request types, leave types and lifecycle templates.
 * Records in use cannot be deleted — deactivate or reassign first.
 */
import { isValidISODate } from '@/lib/dates'
import { createId } from '@/lib/utils'
import { can, type Permission } from '@/domain/permissions'
import type {
  Account,
  Database,
  Department,
  EmploymentType,
  Holiday,
  ID,
  LeaveType,
  LifecycleTemplate,
  Location,
  Organization,
  RequestType,
  Role,
  Team,
  WorkSchedule,
} from '@/domain/types'
import { withAudit } from './activity'
import { ServiceError, store } from './store'
import { required, transact } from './tx'

type ConfigCollection =
  'departments' | 'teams' | 'locations' | 'employmentTypes' | 'schedules' | 'holidays' | 'requestTypes' | 'leaveTypes' | 'lifecycleTemplates'
type Item<K extends ConfigCollection> = Database[K][number]

const PERMISSION: Record<ConfigCollection, Permission> = {
  departments: 'org.manage',
  teams: 'org.manage',
  locations: 'org.manage',
  employmentTypes: 'org.manage',
  schedules: 'org.manage',
  holidays: 'org.manage',
  requestTypes: 'org.manage',
  leaveTypes: 'org.manage',
  lifecycleTemplates: 'lifecycle.manage',
}

function validate(db: Database, collection: ConfigCollection, item: Record<string, unknown>) {
  const name = String(item.name ?? '').trim()
  if (collection !== 'holidays') required(name, 'Name')
  const dup = (db[collection] as Array<{ id: string; name: string }>).some((x) => x.id !== item.id && x.name.trim().toLowerCase() === name.toLowerCase())
  if (dup && collection !== 'holidays' && collection !== 'lifecycleTemplates') throw new ServiceError(`“${name}” already exists.`, 'conflict')
  if (collection === 'employmentTypes') {
    const fte = Number(item.fte)
    if (!(fte > 0 && fte <= 1)) throw new ServiceError('FTE must be greater than 0 and at most 1.')
  }
  if (collection === 'schedules') {
    const days = item.workingDays as number[]
    if (!Array.isArray(days) || !days.length) throw new ServiceError('Choose at least one working day.')
    if (!(Number(item.hoursPerDay) > 0 && Number(item.hoursPerDay) <= 24)) throw new ServiceError('Hours per day must be between 1 and 24.')
  }
  if (collection === 'holidays') {
    required(String(item.name ?? ''), 'Holiday name')
    if (!isValidISODate(String(item.date ?? ''))) throw new ServiceError('Enter a valid date.')
  }
  if (collection === 'teams' && !db.departments.some((d) => d.id === item.departmentId)) throw new ServiceError('Choose a department for the team.')
  if (collection === 'requestTypes') {
    if (!(Number(item.slaHours) > 0 && Number(item.slaHours) <= 400)) throw new ServiceError('Service target must be between 1 and 400 business hours.')
  }
  if (collection === 'leaveTypes') {
    required(String(item.code ?? ''), 'Code')
    if (item.tracked && !(Number(item.annualDays) > 0 && Number(item.annualDays) <= 365))
      throw new ServiceError('Tracked leave needs an annual entitlement between 1 and 365 days.')
  }
  if (collection === 'lifecycleTemplates') {
    const tasks = item.tasks as LifecycleTemplate['tasks']
    if (!tasks?.length) throw new ServiceError('Add at least one task.')
    if (tasks.some((t) => !t.title.trim())) throw new ServiceError('Every task needs a title.')
    if (tasks.some((t) => !Number.isInteger(t.offsetDays) || Math.abs(t.offsetDays) > 365))
      throw new ServiceError('Task offsets must be whole days within a year.')
  }
}

export function saveConfig<K extends ConfigCollection>(actor: Account, collection: K, item: Omit<Item<K>, 'id'> & { id?: ID }): Item<K> {
  if (!can(actor, PERMISSION[collection])) throw new ServiceError('You do not have permission to change organization settings.', 'forbidden')
  const db = store.db
  validate(db, collection, item as Record<string, unknown>)
  const list = db[collection] as Array<Item<K>>
  const exists = item.id && list.some((x) => x.id === item.id)
  const record = { ...item, id: exists ? item.id : createId(collection.slice(0, 3)) } as Item<K>
  transact((d) =>
    withAudit(
      {
        ...d,
        [collection]: exists ? (d[collection] as Array<Item<K>>).map((x) => (x.id === record.id ? record : x)) : [...(d[collection] as Array<Item<K>>), record],
      },
      actor.id,
      `config.${collection}.${exists ? 'updated' : 'created'}`,
      { type: 'settings', id: record.id },
      `${collection}: ${(record as { name?: string }).name ?? record.id}`,
    ),
  )
  return record
}

export function usageOf(db: Database, collection: ConfigCollection, id: ID): number {
  switch (collection) {
    case 'departments':
      return db.employees.filter((e) => e.departmentId === id).length + db.teams.filter((t) => t.departmentId === id).length
    case 'teams':
      return db.employees.filter((e) => e.teamId === id).length
    case 'locations':
      return db.employees.filter((e) => e.locationId === id).length
    case 'employmentTypes':
      return db.employees.filter((e) => e.employmentTypeId === id).length
    case 'schedules':
      return db.employees.filter((e) => e.scheduleId === id).length
    case 'requestTypes':
      return db.requests.filter((r) => r.typeId === id).length
    case 'leaveTypes':
      return db.leaveRequests.filter((r) => r.leaveTypeId === id).length
    case 'lifecycleTemplates':
      return db.lifecycleCases.filter((c) => c.templateId === id && c.status === 'active').length
    case 'holidays':
      return 0
  }
}

export function deleteConfig(actor: Account, collection: ConfigCollection, id: ID) {
  if (!can(actor, PERMISSION[collection])) throw new ServiceError('You do not have permission to change organization settings.', 'forbidden')
  const used = usageOf(store.db, collection, id)
  if (used) throw new ServiceError(`In use by ${used} record(s). Reassign them or deactivate this item instead.`, 'conflict')
  transact((d) =>
    withAudit(
      { ...d, [collection]: (d[collection] as Array<{ id: ID }>).filter((x) => x.id !== id) },
      actor.id,
      `config.${collection}.deleted`,
      { type: 'settings', id },
      `${collection} item deleted`,
    ),
  )
}

export function updateOrganization(actor: Account, patch: Partial<Omit<Organization, 'id'>>) {
  if (!can(actor, 'org.manage')) throw new ServiceError('You do not have permission to change the company profile.', 'forbidden')
  if (patch.name !== undefined) required(patch.name, 'Company name')
  transact((d) =>
    withAudit(
      { ...d, organization: { ...d.organization, ...patch } },
      actor.id,
      'organization.updated',
      { type: 'organization', id: d.organization.id },
      'Company profile updated',
    ),
  )
}

export function changeRole(actor: Account, accountId: ID, role: Role) {
  if (!can(actor, 'accounts.manage')) throw new ServiceError('Only organization administrators can change roles.', 'forbidden')
  if (accountId === actor.id) throw new ServiceError('You cannot change your own role.', 'forbidden')
  const target = store.db.accounts.find((a) => a.id === accountId)
  if (!target) throw new ServiceError('User not found.', 'not_found')
  transact((d) =>
    withAudit(
      { ...d, accounts: d.accounts.map((a) => (a.id === accountId ? { ...a, role } : a)) },
      actor.id,
      'account.role_changed',
      { type: 'account', id: accountId },
      `${target.name}: ${target.role} → ${role}`,
    ),
  )
}

export type { Department, EmploymentType, Holiday, LeaveType, LifecycleTemplate, Location, RequestType, Team, WorkSchedule }
