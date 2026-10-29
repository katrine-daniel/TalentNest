import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Download, Plus, Search, Upload, Users } from 'lucide-react'
import { useDb } from '@/app/hooks'
import { useSession } from '@/app/session'
import { canViewEmploymentDetails } from '@/domain/permissions'
import type { Employee, EmployeeStatus } from '@/domain/types'
import { downloadCSV } from '@/lib/csv'
import { formatDate, today } from '@/lib/dates'
import { fullName } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Form'
import { EmptyState, PageHeader, Panel } from '@/components/ui/Layout'
import { Pagination, Table } from '@/components/ui/Table'
import { EmployeeStatusBadge, employeeStatusLabel, PersonCell } from '@/features/shared/display'
import { EmployeeForm } from './EmployeeForm'
import { ImportDialog } from './ImportDialog'

const PAGE = 20
type SortKey = 'name' | 'department' | 'joinDate' | 'location'

export default function PeoplePage() {
  const db = useDb()
  const { account, can } = useSession()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [dept, setDept] = useState('')
  const [loc, setLoc] = useState('')
  const [status, setStatus] = useState<string>('current')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' })
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  useEffect(() => {
    if (params.get('new') && can('people.manage')) setFormOpen(true)
    if (params.get('import') && can('people.manage')) setImportOpen(true)
    if (params.get('new') || params.get('import')) setParams({}, { replace: true })
  }, [params, setParams, can])

  const name = (list: Array<{ id: string; name: string }>, id: string | null) => list.find((x) => x.id === id)?.name ?? '—'
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = db.employees.filter((e) => {
      if (status === 'current' && e.status === 'terminated') return false
      if (status !== 'current' && status !== 'all' && e.status !== status) return false
      if (dept && e.departmentId !== dept) return false
      if (loc && e.locationId !== loc) return false
      return !q || `${e.firstName} ${e.lastName} ${e.preferredName ?? ''} ${e.workEmail} ${e.employeeNo} ${e.title}`.toLowerCase().includes(q)
    })
    const key = (e: Employee) =>
      sort.key === 'name'
        ? fullName(e)
        : sort.key === 'department'
          ? name(db.departments, e.departmentId)
          : sort.key === 'location'
            ? name(db.locations, e.locationId)
            : e.joinDate
    return filtered.sort((a, b) => key(a).localeCompare(key(b)) * (sort.dir === 'asc' ? 1 : -1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, query, dept, loc, status, sort])
  useEffect(() => setPage(1), [query, dept, loc, status])

  const exportCSV = () => {
    // Exports contain work profile fields only; sensitive personal data is never exported here.
    downloadCSV(
      `people-${today()}.csv`,
      ['employee_id', 'first_name', 'last_name', 'work_email', 'title', 'department', 'location', 'employment_type', 'manager', 'join_date', 'status'],
      rows.map((e) => [
        e.employeeNo,
        e.firstName,
        e.lastName,
        e.workEmail,
        e.title,
        name(db.departments, e.departmentId),
        name(db.locations, e.locationId),
        name(db.employmentTypes, e.employmentTypeId),
        e.managerId ? fullName(db.employees.find((m) => m.id === e.managerId) as Employee) : '',
        e.joinDate,
        employeeStatusLabel(e.status),
      ]),
    )
  }

  return (
    <div>
      <PageHeader
        title="People"
        description={`${db.employees.filter((e) => e.status !== 'terminated').length} current employees across ${db.locations.length} locations.`}
        actions={
          <>
            <Button icon={Download} onClick={exportCSV} disabled={!rows.length}>
              Export CSV
            </Button>
            {can('people.manage') && (
              <>
                <Button icon={Upload} onClick={() => setImportOpen(true)}>
                  Import
                </Button>
                <Button variant="primary" icon={Plus} onClick={() => setFormOpen(true)}>
                  Add employee
                </Button>
              </>
            )}
          </>
        }
      />
      <Panel>
        <div className="border-line flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <div className="relative min-w-52 flex-1">
            <Search size={15} className="text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" aria-hidden />
            <Input
              aria-label="Search people"
              placeholder="Name, email, title or employee ID"
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select
            aria-label="Department"
            className="w-auto"
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            placeholder="All departments"
            options={db.departments.map((d) => ({ value: d.id, label: d.name }))}
          />
          <Select
            aria-label="Location"
            className="w-auto"
            value={loc}
            onChange={(e) => setLoc(e.target.value)}
            placeholder="All locations"
            options={db.locations.map((l) => ({ value: l.id, label: l.name }))}
          />
          <Select
            aria-label="Status"
            className="w-auto"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: 'current', label: 'Current employees' },
              { value: 'all', label: 'Everyone incl. former' },
              ...(['pre_boarding', 'active', 'on_leave', 'offboarding', 'terminated'] as EmployeeStatus[]).map((s) => ({
                value: s,
                label: employeeStatusLabel(s),
              })),
            ]}
          />
        </div>
        <Table
          caption="Employees"
          rows={rows.slice((page - 1) * PAGE, page * PAGE)}
          rowKey={(e) => e.id}
          onRowClick={(e) => navigate(`/people/${e.id}`)}
          sort={sort}
          onSort={(k) => setSort((s) => ({ key: k as SortKey, dir: s.key === k && s.dir === 'asc' ? 'desc' : 'asc' }))}
          empty={
            <EmptyState
              icon={Users}
              title="No people match these filters"
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setQuery('')
                    setDept('')
                    setLoc('')
                    setStatus('current')
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          }
          columns={[
            { key: 'name', header: 'Name', sortable: true, cell: (e) => <PersonCell employee={e} sub={`${e.title} · ${e.employeeNo}`} /> },
            { key: 'department', header: 'Department', sortable: true, hideBelow: 'md', cell: (e) => name(db.departments, e.departmentId) },
            { key: 'location', header: 'Location', sortable: true, hideBelow: 'lg', cell: (e) => name(db.locations, e.locationId) },
            {
              key: 'manager',
              header: 'Manager',
              hideBelow: 'lg',
              cell: (e) => {
                const m = db.employees.find((x) => x.id === e.managerId)
                return m ? (
                  <Link to={`/people/${m.id}`} className="hover:underline" onClick={(ev) => ev.stopPropagation()}>
                    {fullName(m)}
                  </Link>
                ) : (
                  '—'
                )
              },
            },
            { key: 'joinDate', header: 'Joined', sortable: true, hideBelow: 'md', cell: (e) => <span className="tabular">{formatDate(e.joinDate)}</span> },
            {
              key: 'status',
              header: 'Status',
              cell: (e) => (canViewEmploymentDetails(account, e, db) || e.status !== 'terminated' ? <EmployeeStatusBadge status={e.status} /> : null),
            },
          ]}
        />
        <Pagination page={page} pageSize={PAGE} total={rows.length} onChange={setPage} />
      </Panel>
      <EmployeeForm open={formOpen} onClose={() => setFormOpen(false)} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}
