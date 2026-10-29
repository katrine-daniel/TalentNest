import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Archive, ArchiveRestore, ArrowLeft, CheckCircle2, Pencil, Send, Sparkles, Upload } from 'lucide-react'
import { useAction, useDb } from '@/app/hooks'
import { useSession } from '@/app/session'
import { formatDate, formatDateTime } from '@/lib/dates'
import { cn, fullName } from '@/lib/utils'
import {
  acknowledgePolicy,
  acknowledgmentStats,
  archivePolicy,
  currentVersion,
  hasUnpublishedChanges,
  latestVersion,
  needsAcknowledgment,
  publishPolicy,
  submitForReview,
  visiblePolicies,
} from '@/services/policies'
import { Badge } from '@/components/ui/Badge'
import { Button, LinkButton } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState, Panel } from '@/components/ui/Layout'
import { PolicyStatusBadge } from '@/features/shared/display'
import { Markdown } from './Markdown'

export default function PolicyPage() {
  const { policyId } = useParams()
  const db = useDb()
  const { account, can } = useSession()
  const p = visiblePolicies(db, account).find((x) => x.id === policyId)
  const manage = can('policies.manage')
  const [selected, setSelected] = useState<number | null>(null)
  const [publishing, setPublishing] = useState(false)
  const ack = useAction(() => acknowledgePolicy(account, policyId as string), 'Thank you — acknowledgment recorded')
  const review = useAction(() => submitForReview(account, policyId as string), 'Submitted for review')
  const publish = useAction(() => publishPolicy(account, policyId as string), 'Policy published')
  const archive = useAction(
    (a: boolean) => archivePolicy(account, policyId as string, a),
    (_r) => 'Policy updated',
  )

  if (!p)
    return (
      <EmptyState
        title="Policy not found"
        description="It may be unpublished or outside your audience."
        action={<LinkButton to="/policies">Back to policies</LinkButton>}
      />
    )
  const inForce = currentVersion(p)
  const latest = latestVersion(p)
  const shownNo = selected ?? (manage ? latest.version : (inForce?.version ?? latest.version))
  const shown = p.versions.find((v) => v.version === shownNo) ?? latest
  const mustAck = needsAcknowledgment(db, account).some((x) => x.id === p.id)
  const myAck = db.policyAcks.find((a) => a.policyId === p.id && a.version === p.publishedVersion && a.employeeId === account.employeeId)
  const stats = manage ? acknowledgmentStats(db, p) : null
  const name = (id: string | null) => (id ? (db.accounts.find((a) => a.id === id)?.name ?? 'Unknown') : '—')

  return (
    <div>
      <Link to="/policies" className="text-muted hover:text-ink mb-3 inline-flex items-center gap-1 text-sm">
        <ArrowLeft size={14} aria-hidden /> Policies
      </Link>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-muted text-sm">{p.category}</p>
          <h1 className="text-xl font-semibold tracking-tight">{p.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {manage && <PolicyStatusBadge status={p.status} />}
            {inForce ? (
              <Badge tone="success">
                In force: v{inForce.version}, effective {formatDate(inForce.effectiveDate)}
              </Badge>
            ) : (
              <Badge>Not yet published</Badge>
            )}
            {manage && p.status !== 'archived' && hasUnpublishedChanges(p) && <Badge tone="warning">Draft v{latest.version} not published</Badge>}
            {p.audienceDepartmentIds && <Badge>Audience: {p.audienceDepartmentIds.map((d) => db.departments.find((x) => x.id === d)?.name).join(', ')}</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton to={`/assistant?q=${encodeURIComponent(`What does the ${p.title} say about `)}`} variant="ai" icon={Sparkles}>
            Ask about this policy
          </LinkButton>
          {manage && p.status !== 'archived' && (
            <>
              <LinkButton to={`/policies/${p.id}/edit`} icon={Pencil}>
                {hasUnpublishedChanges(p) ? 'Edit draft' : 'New version'}
              </LinkButton>
              {hasUnpublishedChanges(p) && p.status === 'draft' && (
                <Button icon={Send} loading={review.pending} onClick={() => review.run()}>
                  Submit for review
                </Button>
              )}
              {hasUnpublishedChanges(p) && (
                <Button variant="primary" icon={Upload} onClick={() => setPublishing(true)}>
                  Publish v{latest.version}
                </Button>
              )}
            </>
          )}
          {manage && (
            <Button
              variant="ghost"
              icon={p.status === 'archived' ? ArchiveRestore : Archive}
              loading={archive.pending}
              onClick={() => archive.run(p.status !== 'archived')}
            >
              {p.status === 'archived' ? 'Restore' : 'Archive'}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          {mustAck && (
            <div className="border-brand-200 bg-brand-50 flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center">
              <p className="text-brand-800 flex-1 text-sm">Please read this policy and confirm you understand it (version {p.publishedVersion}).</p>
              <Button variant="primary" icon={CheckCircle2} loading={ack.pending} onClick={() => ack.run()}>
                I have read and understood
              </Button>
            </div>
          )}
          {myAck && (
            <p className="text-success flex items-center gap-1.5 text-sm">
              <CheckCircle2 size={15} aria-hidden /> You acknowledged version {myAck.version} on {formatDate(myAck.at)}.
            </p>
          )}
          <Panel bodyClassName="px-5 py-5 sm:px-7">
            <div className="text-muted mb-4 flex flex-wrap items-center gap-2 text-xs">
              <span>Version {shown.version}</span>
              <span>· effective {formatDate(shown.effectiveDate)}</span>
              {shown.publishedAt ? (
                <span>
                  · published {formatDate(shown.publishedAt)} by {name(shown.publishedBy)}
                </span>
              ) : (
                <Badge tone="warning">Unpublished draft</Badge>
              )}
              {inForce && shown.version !== inForce.version && <Badge tone="warning">Not the version in force</Badge>}
            </div>
            {p.summary && <p className="text-ink mb-4 font-medium">{p.summary}</p>}
            <Markdown source={shown.body} />
          </Panel>
        </div>
        <div className="min-w-0 space-y-5">
          <Panel title="Versions">
            <ol className="divide-line divide-y">
              {[...p.versions].reverse().map((v) => (
                <li key={v.version}>
                  <button
                    type="button"
                    onClick={() => setSelected(v.version)}
                    aria-current={v.version === shown.version}
                    className={cn('hover:bg-page w-full px-4 py-2.5 text-left text-sm', v.version === shown.version && 'bg-brand-50')}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      v{v.version}
                      {v.version === p.publishedVersion && <Badge tone="success">In force</Badge>}
                      {!v.publishedAt && <Badge tone="warning">Draft</Badge>}
                    </span>
                    <span className="text-muted block text-xs">
                      {v.changeNote} · effective {formatDate(v.effectiveDate)} · {formatDateTime(v.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="About" bodyClassName="p-4 text-sm space-y-1">
            <p>
              <span className="text-muted">Owner:</span> {name(p.ownerId)}
            </p>
            <p>
              <span className="text-muted">Review by:</span> {formatDate(p.reviewBy)}
            </p>
            <p>
              <span className="text-muted">Tags:</span> {p.tags.join(', ') || '—'}
            </p>
            <p>
              <span className="text-muted">Acknowledgment:</span> {p.requiresAcknowledgment ? 'Required' : 'Not required'}
            </p>
          </Panel>
          {stats && (
            <Panel title={`Acknowledgments · ${stats.acknowledged}/${stats.audience}`}>
              {stats.outstanding.length ? (
                <ul className="divide-line max-h-72 divide-y overflow-y-auto">
                  {stats.outstanding.map((e) => (
                    <li key={e.id} className="px-4 py-2 text-sm">
                      <Link to={`/people/${e.id}`} className="hover:underline">
                        {fullName(e)}
                      </Link>
                      <span className="text-muted text-xs"> · {db.departments.find((d) => d.id === e.departmentId)?.name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted px-4 py-3 text-sm">Everyone in the audience has acknowledged the current version.</p>
              )}
            </Panel>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={publishing}
        onClose={() => setPublishing(false)}
        title={`Publish version ${latest.version}?`}
        description={`It becomes the version in force (effective ${formatDate(latest.effectiveDate)}) and the assistant will answer from it.${p.requiresAcknowledgment ? ' Everyone in the audience is asked to acknowledge it again.' : ''}`}
        confirmLabel="Publish"
        loading={publish.pending}
        onConfirm={async () => {
          const r = await publish.run()
          if (r.ok) setPublishing(false)
        }}
      />
    </div>
  )
}
