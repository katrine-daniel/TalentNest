import { beforeEach, describe, expect, it } from 'vitest'
import { addDays, today } from '@/lib/dates'
import { buildInbox } from '@/domain/inbox'
import { leaveBalance } from '@/domain/leave'
import { answerDemo } from '@/domain/assistant'
import { requestMetrics, defaultRange } from '@/domain/analytics'
import { store } from '@/services/store'
import { createEmployee, previewImport, updateEmployee } from '@/services/employees'
import { addComment, changeStatus, createRequest, decideRequest, visibleRequests } from '@/services/requests'
import { cancelLeave, decideLeave, requestLeave } from '@/services/leave'
import { attachTaskDocument, completeTask, startLifecycle } from '@/services/lifecycle'
import { acknowledgePolicy, publishPolicy, savePolicyDraft, visiblePolicies } from '@/services/policies'
import { executeRule, previewRule, runScheduledChecks, saveRule } from '@/services/automation'
import { visiblePolicies as vp } from '@/services/policies'
import { account, EMPLOYEE, freshDemo, HR, HR_ADMIN, MANAGER, ORG_ADMIN } from './helpers'

beforeEach(async () => {
  await freshDemo()
})

const newHire = (overrides = {}) => ({
  firstName: 'Test',
  lastName: 'Person',
  workEmail: `test.${Math.random().toString(36).slice(2)}@harborpine.example`,
  title: 'Receptionist',
  departmentId: 'dep_front',
  managerId: 'emp_007',
  employmentTypeId: 'et_ft',
  locationId: 'loc_harbor',
  scheduleId: 'sch_shift',
  joinDate: addDays(today(), 14),
  ...overrides,
})

describe('employee records', () => {
  it('only HR can create records, and duplicates are blocked', () => {
    expect(() => createEmployee(account(EMPLOYEE), newHire())).toThrow(/permission/)
    const e = createEmployee(account(HR), newHire())
    expect(e.status).toBe('pre_boarding')
    expect(() => createEmployee(account(HR), newHire({ workEmail: e.workEmail }))).toThrow(/already uses this work email/)
  })

  it('records field-level history and blocks reporting loops', () => {
    const samuel = store.db.employees.find((x) => x.id === 'emp_008')!
    const input = { ...samuel, managerId: 'emp_008', teamId: samuel.teamId } as never
    expect(() => updateEmployee(account(HR), 'emp_008', input)).toThrow(/manage themselves/)
    updateEmployee(account(HR), 'emp_008', { ...samuel, title: 'Senior Guest Services Agent' } as never)
    const after = store.db.employees.find((x) => x.id === 'emp_008')!
    expect(after.history[0]).toMatchObject({ field: 'Job title', from: 'Guest Services Agent', to: 'Senior Guest Services Agent' })
  })

  it('validates CSV imports row by row', () => {
    const preview = previewImport(store.db, [
      ['first_name', 'last_name', 'work_email', 'title', 'department', 'location', 'employment_type', 'join_date'],
      ['Ok', 'Row', 'ok.row@harborpine.example', 'Agent', 'Front Office', 'Harbor Hotel', 'Full-time', '2026-01-05'],
      ['Bad', 'Row', 'not-an-email', 'Agent', 'Nowhere', 'Harbor Hotel', 'Full-time', '2026-13-40'],
    ])
    expect(preview.valid).toHaveLength(1)
    expect(preview.errors[0]?.line).toBe(3)
    expect(preview.errors[0]?.messages.length).toBeGreaterThanOrEqual(3)
  })

  it('starts onboarding automatically for a future joiner (automation rule)', () => {
    const e = createEmployee(account(HR), newHire())
    const c = store.db.lifecycleCases.find((x) => x.employeeId === e.id && x.kind === 'onboarding')
    expect(c).toBeDefined()
    expect(c?.templateId).toBe('tpl_onb_hotel') // most specific: Harbor Hotel
    expect(store.db.runs.find((r) => r.ruleId === 'rule_onboard')?.status).toBe('succeeded')
  })
})

