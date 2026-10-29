/**
 * Employee records: create, update (with change history), documents, equipment,
 * deactivation, retention clean-up and CSV import.
 */
import { isValidISODate, today } from '@/lib/dates'
import { createId, EMAIL_RE, normalizeEmail, nowISO } from '@/lib/utils'
import { can } from '@/domain/permissions'
import type { Account, ChangeEntry, Database, Employee, EmployeeStatus, ID } from '@/domain/types'
import { queueEvent, withAudit, withNotifications } from './activity'
import { files } from './files'
import { replaceById, ServiceError, store } from './store'
import { requirePermission, transact } from './tx'

export interface EmployeeInput {
  firstName: string
  lastName: string
  preferredName?: string | null
  workEmail: string
  personalEmail?: string | null
  phone?: string | null
  title: string
  departmentId: ID
  teamId?: ID | null
  managerId?: ID | null
  employmentTypeId: ID
  locationId: ID
  scheduleId: ID
  joinDate: string
  dateOfBirth?: string | null
  employeeNo?: string
}

export interface DuplicateMatch {
  employee: Employee
  reasons: string[]
}

/** Possible duplicates: same work or personal email, or same name with the same date of birth. */
export function findDuplicates(input: Partial<EmployeeInput>, employees: readonly Employee[], excludeId?: ID): DuplicateMatch[] {
  const work = input.workEmail ? normalizeEmail(input.workEmail) : ''
  const personal = input.personalEmail ? normalizeEmail(input.personalEmail) : ''
  const name = `${input.firstName ?? ''} ${input.lastName ?? ''}`.trim().toLowerCase()
  return employees
    .filter((e) => e.id !== excludeId && e.status !== 'terminated')
    .map((e) => {
      const reasons: string[] = []
      if (work && normalizeEmail(e.workEmail) === work) reasons.push('same work email')
      if (personal && e.personalEmail && normalizeEmail(e.personalEmail) === personal) reasons.push('same personal email')
      if (name && `${e.firstName} ${e.lastName}`.toLowerCase() === name && input.dateOfBirth && e.dateOfBirth === input.dateOfBirth) reasons.push('same name and date of birth')
      return { employee: e, reasons }
    })
    .filter((m) => m.reasons.length)
}

export function validateEmployee(db: Database, input: EmployeeInput, excludeId?: ID): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!input.firstName?.trim()) errors.firstName = 'First name is required.'
  if (!input.lastName?.trim()) errors.lastName = 'Last name is required.'
  if (!input.title?.trim()) errors.title = 'Job title is required.'
  if (!EMAIL_RE.test(input.workEmail ?? '')) errors.workEmail = 'Enter a valid work email.'
  else if (db.employees.some((e) => e.id !== excludeId && normalizeEmail(e.workEmail) === normalizeEmail(input.workEmail))) errors.workEmail = 'Another employee already uses this work email.'
  if (input.personalEmail && !EMAIL_RE.test(input.personalEmail)) errors.personalEmail = 'Enter a valid email or leave it empty.'
  if (input.phone && !/^[+\d][\d\s().-]{6,}$/.test(input.phone)) errors.phone = 'Enter a valid phone number.'
  if (!db.departments.some((d) => d.id === input.departmentId)) errors.departmentId = 'Choose a department.'
  if (!db.locations.some((l) => l.id === input.locationId)) errors.locationId = 'Choose a location.'
  if (!db.employmentTypes.some((t) => t.id === input.employmentTypeId)) errors.employmentTypeId = 'Choose an employment type.'
  if (!db.schedules.some((s) => s.id === input.scheduleId)) errors.scheduleId = 'Choose a work schedule.'
  if (!isValidISODate(input.joinDate ?? '')) errors.joinDate = 'Enter a valid joining date.'
  if (input.dateOfBirth && !isValidISODate(input.dateOfBirth)) errors.dateOfBirth = 'Enter a valid date.'
  if (input.managerId) {
    if (input.managerId === excludeId) errors.managerId = 'An employee cannot manage themselves.'
    else if (excludeId && wouldCreateCycle(db.employees, excludeId, input.managerId)) errors.managerId = 'This would create a reporting loop.'
    else if (!db.employees.some((e) => e.id === input.managerId && e.status !== 'terminated')) errors.managerId = 'Choose an active manager.'
  }
  if (input.teamId && db.teams.find((t) => t.id === input.teamId)?.departmentId !== input.departmentId) errors.teamId = 'The team belongs to another department.'
  if (input.employeeNo && db.employees.some((e) => e.id !== excludeId && e.employeeNo === input.employeeNo)) errors.employeeNo = 'This employee ID is already used.'
  return errors
}

