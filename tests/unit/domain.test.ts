import { describe, expect, it } from 'vitest'
import { countLeaveDays, entitlement } from '@/domain/leave'
import { buildSteps, canDecide, decide, delegate } from '@/domain/approvals'
import { addBusinessHours, isOverdue } from '@/domain/sla'
import { conditionHolds, dedupeKey, interpolate, validateRule } from '@/domain/automation'
import { median, rate } from '@/domain/analytics'
import { canViewSensitive, reportIds } from '@/domain/permissions'
import { parseCSV, toCSV } from '@/lib/csv'
import { createSeed } from '@/data/seed'
import type { LeaveType } from '@/domain/types'

const weekdays = { workingDays: [1, 2, 3, 4, 5] }

describe('leave day counting', () => {
  it('counts schedule working days and skips holidays', () => {
    // 2026-06-01 is a Monday; Wednesday 06-03 is a holiday.
    expect(countLeaveDays({ startDate: '2026-06-01', endDate: '2026-06-07', halfDayStart: false, halfDayEnd: false }, weekdays, new Set(['2026-06-03']))).toBe(4)
  })

  it('uses the employee’s own working days (shift pattern Tue–Sat)', () => {
    expect(countLeaveDays({ startDate: '2026-06-01', endDate: '2026-06-07', halfDayStart: false, halfDayEnd: false }, { workingDays: [2, 3, 4, 5, 6] }, new Set())).toBe(5)
  })

  it('subtracts half days, never below zero', () => {
    expect(countLeaveDays({ startDate: '2026-06-01', endDate: '2026-06-02', halfDayStart: true, halfDayEnd: true }, weekdays, new Set())).toBe(1)
    expect(countLeaveDays({ startDate: '2026-06-01', endDate: '2026-06-01', halfDayStart: true, halfDayEnd: true }, weekdays, new Set())).toBe(0.5)
    expect(countLeaveDays({ startDate: '2026-06-06', endDate: '2026-06-07', halfDayStart: true, halfDayEnd: false }, weekdays, new Set())).toBe(0)
  })

  it('pro-rates entitlement by FTE and joining month', () => {
    const t = { tracked: true, annualDays: 22 } as LeaveType
    expect(entitlement(t, { joinDate: '2020-02-01', employmentTypeId: 'x' }, 1, 2026)).toBe(22)
    expect(entitlement(t, { joinDate: '2020-02-01', employmentTypeId: 'x' }, 0.5, 2026)).toBe(11)
    expect(entitlement(t, { joinDate: '2026-07-10', employmentTypeId: 'x' }, 1, 2026)).toBe(11) // 6 of 12 months
    expect(entitlement(t, { joinDate: '2027-01-01', employmentTypeId: 'x' }, 1, 2026)).toBe(0)
  })
})

describe('approval chains', () => {
  const db = createSeed(new Date('2026-05-04T10:00:00'))
  const samuel = db.employees.find((e) => e.firstName === 'Samuel')!
  const chain = [
    { id: 'm', name: 'Manager', rule: 'manager' as const },
    { id: 'h', name: 'HR', rule: 'hr' as const },
  ]

  it('resolves the manager, then HR, and runs steps in order', () => {
    const steps = buildSteps(db, chain, samuel, 'acc_emp_008')
    expect(steps[0]?.approverIds).toEqual(['acc_emp_007'])
    expect(canDecide(steps, 'acc_emp_002')).toBe(false) // HR step not active yet
    const r1 = decide(steps, 'acc_emp_007', 'approved', '', 'now')
    expect(r1.outcome).toBe('pending')
    expect(canDecide(r1.steps, 'acc_emp_002')).toBe(true)
    expect(decide(r1.steps, 'acc_emp_002', 'approved', '', 'now').outcome).toBe('approved')
  })

  it('never lets someone approve their own request', () => {
    const marcus = db.employees.find((e) => e.firstName === 'Marcus')!
    const steps = buildSteps(db, [{ id: 'h', name: 'HR', rule: 'hr' }], marcus, 'acc_emp_002')
    expect(steps[0]?.approverIds).not.toContain('acc_emp_002')
    expect(steps[0]?.approverIds.length).toBeGreaterThan(0)
  })

  it('requires a comment to reject or request changes', () => {
    const steps = buildSteps(db, chain, samuel, 'acc_emp_008')
    expect(() => decide(steps, 'acc_emp_007', 'rejected', ' ', 'now')).toThrow(/comment/)
    expect(decide(steps, 'acc_emp_007', 'rejected', 'Peak season', 'now').outcome).toBe('rejected')
  })

  it('lets the delegate decide instead of the original approver', () => {
    const steps = delegate(buildSteps(db, chain, samuel, 'acc_emp_008'), 'acc_emp_007', 'acc_emp_002', ['acc_emp_002'])
    expect(canDecide(steps, 'acc_emp_007')).toBe(false)
    expect(canDecide(steps, 'acc_emp_002')).toBe(true)
  })
})