describe('service requests', () => {
  it('hides internal notes from the employee', async () => {
    const r = await createRequest(account(EMPLOYEE), { typeId: 'rt_payroll', subject: 'Payslip question', description: 'Why is my net pay lower?' })
    addComment(account(HR), r.id, 'Check the tax table change', true)
    addComment(account(HR), r.id, 'Looking into it', false)
    const asEmployee = visibleRequests(store.db, account(EMPLOYEE)).find((x) => x.id === r.id)!
    expect(asEmployee.comments.map((c) => c.text)).toEqual(['Looking into it'])
    expect(() => addComment(account(EMPLOYEE), r.id, 'x', true)).toThrow(/Only HR/)
  })

  it('enforces status transitions and requires a resolution note', async () => {
    const r = await createRequest(account(EMPLOYEE), { typeId: 'rt_letter', subject: 'Letter', description: '' })
    expect(() => changeStatus(account(EMPLOYEE), r.id, 'resolved')).toThrow()
    expect(() => changeStatus(account(HR), r.id, 'resolved')).toThrow(/resolution/)
    changeStatus(account(HR), r.id, 'resolved', 'Letter sent by email')
    expect(store.db.requests.find((x) => x.id === r.id)?.status).toBe('resolved')
  })

  it('applies approved record updates to the employee record', async () => {
    const r = await createRequest(account(EMPLOYEE), { typeId: 'rt_update', subject: 'New phone', description: '', proposedChanges: { phone: '+351 91 000 1111' } })
    expect(r.status).toBe('pending_approval')
    expect(() => decideRequest(account(EMPLOYEE), r.id, 'approved', '')).toThrow(/not an approver/)
    decideRequest(account(HR), r.id, 'approved', '')
    expect(store.db.employees.find((e) => e.id === 'emp_008')?.phone).toBe('+351 91 000 1111')
    expect(store.db.requests.find((x) => x.id === r.id)?.status).toBe('resolved')
  })

  it('a colleague cannot see someone else’s request', async () => {
    const r = await createRequest(account(EMPLOYEE), { typeId: 'rt_benefits', subject: 'Private', description: '' })
    expect(visibleRequests(store.db, account('acc_emp_009')).some((x) => x.id === r.id)).toBe(false)
    expect(visibleRequests(store.db, account(MANAGER)).some((x) => x.id === r.id)).toBe(true) // their manager
  })
})

describe('leave', () => {
  it('reserves pending days, blocks overlaps and updates the balance on approval', () => {
    const year = new Date().getFullYear()
    const before = leaveBalance(store.db, 'emp_008', 'lt_annual', year)!
    const start = addDays(today(), 21)
    const l = requestLeave(account(EMPLOYEE), { employeeId: 'emp_008', leaveTypeId: 'lt_annual', startDate: start, endDate: addDays(start, 6), halfDayStart: false, halfDayEnd: false, reason: 'Trip' })
    const pending = leaveBalance(store.db, 'emp_008', 'lt_annual', new Date(start).getFullYear())!
    if (addDays(start, 6).slice(0, 4) === String(year)) expect(pending.pending).toBe(before.pending + l.days)
    expect(() => requestLeave(account(EMPLOYEE), { employeeId: 'emp_008', leaveTypeId: 'lt_annual', startDate: start, endDate: start, halfDayStart: false, halfDayEnd: false, reason: '' })).toThrow(/overlap/)
    expect(buildInbox(store.db, account(MANAGER)).some((i) => i.key === `leave:${l.id}`)).toBe(true)
    decideLeave(account(MANAGER), l.id, 'approved', '')
    expect(store.db.leaveRequests.find((x) => x.id === l.id)?.status).toBe('approved')
    expect(buildInbox(store.db, account(MANAGER)).some((i) => i.key === `leave:${l.id}`)).toBe(false)
  })

  it('refuses requests beyond the available balance', () => {
    const next = new Date().getFullYear() + 1
    expect(() => requestLeave(account(EMPLOYEE), { employeeId: 'emp_008', leaveTypeId: 'lt_annual', startDate: `${next}-02-01`, endDate: `${next}-04-30`, halfDayStart: false, halfDayEnd: false, reason: '' })).toThrow(/Not enough/)
  })

  it('rejects malformed dates', () => {
    expect(() => requestLeave(account(EMPLOYEE), { employeeId: 'emp_008', leaveTypeId: 'lt_annual', startDate: '-02-01', endDate: '2026-02-31', halfDayStart: false, halfDayEnd: false, reason: '' })).toThrow(/valid/)
  })

  it('only allows employees to cancel approved leave before it starts', () => {
    const past = store.db.leaveRequests.find((l) => l.employeeId === 'emp_008' && l.status === 'approved' && l.startDate < today())
    if (past) expect(() => cancelLeave(account(EMPLOYEE), past.id, '')).toThrow(/started/)
    const pending = store.db.leaveRequests.find((l) => l.employeeId === 'emp_008' && l.status === 'pending')!
    cancelLeave(account(EMPLOYEE), pending.id, 'Plans changed')
    expect(store.db.leaveRequests.find((l) => l.id === pending.id)?.status).toBe('cancelled')
  })

  it('employees cannot request leave for others', () => {
    expect(() => requestLeave(account(EMPLOYEE), { employeeId: 'emp_009', leaveTypeId: 'lt_annual', startDate: addDays(today(), 5), endDate: addDays(today(), 5), halfDayStart: false, halfDayEnd: false, reason: '' })).toThrow(/yourself/)
  })
})