function wouldCreateCycle(employees: readonly Employee[], employeeId: ID, managerId: ID): boolean {
  let cursor: ID | null = managerId
  for (let i = 0; cursor && i < 500; i++) {
    if (cursor === employeeId) return true
    cursor = employees.find((e) => e.id === cursor)?.managerId ?? null
  }
  return false
}

function nextEmployeeNo(db: Database): string {
  const max = db.employees.reduce((m, e) => Math.max(m, Number(e.employeeNo.replace(/\D/g, '')) || 0), 1000)
  const prefix = db.employees[0]?.employeeNo.replace(/\d+$/, '') ?? 'EMP-'
  return `${prefix}${max + 1}`
}

const LABELS: Partial<Record<keyof Employee, string>> = {
  firstName: 'First name',
  lastName: 'Last name',
  preferredName: 'Preferred name',
  workEmail: 'Work email',
  personalEmail: 'Personal email',
  phone: 'Phone',
  title: 'Job title',
  departmentId: 'Department',
  teamId: 'Team',
  managerId: 'Manager',
  employmentTypeId: 'Employment type',
  locationId: 'Location',
  scheduleId: 'Work schedule',
  joinDate: 'Joining date',
  dateOfBirth: 'Date of birth',
  status: 'Status',
  endDate: 'End date',
}
const SENSITIVE = new Set(['personalEmail', 'phone', 'dateOfBirth'])

function display(db: Database, field: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const id = String(value)
  if (field === 'departmentId') return db.departments.find((d) => d.id === id)?.name ?? id
  if (field === 'locationId') return db.locations.find((d) => d.id === id)?.name ?? id
  if (field === 'teamId') return db.teams.find((d) => d.id === id)?.name ?? id
  if (field === 'employmentTypeId') return db.employmentTypes.find((d) => d.id === id)?.name ?? id
  if (field === 'scheduleId') return db.schedules.find((d) => d.id === id)?.name ?? id
  if (field === 'managerId') {
    const m = db.employees.find((e) => e.id === id)
    return m ? `${m.firstName} ${m.lastName}` : id
  }
  return SENSITIVE.has(field) ? '•••' : id
}

export function createEmployee(actor: Account, input: EmployeeInput, opts: { allowDuplicate?: boolean } = {}): Employee {
  requirePermission(actor, 'people.manage')
  const db = store.db
  const errors = validateEmployee(db, input)
  if (Object.keys(errors).length) throw new ServiceError(Object.values(errors)[0] as string)
  const dups = findDuplicates(input, db.employees)
  if (dups.length && !opts.allowDuplicate) throw new ServiceError(`Possible duplicate of ${dups[0]?.employee.firstName} ${dups[0]?.employee.lastName} (${dups[0]?.reasons.join(', ')}).`, 'conflict')
  const now = nowISO()
  const status: EmployeeStatus = input.joinDate > today() ? 'pre_boarding' : 'active'
  const employee: Employee = {
    id: createId('emp'),
    employeeNo: input.employeeNo?.trim() || nextEmployeeNo(db),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    preferredName: input.preferredName?.trim() || null,
    workEmail: normalizeEmail(input.workEmail),
    personalEmail: input.personalEmail ? normalizeEmail(input.personalEmail) : null,
    phone: input.phone?.trim() || null,
    title: input.title.trim(),
    departmentId: input.departmentId,
    teamId: input.teamId || null,
    managerId: input.managerId || null,
    employmentTypeId: input.employmentTypeId,
    locationId: input.locationId,
    scheduleId: input.scheduleId,
    joinDate: input.joinDate,
    endDate: null,
    status,
    dateOfBirth: input.dateOfBirth || null,
    emergencyContact: null,
    documents: [],
    equipment: [],
    history: [{ id: createId('chg'), at: now, by: actor.id, field: 'Record', from: null, to: 'Created' }],
    createdAt: now,
  }
  queueEvent({ type: 'employee.created', entity: { type: 'employee', id: employee.id }, employeeId: employee.id, actorId: actor.id, data: { 'employee.status': status } })
  if (status === 'active') queueEvent({ type: 'employee.joined', entity: { type: 'employee', id: employee.id }, employeeId: employee.id, actorId: actor.id, data: {} })
  transact((d) => withAudit({ ...d, employees: [...d.employees, employee] }, actor.id, 'employee.created', { type: 'employee', id: employee.id }, `Created ${employee.firstName} ${employee.lastName}`))
  return employee
}

