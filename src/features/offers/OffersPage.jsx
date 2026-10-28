import { useMemo, useState } from 'react'
import { CheckCircle2, FilePlus2, FileSignature, MoreHorizontal, Pencil, Send, ThumbsDown, Handshake, Timer, UserRoundCheck } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Tabs from '@/components/ui/Tabs'
import DataTable, { CellActions } from '@/components/ui/DataTable'
import Dropdown from '@/components/ui/Dropdown'
import EmptyState from '@/components/ui/EmptyState'
import StatusBadge from '@/components/ui/StatusBadge'
import Avatar from '@/components/ui/Avatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import MetricCard, { MetricStrip } from '@/features/dashboard/components/MetricCard'
import { useCollection, useLookups, fullName } from '@/hooks/useStore'
import { useOfferActions } from '@/features/interviews/hooks/useScheduling'
import { useTableState } from '@/hooks/useTableState'
import { useGlobalActions } from '@/app/providers/GlobalActionsContext'
import { useSession } from '@/app/providers/SessionContext'
import { formatDate, formatRelative } from '@/utils/formatDate'

const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`

const CONFIRM_COPY = {
  accepted: {
    title: 'Record offer as accepted?',
    body: 'The candidate moves to the Hired stage and an onboarding checklist starts.',
    label: 'Mark accepted',
    tone: 'primary',
  },
  declined: {
    title: 'Record offer as declined?',
    body: 'The application is marked as not progressing. You can restore it later from the candidate profile.',
    label: 'Mark declined',
    tone: 'danger',
  },
  sent: { title: 'Mark offer as sent?', body: 'Demo mode records the status only; no offer letter is emailed.', label: 'Mark sent', tone: 'primary' },
}

export default function OffersPage() {
  const offers = useCollection('offers')
  const { candidatesById, jobsById } = useLookups()
  const actions = useOfferActions()
  const global = useGlobalActions()
  const { can } = useSession()
  const canManage = can('offers.manage')
  const [tab, setTab] = useState('offers')
  const [status, setStatus] = useState('active')
  const [confirm, setConfirm] = useState(null)

  const rows = useMemo(
    () =>
      offers.map((o) => ({
        id: o.id,
        offer: o,
        name: fullName(candidatesById.get(o.candidateId)),
        job: jobsById.get(o.jobId),
        salary: o.salary,
        expiresAt: new Date(o.expiresAt).getTime(),
        expiringSoon: ['sent', 'negotiating'].includes(o.status) && new Date(o.expiresAt).getTime() < Date.now() + 2 * 86_400_000,
      })),
    [offers, candidatesById, jobsById],
  )
  const filtered = rows.filter((r) =>
    status === 'active' ? ['draft', 'sent', 'negotiating'].includes(r.offer.status) : status === 'all' ? true : r.offer.status === status,
  )
  const table = useTableState(filtered, { initialSort: { key: 'expiresAt', dir: 'asc' }, pageSize: 50 })
  const accepted = rows.filter((r) => r.offer.status === 'accepted')
  const decided = rows.filter((r) => ['accepted', 'declined'].includes(r.offer.status)).length
  const count = (s) => rows.filter((r) => r.offer.status === s).length

  const columns = [
    {
      key: 'name',
      header: 'Candidate',
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-3">
          <Avatar name={r.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium">{r.name}</p>
            <p className="text-muted truncate text-xs">{r.job?.title}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'salary',
      header: 'Annual CTC',
      sortable: true,
      align: 'right',
      render: (r) => (
        <span className="tabular">
          {inr(r.offer.salary)}
          {r.offer.joiningBonus > 0 && <span className="text-muted block text-xs">+ {inr(r.offer.joiningBonus)} bonus</span>}
        </span>
      ),
    },
    { key: 'start', header: 'Start date', hideBelow: 'lg', render: (r) => formatDate(r.offer.startDate) },
    {
      key: 'expiresAt',
      header: 'Valid until',
      sortable: true,
      hideBelow: 'md',
      render: (r) => (
        <span className={r.expiringSoon ? 'font-medium text-amber-700' : 'text-ink-soft'}>
          {['accepted', 'declined'].includes(r.offer.status) ? '—' : formatRelative(r.offer.expiresAt)}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge kind="offer" value={r.offer.status} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (r) => {
        const s = r.offer.status
        const open = ['draft', 'sent', 'negotiating'].includes(s)
        return (
          <CellActions>
            <Dropdown
              menuLabel={`Actions for ${r.name}`}
              items={[
                { label: 'Mark as sent', icon: Send, disabled: !canManage || s !== 'draft', onSelect: () => setConfirm({ row: r, status: 'sent' }) },
                { label: 'Revise offer', icon: Pencil, disabled: !canManage || !open, onSelect: () => global.openOffer({ offer: r.offer }) },
                {
                  label: 'Candidate is negotiating',
                  icon: Handshake,
                  disabled: !canManage || s !== 'sent',
                  onSelect: () => actions.setStatus.run(r.id, 'negotiating'),
                },
                { divider: true },
                {
                  label: 'Mark accepted',
                  icon: CheckCircle2,
                  disabled: !canManage || !['sent', 'negotiating'].includes(s),
                  onSelect: () => setConfirm({ row: r, status: 'accepted' }),
                },
                {
                  label: 'Mark declined',
                  icon: ThumbsDown,
                  danger: true,
                  disabled: !canManage || !['sent', 'negotiating'].includes(s),
                  onSelect: () => setConfirm({ row: r, status: 'declined' }),
                },
              ]}
              renderTrigger={(props) => <Button {...props} size="sm" variant="ghost" iconOnly icon={MoreHorizontal} aria-label={`Actions for ${r.name}`} />}
            />
          </CellActions>
        )
      },
    },
  ]

  const copy = confirm ? CONFIRM_COPY[confirm.status] : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offers"
        description="Prepare, send and track offers. Accepted offers continue in Onboarding."
        actions={
          <Button variant="primary" icon={FilePlus2} onClick={() => global.openOffer()} disabled={!canManage}>
            Create offer
          </Button>
        }
      />

      <MetricStrip columns={4}>
        <MetricCard label="Awaiting response" icon={Timer} value={count('sent') + count('negotiating')} detail={`${count('negotiating')} negotiating`} />
        <MetricCard label="Drafts" icon={FileSignature} value={count('draft')} detail="Pending approval" />
        <MetricCard
          label="Acceptance rate"
          icon={CheckCircle2}
          value={decided ? Math.round((accepted.length / decided) * 100) : null}
          suffix="%"
          detail={`Of ${decided} decided offers`}
        />
        <MetricCard label="Accepted" icon={UserRoundCheck} value={accepted.length} detail="Open onboarding →" to="/onboarding" emphasis />
      </MetricStrip>

      <Tabs value={tab} onChange={setTab} label="Offers sections" tabs={[{ value: 'offers', label: 'Offers', count: rows.length }]} />

      {tab === 'offers' ? (
        <div className="border-line/80 bg-surface shadow-card rounded-2xl border">
          <div className="no-scrollbar border-line flex gap-1.5 overflow-x-auto border-b p-3" role="group" aria-label="Filter offers by status">
            {[
              ['active', 'Open'],
              ['accepted', 'Accepted'],
              ['declined', 'Declined'],
              ['all', 'All'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={status === value}
                onClick={() => setStatus(value)}
                className={`shrink-0 rounded-md border px-2.5 py-1 text-xs ${status === value ? 'border-brand-200 bg-brand-50 text-brand-700 font-medium' : 'border-line text-muted hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <DataTable
            columns={columns}
            rows={table.rows}
            sort={table.sort}
            onSort={table.toggleSort}
            empty={<EmptyState icon={FileSignature} title="No offers in this view" description="Create an offer for a candidate who has cleared interviews." />}
            mobileCard={(r) => (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="text-muted truncate text-xs">{r.job?.title}</p>
                  </div>
                  <StatusBadge kind="offer" value={r.offer.status} />
                </div>
                <p className="tabular text-sm">
                  {inr(r.offer.salary)} · starts {formatDate(r.offer.startDate)}
                </p>
                {['sent', 'negotiating'].includes(r.offer.status) && (
                  <div className="flex gap-2">
                    <Button size="xs" variant="primary" onClick={() => setConfirm({ row: r, status: 'accepted' })} disabled={!canManage}>
                      Accepted
                    </Button>
                    <Button size="xs" variant="danger-ghost" onClick={() => setConfirm({ row: r, status: 'declined' })} disabled={!canManage}>
                      Declined
                    </Button>
                  </div>
                )}
                {r.offer.status === 'draft' && (
                  <Button size="xs" onClick={() => setConfirm({ row: r, status: 'sent' })} disabled={!canManage}>
                    Mark sent
                  </Button>
                )}
              </div>
            )}
          />
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={copy?.title}
        description={copy ? `${confirm.row.name} — ${confirm.row.job?.title}. ${copy.body}` : ''}
        confirmLabel={copy?.label}
        tone={copy?.tone}
        loading={actions.setStatus.pending}
        onConfirm={async () => {
          const res = await actions.setStatus.run(confirm.row.id, confirm.status)
          if (res.ok) setConfirm(null)
        }}
      />
    </div>
  )
}