describe('onboarding and offboarding', () => {
  it('requires a document before completing a document task and confirmation for external actions', async () => {
    const e = createEmployee(account(HR), newHire({ locationId: 'loc_hq', departmentId: 'dep_sales', managerId: 'emp_026', scheduleId: 'sch_office' }))
    const c = store.db.lifecycleCases.find((x) => x.employeeId === e.id)!
    const docTask = c.tasks.find((t) => t.requiresDocument)!
    expect(() => completeTask(account(HR), c.id, docTask.id, '')).toThrow(/Upload/)
    await attachTaskDocument(account(HR), c.id, docTask.id, new File(['%PDF-1.4'], 'id.pdf', { type: 'application/pdf' }))
    completeTask(account(HR), c.id, docTask.id, '')
    const ext = c.tasks.find((t) => t.externalAction)!
    expect(() => completeTask(account(HR), c.id, ext.id, '')).toThrow(/external system/)
    const it = store.db.lifecycleCases.find((x) => x.id === c.id)!
    expect(it.tasks.find((t) => t.id === docTask.id)?.status).toBe('done')
  })

  it('prevents a second active onboarding for the same person', () => {
    const e = createEmployee(account(HR), newHire())
    expect(() => startLifecycle(account(HR), 'onboarding', e.id, null)).toThrow(/already has an active/)
  })
})

describe('policies', () => {
  it('keeps the published version in force while a new draft is edited, then requires re-acknowledgment', () => {
    const p = store.db.policies.find((x) => x.id === 'pol_leave')!
    const v = p.versions[p.versions.length - 1]!
    savePolicyDraft(account(HR_ADMIN), p.id, { title: p.title, category: p.category, tags: p.tags, summary: p.summary, body: `${v.body}\n\n## Peak periods\nLeave may be limited in July and August.`, effectiveDate: addDays(today(), 10), changeNote: 'Peak periods', requiresAcknowledgment: true, audienceDepartmentIds: null, reviewBy: null })
    expect(store.db.policies.find((x) => x.id === p.id)?.publishedVersion).toBe(2)
    acknowledgePolicy(account(EMPLOYEE), p.id)
    publishPolicy(account(HR_ADMIN), p.id)
    expect(store.db.policies.find((x) => x.id === p.id)?.publishedVersion).toBe(3)
    expect(buildInbox(store.db, account(EMPLOYEE)).some((i) => i.key === `ack:${p.id}:3`)).toBe(true)
  })

  it('hides drafts and out-of-audience policies from employees', () => {
    const titles = visiblePolicies(store.db, account(EMPLOYEE)).map((p) => p.id)
    expect(titles).not.toContain('pol_expenses') // draft
    expect(titles).not.toContain('pol_remote') // office audience only
    expect(visiblePolicies(store.db, account(HR_ADMIN)).map((p) => p.id)).toContain('pol_expenses')
  })
})

