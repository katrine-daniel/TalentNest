import { beforeEach, describe, expect, it } from 'vitest'
import { addDays, today } from '@/lib/dates'
import { isRecordQuestion } from '@/domain/assistant'
import { store } from '@/services/store'
import { joinEmployee, splitEmployee, diff } from '@/services/supabaseDriver'
import { isSafeHref } from '@/services/assistant'
import { executeRule, runScheduledChecks, saveRule, setAutomationSession } from '@/services/automation'
import { createRequest } from '@/services/requests'
import { completeTask } from '@/services/lifecycle'
import { account, EMPLOYEE, freshDemo, HR, HR_ADMIN, MANAGER } from './helpers'

beforeEach(async () => {
  await freshDemo()
  setAutomationSession(null)
})

describe('Supabase record splitting', () => {
  it('keeps personal fields and employment records out of the directory row', () => {
    const e = store.db.employees.find((x) => x.id === 'emp_008')!
    const { pub, priv, records } = splitEmployee(e)
    expect(pub).not.toHaveProperty('phone')
    expect(pub).not.toHaveProperty('dateOfBirth')
    expect(pub).not.toHaveProperty('documents')
    expect(pub).not.toHaveProperty('id')
    expect(priv).toMatchObject({ phone: e.phone, dateOfBirth: e.dateOfBirth })
    expect(records).toMatchObject({ documents: e.documents })
    expect(joinEmployee(e.id, pub, priv, records)).toEqual(e)
  })

  it('fills unreadable parts with empty values rather than failing', () => {
    const e = store.db.employees.find((x) => x.id === 'emp_008')!
    const joined = joinEmployee(e.id, splitEmployee(e).pub, undefined, undefined)
    expect(joined.phone).toBeNull()
    expect(joined.documents).toEqual([])
    expect(joined.firstName).toBe(e.firstName)
  })

  it('diffs collections into upserts and deletes', () => {
    const a = [
      { id: '1', v: 1 },
      { id: '2', v: 2 },
    ]
    const b = [
      { id: '1', v: 1 },
      { id: '3', v: 3 },
    ]
    expect(diff(a, b)).toEqual({ upserts: [{ id: '3', v: 3 }], deletes: ['2'] })
  })
})

describe('assistant safety', () => {
  it('allows only same-app links from the AI service', () => {
    expect(isSafeHref('/policies/pol_leave')).toBe(true)
    expect(isSafeHref('//evil.example')).toBe(false)
    expect(isSafeHref('/\\evil.example')).toBe(false)
    expect(isSafeHref('https://evil.example')).toBe(false)
    expect(isSafeHref('javascript:alert(1)')).toBe(false)
  })

  it('keeps record questions on the local, permission-filtered engine', () => {
    expect(isRecordQuestion('Show me requests awaiting my approval')).toBe(true)
    expect(isRecordQuestion('How many days of leave do I have left?')).toBe(true)
    expect(isRecordQuestion('What is the remote work policy?')).toBe(false)
  })
})

describe('automation permissions', () => {
  it('defers privileged actions triggered by an employee until an HR session retries them', async () => {
    const rule = saveRule(account(HR_ADMIN), {
      name: 'Move to on-leave',
      description: '',
      trigger: 'request.submitted',
      conditions: [{ field: 'request.category', operator: 'equals', value: 'benefits' }],
      actions: [{ type: 'update_employee', field: 'status', value: 'on_leave' }],
      enabled: true,
      maxAttempts: 3,
    })
    await createRequest(account(EMPLOYEE), { typeId: 'rt_benefits', subject: 'Question', description: '' })
    const run = store.db.runs.find((r) => r.ruleId === rule.id)!
    expect(run.status).toBe('failed')
    expect(run.error).toMatch(/people.manage/)
    expect(store.db.employees.find((e) => e.id === 'emp_008')?.status).toBe('active')

    setAutomationSession(HR)
    const { retries } = runScheduledChecks()
    expect(retries).toBeGreaterThan(0)
    expect(store.db.employees.find((e) => e.id === 'emp_008')?.status).toBe('on_leave')
  })

  it('runs non-privileged actions for any member', () => {
    const rule = store.db.rules.find((r) => r.id === 'rule_dept_change')!
    const run = executeRule(rule, {
      type: 'employee.department_changed',
      entity: { type: 'employee', id: 'emp_008' },
      employeeId: 'emp_008',
      actorId: EMPLOYEE,
      data: { department: 'Ops' },
    })
    expect(run.status).toBe('succeeded')
  })
})

describe('lifecycle status changes', () => {
  it('lets the scheduler move people whose last day has passed to former employees', () => {
    const leaver = store.db.employees.find((e) => e.status === 'offboarding')!
    store.commit((d) => ({ ...d, employees: d.employees.map((e) => (e.id === leaver.id ? { ...e, endDate: addDays(today(), -1) } : e)) }))
    setAutomationSession(HR)
    runScheduledChecks()
    expect(store.db.employees.find((e) => e.id === leaver.id)?.status).toBe('terminated')
    expect(store.db.accounts.find((a) => a.employeeId === leaver.id)?.status).toBe('suspended')
  })

  it('does not change the employee record when a non-HR assignee completes the last task', () => {
    const c = store.db.lifecycleCases.find((x) => x.id === 'lc_2')!
    // Leave one manager-owned task open and complete everything else as HR.
    const managerTask = c.tasks.find((t) => t.owner === 'manager')!
    store.commit((d) => ({
      ...d,
      lifecycleCases: d.lifecycleCases.map((x) =>
        x.id === c.id
          ? {
              ...x,
              tasks: x.tasks.map((t) => (t.id === managerTask.id ? { ...t, status: 'open' as const, assigneeId: MANAGER } : { ...t, status: 'done' as const })),
            }
          : x,
      ),
      employees: d.employees.map((e) => (e.id === c.employeeId ? { ...e, joinDate: addDays(today(), -1), status: 'pre_boarding' as const } : e)),
    }))
    completeTask(account(MANAGER), c.id, managerTask.id, '')
    expect(store.db.lifecycleCases.find((x) => x.id === c.id)?.status).toBe('completed')
    expect(store.db.employees.find((e) => e.id === c.employeeId)?.status).toBe('pre_boarding')
  })
})
