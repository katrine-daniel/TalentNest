import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BriefcaseBusiness, Check, FilePlus2, Pencil, RotateCcw, Send, X } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Drawer from '@/components/ui/Drawer'
import Tabs from '@/components/ui/Tabs'
import DataTable from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import StatusBadge, { type Tone } from '@/components/ui/StatusBadge'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { useCollection, useLookups } from '@/hooks/useStore'
import { useSession } from '@/app/providers/SessionContext'
import { useGlobalActions } from '@/app/providers/GlobalActionsContext'
import { formatDate, formatRelative } from '@/utils/formatDate'
import type { Requisition, RequisitionStatus } from '@/types/domain'
import RequisitionForm from './components/RequisitionForm'
import { canDecide, requisitionService, DECISIONS } from './requisitionService'

const REQ_STATUS: Record<RequisitionStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  pending: { label: 'Pending approval', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  'revision-requested': { label: 'Revision requested', tone: 'blue' },
}

const inr = (n: number) => `₹${(n / 100000).toFixed(n % 100000 ? 1 : 0)}L`

function RequisitionDetail({ req, onClose, onEdit }: { req: Requisition; onClose: () => void; onEdit: () => void }) {
  const { user, actorId } = useSession()
  const { usersById, departmentsById, jobsById } = useLookups()
  const global = useGlobalActions() as { openJobForm: (p?: unknown) => void }
  const navigate = useNavigate()
  const [decision, setDecision] = useState<keyof typeof DECISIONS | null>(null)
  const decide = useAsyncAction((d: keyof typeof DECISIONS, comment: string) => requisitionService.decide(req.id, d, { actor: user, comment }), {
    success: (r) => `Requisition ${REQ_STATUS[r.status].label.toLowerCase()}`,
  })
  const submit = useAsyncAction(() => requisitionService.submit(req.id, { actorId }), { success: 'Submitted for approval' })
  const mayDecide = canDecide(req, user)
  const isOwner = req.createdById === actorId || user.role === 'Admin'
  const job = req.jobId ? jobsById.get(req.jobId) : undefined

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title={req.title}
        subtitle={<StatusBadge tone={REQ_STATUS[req.status].tone}>{REQ_STATUS[req.status].label}</StatusBadge>}
        footer={
          <>
            {isOwner && ['draft', 'revision-requested'].includes(req.status) && (
              <>
                <Button icon={Pencil} onClick={onEdit}>
                  Edit
                </Button>
                <Button variant="primary" icon={Send} loading={submit.pending} onClick={() => submit.run()}>
                  Submit for approval
                </Button>
              </>
            )}
            {mayDecide && (
              <>
                <Button variant="danger-ghost" icon={X} onClick={() => setDecision('reject')}>
                  Reject
                </Button>
                <Button icon={RotateCcw} onClick={() => setDecision('request-revision')}>
                  Request changes
                </Button>
                <Button variant="primary" icon={Check} onClick={() => setDecision('approve')}>
                  Approve
                </Button>
              </>
            )}
            {req.status === 'approved' && !req.jobId && (
              <Button
                variant="primary"
                icon={BriefcaseBusiness}
                onClick={() => {
                  global.openJobForm({
                    prefill: {
                      requisitionId: req.id,
                      title: req.title,
                      departmentId: req.departmentId,
                      hiringManagerId: req.hiringManagerId,
                      openings: req.headcount,
                      salaryMin: req.budgetMin,
                      salaryMax: req.budgetMax,
                    },
                  })
                  onClose()
                }}
              >
                Create vacancy
              </Button>
            )}
            {job && (
              <Button icon={BriefcaseBusiness} onClick={() => navigate(`/jobs/${job.id}`)}>
                Open vacancy
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-6 p-5">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            {[
              ['Department', departmentsById.get(req.departmentId)?.name],
              ['Headcount', req.headcount],
              ['Budget per hire', `${inr(req.budgetMin)} – ${inr(req.budgetMax)}`],
              ['Total budget (max)', inr(req.budgetMax * req.headcount)],
              ['Hiring manager', usersById.get(req.hiringManagerId)?.name],
              ['Approver', usersById.get(req.approverId)?.name],
              ['Raised by', usersById.get(req.createdById)?.name],
              ['Raised', formatDate(req.createdAt)],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="text-muted text-xs">{k}</dt>
                <dd className="text-ink">{v ?? '—'}</dd>
              </div>
            ))}
          </dl>
          <section>
            <h3 className="text-muted mb-1 text-xs font-semibold tracking-wide uppercase">Justification</h3>
            <p className="text-ink-soft text-sm leading-relaxed whitespace-pre-line">{req.justification}</p>
          </section>
          <section>
            <h3 className="text-muted mb-2 text-xs font-semibold tracking-wide uppercase">Approval history</h3>
            <ol className="border-line space-y-3 border-l pl-4">
              {req.history.map((h) => (
                <li key={h.id} className="text-sm">
                  <p>
                    <span className="font-medium capitalize">{h.action.replace('-', ' ')}</span>
                    <span className="text-muted">
                      {' '}
                      · {usersById.get(h.byId ?? '')?.name ?? 'System'} · {formatRelative(h.at)}
                    </span>
                  </p>
                  {h.comment && <p className="text-ink-soft">“{h.comment}”</p>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </Drawer>
      <ConfirmDialog
        open={Boolean(decision)}
        onClose={() => setDecision(null)}
        title={decision === 'approve' ? 'Approve this requisition?' : decision === 'reject' ? 'Reject this requisition?' : 'Request changes?'}
        description={decision === 'approve' ? 'The hiring team can then publish a vacancy for it.' : 'The requester is notified with your comment.'}
        confirmLabel={decision === 'approve' ? 'Approve' : decision === 'reject' ? 'Reject' : 'Request changes'}
        tone={decision === 'reject' ? 'danger' : 'primary'}
        reasonLabel="Comment"
        requireReason={decision ? DECISIONS[decision].requiresComment : false}
        loading={decide.pending}
        onConfirm={async (comment) => {
          if (!decision) return
          const res = await decide.run(decision, comment)
          if (res.ok) setDecision(null)
        }}
      />
    </>
  )
}

export default function RequisitionsPage() {
  const requisitions = useCollection('requisitions')
  const { usersById, departmentsById } = useLookups()
  const { can, actorId, role } = useSession()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState('needs-me')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Requisition | null>(null)
  const selectedId = params.get('id')
  const selected = requisitions.find((r) => r.id === selectedId) ?? null

  useEffect(() => {
    if (params.get('new') === '1') {
      setEditing(null)
      setFormOpen(true)
      params.delete('new')
      setParams(params, { replace: true })
    }
  }, [params, setParams])

  const needsMe = (r: Requisition) => r.status === 'pending' && (r.approverId === actorId || role === 'Admin') && r.createdById !== actorId
  const rows = useMemo(
    () =>
      [...requisitions]
        .filter((r) => (tab === 'needs-me' ? needsMe(r) : tab === 'all' ? true : r.status === tab))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [requisitions, tab, actorId, role],
  )
  const count = (s: string) => requisitions.filter((r) => r.status === s).length

  return (
    <div className="space-y-5">
      <PageHeader
        title="Requisitions"
        description="Headcount requests and approvals. A vacancy can only be published from an approved requisition."
        actions={
          <Button
            variant="primary"
            icon={FilePlus2}
            disabled={!can('requisitions.create')}
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            Raise requisition
          </Button>
        }
      />
      <div className="border-line/80 bg-surface shadow-card rounded-2xl border">
        <div className="px-4 pt-2">
          <Tabs
            value={tab}
            onChange={setTab}
            label="Requisition status"
            tabs={[
              { value: 'needs-me', label: 'Needs my approval', count: requisitions.filter(needsMe).length },
              { value: 'pending', label: 'Pending', count: count('pending') },
              { value: 'revision-requested', label: 'Changes requested', count: count('revision-requested') },
              { value: 'draft', label: 'Drafts', count: count('draft') },
              { value: 'approved', label: 'Approved', count: count('approved') },
              { value: 'rejected', label: 'Rejected', count: count('rejected') },
              { value: 'all', label: 'All', count: requisitions.length },
            ]}
          />
        </div>
        <DataTable
          rows={rows}
          onRowClick={(r) => setParams({ id: r.id })}
          rowLabel={(r) => `Open requisition ${r.title}`}
          empty={<EmptyState title={tab === 'needs-me' ? 'Nothing waiting for your approval' : 'No requisitions here'} />}
          columns={[
            {
              key: 'title',
              header: 'Requisition',
              render: (r) => (
                <div>
                  <p className="font-medium">{r.title}</p>
                  <p className="text-muted text-xs">{departmentsById.get(r.departmentId)?.name}</p>
                </div>
              ),
            },
            { key: 'headcount', header: 'Headcount', align: 'right', hideBelow: 'md', render: (r) => r.headcount },
            { key: 'budget', header: 'Budget / hire', hideBelow: 'lg', render: (r) => `${inr(r.budgetMin)}–${inr(r.budgetMax)}` },
            { key: 'approver', header: 'Approver', hideBelow: 'lg', render: (r) => usersById.get(r.approverId)?.name ?? '—' },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge tone={REQ_STATUS[r.status].tone}>{REQ_STATUS[r.status].label}</StatusBadge> },
            { key: 'updated', header: 'Updated', hideBelow: 'md', render: (r) => <span className="text-muted">{formatRelative(r.updatedAt)}</span> },
          ]}
          mobileCard={(r) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.title}</p>
                <p className="text-muted text-xs">
                  {r.headcount} × {inr(r.budgetMax)} · {formatRelative(r.updatedAt)}
                </p>
              </div>
              <StatusBadge tone={REQ_STATUS[r.status].tone}>{REQ_STATUS[r.status].label}</StatusBadge>
            </div>
          )}
        />
      </div>
      {selected && (
        <RequisitionDetail
          req={selected}
          onClose={() => setParams({})}
          onEdit={() => {
            setEditing(selected)
            setFormOpen(true)
          }}
        />
      )}
      <RequisitionForm open={formOpen} onClose={() => setFormOpen(false)} requisition={editing} />
    </div>
  )
}
