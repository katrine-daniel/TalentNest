// Demo-only requisitions, tasks, talent pools and saved searches.
import { relativeDate } from './seedUtils'

const APPROVER = 'usr-01'

/** Every published vacancy is backed by an approved requisition; drafts are still awaiting approval. */
export function buildRequisitions(jobs) {
  const fromJobs = jobs.map((job) => {
    const id = `req-${job.id}`
    const approved = job.status !== 'draft'
    const created = new Date(new Date(job.createdAt).getTime() - 5 * 86_400_000).toISOString()
    const history = [
      { id: `${id}-h0`, action: 'created', byId: job.hiringManagerId, at: created, comment: '' },
      { id: `${id}-h1`, action: 'submitted', byId: job.hiringManagerId, at: created, comment: '' },
    ]
    if (approved) history.push({ id: `${id}-h2`, action: 'approved', byId: APPROVER, at: job.createdAt, comment: 'Approved within headcount plan.' })
    return {
      id,
      title: job.title,
      departmentId: job.departmentId,
      justification: `Headcount for ${job.title}: ${job.openings} position(s) to meet booking-volume growth.`,
      headcount: job.openings,
      budgetMin: job.salaryMin,
      budgetMax: job.salaryMax,
      hiringManagerId: job.hiringManagerId,
      approverId: APPROVER,
      status: approved ? 'approved' : 'pending',
      jobId: job.id,
      createdById: job.hiringManagerId,
      createdAt: created,
      updatedAt: approved ? job.createdAt : created,
      history,
    }
  })
  const extra = [
    {
      id: 'req-ofr-analyst-2',
      title: 'Senior Revenue Analyst — OneFineRate',
      departmentId: 'dep-ofr',
      justification: 'Second analyst to cover APAC partner hotels after onboarding 120 new properties.',
      headcount: 1,
      budgetMin: 1400000,
      budgetMax: 1900000,
      hiringManagerId: 'usr-12',
      approverId: APPROVER,
      status: 'pending',
      jobId: null,
      createdById: 'usr-12',
      createdAt: relativeDate(-2),
      updatedAt: relativeDate(-2),
      history: [
        { id: 'req-ofr-analyst-2-h0', action: 'created', byId: 'usr-12', at: relativeDate(-2), comment: '' },
        { id: 'req-ofr-analyst-2-h1', action: 'submitted', byId: 'usr-12', at: relativeDate(-2), comment: '' },
      ],
    },
    {
      id: 'req-night-shift-tl',
      title: 'Night Shift Team Lead — Voice',
      departmentId: 'dep-cc',
      justification: 'Night shift has grown to 40 agents without a dedicated lead.',
      headcount: 2,
      budgetMin: 700000,
      budgetMax: 1100000,
      hiringManagerId: 'usr-06',
      approverId: APPROVER,
      status: 'revision-requested',
      jobId: null,
      createdById: 'usr-06',
      createdAt: relativeDate(-6),
      updatedAt: relativeDate(-4),
      history: [
        { id: 'req-night-shift-tl-h0', action: 'created', byId: 'usr-06', at: relativeDate(-6), comment: '' },
        { id: 'req-night-shift-tl-h1', action: 'submitted', byId: 'usr-06', at: relativeDate(-6), comment: '' },
        {
          id: 'req-night-shift-tl-h2',
          action: 'revision-requested',
          byId: APPROVER,
          at: relativeDate(-4),
          comment: 'Budget is above band; please justify the second position or reduce to one.',
        },
      ],
    },
  ]
  return [...fromJobs, ...extra]
}

export function buildTasks(applications, jobs, candidates) {
  const name = (id) => {
    const c = candidates.find((x) => x.id === id)
    return c ? `${c.firstName} ${c.lastName}` : 'candidate'
  }
  const early = applications.filter((a) => a.status === 'active').slice(0, 6)
  return early.map((app, i) => {
    const job = jobs.find((j) => j.id === app.jobId)
    return {
      id: `task-${app.id}`,
      title: i % 2 ? `Collect references for ${name(app.candidateId)}` : `Screening call with ${name(app.candidateId)}`,
      assigneeId: job.recruiterId,
      dueDate: relativeDate(i - 2, 17),
      status: i === 5 ? 'done' : 'open',
      candidateId: app.candidateId,
      applicationId: app.id,
      createdById: job.recruiterId,
      createdAt: relativeDate(-4),
      completedAt: i === 5 ? relativeDate(-1) : null,
      sourceKey: null,
    }
  })
}

export function buildTalentPools(candidates) {
  const silver = candidates.filter((c) => c.skills.some((s) => /amadeus|sabre|galileo/i.test(s))).map((c) => c.id)
  const eng = candidates.filter((c) => c.skills.some((s) => /react|node|typescript/i.test(s))).map((c) => c.id)
  return [
    {
      id: 'pool-gds',
      name: 'GDS-skilled travel talent',
      description: 'Candidates with hands-on Amadeus, Sabre or Galileo experience.',
      candidateIds: silver.slice(0, 8),
      createdById: 'usr-03',
      createdAt: relativeDate(-20),
    },
    {
      id: 'pool-eng',
      name: 'Engineering silver medallists',
      description: 'Strong engineers to revisit for future openings.',
      candidateIds: eng.slice(0, 5),
      createdById: 'usr-04',
      createdAt: relativeDate(-12),
    },
  ]
}

export function buildSavedSearches() {
  return [
    {
      id: 'ss-voice-senior',
      name: 'Experienced voice agents in NCR',
      query: { text: '', skills: ['Customer Handling'], location: 'Gurugram', minExperience: 2, maxExperience: null, pastRole: '' },
      createdById: 'usr-02',
      createdAt: relativeDate(-9),
    },
  ]
}
