/**
 * Company policy knowledge base: drafts, review, versioned publication, archive and acknowledgment.
 * Only the published version of a policy is "in force" and used by the assistant.
 */
import { isValidISODate, today } from '@/lib/dates'
import { createId, nowISO } from '@/lib/utils'
import { can } from '@/domain/permissions'
import type { Account, Database, ID, Policy, PolicyVersion } from '@/domain/types'
import { withAudit, withNotifications } from './activity'
import { replaceById, ServiceError, store } from './store'
import { required, transact } from './tx'

export const POLICY_STATUS_LABELS: Record<Policy['status'], string> = { draft: 'Draft', in_review: 'In review', published: 'Published', archived: 'Archived' }

export function inAudience(policy: Pick<Policy, 'audienceDepartmentIds'>, db: Pick<Database, 'employees'>, account: Account): boolean {
  if (!policy.audienceDepartmentIds) return true
  const emp = db.employees.find((e) => e.id === account.employeeId)
  return Boolean(emp && policy.audienceDepartmentIds.includes(emp.departmentId))
}

/** Policies the account may read: published ones in their audience; editors also see drafts and archive. */
export function visiblePolicies(db: Database, account: Account): Policy[] {
  if (can(account, 'policies.manage')) return db.policies
  return db.policies.filter((p) => p.status === 'published' && (inAudience(p, db, account) || can(account, 'people.view_all')))
}

export const currentVersion = (p: Policy): PolicyVersion | undefined => p.versions.find((v) => v.version === p.publishedVersion)
export const latestVersion = (p: Policy): PolicyVersion => p.versions[p.versions.length - 1] as PolicyVersion

export function needsAcknowledgment(db: Database, account: Account): Policy[] {
  if (!account.employeeId) return []
  return db.policies.filter(
    (p) => p.status === 'published' && p.requiresAcknowledgment && p.publishedVersion !== null && inAudience(p, db, account) && !db.policyAcks.some((a) => a.policyId === p.id && a.version === p.publishedVersion && a.employeeId === account.employeeId),
  )
}

export interface PolicyInput {
  title: string
  category: string
  tags: string[]
  summary: string
  body: string
  effectiveDate: string
  changeNote: string
  requiresAcknowledgment: boolean
  audienceDepartmentIds: ID[] | null
  reviewBy: string | null
}

function validate(input: PolicyInput) {
  required(input.title, 'Title')
  required(input.category, 'Category')
  if (input.body.trim().length < 20) throw new ServiceError('The policy text is too short.')
  if (!isValidISODate(input.effectiveDate)) throw new ServiceError('Enter a valid effective date.')
  if (input.reviewBy && !isValidISODate(input.reviewBy)) throw new ServiceError('Enter a valid review date.')
}

export function createPolicy(actor: Account, input: PolicyInput): Policy {
  if (!can(actor, 'policies.manage')) throw new ServiceError('Only policy managers can create policies.', 'forbidden')
  validate(input)
  const now = nowISO()
  const policy: Policy = {
    id: createId('pol'),
    title: input.title.trim(),
    category: input.category.trim(),
    tags: input.tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
    summary: input.summary.trim(),
    ownerId: actor.id,
    status: 'draft',
    publishedVersion: null,
    versions: [{ version: 1, body: input.body.trim(), effectiveDate: input.effectiveDate, changeNote: input.changeNote.trim() || 'First draft', createdBy: actor.id, createdAt: now, publishedAt: null, publishedBy: null }],
    requiresAcknowledgment: input.requiresAcknowledgment,
    audienceDepartmentIds: input.audienceDepartmentIds?.length ? input.audienceDepartmentIds : null,
    reviewBy: input.reviewBy,
    updatedAt: now,
  }
  transact((d) => withAudit({ ...d, policies: [policy, ...d.policies] }, actor.id, 'policy.created', { type: 'policy', id: policy.id }, policy.title))
  return policy
}

/**
 * Saves edits. If the latest version is unpublished it is edited in place; otherwise a new draft
 * version is added and the published version stays in force until the new one is published.
 */
export function savePolicyDraft(actor: Account, id: ID, input: PolicyInput) {
  if (!can(actor, 'policies.manage')) throw new ServiceError('Only policy managers can edit policies.', 'forbidden')
  validate(input)
  const p = store.db.policies.find((x) => x.id === id)
  if (!p) throw new ServiceError('Policy not found.', 'not_found')
  if (p.status === 'archived') throw new ServiceError('Restore the policy before editing it.', 'conflict')
  const latest = latestVersion(p)
  const now = nowISO()
  const versions = latest.publishedAt
    ? [...p.versions, { version: latest.version + 1, body: input.body.trim(), effectiveDate: input.effectiveDate, changeNote: input.changeNote.trim() || 'Revision', createdBy: actor.id, createdAt: now, publishedAt: null, publishedBy: null }]
    : p.versions.map((v) => (v.version === latest.version ? { ...v, body: input.body.trim(), effectiveDate: input.effectiveDate, changeNote: input.changeNote.trim() || v.changeNote } : v))
  transact((d) =>
    withAudit(
      {
        ...d,
        policies: replaceById(d.policies, id, (x) => ({
          ...x,
          title: input.title.trim(),
          category: input.category.trim(),
          tags: input.tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
          summary: input.summary.trim(),
          requiresAcknowledgment: input.requiresAcknowledgment,
          audienceDepartmentIds: input.audienceDepartmentIds?.length ? input.audienceDepartmentIds : null,
          reviewBy: input.reviewBy,
          versions,
          status: x.status === 'published' ? 'published' : 'draft',
          updatedAt: now,
        })),
      },
      actor.id,
      'policy.edited',
      { type: 'policy', id },
      p.title,
    ),
  )
}