describe('service levels', () => {
  it('counts business hours Monday–Friday 09:00–17:00', () => {
    const fri4pm = new Date('2026-06-05T16:00:00')
    const due = addBusinessHours(fri4pm, 2)
    expect(due.getDay()).toBe(1) // Monday
    expect(due.getHours()).toBe(10)
  })

  it('does not count requests waiting on the employee as overdue', () => {
    const past = new Date(Date.now() - 3_600_000).toISOString()
    expect(isOverdue({ status: 'open', dueAt: past })).toBe(true)
    expect(isOverdue({ status: 'waiting_on_employee', dueAt: past })).toBe(false)
    expect(isOverdue({ status: 'resolved', dueAt: past })).toBe(false)
  })
})

describe('automation rules', () => {
  it('evaluates conditions case-insensitively and numerically', () => {
    expect(conditionHolds({ field: 'd', operator: 'equals', value: 'Front Office' }, { d: 'front office' })).toBe(true)
    expect(conditionHolds({ field: 'd', operator: 'in', value: 'a, b' }, { d: 'b' })).toBe(true)
    expect(conditionHolds({ field: 'n', operator: 'gte', value: '3' }, { n: 2 })).toBe(false)
    expect(conditionHolds({ field: 'missing', operator: 'not_equals', value: 'x' }, {})).toBe(false)
  })

  it('interpolates known placeholders and leaves unknown ones visible', () => {
    expect(interpolate('{employee} joins on {date} {nope}', { employee: 'Ana', date: '2026-01-01' })).toBe('Ana joins on 2026-01-01 {nope}')
  })

  it('dedupes per rule, trigger and record (and day for daily rules)', () => {
    expect(dedupeKey('r', 'employee.created', 'e1', null)).toBe(dedupeKey('r', 'employee.created', 'e1', null))
    expect(dedupeKey('r', 'schedule.daily', null, '2026-01-01')).not.toBe(dedupeKey('r', 'schedule.daily', null, '2026-01-02'))
  })

  it('rejects incomplete rules and conditions that do not fit the trigger', () => {
    const db = createSeed()
    const errors = validateRule({ name: '', trigger: 'employee.created', conditions: [{ field: 'days', operator: 'gte', value: 'x' }], actions: [], maxAttempts: 9 }, db)
    expect(errors.join(' ')).toMatch(/name/)
    expect(errors.join(' ')).toMatch(/not available for this trigger/)
    expect(errors.join(' ')).toMatch(/at least one action/)
    expect(errors.join(' ')).toMatch(/Retries/)
  })
})

describe('analytics helpers', () => {
  it('returns null for empty denominators', () => {
    expect(rate(0, 0)).toBeNull()
    expect(rate(1, 3)).toBe(33.3)
    expect(median([])).toBeNull()
    expect(median([5, 1, 3, 2])).toBe(2.5)
  })
})

describe('permissions', () => {
  const db = createSeed()
  it('limits sensitive fields to HR and the employee themself', () => {
    const samuel = db.employees.find((e) => e.firstName === 'Samuel')!
    const acc = (id: string) => db.accounts.find((a) => a.id === id)!
    expect(canViewSensitive(acc('acc_emp_008'), samuel)).toBe(true)
    expect(canViewSensitive(acc('acc_emp_002'), samuel)).toBe(true)
    expect(canViewSensitive(acc('acc_emp_007'), samuel)).toBe(false) // manager
    expect(canViewSensitive(acc('acc_emp_009'), samuel)).toBe(false) // colleague
  })

  it('computes the full reporting line', () => {
    const aisha = db.employees.find((e) => e.firstName === 'Aisha')!
    const samuel = db.employees.find((e) => e.firstName === 'Samuel')!
    expect(reportIds(db.employees, aisha.id).has(samuel.id)).toBe(true) // indirect
  })
})

describe('CSV', () => {
  it('round-trips quotes, commas and newlines and neutralizes formulas', () => {
    const csv = toCSV(['a', 'b'], [['x, "y"', 'line\nbreak'], ['=SUM(A1)', '2']])
    expect(parseCSV(csv)).toEqual([
      ['a', 'b'],
      ['x, "y"', 'line\nbreak'],
      ["'=SUM(A1)", '2'],
    ])
  })
})