export type EmployeePatch = Partial<Omit<Employee, 'id' | 'documents' | 'equipment' | 'history' | 'createdAt'>>

/** Applies a validated patch and records each changed field in the history. Internal — callers check permission. */
export function applyEmployeePatch(db: Database, employeeId: ID, patch: EmployeePatch, actorId: ID | null, note?: string): Database {
  const current = db.employees.find((e) => e.id === employeeId)
  if (!current) throw new ServiceError('Employee not found.', 'not_found')
  const changes: ChangeEntry[] = []
  for (const [key, value] of Object.entries(patch) as Array<[keyof Employee, unknown]>) {
    const before = current[key]
    if (JSON.stringify(before ?? null) === JSON.stringify(value ?? null)) continue
    if (key === 'emergencyContact') {
      changes.push({ id: createId('chg'), at: nowISO(), by: actorId, field: 'Emergency contact', from: before ? '•••' : null, to: value ? '•••' : null, note })
      continue
    }
    changes.push({ id: createId('chg'), at: nowISO(), by: actorId, field: LABELS[key] ?? key, from: display(db, key, before), to: display(db, key, value), note })
  }
  if (!changes.length) return db
  if (patch.departmentId && patch.departmentId !== current.departmentId) {
    queueEvent({
      type: 'employee.department_changed',
      entity: { type: 'employee', id: employeeId },
      employeeId,
      actorId,
      data: { 'department.from': current.departmentId, department: db.departments.find((d) => d.id === patch.departmentId)?.name ?? '' },
    })
  }
  return {
    ...db,
    employees: replaceById(db.employees, employeeId, (e) => ({ ...e, ...patch, history: [...changes, ...e.history] })),
  }
}

export function updateEmployee(actor: Account, employeeId: ID, input: EmployeeInput): void {
  requirePermission(actor, 'people.manage', 'Only HR can edit employee records. Employees can request changes through the service desk.')
  const db = store.db
  const errors = validateEmployee(db, input, employeeId)
  if (Object.keys(errors).length) throw new ServiceError(Object.values(errors)[0] as string)
  const patch: EmployeePatch = {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    preferredName: input.preferredName?.trim() || null,
    workEmail: normalizeEmail(input.workEmail),
    personalEmail: input.personalEmail ? normalizeEmail(input.personalEmail) : null,
    phone: input.phone?.trim() || null,
    title: input.title.trim(),
    departmentId: input.departmentId,
    teamId: input.teamId || null,
    managerId: input.managerId || null,
    employmentTypeId: input.employmentTypeId,
    locationId: input.locationId,
    scheduleId: input.scheduleId,
    joinDate: input.joinDate,
    dateOfBirth: input.dateOfBirth || null,
  }
  transact((d) => withAudit(applyEmployeePatch(d, employeeId, patch, actor.id), actor.id, 'employee.updated', { type: 'employee', id: employeeId }, `Updated ${input.firstName} ${input.lastName}`))
}

export function setEmergencyContact(actor: Account, employeeId: ID, contact: Employee['emergencyContact']) {
  if (!can(actor, 'people.manage')) throw new ServiceError('Only HR can change emergency contacts directly.', 'forbidden')
  transact((d) => withAudit(applyEmployeePatch(d, employeeId, { emergencyContact: contact }, actor.id), actor.id, 'employee.emergency_contact', { type: 'employee', id: employeeId }, 'Emergency contact updated'))
}