export function hasUnpublishedChanges(p: Policy): boolean {
  return !latestVersion(p).publishedAt
}

export function submitForReview(actor: Account, id: ID) {
  if (!can(actor, 'policies.manage')) throw new ServiceError('Only policy managers can submit for review.', 'forbidden')
  const p = store.db.policies.find((x) => x.id === id)
  if (!p || !hasUnpublishedChanges(p)) throw new ServiceError('There is no draft to review.', 'conflict')
  transact((d) => withAudit({ ...d, policies: replaceById(d.policies, id, (x) => ({ ...x, status: x.status === 'published' ? 'published' : 'in_review', updatedAt: nowISO() })) }, actor.id, 'policy.review', { type: 'policy', id }, `${p.title} v${latestVersion(p).version} submitted for review`))
}

export function publishPolicy(actor: Account, id: ID) {
  if (!can(actor, 'policies.manage')) throw new ServiceError('Only policy managers can publish.', 'forbidden')
  const p = store.db.policies.find((x) => x.id === id)
  if (!p) throw new ServiceError('Policy not found.', 'not_found')
  const latest = latestVersion(p)
  if (latest.publishedAt) throw new ServiceError('The latest version is already published.', 'conflict')
  const now = nowISO()
  transact((d) => {
    let next = withAudit(
      {
        ...d,
        policies: replaceById(d.policies, id, (x) => ({ ...x, status: 'published', publishedVersion: latest.version, versions: x.versions.map((v) => (v.version === latest.version ? { ...v, publishedAt: now, publishedBy: actor.id } : v)), updatedAt: now })),
      },
      actor.id,
      'policy.published',
      { type: 'policy', id },
      `${p.title} v${latest.version} published (effective ${latest.effectiveDate})`,
    )
    if (p.requiresAcknowledgment) {
      const audience = d.accounts.filter((a) => a.status === 'active' && a.employeeId && inAudience(p, d, a))
      next = withNotifications(next, audience.map((a) => ({ accountId: a.id, title: `Please read and acknowledge: ${p.title}`, body: `Version ${latest.version}, effective ${latest.effectiveDate}`, link: `/policies/${id}`, kind: 'policy' as const })))
    }
    return next
  })
}

export function archivePolicy(actor: Account, id: ID, archive = true) {
  if (!can(actor, 'policies.manage')) throw new ServiceError('Only policy managers can archive.', 'forbidden')
  const p = store.db.policies.find((x) => x.id === id)
  if (!p) throw new ServiceError('Policy not found.', 'not_found')
  const status: Policy['status'] = archive ? 'archived' : p.publishedVersion ? 'published' : 'draft'
  transact((d) => withAudit({ ...d, policies: replaceById(d.policies, id, (x) => ({ ...x, status, updatedAt: nowISO() })) }, actor.id, archive ? 'policy.archived' : 'policy.restored', { type: 'policy', id }, p.title))
}

export function acknowledgePolicy(actor: Account, id: ID) {
  const p = store.db.policies.find((x) => x.id === id)
  if (!p || p.status !== 'published' || p.publishedVersion === null) throw new ServiceError('Only published policies can be acknowledged.', 'conflict')
  if (!actor.employeeId) throw new ServiceError('Your account is not linked to an employee record.')
  if (store.db.policyAcks.some((a) => a.policyId === id && a.version === p.publishedVersion && a.employeeId === actor.employeeId)) return
  const ack = { id: createId('ack'), policyId: id, version: p.publishedVersion, employeeId: actor.employeeId, at: nowISO() }
  transact((d) => withAudit({ ...d, policyAcks: [...d.policyAcks, ack] }, actor.id, 'policy.acknowledged', { type: 'policy', id }, `${p.title} v${p.publishedVersion}`))
}

export function acknowledgmentStats(db: Database, p: Policy) {
  if (!p.requiresAcknowledgment || p.publishedVersion === null) return null
  const audience = db.employees.filter((e) => ['active', 'on_leave', 'offboarding'].includes(e.status) && (!p.audienceDepartmentIds || p.audienceDepartmentIds.includes(e.departmentId)))
  const acked = new Set(db.policyAcks.filter((a) => a.policyId === p.id && a.version === p.publishedVersion).map((a) => a.employeeId))
  return { audience: audience.length, acknowledged: audience.filter((e) => acked.has(e.id)).length, outstanding: audience.filter((e) => !acked.has(e.id)) }
}

export const isReviewDue = (p: Policy) => Boolean(p.reviewBy && p.reviewBy <= today() && p.status === 'published')
