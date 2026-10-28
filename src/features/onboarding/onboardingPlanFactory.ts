import type { Job, Offer, OnboardingPlan, OnboardingTemplate, Role, User } from '@/types/domain'

const DAY = 86_400_000

/** Resolves a template task's owner role to a concrete person for this hire. */
function ownerFor(role: Role | null, job: Job, users: User[]): string | null {
  if (role === 'Recruiter') return job.recruiterId
  if (role === 'Hiring Manager') return job.hiringManagerId
  if (role === 'Admin') return users.find((u) => u.role === 'Admin' && u.status === 'active')?.id ?? null
  return null
}

/** Builds an onboarding plan for an accepted offer from a checklist template. */
export function createOnboardingPlan({
  template,
  offer,
  job,
  users,
  now = new Date(),
}: {
  template: OnboardingTemplate
  offer: Offer
  job: Job
  users: User[]
  now?: Date
}): OnboardingPlan {
  const start = new Date(offer.startDate).getTime()
  const id = `obp-${offer.id}`
  return {
    id,
    offerId: offer.id,
    candidateId: offer.candidateId,
    jobId: offer.jobId,
    startDate: offer.startDate,
    status: 'not-started',
    tasks: template.tasks.map((t, i) => ({
      id: `${id}-t${i}`,
      label: t.label,
      ownerId: ownerFor(t.ownerRole, job, users),
      dueDate: new Date(start + t.dueOffsetDays * DAY).toISOString(),
      done: false,
      completedAt: null,
      requiresDocument: t.requiresDocument,
      document: null,
    })),
    history: [{ id: `${id}-h0`, at: now.toISOString(), byId: null, text: `Plan created from “${template.name}”` }],
    createdAt: now.toISOString(),
    completedAt: null,
  }
}

/** Derives plan status from its tasks: completed when all are done, blocked when any is overdue. */
export function derivePlanStatus(plan: Pick<OnboardingPlan, 'tasks'>, now = Date.now()): OnboardingPlan['status'] {
  const done = plan.tasks.filter((t) => t.done).length
  if (done === plan.tasks.length && plan.tasks.length > 0) return 'completed'
  const overdue = plan.tasks.some((t) => !t.done && t.dueDate && new Date(t.dueDate).getTime() < now)
  if (overdue) return 'blocked'
  return done === 0 ? 'not-started' : 'in-progress'
}

export function isTaskOverdue(task: { done: boolean; dueDate: string | null }, now = Date.now()) {
  return !task.done && Boolean(task.dueDate) && new Date(task.dueDate as string).getTime() < now
}
