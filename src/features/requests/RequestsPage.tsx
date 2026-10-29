import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ClipboardList, Plus, Search } from 'lucide-react'
import { useDb } from '@/app/hooks'
import { useSession } from '@/app/session'
import { canDecide } from '@/domain/approvals'
import { isHR } from '@/domain/permissions'
import { isOverdue, isOpenRequest } from '@/domain/sla'
import type { HRRequest } from '@/domain/types'
import { formatRelative } from '@/lib/dates'
import { visibleRequests } from '@/services/requests'
import { LinkButton } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Form'
import { EmptyState, PageHeader, Panel, Tabs } from '@/components/ui/Layout'
import { Pagination, Table } from '@/components/ui/Table'
import { CATEGORY_LABELS, DueLabel, PersonCell, PriorityBadge, RequestStatusBadge } from '@/features/shared/display'

const QUEUE_FILTERS: Record<string, { label: string; test: (r: HRRequest, me: string) => boolean }> = {
  open: { label: 'All open', test: (r) => isOpenRequest(r) },
  unassigned: { label: 'Unassigned', test: (r) => isOpenRequest(r) && !r.assigneeId && r.status !== 'pending_approval' },
  mine: { label: 'Assigned to me', test: (r, me) => isOpenRequest(r) && r.assigneeId === me },
  overdue: { label: 'Overdue', test: (r) => isOverdue(r) },
  approval: { label: 'Pending approval', test: (r) => r.status === 'pending_approval' || r.status === 'changes_requested' },
  waiting: { label: 'Waiting on employee', test: (r) => r.status === 'waiting_on_employee' },
  resolved: { label: 'Resolved & closed', test: (r) => ['resolved', 'closed', 'rejected', 'cancelled'].includes(r.status) },
}

export default function RequestsPage() {
  const db = useDb()
  const { account } = useSession()
  const navigate = useNavigate()
  const hr = isHR(account)
  const [params, setParams] = useSearchParams()
  const all = useMemo(() => visibleRequests(db, account), [db, account])
  const approvals = all.filter((r) => r.status === 'pending_approval' && canDecide(r.approvals, account.id))
  const view = params.get('view') ?? (hr ? 'queue' : 'mine')
  const filter = params.get('filter') ?? 'open'
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)

  const base =
    view === 'queue' && hr
      ? all.filter((r) => (QUEUE_FILTERS[filter] ?? QUEUE_FILTERS.open!).test(r, account.id))
      : view === 'approvals'
        ? approvals
        : all.filter((r) => r.requesterId === account.id || r.employeeId === account.employeeId)
  const rows = base
    .filter((r) => !category || r.category === category)
    .filter((r) => !query.trim() || `${r.number} ${r.subject} ${r.description}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || a.dueAt.localeCompare(b.dueAt))

  const tabs = [
    {
      value: 'mine',
      label: 'My requests',
      count: all.filter((r) => (r.requesterId === account.id || r.employeeId === account.employeeId) && isOpenRequest(r)).length,
    },
    ...(approvals.length || account.role !== 'employee' ? [{ value: 'approvals', label: 'Awaiting my approval', count: approvals.length }] : []),
    ...(hr ? [{ value: 'queue', label: 'HR queue', count: all.filter(isOpenRequest).length }] : []),
  ]

  return (
    <div>
      <PageHeader
        title="Employee Requests"
        description={
          hr
            ? 'The HR service desk: every employee request with its owner, service target and approvals.'
            : 'Ask HR for letters, equipment, payroll help, changes to your details and more.'
        }
        actions={
          <LinkButton to="/requests/new" variant="primary" icon={Plus}>
            New request
          </LinkButton>
        }
      />
      <Panel>
        <div className="px-4 pt-1">
          <Tabs
            label="Request views"
            tabs={tabs}
            value={view}
            onChange={(v) => {
              setParams({ view: v })
              setPage(1)
            }}
          />
        </div>
        <div className="border-line flex flex-wrap items-center gap-2 border-b px-4 py-3">
          {view === 'queue' && hr && (
            <Select
              aria-label="Queue filter"
              className="w-auto"
              value={filter}
              onChange={(e) => {
                setParams({ view, filter: e.target.value })
                setPage(1)
              }}
              options={Object.entries(QUEUE_FILTERS).map(([value, f]) => ({ value, label: `${f.label} (${all.filter((r) => f.test(r, account.id)).length})` }))}
            />
          )}
          <div className="relative min-w-48 flex-1">
            <Search size={15} className="text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" aria-hidden />
            <Input
              aria-label="Search requests"
              placeholder="Number, subject or description"
              className="pl-9"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <Select
            aria-label="Category"
            className="w-auto"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="All categories"
            options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </div>
        <Table
          caption="Requests"
          rows={rows.slice((page - 1) * 20, page * 20)}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/requests/${r.id}`)}
          empty={
            <EmptyState
              icon={ClipboardList}
              title={view === 'approvals' ? 'Nothing awaiting your approval' : 'No requests here'}
              action={
                view === 'mine' ? (
                  <LinkButton to="/requests/new" size="sm">
                    Create a request
                  </LinkButton>
                ) : undefined
              }
            />
          }
          columns={[
            {
              key: 'subject',
              header: 'Request',
              cell: (r) => (
                <span className="block min-w-0">
                  <a
                    href={`${import.meta.env.BASE_URL}requests/${r.id}`}
                    onClick={(e) => {
                      e.preventDefault()
                      navigate(`/requests/${r.id}`)
                    }}
                    className="text-ink font-medium hover:underline"
                  >
                    {r.subject}
                  </a>
                  <span className="text-muted block text-xs">
                    {r.number} · {CATEGORY_LABELS[r.category]} · {formatRelative(r.createdAt)}
                  </span>
                </span>
              ),
            },
            ...(view !== 'mine'
              ? [
                  {
                    key: 'employee',
                    header: 'Employee',
                    hideBelow: 'md' as const,
                    cell: (r: HRRequest) => <PersonCell employee={db.employees.find((e) => e.id === r.employeeId)} />,
                  },
                ]
              : []),
            { key: 'priority', header: 'Priority', hideBelow: 'lg', cell: (r) => <PriorityBadge priority={r.priority} /> },
            ...(hr
              ? [
                  {
                    key: 'owner',
                    header: 'Owner',
                    hideBelow: 'lg' as const,
                    cell: (r: HRRequest) =>
                      r.assigneeId ? db.accounts.find((a) => a.id === r.assigneeId)?.name : <span className="text-muted">Unassigned</span>,
                  },
                ]
              : []),
            { key: 'due', header: 'Due', hideBelow: 'sm', cell: (r) => <DueLabel due={r.dueAt} done={!isOpenRequest(r)} /> },
            { key: 'status', header: 'Status', cell: (r) => <RequestStatusBadge status={r.status} /> },
          ]}
        />
        <Pagination page={page} pageSize={20} total={rows.length} onChange={setPage} />
      </Panel>
    </div>
  )
}
