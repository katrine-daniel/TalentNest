/**
 * Demo data set for a fictional hospitality group with a corporate office.
 * All people, emails and phone numbers are invented. Dates are generated relative to the day the
 * demo workspace is first opened so deadlines and "overdue" states stay meaningful.
 */
import { addDays, today } from '@/lib/dates'
import { addBusinessHours } from '@/domain/sla'
import { countLeaveDays, endDateFor, holidaysFor } from '@/domain/leave'
import type {
  Account,
  ApprovalStage,
  ApprovalStep,
  Database,
  Department,
  Employee,
  EmploymentType,
  HRRequest,
  LeaveRequest,
  LeaveType,
  LifecycleCase,
  LifecycleTemplate,
  Location,
  Policy,
  RequestType,
  Role,
  WorkSchedule,
  WorkflowRule,
} from '@/domain/types'

export const SEED_VERSION = 1

// Deterministic pseudo-random generator so the demo looks the same for everyone.
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const iso = (d: Date) => d.toISOString()

export function createSeed(now: Date = new Date()): Database {
  const rand = rng(42)
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)] as T
  const T = today(now)
  const at = (daysAgo: number, hour = 10) => {
    const d = new Date(now)
    d.setDate(d.getDate() - daysAgo)
    d.setHours(hour, Math.floor(rand() * 59), 0, 0)
    return iso(d)
  }

  const organization = {
    id: 'org_demo',
    name: 'Harbor & Pine Group',
    industry: 'Hospitality',
    timezone: 'Europe/Lisbon',
    country: 'PT',
    weekStartsOn: 1 as const,
    terminology: { employee: 'team member', employees: 'team members', department: 'department', location: 'property' },
  }

  const locations: Location[] = [
    { id: 'loc_hq', name: 'Group Office', city: 'Lisbon', country: 'PT', timezone: 'Europe/Lisbon' },
    { id: 'loc_harbor', name: 'Harbor Hotel', city: 'Lisbon', country: 'PT', timezone: 'Europe/Lisbon' },
    { id: 'loc_pine', name: 'Pine Lodge', city: 'Porto', country: 'PT', timezone: 'Europe/Lisbon' },
    { id: 'loc_remote', name: 'Remote', city: '—', country: 'PT', timezone: 'Europe/Lisbon' },
  ]

  const employmentTypes: EmploymentType[] = [
    { id: 'et_ft', name: 'Full-time', fte: 1 },
    { id: 'et_pt', name: 'Part-time', fte: 0.5 },
    { id: 'et_seasonal', name: 'Seasonal', fte: 1 },
    { id: 'et_contract', name: 'Fixed-term contract', fte: 1 },
  ]

  const schedules: WorkSchedule[] = [
    { id: 'sch_office', name: 'Office (Mon–Fri)', workingDays: [1, 2, 3, 4, 5], hoursPerDay: 8, kind: 'fixed' },
    { id: 'sch_shift', name: 'Hotel shifts (5 on, 2 off, Tue–Sat)', workingDays: [2, 3, 4, 5, 6], hoursPerDay: 8, kind: 'rotating' },
    { id: 'sch_flex', name: 'Flexible (Mon–Fri)', workingDays: [1, 2, 3, 4, 5], hoursPerDay: 8, kind: 'flexible' },
  ]

  const year = now.getFullYear()
  const holidays = [
    { id: 'hol_1', date: `${year}-01-01`, name: "New Year's Day", locationId: null },
    { id: 'hol_2', date: `${year}-04-25`, name: 'Freedom Day', locationId: null },
    { id: 'hol_3', date: `${year}-05-01`, name: 'Labour Day', locationId: null },
    { id: 'hol_4', date: `${year}-06-13`, name: 'Lisbon municipal holiday', locationId: 'loc_harbor' },
    { id: 'hol_5', date: `${year}-06-24`, name: 'Porto municipal holiday', locationId: 'loc_pine' },
    { id: 'hol_6', date: `${year}-12-25`, name: 'Christmas Day', locationId: null },
    { id: 'hol_7', date: `${year + 1}-01-01`, name: "New Year's Day", locationId: null },
  ]

  // --------------------------------------------------------------- people
  type Spec = [first: string, last: string, title: string, dept: string, loc: string, sched: string, et: string, monthsAgo: number]
  const specs: Spec[] = [
    // People & Culture
    ['Katrine', 'Daniel', 'Head of People & Culture', 'dep_people', 'loc_hq', 'sch_office', 'et_ft', 52],
    ['Marcus', 'Chen', 'HR Specialist', 'dep_people', 'loc_hq', 'sch_office', 'et_ft', 30],
    ['Leonor', 'Matos', 'HR Coordinator', 'dep_people', 'loc_pine', 'sch_office', 'et_ft', 14],
    // Leadership / Finance
    ['Aisha', 'Rahman', 'Chief Operating Officer', 'dep_finance', 'loc_hq', 'sch_office', 'et_ft', 70],
    ['Tomás', 'Ferreira', 'Finance Manager', 'dep_finance', 'loc_hq', 'sch_office', 'et_ft', 44],
    ['Inês', 'Carvalho', 'Payroll Analyst', 'dep_finance', 'loc_hq', 'sch_office', 'et_ft', 19],
    // Front Office
    ['Elena', 'Rossi', 'Front Office Manager', 'dep_front', 'loc_harbor', 'sch_shift', 'et_ft', 40],
    ['Samuel', 'Okoye', 'Guest Services Agent', 'dep_front', 'loc_harbor', 'sch_shift', 'et_ft', 11],
    ['Beatriz', 'Lopes', 'Receptionist', 'dep_front', 'loc_harbor', 'sch_shift', 'et_pt', 8],
    ['Hugo', 'Almeida', 'Night Auditor', 'dep_front', 'loc_harbor', 'sch_shift', 'et_ft', 26],
    ['Mia', 'Schneider', 'Concierge', 'dep_front', 'loc_pine', 'sch_shift', 'et_ft', 17],
    ['Rafael', 'Costa', 'Guest Services Agent', 'dep_front', 'loc_pine', 'sch_shift', 'et_seasonal', 3],
    // Housekeeping
    ['Fatima', 'Benali', 'Executive Housekeeper', 'dep_house', 'loc_harbor', 'sch_shift', 'et_ft', 58],
    ['Diego', 'Moreno', 'Room Attendant', 'dep_house', 'loc_harbor', 'sch_shift', 'et_ft', 22],
    ['Ana', 'Pereira', 'Room Attendant', 'dep_house', 'loc_harbor', 'sch_shift', 'et_pt', 9],
    ['Chloé', 'Martin', 'Laundry Supervisor', 'dep_house', 'loc_pine', 'sch_shift', 'et_ft', 33],
    ['Joel', 'Mensah', 'Room Attendant', 'dep_house', 'loc_pine', 'sch_shift', 'et_seasonal', 2],
    // Food & Beverage
    ['Giulia', 'Bianchi', 'F&B Manager', 'dep_fnb', 'loc_harbor', 'sch_shift', 'et_ft', 47],
    ['Kenji', 'Watanabe', 'Sous Chef', 'dep_fnb', 'loc_harbor', 'sch_shift', 'et_ft', 28],
    ['Lucas', 'Silva', 'Bartender', 'dep_fnb', 'loc_harbor', 'sch_shift', 'et_pt', 12],
    ['Nadia', 'Haddad', 'Restaurant Supervisor', 'dep_fnb', 'loc_pine', 'sch_shift', 'et_ft', 21],
    ['Pedro', 'Santos', 'Commis Chef', 'dep_fnb', 'loc_pine', 'sch_shift', 'et_contract', 5],
    // Engineering & Maintenance
    ['Viktor', 'Novak', 'Chief Engineer', 'dep_eng', 'loc_harbor', 'sch_office', 'et_ft', 63],
    ['André', 'Sousa', 'Maintenance Technician', 'dep_eng', 'loc_harbor', 'sch_shift', 'et_ft', 16],
    ['Marta', 'Ribeiro', 'Maintenance Technician', 'dep_eng', 'loc_pine', 'sch_shift', 'et_ft', 7],
    // Sales & Marketing
    ['Olivia', 'Grant', 'Director of Sales & Marketing', 'dep_sales', 'loc_hq', 'sch_flex', 'et_ft', 38],
    ['Daniel', 'Kim', 'Revenue Analyst', 'dep_sales', 'loc_remote', 'sch_flex', 'et_ft', 13],
    ['Sofia', 'Gomes', 'Events Sales Executive', 'dep_sales', 'loc_harbor', 'sch_office', 'et_ft', 24],
    ['Rui', 'Antunes', 'Marketing Coordinator', 'dep_sales', 'loc_hq', 'sch_flex', 'et_ft', 6],
    // Technology
    ['Priya', 'Nair', 'IT Manager', 'dep_tech', 'loc_hq', 'sch_flex', 'et_ft', 35],
    ['Jonas', 'Weber', 'Systems Administrator', 'dep_tech', 'loc_remote', 'sch_flex', 'et_ft', 18],
    ['Laila', 'Aziz', 'IT Support Specialist', 'dep_tech', 'loc_harbor', 'sch_office', 'et_ft', 10],
    // Upcoming joiners (pre-boarding) and a leaver
    ['Carla', 'Duarte', 'Guest Services Agent', 'dep_front', 'loc_harbor', 'sch_shift', 'et_ft', -0.3],
    ['Ethan', 'Brooks', 'Data Analyst', 'dep_sales', 'loc_remote', 'sch_flex', 'et_ft', -0.6],
    ['Yusuf', 'Kaya', 'Room Attendant', 'dep_house', 'loc_pine', 'sch_shift', 'et_seasonal', 0.4],
  ]

  const deptNames: Record<string, [string, string]> = {
    dep_people: ['People & Culture', 'PEO'],
    dep_finance: ['Finance & Administration', 'FIN'],
    dep_front: ['Front Office', 'FO'],
    dep_house: ['Housekeeping', 'HK'],
    dep_fnb: ['Food & Beverage', 'FNB'],
    dep_eng: ['Engineering & Maintenance', 'ENG'],
    dep_sales: ['Sales & Marketing', 'SM'],
    dep_tech: ['Technology', 'IT'],
  }
  const heads: Record<string, string> = {
    dep_people: 'Katrine Daniel',
    dep_finance: 'Aisha Rahman',
    dep_front: 'Elena Rossi',
    dep_house: 'Fatima Benali',
    dep_fnb: 'Giulia Bianchi',
    dep_eng: 'Viktor Novak',
    dep_sales: 'Olivia Grant',
    dep_tech: 'Priya Nair',
  }

  const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const employees: Employee[] = specs.map(([first, last, title, dept, loc, sched, et, monthsAgo], i) => {
    const join = addDays(T, -Math.round(monthsAgo * 30.4))
    const preboarding = monthsAgo < 0
    return {
      id: `emp_${String(i + 1).padStart(3, '0')}`,
      employeeNo: `HP-${String(1001 + i)}`,
      firstName: first,
      lastName: last,
      preferredName: null,
      workEmail: `${slug(first)}.${slug(last)}@harborpine.example`,
      personalEmail: `${slug(first)}${Math.floor(rand() * 90 + 10)}@mail.example`,
      phone: `+351 9${Math.floor(rand() * 9)} ${String(Math.floor(rand() * 900 + 100))} ${String(Math.floor(rand() * 9000 + 1000))}`,
      title,
      departmentId: dept,
      teamId: null,
      managerId: null,
      employmentTypeId: et,
      locationId: loc,
      scheduleId: sched,
      joinDate: join,
      endDate: null,
      status: preboarding ? 'pre_boarding' : 'active',
      dateOfBirth: `${1975 + Math.floor(rand() * 26)}-${String(Math.floor(rand() * 12) + 1).padStart(2, '0')}-${String(Math.floor(rand() * 27) + 1).padStart(2, '0')}`,
      emergencyContact: {
        name: `${pick(['Maria', 'João', 'Sam', 'Lee', 'Alex', 'Noor'])} ${last}`,
        relationship: pick(['Partner', 'Parent', 'Sibling']),
        phone: `+351 91 ${Math.floor(rand() * 900 + 100)} ${Math.floor(rand() * 9000 + 1000)}`,
      },
      documents: preboarding
        ? []
        : [
            {
              id: `doc_${i}_c`,
              name: 'Employment contract.pdf',
              kind: 'contract',
              fileId: null,
              size: 184_000,
              uploadedAt: iso(new Date(join)),
              uploadedBy: 'acc_emp_002',
              expiresOn: et === 'et_contract' || et === 'et_seasonal' ? addDays(join, 180) : null,
            },
            ...(dept === 'dep_fnb'
              ? [
                  {
                    id: `doc_${i}_h`,
                    name: 'Food hygiene certificate.pdf',
                    kind: 'certificate' as const,
                    fileId: null,
                    size: 96_000,
                    uploadedAt: iso(new Date(join)),
                    uploadedBy: 'acc_emp_002',
                    expiresOn: addDays(T, i % 2 ? 21 : 140),
                  },
                ]
              : []),
          ],
      equipment: preboarding
        ? []
        : dept === 'dep_tech' || loc === 'loc_hq' || loc === 'loc_remote'
          ? [{ id: `eq_${i}`, item: 'Laptop', assetTag: `LT-${2200 + i}`, assignedOn: join, returnedOn: null }]
          : [],
      history: [{ id: `h_${i}_0`, at: iso(new Date(join)), by: null, field: 'Record', from: null, to: 'Created', note: 'Imported during demo setup' }],
      createdAt: iso(new Date(join)),
    }
  })
  const byName = (name: string) => employees.find((e) => `${e.firstName} ${e.lastName}` === name) as Employee
  const departments: Department[] = Object.entries(deptNames).map(([id, [name, code]]) => ({ id, name, code, headEmployeeId: byName(heads[id] as string).id }))

  // Reporting lines: department members report to the head; heads report to the COO.
  const coo = byName('Aisha Rahman')
  for (const e of employees) {
    const head = departments.find((d) => d.id === e.departmentId)?.headEmployeeId
    e.managerId = e.id === coo.id ? null : head === e.id ? coo.id : (head ?? null)
  }
  byName('Samuel Okoye').managerId = byName('Elena Rossi').id
  // A leaver currently offboarding.
  const leaver = byName('Hugo Almeida')
  leaver.status = 'offboarding'
  leaver.endDate = addDays(T, 9)

  const teams = [
    { id: 'team_fo_lis', name: 'Front Desk — Harbor', departmentId: 'dep_front', leadEmployeeId: byName('Elena Rossi').id },
    { id: 'team_fo_opo', name: 'Front Desk — Pine', departmentId: 'dep_front', leadEmployeeId: byName('Mia Schneider').id },
    { id: 'team_kitchen', name: 'Kitchen', departmentId: 'dep_fnb', leadEmployeeId: byName('Kenji Watanabe').id },
  ]
  for (const e of employees) {
    if (e.departmentId === 'dep_front') e.teamId = e.locationId === 'loc_pine' ? 'team_fo_opo' : 'team_fo_lis'
    if (e.title.includes('Chef')) e.teamId = 'team_kitchen'
  }

  // --------------------------------------------------------------- accounts
  const demoRoles: Record<string, Role> = {
    'Katrine Daniel': 'hr_admin',
    'Marcus Chen': 'hr_specialist',
    'Leonor Matos': 'hr_specialist',
    'Aisha Rahman': 'org_admin',
  }
  const accounts: Account[] = employees
    .filter((e) => e.status !== 'pre_boarding')
    .map((e) => {
      const name = `${e.firstName} ${e.lastName}`
      const isHead = departments.some((d) => d.headEmployeeId === e.id) || teams.some((t) => t.leadEmployeeId === e.id)
      return { id: `acc_${e.id}`, employeeId: e.id, name, email: e.workEmail, role: demoRoles[name] ?? (isHead ? 'manager' : 'employee'), status: 'active' }
    })
  const acc = (name: string) => accounts.find((a) => a.name === name) as Account

  // --------------------------------------------------------------- configuration
  const managerThenHR: ApprovalStage[] = [
    { id: 'st_mgr', name: 'Manager approval', rule: 'manager' },
    { id: 'st_hr', name: 'HR approval', rule: 'hr' },
  ]
  const managerOnly: ApprovalStage[] = [{ id: 'st_mgr', name: 'Manager approval', rule: 'manager' }]
  const hrOnly: ApprovalStage[] = [{ id: 'st_hr', name: 'HR review', rule: 'hr' }]

  const requestTypes: RequestType[] = [
    {
      id: 'rt_letter',
      name: 'Employment letter',
      category: 'letters',
      description: 'Proof of employment, salary confirmation or visa support letter.',
      approvalChain: [],
      slaHours: 16,
      defaultPriority: 'normal',
      selfService: true,
      active: true,
      kind: 'document',
    },
    {
      id: 'rt_payroll',
      name: 'Payroll question',
      category: 'payroll',
      description: 'Questions about a payslip, deductions or payment dates.',
      approvalChain: [],
      slaHours: 16,
      defaultPriority: 'normal',
      selfService: true,
      active: true,
      kind: 'service',
    },
    {
      id: 'rt_benefits',
      name: 'Benefits enquiry',
      category: 'benefits',
      description: 'Health insurance, meal allowance and other benefits.',
      approvalChain: [],
      slaHours: 24,
      defaultPriority: 'normal',
      selfService: true,
      active: true,
      kind: 'service',
    },
    {
      id: 'rt_equipment',
      name: 'Equipment request or replacement',
      category: 'equipment',
      description: 'New, broken or lost work equipment (laptop, phone, uniform, tools).',
      approvalChain: managerOnly,
      slaHours: 40,
      defaultPriority: 'normal',
      selfService: true,
      active: true,
      kind: 'equipment',
    },
    {
      id: 'rt_docs',
      name: 'Copy of a document',
      category: 'documents',
      description: 'A copy of your contract or another document on file.',
      approvalChain: [],
      slaHours: 16,
      defaultPriority: 'low',
      selfService: true,
      active: true,
      kind: 'document',
    },
    {
      id: 'rt_policy',
      name: 'Policy question',
      category: 'policy',
      description: 'Ask HR how a company policy applies to you.',
      approvalChain: [],
      slaHours: 24,
      defaultPriority: 'low',
      selfService: true,
      active: true,
      kind: 'service',
    },
    {
      id: 'rt_onboard',
      name: 'Onboarding support',
      category: 'onboarding',
      description: 'Help during your first weeks — access, schedules, training.',
      approvalChain: [],
      slaHours: 8,
      defaultPriority: 'high',
      selfService: true,
      active: true,
      kind: 'service',
    },
    {
      id: 'rt_flex',
      name: 'Work arrangement change',
      category: 'work_arrangement',
      description: 'Change hours, schedule, location or remote-work pattern.',
      approvalChain: managerThenHR,
      slaHours: 40,
      defaultPriority: 'normal',
      selfService: true,
      active: true,
      kind: 'service',
    },
    {
      id: 'rt_update',
      name: 'Update my personal details',
      category: 'records',
      description: 'Change your phone, personal email or emergency contact. HR verifies the change.',
      approvalChain: hrOnly,
      slaHours: 16,
      defaultPriority: 'normal',
      selfService: true,
      active: true,
      kind: 'record_update',
    },
    {
      id: 'rt_general',
      name: 'General HR question',
      category: 'general',
      description: 'Anything that does not fit another category.',
      approvalChain: [],
      slaHours: 24,
      defaultPriority: 'normal',
      selfService: true,
      active: true,
      kind: 'service',
    },
  ]

  const leaveTypes: LeaveType[] = [
    {
      id: 'lt_annual',
      name: 'Annual leave',
      code: 'AL',
      annualDays: 22,
      tracked: true,
      carryOverMax: 5,
      allowNegative: false,
      requiresAttachmentAfterDays: null,
      approvalChain: managerOnly,
      color: '#4338CA',
      active: true,
    },
    {
      id: 'lt_sick',
      name: 'Sick leave',
      code: 'SL',
      annualDays: 10,
      tracked: true,
      carryOverMax: 0,
      allowNegative: true,
      requiresAttachmentAfterDays: 2,
      approvalChain: managerOnly,
      color: '#DC2626',
      active: true,
    },
    {
      id: 'lt_parental',
      name: 'Parental leave',
      code: 'PL',
      annualDays: 0,
      tracked: false,
      carryOverMax: 0,
      allowNegative: false,
      requiresAttachmentAfterDays: 0,
      approvalChain: managerThenHR,
      color: '#059669',
      active: true,
    },
    {
      id: 'lt_unpaid',
      name: 'Unpaid leave',
      code: 'UL',
      annualDays: 0,
      tracked: false,
      carryOverMax: 0,
      allowNegative: false,
      requiresAttachmentAfterDays: null,
      approvalChain: managerThenHR,
      color: '#62677A',
      active: true,
    },
  ]

  // --------------------------------------------------------------- requests
  const steps = (
    chain: ApprovalStage[],
    subject: Employee,
    requester: Account,
    decisions: Array<'approved' | 'pending' | 'rejected' | 'changes_requested'>,
  ): ApprovalStep[] =>
    chain.map((stage, i) => {
      const approver =
        stage.rule === 'manager' ? accounts.find((a) => a.employeeId === subject.managerId) : stage.rule === 'hr' ? acc('Marcus Chen') : undefined
      const ids =
        stage.rule === 'hr'
          ? accounts.filter((a) => ['hr_specialist', 'hr_admin', 'org_admin'].includes(a.role) && a.id !== requester.id).map((a) => a.id)
          : approver
            ? [approver.id]
            : [acc('Marcus Chen').id]
      const d = decisions[i] ?? 'pending'
      return {
        id: `apr_${subject.id}_${stage.id}_${i}_${Math.floor(rand() * 1e6)}`,
        stageName: stage.name,
        rule: stage.rule,
        approverIds: ids,
        delegatedTo: null,
        decision: d,
        decidedBy: d === 'pending' ? null : (approver?.id ?? ids[0] ?? null),
        decidedAt: d === 'pending' ? null : at(1),
        comment: d === 'approved' ? 'Approved.' : d === 'pending' ? '' : 'Please add the model and the reason for replacement.',
      }
    })

  let reqNo = 1040
  const requests: HRRequest[] = []
  const addRequest = (
    typeId: string,
    who: string,
    subject: string,
    description: string,
    daysAgo: number,
    status: HRRequest['status'],
    opts: {
      assignee?: string
      priority?: HRRequest['priority']
      decisions?: Array<'approved' | 'pending' | 'rejected' | 'changes_requested'>
      comments?: Array<[string, string, boolean]>
      resolution?: string
      proposed?: Record<string, string>
    } = {},
  ) => {
    const type = requestTypes.find((t) => t.id === typeId) as RequestType
    const requester = acc(who)
    const subjectEmp = employees.find((e) => e.id === requester.employeeId) as Employee
    const created = at(daysAgo, 9)
    const done = ['resolved', 'closed', 'rejected'].includes(status)
    requests.push({
      id: `req_${reqNo}`,
      number: `HR-${reqNo++}`,
      typeId,
      category: type.category,
      subject,
      description,
      requesterId: requester.id,
      employeeId: subjectEmp.id,
      priority: opts.priority ?? type.defaultPriority,
      status,
      assigneeId: opts.assignee ? acc(opts.assignee).id : null,
      dueAt: iso(addBusinessHours(new Date(created), type.slaHours)),
      proposedChanges: opts.proposed ?? null,
      approvals: type.approvalChain.length ? steps(type.approvalChain, subjectEmp, requester, opts.decisions ?? []) : [],
      comments: (opts.comments ?? []).map(([author, text, internal], i) => ({
        id: `cm_${reqNo}_${i}`,
        authorId: acc(author).id,
        text,
        internal,
        at: at(Math.max(daysAgo - 1 - i, 0), 14),
      })),
      attachments: [],
      timeline: [{ id: `tl_${reqNo}`, at: created, by: requester.id, text: 'Request submitted' }],
      resolution: opts.resolution ?? null,
      escalatedAt: null,
      createdAt: created,
      updatedAt: at(Math.max(daysAgo - 1, 0)),
      resolvedAt: done ? at(Math.max(daysAgo - 2, 0)) : null,
    })
  }
  addRequest(
    'rt_equipment',
    'Samuel Okoye',
    'Replacement headset for front desk',
    'The headset at station 2 cuts out during calls. Requesting a replacement.',
    2,
    'pending_approval',
    { decisions: ['pending'] },
  )
  addRequest(
    'rt_letter',
    'Diego Moreno',
    'Employment confirmation for apartment rental',
    'My landlord needs a letter confirming employment and start date.',
    4,
    'in_progress',
    { assignee: 'Marcus Chen', comments: [['Marcus Chen', 'Drafting now — will share by tomorrow.', false]] },
  )
  addRequest('rt_payroll', 'Kenji Watanabe', 'Overtime missing from last payslip', 'Overtime from the gala weekend is not on my payslip.', 6, 'open', {
    priority: 'high',
  })
  addRequest('rt_flex', 'Daniel Kim', 'Compressed four-day week', 'I would like to work 4×10h Monday–Thursday from next month.', 3, 'pending_approval', {
    decisions: ['approved', 'pending'],
  })
  addRequest('rt_update', 'Beatriz Lopes', 'New mobile number', 'Please update my phone number.', 1, 'pending_approval', {
    decisions: ['pending'],
    proposed: { phone: '+351 93 555 0147' },
  })
  addRequest('rt_benefits', 'Nadia Haddad', 'Adding partner to health insurance', 'How do I add my partner to the health plan?', 9, 'waiting_on_employee', {
    assignee: 'Leonor Matos',
    comments: [['Leonor Matos', 'Could you send a copy of the partnership certificate?', false]],
  })
  addRequest('rt_onboard', 'Rafael Costa', 'No access to the rostering app', 'I started this week and cannot log in to the rostering app.', 5, 'open', {
    priority: 'high',
  })
  addRequest('rt_policy', 'Lucas Silva', 'Can I swap shifts with a colleague?', 'What is the process for swapping a shift?', 12, 'resolved', {
    assignee: 'Leonor Matos',
    resolution: 'Shift swaps are agreed with your supervisor and recorded in the rostering app. See the Working Time policy.',
  })
  addRequest('rt_equipment', 'Laila Aziz', 'Second monitor', 'Requesting a second monitor for the support desk.', 15, 'closed', {
    decisions: ['approved'],
    assignee: 'Marcus Chen',
    resolution: 'Monitor delivered (asset MN-0441).',
  })
  addRequest(
    'rt_general',
    'Sofia Gomes',
    'Training budget for events certification',
    'Is there budget for an events management certificate?',
    7,
    'in_progress',
    { assignee: 'Katrine Daniel', comments: [['Katrine Daniel', 'Budget owner is Olivia — confirming availability.', true]] },
  )
  addRequest('rt_docs', 'André Sousa', 'Copy of my contract', 'I need a copy of my signed contract.', 1, 'open')
  addRequest('rt_equipment', 'Mia Schneider', 'Replacement uniform jacket', 'Jacket zip is broken.', 8, 'rejected', {
    decisions: ['rejected'],
    resolution: 'Uniforms are replaced through the housekeeping store — please visit the linen room.',
  })
  addRequest('rt_payroll', 'Pedro Santos', 'Tax withholding question', 'Which tax table is applied to my contract?', 10, 'open', { assignee: 'Marcus Chen' })

  // --------------------------------------------------------------- leave
  const leaveRequests: LeaveRequest[] = []
  const addLeave = (
    who: string,
    typeId: string,
    startOffset: number,
    workdays: number,
    status: LeaveRequest['status'],
    reason: string,
    decisions: Array<'approved' | 'pending' | 'rejected' | 'changes_requested'>,
  ) => {
    const emp = byName(who)
    const requester = acc(who)
    const schedule = schedules.find((s) => s.id === emp.scheduleId) as WorkSchedule
    const hol = holidaysFor(holidays, emp.locationId)
    let start = addDays(T, startOffset)
    // Start on a working day.
    while (countLeaveDays({ startDate: start, endDate: start, halfDayStart: false, halfDayEnd: false }, schedule, hol) === 0) start = addDays(start, 1)
    const end = endDateFor(start, workdays, schedule, hol)
    const type = leaveTypes.find((t) => t.id === typeId) as LeaveType
    leaveRequests.push({
      id: `lv_${leaveRequests.length + 1}`,
      employeeId: emp.id,
      leaveTypeId: typeId,
      startDate: start,
      endDate: end,
      halfDayStart: false,
      halfDayEnd: false,
      days: countLeaveDays({ startDate: start, endDate: end, halfDayStart: false, halfDayEnd: false }, schedule, hol),
      reason,
      status,
      approvals: steps(type.approvalChain, emp, requester, decisions),
      timeline: [{ id: `lt_${leaveRequests.length}`, at: at(Math.max(-startOffset + 10, 1)), by: requester.id, text: 'Leave requested' }],
      requestedBy: requester.id,
      createdAt: at(Math.max(-startOffset + 10, 1)),
      updatedAt: at(1),
    })
  }
  if (now.getMonth() >= 1) {
    addLeave('Samuel Okoye', 'lt_annual', -40, 3, 'approved', 'Family visit', ['approved'])
    addLeave('Diego Moreno', 'lt_sick', -20, 2, 'approved', 'Flu', ['approved'])
    addLeave('Olivia Grant', 'lt_annual', -60, 5, 'approved', 'Holiday', ['approved'])
    addLeave('Kenji Watanabe', 'lt_annual', -30, 4, 'approved', '', ['approved'])
  }
  addLeave('Samuel Okoye', 'lt_annual', 14, 5, 'pending', 'Summer trip with family', ['pending'])
  addLeave('Beatriz Lopes', 'lt_annual', 6, 2, 'pending', 'Moving apartment', ['pending'])
  addLeave('Marta Ribeiro', 'lt_annual', 21, 3, 'pending', '', ['pending'])
  addLeave('Daniel Kim', 'lt_annual', 30, 5, 'changes_requested', 'Conference + holiday', ['changes_requested'])
  addLeave('Giulia Bianchi', 'lt_annual', 3, 2, 'approved', 'Wedding', ['approved'])
  addLeave('Lucas Silva', 'lt_unpaid', 45, 5, 'pending', 'Course abroad', ['pending', 'pending'])
  addLeave('Jonas Weber', 'lt_annual', -2, 4, 'approved', 'Hiking trip', ['approved'])
  addLeave('Inês Carvalho', 'lt_annual', 10, 1, 'rejected', 'Month-end close', ['rejected'])

  const leaveAdjustments = [
    {
      id: 'adj_1',
      employeeId: byName('Samuel Okoye').id,
      leaveTypeId: 'lt_annual',
      year,
      days: 2,
      reason: 'Carry-over from previous year',
      by: acc('Marcus Chen').id,
      at: `${year}-01-03T10:00:00.000Z`,
    },
    {
      id: 'adj_2',
      employeeId: byName('Kenji Watanabe').id,
      leaveTypeId: 'lt_annual',
      year,
      days: 5,
      reason: 'Carry-over from previous year',
      by: acc('Marcus Chen').id,
      at: `${year}-01-03T10:00:00.000Z`,
    },
  ]

  // --------------------------------------------------------------- lifecycle
  const onboardingStd: LifecycleTemplate = {
    id: 'tpl_onb_std',
    kind: 'onboarding',
    name: 'Standard onboarding',
    departmentId: null,
    locationId: null,
    employmentTypeId: null,
    active: true,
    tasks: [
      { id: 't1', title: 'Collect signed contract and ID documents', owner: 'hr', offsetDays: -10, requiresDocument: true, externalAction: false },
      { id: 't2', title: 'Create payroll record', owner: 'finance', offsetDays: -7, requiresDocument: false, externalAction: true },
      { id: 't3', title: 'Prepare email and system accounts', owner: 'it', offsetDays: -3, requiresDocument: false, externalAction: true },
      { id: 't4', title: 'Prepare equipment', owner: 'it', offsetDays: -2, requiresDocument: false, externalAction: false },
      { id: 't5', title: 'Plan first-week schedule and buddy', owner: 'manager', offsetDays: -2, requiresDocument: false, externalAction: false },
      { id: 't6', title: 'Welcome and induction session', owner: 'hr', offsetDays: 0, requiresDocument: false, externalAction: false },
      { id: 't7', title: 'Acknowledge code of conduct and key policies', owner: 'employee', offsetDays: 3, requiresDocument: false, externalAction: false },
      { id: 't8', title: '30-day check-in', owner: 'manager', offsetDays: 30, requiresDocument: false, externalAction: false },
    ],
  }
  const onboardingHotel: LifecycleTemplate = {
    ...onboardingStd,
    id: 'tpl_onb_hotel',
    name: 'Hotel operations onboarding',
    locationId: 'loc_harbor',
    tasks: [
      ...onboardingStd.tasks.filter((t) => t.id !== 't3'),
      { id: 't9', title: 'Uniform and locker allocation', owner: 'facilities', offsetDays: -1, requiresDocument: false, externalAction: false },
      { id: 't10', title: 'Rostering app access', owner: 'it', offsetDays: -1, requiresDocument: false, externalAction: true },
      { id: 't11', title: 'Health & safety and fire training', owner: 'hr', offsetDays: 1, requiresDocument: true, externalAction: false },
    ],
  }
  const offboardingStd: LifecycleTemplate = {
    id: 'tpl_off_std',
    kind: 'offboarding',
    name: 'Standard offboarding',
    departmentId: null,
    locationId: null,
    employmentTypeId: null,
    active: true,
    tasks: [
      { id: 'o1', title: 'Confirm resignation and last working day in writing', owner: 'hr', offsetDays: -14, requiresDocument: true, externalAction: false },
      { id: 'o2', title: 'Knowledge handover plan', owner: 'manager', offsetDays: -7, requiresDocument: false, externalAction: false },
      { id: 'o3', title: 'Schedule exit interview', owner: 'hr', offsetDays: -5, requiresDocument: false, externalAction: false },
      { id: 'o4', title: 'Collect equipment, keys and uniform', owner: 'facilities', offsetDays: 0, requiresDocument: false, externalAction: false },
      { id: 'o5', title: 'Revoke system and building access', owner: 'it', offsetDays: 0, requiresDocument: false, externalAction: true },
      { id: 'o6', title: 'Final pay and unused leave calculation', owner: 'finance', offsetDays: 2, requiresDocument: false, externalAction: true },
      { id: 'o7', title: 'Issue employment certificate', owner: 'hr', offsetDays: 5, requiresDocument: true, externalAction: false },
    ],
  }
  const lifecycleTemplates = [onboardingStd, onboardingHotel, offboardingStd]

  const ownerAccount: Record<string, (e: Employee) => string | null> = {
    hr: () => acc('Marcus Chen').id,
    manager: (e) => accounts.find((a) => a.employeeId === e.managerId)?.id ?? null,
    it: () => acc('Priya Nair').id,
    employee: (e) => accounts.find((a) => a.employeeId === e.id)?.id ?? null,
    facilities: () => acc('Fatima Benali').id,
    finance: () => acc('Inês Carvalho').id,
  }
  const makeCase = (id: string, tpl: LifecycleTemplate, emp: Employee, keyDate: string, doneUntilOffset: number): LifecycleCase => ({
    id,
    kind: tpl.kind,
    employeeId: emp.id,
    templateId: tpl.id,
    keyDate,
    status: 'active',
    createdBy: acc('Katrine Daniel').id,
    createdAt: at(20),
    completedAt: null,
    timeline: [
      {
        id: `${id}_t0`,
        at: at(20),
        by: acc('Katrine Daniel').id,
        text: `${tpl.kind === 'onboarding' ? 'Onboarding' : 'Offboarding'} started from “${tpl.name}”`,
      },
    ],
    tasks: tpl.tasks.map((t) => {
      const due = addDays(keyDate, t.offsetDays)
      const done = due < addDays(T, doneUntilOffset)
      return {
        id: `${id}_${t.id}`,
        title: t.title,
        owner: t.owner,
        assigneeId: ownerAccount[t.owner]?.(emp) ?? null,
        dueDate: due,
        status: done ? 'done' : 'open',
        requiresDocument: t.requiresDocument,
        externalAction: t.externalAction,
        documentId: null,
        completedAt: done ? at(Math.max(-t.offsetDays, 1)) : null,
        completedBy: done ? (ownerAccount[t.owner]?.(emp) ?? null) : null,
        note: '',
      }
    }),
  })
  const carla = byName('Carla Duarte')
  const ethan = byName('Ethan Brooks')
  const yusuf = byName('Yusuf Kaya')
  const lifecycleCases = [
    // Some tasks deliberately left overdue.
    makeCase('lc_1', onboardingHotel, carla, carla.joinDate, -6),
    makeCase('lc_2', onboardingStd, ethan, ethan.joinDate, -30),
    makeCase('lc_3', onboardingStd, yusuf, yusuf.joinDate, -1),
    makeCase('lc_4', offboardingStd, leaver, leaver.endDate as string, -12),
  ]
  yusuf.status = 'active'

  // --------------------------------------------------------------- policies
  const katrine = acc('Katrine Daniel').id
  const policy = (
    id: string,
    title: string,
    category: string,
    tags: string[],
    summary: string,
    versions: Array<[string, string, string]>,
    opts: Partial<Policy> = {},
  ): Policy => ({
    id,
    title,
    category,
    tags,
    summary,
    ownerId: katrine,
    status: 'published',
    publishedVersion: versions.length,
    requiresAcknowledgment: false,
    audienceDepartmentIds: null,
    reviewBy: addDays(T, 200),
    updatedAt: at(30),
    versions: versions.map(([effective, note, body], i) => ({
      version: i + 1,
      body,
      effectiveDate: effective,
      changeNote: note,
      createdBy: katrine,
      createdAt: at(400 - i * 120),
      publishedAt: at(390 - i * 120),
      publishedBy: katrine,
    })),
    ...opts,
  })
  const policies: Policy[] = [
    policy(
      'pol_leave',
      'Annual Leave Policy',
      'Time off',
      ['leave', 'holiday', 'vacation', 'time off'],
      'How annual leave is earned, requested, approved and carried over.',
      [
        [`${year - 1}-01-01`, 'Initial version', `## Entitlement\nFull-time team members receive 20 working days of paid annual leave per calendar year.`],
        [
          `${year}-01-01`,
          'Entitlement increased to 22 days; carry-over clarified',
          `## Entitlement\nFull-time team members receive **22 working days** of paid annual leave per calendar year, in addition to public holidays. Part-time team members receive a pro-rated entitlement based on their contracted hours. Team members who join during the year receive a pro-rated entitlement for the remaining months.\n\n## Requesting leave\nRequest leave in PeopleOS at least **two weeks in advance** for periods longer than three days. Your manager approves or declines the request. During peak occupancy periods published by each property, leave may be limited.\n\n## Carry-over\nUp to **5 unused days** may be carried into the next year and must be used by 31 March.\n\n## Cancelling\nYou can cancel a pending or approved request before it starts. Approved leave that has started can only be changed by HR.`,
        ],
      ],
      { requiresAcknowledgment: true },
    ),
    policy(
      'pol_sick',
      'Sickness Absence Policy',
      'Time off',
      ['sick', 'illness', 'absence', 'medical'],
      'Reporting sickness, medical certificates and returning to work.',
      [
        [
          `${year - 1}-06-01`,
          'Initial version',
          `## Reporting sickness\nTell your manager **before your shift starts** — by phone for hotel teams. Record the absence as sick leave in PeopleOS on your return.\n\n## Medical certificates\nAbsences of **more than 2 working days** require a medical certificate, uploaded to the sick leave request.\n\n## Paid sick days\nUp to 10 working days per year are paid by the company. Further absence is handled under statutory sickness rules for your country of employment; HR will contact you.\n\n## Returning to work\nYour manager holds a short return-to-work conversation after any absence of 5 days or more.`,
        ],
      ],
    ),
    policy(
      'pol_remote',
      'Remote and Hybrid Work Policy',
      'Working arrangements',
      ['remote', 'hybrid', 'work from home', 'flexible'],
      'Who can work remotely and how to request a different arrangement.',
      [
        [
          `${year}-02-01`,
          'Initial version',
          `## Eligibility\nRemote or hybrid work is available for **office-based roles** where the work can be done effectively away from a property. Guest-facing hotel roles are on-site.\n\n## Requesting an arrangement\nSubmit a *Work arrangement change* request. It is approved by your manager and then by HR.\n\n## Expectations\nBe reachable during core hours (10:00–16:00 local time) and attend in-person team days set by your manager.\n\n## Equipment\nThe company provides a laptop. Request additional equipment through an *Equipment request*.`,
        ],
      ],
      { audienceDepartmentIds: ['dep_finance', 'dep_sales', 'dep_tech', 'dep_people'] },
    ),
    policy(
      'pol_equipment',
      'Equipment and IT Use Policy',
      'IT & equipment',
      ['equipment', 'laptop', 'replacement', 'it', 'lost', 'broken'],
      'Issuing, replacing and returning work equipment.',
      [
        [
          `${year - 1}-09-01`,
          'Initial version',
          `## Issuing equipment\nEquipment needed for your role is prepared before your first day.\n\n## Replacements\nIf equipment is **broken, lost or no longer suitable**, submit an *Equipment request or replacement* in PeopleOS describing the item and what happened. Your manager approves the request and IT arranges the replacement — usually within 5 working days.\n\n## Lost or stolen devices\nReport lost or stolen laptops and phones to IT **immediately** so access can be secured.\n\n## Returning equipment\nAll equipment is returned on or before your last working day.`,
        ],
      ],
    ),
    policy(
      'pol_conduct',
      'Code of Conduct',
      'Conduct',
      ['conduct', 'behaviour', 'ethics', 'harassment'],
      'Standards of behaviour expected of every team member.',
      [
        [
          `${year}-01-15`,
          'Annual review',
          `## Our standards\nTreat guests and colleagues with respect. Harassment, discrimination and bullying are not tolerated.\n\n## Raising concerns\nRaise concerns with your manager, HR, or confidentially through a *General HR question* marked as sensitive.\n\n## Conflicts of interest\nDeclare any conflict of interest to HR.`,
        ],
      ],
      { requiresAcknowledgment: true },
    ),
    policy(
      'pol_working_time',
      'Working Time and Shift Policy',
      'Working arrangements',
      ['shift', 'rota', 'overtime', 'swap', 'hours'],
      'Rotas, shift swaps, breaks and overtime for hotel teams.',
      [
        [
          `${year - 1}-03-01`,
          'Initial version',
          `## Rotas\nRotas are published at least **two weeks** ahead in the rostering app.\n\n## Shift swaps\nYou may swap a shift with a colleague in the same role if your supervisor agrees. Record the swap in the rostering app.\n\n## Overtime\nOvertime must be approved by your manager in advance and appears on the following month's payslip.`,
        ],
      ],
    ),
    {
      ...policy('pol_expenses', 'Travel and Expenses Policy', 'Finance', ['expenses', 'travel', 'reimbursement'], 'Draft — under review by Finance.', [
        [addDays(T, 30), 'First draft', `## Draft\nThis policy is being drafted and is not yet in force.`],
      ]),
      status: 'draft',
      publishedVersion: null,
      versions: [
        {
          version: 1,
          body: '## Draft\nThis policy is being drafted and is not yet in force.',
          effectiveDate: addDays(T, 30),
          changeNote: 'First draft',
          createdBy: katrine,
          createdAt: at(5),
          publishedAt: null,
          publishedBy: null,
        },
      ],
    },
  ]
  const policyAcks = employees
    .filter((e, i) => e.status === 'active' && i % 3 !== 0)
    .flatMap((e, i) => [
      { id: `ack_l_${e.id}`, policyId: 'pol_leave', version: 2, employeeId: e.id, at: at(20 + (i % 10)) },
      ...(i % 2 ? [{ id: `ack_c_${e.id}`, policyId: 'pol_conduct', version: 1, employeeId: e.id, at: at(30 + (i % 7)) }] : []),
    ])

  // --------------------------------------------------------------- automation
  const rule = (
    id: string,
    name: string,
    description: string,
    trigger: WorkflowRule['trigger'],
    conditions: WorkflowRule['conditions'],
    actions: WorkflowRule['actions'],
  ): WorkflowRule => ({
    id,
    name,
    description,
    trigger,
    conditions,
    actions,
    enabled: true,
    maxAttempts: 3,
    createdBy: katrine,
    createdAt: at(60),
    updatedAt: at(60),
    changeLog: [{ id: `${id}_c`, at: at(60), by: katrine, text: 'Rule created' }],
  })
  const rules: WorkflowRule[] = [
    rule(
      'rule_onboard',
      'Start onboarding for new hires',
      'When an employee record is created with a future joining date, start the matching onboarding checklist.',
      'employee.created',
      [{ field: 'employee.status', operator: 'equals', value: 'pre_boarding' }],
      [
        { type: 'start_lifecycle', kind: 'onboarding', templateId: null },
        { type: 'notify', to: 'manager', title: 'New team member joining', message: '{employee} joins on {date}. Please review the onboarding checklist.' },
      ],
    ),
    rule(
      'rule_overdue_req',
      'Escalate overdue HR requests',
      'Notify the HR queue when a request passes its due time.',
      'task.overdue',
      [{ field: 'entity.type', operator: 'equals', value: 'request' }],
      [{ type: 'notify', to: 'hr_queue', title: 'Request overdue', message: '{subject} is past its service target.' }],
    ),
    rule(
      'rule_cert',
      'Certificate expiry reminder',
      'Remind HR 30 days before a certificate expires.',
      'document.expiring',
      [{ field: 'document.kind', operator: 'equals', value: 'certificate' }],
      [
        { type: 'create_task', title: 'Renew {document} for {employee}', assignTo: 'hr_queue', dueInDays: 14, priority: 'normal' },
        { type: 'notify', to: 'employee', title: 'Certificate expiring', message: 'Your {document} expires on {date}. HR will contact you about renewal.' },
      ],
    ),
    rule(
      'rule_dept_change',
      'Department change follow-up',
      'When someone changes department, ask IT to review their access.',
      'employee.department_changed',
      [],
      [
        {
          type: 'create_task',
          title: 'Review system access for {employee} (moved to {department})',
          assignTo: `account:${acc('Priya Nair').id}`,
          dueInDays: 3,
          priority: 'normal',
        },
      ],
    ),
  ]

  // --------------------------------------------------------------- tasks, notifications, misc
  const tasks = [
    {
      id: 'task_1',
      title: 'Prepare Q3 headcount report for the COO',
      description: '',
      assigneeId: katrine,
      dueDate: addDays(T, 2),
      status: 'open' as const,
      priority: 'normal' as const,
      link: null,
      sourceKey: null,
      createdBy: katrine,
      createdAt: at(3),
      completedAt: null,
    },
    {
      id: 'task_2',
      title: 'Review seasonal contracts ending next month',
      description: 'Pine Lodge seasonal team.',
      assigneeId: acc('Marcus Chen').id,
      dueDate: addDays(T, -1),
      status: 'open' as const,
      priority: 'high' as const,
      link: null,
      sourceKey: null,
      createdBy: katrine,
      createdAt: at(6),
      completedAt: null,
    },
  ]

  const announcements = [
    {
      id: 'ann_1',
      title: 'Annual leave policy updated',
      body: 'Entitlement is now 22 days for full-time team members. Please read and acknowledge the updated policy.',
      authorId: katrine,
      publishedAt: at(25),
      audienceDepartmentIds: null,
    },
    {
      id: 'ann_2',
      title: 'Summer peak period',
      body: 'Leave at both properties is limited during the peak period — plan requests early.',
      authorId: acc('Aisha Rahman').id,
      publishedAt: at(4),
      audienceDepartmentIds: ['dep_front', 'dep_house', 'dep_fnb'],
    },
  ]

  const notifications = [
    {
      id: 'ntf_1',
      accountId: katrine,
      title: 'Work arrangement change awaiting HR approval',
      body: 'Daniel Kim — compressed four-day week',
      link: '/requests/req_1043',
      read: false,
      at: at(1, 11),
      kind: 'request' as const,
    },
    {
      id: 'ntf_2',
      accountId: acc('Elena Rossi').id,
      title: 'Leave request from Samuel Okoye',
      body: '5 days annual leave',
      link: '/leave?tab=approvals',
      read: false,
      at: at(1, 9),
      kind: 'leave' as const,
    },
    {
      id: 'ntf_3',
      accountId: acc('Samuel Okoye').id,
      title: 'Your equipment request is awaiting manager approval',
      body: 'Replacement headset for front desk',
      link: '/requests/req_1040',
      read: true,
      at: at(2, 10),
      kind: 'request' as const,
    },
  ]

  return {
    version: SEED_VERSION,
    organization,
    accounts,
    departments,
    teams,
    locations,
    employmentTypes,
    schedules,
    holidays,
    employees,
    requestTypes,
    requests,
    leaveTypes,
    leaveRequests,
    leaveAdjustments,
    lifecycleTemplates,
    lifecycleCases,
    tasks,
    policies,
    policyAcks,
    announcements,
    rules,
    runs: [],
    notifications,
    notificationPrefs: [],
    inboxState: [],
    audit: [
      {
        id: 'aud_0',
        at: at(0, 8),
        actorId: null,
        action: 'demo.created',
        entity: { type: 'organization', id: organization.id },
        summary: 'Demo workspace created with fictional data',
      },
    ],
    conversations: [],
  }
}

/** Accounts offered on the demo sign-in screen, one per role. */
export const DEMO_ACCOUNTS: Array<{ id: string; blurb: string }> = [
  { id: 'acc_emp_001', blurb: 'Runs HR — queues, approvals, policies, automation' },
  { id: 'acc_emp_002', blurb: 'Works the HR service queue and onboarding' },
  { id: 'acc_emp_007', blurb: 'Manages the Harbor front office team' },
  { id: 'acc_emp_008', blurb: 'Raises requests and leave; sees only their own data' },
  { id: 'acc_emp_004', blurb: 'Full access including organization settings' },
]