/** Marks an employee as leaving (offboarding) or terminated. Records are retained, not deleted. */
export function deactivateEmployee(actor: Account, employeeId: ID, endDate: string, reason: string) {
  requirePermission(actor, 'people.manage')
  if (!isValidISODate(endDate)) throw new ServiceError('Enter a valid last working day.')
  if (!reason.trim()) throw new ServiceError('Give a reason for the record.')
  const status: EmployeeStatus = endDate > today() ? 'offboarding' : 'terminated'
  transact((d) => {
    let next = applyEmployeePatch(d, employeeId, { status, endDate }, actor.id, reason.trim())
    // Accounts of people who have left are suspended.
    if (status === 'terminated') next = { ...next, accounts: next.accounts.map((a) => (a.employeeId === employeeId ? { ...a, status: 'suspended' } : a)) }
    return withAudit(next, actor.id, 'employee.deactivated', { type: 'employee', id: employeeId }, `Marked as ${status} (last day ${endDate})`)
  })
}

/**
 * Retention: after the retention period, personal (non-work) data of former employees is removed.
 * The work record (name, role, dates, history) is kept for legal and reporting purposes.
 */
export function erasePersonalData(actor: Account, employeeId: ID) {
  requirePermission(actor, 'accounts.manage', 'Only organization administrators can erase personal data.')
  const e = store.db.employees.find((x) => x.id === employeeId)
  if (!e) throw new ServiceError('Employee not found.', 'not_found')
  if (e.status !== 'terminated') throw new ServiceError('Personal data can only be erased for former employees.')
  transact((d) =>
    withAudit(
      { ...d, employees: replaceById(d.employees, employeeId, (x) => ({ ...x, personalEmail: null, phone: null, dateOfBirth: null, emergencyContact: null, history: [{ id: createId('chg'), at: nowISO(), by: actor.id, field: 'Personal data', from: null, to: 'Erased (retention)' }, ...x.history] })) },
      actor.id,
      'employee.personal_data_erased',
      { type: 'employee', id: employeeId },
      'Personal data erased under the retention policy',
    ),
  )
}

export async function addDocument(actor: Account, employeeId: ID, file: File, kind: Employee['documents'][number]['kind'], expiresOn: string | null) {
  requirePermission(actor, 'people.manage')
  const stored = await files.upload(file, `employees/${employeeId}`)
  const doc = { id: createId('doc'), name: stored.name, kind, fileId: stored.fileId, size: stored.size, uploadedAt: nowISO(), uploadedBy: actor.id, expiresOn: expiresOn || null }
  transact((d) => withAudit({ ...d, employees: replaceById(d.employees, employeeId, (e) => ({ ...e, documents: [doc, ...e.documents] })) }, actor.id, 'employee.document_added', { type: 'employee', id: employeeId }, `Document added: ${doc.name}`))
  return doc
}

export async function removeDocument(actor: Account, employeeId: ID, documentId: ID) {
  requirePermission(actor, 'people.manage')
  const doc = store.db.employees.find((e) => e.id === employeeId)?.documents.find((x) => x.id === documentId)
  if (!doc) throw new ServiceError('Document not found.', 'not_found')
  if (doc.fileId) await files.remove(doc.fileId).catch(() => undefined)
  transact((d) => withAudit({ ...d, employees: replaceById(d.employees, employeeId, (e) => ({ ...e, documents: e.documents.filter((x) => x.id !== documentId) })) }, actor.id, 'employee.document_removed', { type: 'employee', id: employeeId }, `Document removed: ${doc.name}`))
}

export function assignEquipment(actor: Account, employeeId: ID, item: string, assetTag: string) {
  requirePermission(actor, 'people.manage')
  if (!item.trim() || !assetTag.trim()) throw new ServiceError('Enter the item and its asset tag.')
  if (store.db.employees.some((e) => e.equipment.some((q) => q.assetTag === assetTag.trim() && !q.returnedOn))) throw new ServiceError('That asset is already assigned to someone.', 'conflict')
  const eq = { id: createId('eq'), item: item.trim(), assetTag: assetTag.trim(), assignedOn: today(), returnedOn: null }
  transact((d) => withAudit({ ...d, employees: replaceById(d.employees, employeeId, (e) => ({ ...e, equipment: [eq, ...e.equipment] })) }, actor.id, 'employee.equipment_assigned', { type: 'employee', id: employeeId }, `${eq.item} (${eq.assetTag}) assigned`))
}