describe('automation', () => {
  it('previews without changing data and executes once per record', () => {
    const rule = store.db.rules.find((r) => r.id === 'rule_dept_change')!
    const event = { type: 'employee.department_changed' as const, entity: { type: 'employee' as const, id: 'emp_008' }, employeeId: 'emp_008', actorId: null, data: { department: 'Housekeeping' } }
    const tasksBefore = store.db.tasks.length
    const preview = previewRule(rule, event)
    expect(preview.matches).toBe(true)
    expect(preview.run?.status).toBe('test')
    expect(store.db.tasks.length).toBe(tasksBefore)
    executeRule(rule, event)
    executeRule(rule, event)
    expect(store.db.tasks.filter((t) => t.title.includes('Samuel Okoye')).length).toBe(1)
  })

  it('records email actions as skipped when no provider is configured', () => {
    const rule = saveRule(account(HR_ADMIN), { name: 'Email test', description: '', trigger: 'leave.submitted', conditions: [], actions: [{ type: 'send_email', to: 'manager', subject: 'Leave', body: '{employee} requested leave' }], enabled: true, maxAttempts: 1 })
    requestLeave(account(EMPLOYEE), { employeeId: 'emp_008', leaveTypeId: 'lt_sick', startDate: addDays(today(), 3), endDate: addDays(today(), 5), halfDayStart: false, halfDayEnd: false, reason: '' })
    const run = store.db.runs.find((r) => r.ruleId === rule.id)!
    expect(run.results[0]?.outcome).toBe('skipped')
    expect(run.status).toBe('succeeded')
  })

  it('only automation managers can save rules', () => {
    expect(() => saveRule(account(HR), { name: 'x', description: '', trigger: 'schedule.daily', conditions: [], actions: [{ type: 'notify', to: 'hr_queue', title: 't', message: 'm' }], enabled: true, maxAttempts: 1 })).toThrow(/automation managers/)
  })

  it('scheduled checks escalate overdue requests once', () => {
    const first = runScheduledChecks()
    expect(first.events).toBeGreaterThan(0)
    const escalated = store.db.requests.filter((r) => r.escalatedAt).length
    runScheduledChecks()
    expect(store.db.requests.filter((r) => r.escalatedAt).length).toBe(escalated)
  })
})

describe('assistant (demo engine)', () => {
  it('answers policy questions with a cited source and version', () => {
    const a = answerDemo(store.db, account(EMPLOYEE), 'What is our annual leave policy carry over?', { policies: vp(store.db, account(EMPLOYEE)) })
    expect(a.text).toMatch(/Annual Leave Policy/)
    expect(a.citations[0]).toMatchObject({ kind: 'policy', detail: expect.stringMatching(/^v2 · effective/) })
  })

  it('does not answer from policies the user cannot see, and says so', () => {
    const a = answerDemo(store.db, account(EMPLOYEE), 'travel expenses reimbursement rules', { policies: vp(store.db, account(EMPLOYEE)) })
    expect(a.citations).toHaveLength(0)
    expect(a.text).toMatch(/couldn't find/)
  })

  it('lists approvals only for the asking user', () => {
    const mgr = answerDemo(store.db, account(MANAGER), 'Show me requests awaiting my approval', { policies: [] })
    expect(mgr.text).toMatch(/waiting for your decision/)
    const emp = answerDemo(store.db, account(EMPLOYEE), 'Show me requests awaiting my approval', { policies: [] })
    expect(emp.text).toMatch(/Nothing is waiting/)
  })

  it('points to the right request type for "how do I" questions', () => {
    const a = answerDemo(store.db, account(EMPLOYEE), 'How do I request a workplace equipment replacement?', { policies: vp(store.db, account(EMPLOYEE)) })
    expect(a.actions[0]?.href).toBe('/requests/new?type=rt_equipment')
    expect(a.actions[0]?.requiresConfirmation).toBe(true)
  })
})

describe('analytics', () => {
  it('counts open and overdue requests from records', () => {
    const m = requestMetrics(store.db, defaultRange())
    expect(m.open).toBe(store.db.requests.filter((r) => !['resolved', 'closed', 'rejected', 'cancelled'].includes(r.status)).length)
    expect(m.overdue).toBeLessThanOrEqual(m.open)
  })

  it('org admin role exists for settings', () => {
    expect(account(ORG_ADMIN).role).toBe('org_admin')
  })
})