export function returnEquipment(actor: Account, employeeId: ID, equipmentId: ID) {
  requirePermission(actor, 'people.manage')
  transact((d) =>
    withAudit(
      { ...d, employees: replaceById(d.employees, employeeId, (e) => ({ ...e, equipment: e.equipment.map((q) => (q.id === equipmentId ? { ...q, returnedOn: today() } : q)) })) },
      actor.id,
      'employee.equipment_returned',
      { type: 'employee', id: employeeId },
      'Equipment returned',
    ),
  )
}

// ------------------------------------------------------------------ CSV import
export const IMPORT_COLUMNS = ['first_name', 'last_name', 'work_email', 'title', 'department', 'location', 'employment_type', 'schedule', 'join_date', 'manager_email', 'personal_email', 'phone', 'employee_id'] as const

export interface ImportPreview {
  valid: Array<{ line: number; input: EmployeeInput }>
  errors: Array<{ line: number; messages: string[] }>
}

/** Validates CSV rows (header row first). Nothing is saved until `commitImport`. */
export function previewImport(db: Database, rows: string[][]): ImportPreview {
  const [header, ...body] = rows
  const cols = (header ?? []).map((h) => h.trim().toLowerCase())
  const missing = ['first_name', 'last_name', 'work_email', 'title', 'department', 'location', 'employment_type', 'join_date'].filter((c) => !cols.includes(c))
  if (missing.length) return { valid: [], errors: [{ line: 1, messages: [`Missing columns: ${missing.join(', ')}`] }] }
  const get = (r: string[], c: string) => (r[cols.indexOf(c)] ?? '').trim()
  const byName = <T extends { id: string; name: string }>(list: readonly T[], v: string) => list.find((x) => x.name.toLowerCase() === v.toLowerCase())?.id ?? ''
  const preview: ImportPreview = { valid: [], errors: [] }
  const seen = new Set<string>()
  body.forEach((r, i) => {
    const line = i + 2
    const input: EmployeeInput = {
      firstName: get(r, 'first_name'),
      lastName: get(r, 'last_name'),
      workEmail: get(r, 'work_email'),
      title: get(r, 'title'),
      departmentId: byName(db.departments, get(r, 'department')),
      locationId: byName(db.locations, get(r, 'location')),
      employmentTypeId: byName(db.employmentTypes, get(r, 'employment_type')),
      scheduleId: byName(db.schedules, get(r, 'schedule')) || db.schedules[0]?.id || '',
      joinDate: get(r, 'join_date'),
      managerId: db.employees.find((e) => normalizeEmail(e.workEmail) === normalizeEmail(get(r, 'manager_email')))?.id ?? null,
      personalEmail: get(r, 'personal_email') || null,
      phone: get(r, 'phone') || null,
      employeeNo: get(r, 'employee_id') || undefined,
    }
    const errs = Object.values(validateEmployee(db, input))
    if (get(r, 'manager_email') && !input.managerId) errs.push('Manager email does not match an employee.')
    const key = normalizeEmail(input.workEmail)
    if (seen.has(key)) errs.push('Duplicate work email within the file.')
    seen.add(key)
    if (errs.length) preview.errors.push({ line, messages: errs })
    else preview.valid.push({ line, input })
  })
  return preview
}

export function commitImport(actor: Account, preview: ImportPreview): { imported: number; failed: ImportPreview['errors'] } {
  requirePermission(actor, 'people.manage')
  let count = 0
  const failed: ImportPreview['errors'] = []
  for (const row of preview.valid) {
    try {
      createEmployee(actor, row.input, { allowDuplicate: false })
      count++
    } catch (error) {
      // e.g. a possible duplicate found only now; the row is reported, the rest continue.
      failed.push({ line: row.line, messages: [error instanceof Error ? error.message : 'Could not import'] })
    }
  }
  const skipped = preview.errors.length + failed.length
  transact((d) => withNotifications(d, [{ accountId: actor.id, title: `Imported ${count} employee record(s)`, body: skipped ? `${skipped} row(s) were skipped because of errors.` : 'All rows imported.', link: '/people', kind: 'system' }]))
  return { imported: count, failed }
}
