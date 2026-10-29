import { useMemo, useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3, Download, Info, Table2 } from 'lucide-react'
import { useDb } from '@/app/hooks'
import { useSession } from '@/app/session'
import {
  approvalTurnaround,
  DEFINITIONS,
  headcountBy,
  leaveUsage,
  MIN_GROUP,
  movementByMonth,
  onboardingMetrics,
  requestMetrics,
  workforceSummary,
  type Range,
} from '@/domain/analytics'
import { reportIds } from '@/domain/permissions'
import { addDays, today } from '@/lib/dates'
import { downloadCSV } from '@/lib/csv'
import { acknowledgmentStats } from '@/services/policies'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Form'
import { EmptyState, PageHeader, Panel, Stat } from '@/components/ui/Layout'
import { CATEGORY_LABELS } from '@/features/shared/display'

// Validated with the dataviz palette script (light surface): indigo / amber, CVD ΔE 33.8.
const SERIES = { primary: '#4338CA', secondary: '#D97706' }
const AXIS = { fontSize: 12, fill: '#62677A' }

function Def({ k }: { k: keyof typeof DEFINITIONS }) {
  return (
    <span className="text-muted inline-flex cursor-help items-center" title={DEFINITIONS[k]?.formula}>
      <Info size={12} aria-label={`How this is calculated: ${DEFINITIONS[k]?.formula}`} />
    </span>
  )
}

/** Chart panel with a table view, CSV export and an empty state. */
function ChartPanel({
  title,
  formula,
  rows,
  columns,
  filename,
  chart,
  empty,
}: {
  title: string
  formula: string
  rows: Array<Record<string, string | number | null>>
  columns: Array<[string, string]>
  filename: string
  chart: ReactNode
  empty: boolean
}) {
  const [table, setTable] = useState(false)
  return (
    <Panel
      title={title}
      actions={
        !empty && (
          <span className="flex gap-1">
            <Button size="sm" variant="ghost" icon={table ? BarChart3 : Table2} aria-pressed={table} onClick={() => setTable((t) => !t)}>
              {table ? 'Chart' : 'Table'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={Download}
              onClick={() =>
                downloadCSV(
                  `${filename}-${today()}.csv`,
                  columns.map((c) => c[1]),
                  rows.map((r) => columns.map((c) => r[c[0]] ?? '')),
                )
              }
            >
              CSV
            </Button>
          </span>
        )
      }
    >
      <div className="p-4">
        {empty ? (
          <EmptyState title="Not enough data for this period" description="Widen the date range or clear the department filter." compact />
        ) : table ? (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr className="border-line border-b">
                  {columns.map(([k, label]) => (
                    <th key={k} scope="col" className="text-muted py-2 pr-4 text-left text-xs font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-line border-b last:border-0">
                    {columns.map(([k]) => (
                      <td key={k} className="tabular py-1.5 pr-4">
                        {r[k] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div role="img" aria-label={`${title} chart. Use the Table button for the underlying values.`}>
            {chart}
          </div>
        )}
        <p className="text-muted mt-3 text-xs">{formula}</p>
      </div>
    </Panel>
  )
}

const PRESETS: Record<string, number | 'ytd'> = { '90': 90, '180': 180, '365': 365, ytd: 'ytd' }

export default function AnalyticsPage() {
  const db = useDb()
  const { account, can } = useSession()
  const [preset, setPreset] = useState('365')
  const [custom, setCustom] = useState({ from: addDays(today(), -365), to: today() })
  // Managers without people.view_all see their own department only.
  const managerDept = !can('people.view_all') ? (db.employees.find((e) => e.id === account.employeeId)?.departmentId ?? null) : null
  const [dept, setDept] = useState<string>(managerDept ?? '')
  const range: Range = useMemo(() => {
    const T = today()
    const p = PRESETS[preset]
    const from = preset === 'custom' ? custom.from : p === 'ytd' ? `${T.slice(0, 4)}-01-01` : addDays(T, -(p as number))
    return { from, to: preset === 'custom' ? custom.to : T, departmentId: managerDept ?? (dept || null) }
  }, [preset, custom, dept, managerDept])

  const summary = workforceSummary(db, range)
  const byDept = headcountBy(db, 'departmentId', range)
  const byLoc = headcountBy(db, 'locationId', range)
  const movement = movementByMonth(db, range)
  const reqs = requestMetrics(db, range)
  const approvals = approvalTurnaround(db, range)
  const onboarding = onboardingMetrics(db, range)
  const leave = leaveUsage(db, range)
  const ackPolicies = db.policies.filter((p) => p.requiresAcknowledgment && p.publishedVersion !== null).map((p) => ({ p, s: acknowledgmentStats(db, p) }))
  const hours = (h: number | null) => (h === null ? '—' : h < 48 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} d`)
  const pct = (v: number | null) => (v === null ? '—' : `${v}%`)
  const teamSize = reportIds(db.employees, account.employeeId).size

  return (
    <div>
      <PageHeader
        title="Workforce Analytics"
        description="Calculated from current records only. Hover the info icons for each formula. Correlations shown here are not evidence of cause."
      />
      <div className="border-line bg-surface mb-5 flex flex-wrap items-end gap-3 rounded-lg border px-4 py-3">
        <Field label="Period">
          {(a) => (
            <Select
              {...a}
              className="w-auto"
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              options={[
                { value: '90', label: 'Last 90 days' },
                { value: '180', label: 'Last 6 months' },
                { value: '365', label: 'Last 12 months' },
                { value: 'ytd', label: 'Year to date' },
                { value: 'custom', label: 'Custom range' },
              ]}
            />
          )}
        </Field>
        {preset === 'custom' && (
          <>
            <Field label="From">
              {(a) => <Input {...a} type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />}
            </Field>
            <Field label="To">{(a) => <Input {...a} type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />}</Field>
          </>
        )}
        <Field label="Department">
          {(a) => (
            <Select
              {...a}
              className="w-auto"
              disabled={Boolean(managerDept)}
              value={managerDept ?? dept}
              onChange={(e) => setDept(e.target.value)}
              placeholder="All departments"
              options={db.departments.map((d) => ({ value: d.id, label: d.name }))}
            />
          )}
        </Field>
        {managerDept && <p className="text-muted pb-2 text-xs">Showing your department only ({teamSize} reports).</p>}
      </div>

      <section
        aria-label="Key figures"
        className="border-line bg-surface shadow-card mb-5 grid grid-cols-2 gap-5 rounded-lg border p-5 md:grid-cols-4 xl:grid-cols-8"
      >
        <Stat
          label={
            <>
              Headcount <Def k="headcount" />
            </>
          }
          value={summary.end}
          hint={`${summary.start} at period start`}
        />
        <Stat label="Joiners" value={summary.joiners} />
        <Stat label="Leavers" value={summary.leavers} />
        <Stat label="Turnover" value={pct(summary.turnover)} />
        <Stat label="Open requests" value={reqs.open} />
        <Stat label="Overdue requests" value={reqs.overdue} tone={reqs.overdue ? 'danger' : 'default'} />
        <Stat label="Median resolution" value={hours(reqs.medianResolutionHours)} hint={`${reqs.resolved} resolved`} />
        <Stat label="Approval turnaround" value={hours(approvals.medianHours)} hint={`${approvals.decisions} decisions`} />
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartPanel
          title="Headcount by department"
          formula={DEFINITIONS.headcount?.formula ?? ''}
          filename="headcount-by-department"
          empty={!byDept.length}
          rows={byDept.map((d) => ({ name: d.name, count: d.count }))}
          columns={[
            ['name', 'Department'],
            ['count', 'Employees'],
          ]}
          chart={
            <ResponsiveContainer width="100%" height={Math.max(160, byDept.length * 34)}>
              <BarChart data={byDept} layout="vertical" margin={{ left: 8, right: 24 }} barCategoryGap={6}>
                <CartesianGrid horizontal={false} stroke="#E6E8F0" />
                <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={150} tick={AXIS} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#F1F2F7' }} />
                <Bar
                  dataKey="count"
                  name="Employees"
                  fill={SERIES.primary}
                  radius={[0, 4, 4, 0]}
                  maxBarSize={22}
                  label={{ position: 'right', fontSize: 12, fill: '#3B3F52' }}
                />
              </BarChart>
            </ResponsiveContainer>
          }
        />
        <ChartPanel
          title="Joiners and leavers by month"
          formula={`${DEFINITIONS.joiners?.formula} ${DEFINITIONS.leavers?.formula}`}
          filename="joiners-leavers"
          empty={!movement.some((m) => m.joiners || m.leavers)}
          rows={movement}
          columns={[
            ['month', 'Month'],
            ['joiners', 'Joiners'],
            ['leavers', 'Leavers'],
          ]}
          chart={
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={movement} margin={{ left: -16, right: 8 }} barGap={2}>
                <CartesianGrid vertical={false} stroke="#E6E8F0" />
                <XAxis dataKey="month" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#F1F2F7' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="joiners" name="Joiners" fill={SERIES.primary} radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Bar dataKey="leavers" name="Leavers" fill={SERIES.secondary} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          }
        />
        <ChartPanel
          title="Requests by category"
          formula="Service requests submitted in the period, by category."
          filename="requests-by-category"
          empty={!reqs.byCategory.length}
          rows={reqs.byCategory.map((c) => ({ category: CATEGORY_LABELS[c.category] ?? c.category, count: c.count }))}
          columns={[
            ['category', 'Category'],
            ['count', 'Requests'],
          ]}
          chart={
            <ResponsiveContainer width="100%" height={Math.max(160, reqs.byCategory.length * 34)}>
              <BarChart
                data={reqs.byCategory.map((c) => ({ ...c, label: CATEGORY_LABELS[c.category] ?? c.category }))}
                layout="vertical"
                margin={{ left: 8, right: 24 }}
                barCategoryGap={6}
              >
                <CartesianGrid horizontal={false} stroke="#E6E8F0" />
                <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={150} tick={AXIS} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#F1F2F7' }} />
                <Bar
                  dataKey="count"
                  name="Requests"
                  fill={SERIES.primary}
                  radius={[0, 4, 4, 0]}
                  maxBarSize={22}
                  label={{ position: 'right', fontSize: 12, fill: '#3B3F52' }}
                />
              </BarChart>
            </ResponsiveContainer>
          }
        />
        <ChartPanel
          title="Headcount by location"
          formula={DEFINITIONS.headcount?.formula ?? ''}
          filename="headcount-by-location"
          empty={!byLoc.length}
          rows={byLoc.map((d) => ({ name: d.name, count: d.count }))}
          columns={[
            ['name', 'Location'],
            ['count', 'Employees'],
          ]}
          chart={
            <ResponsiveContainer width="100%" height={Math.max(140, byLoc.length * 34)}>
              <BarChart data={byLoc} layout="vertical" margin={{ left: 8, right: 24 }} barCategoryGap={6}>
                <CartesianGrid horizontal={false} stroke="#E6E8F0" />
                <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={150} tick={AXIS} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#F1F2F7' }} />
                <Bar
                  dataKey="count"
                  name="Employees"
                  fill={SERIES.primary}
                  radius={[0, 4, 4, 0]}
                  maxBarSize={22}
                  label={{ position: 'right', fontSize: 12, fill: '#3B3F52' }}
                />
              </BarChart>
            </ResponsiveContainer>
          }
        />
        <Panel title="Service levels & onboarding" bodyClassName="grid grid-cols-2 gap-5 p-5">
          <Stat label="Resolved within target" value={pct(reqs.slaMet)} hint={DEFINITIONS.slaMet?.formula} />
          <Stat
            label="Onboarding tasks on time"
            value={pct(onboarding.rate)}
            hint={`${onboarding.onTime} of ${onboarding.due} due · ${DEFINITIONS.onboardingCompletion?.formula}`}
          />
          <Stat label="Active onboarding" value={onboarding.activeOnboarding} />
          <Stat label="Active offboarding" value={onboarding.activeOffboarding} />
        </Panel>
        <Panel
          title="Leave taken by type"
          actions={
            <Button
              size="sm"
              variant="ghost"
              icon={Download}
              onClick={() =>
                downloadCSV(
                  `leave-usage-${today()}.csv`,
                  ['Leave type', 'People', 'Days'],
                  leave.map((l) => [l.name, l.suppressed ? `<${MIN_GROUP}` : l.people, l.suppressed ? 'hidden' : l.days]),
                )
              }
            >
              CSV
            </Button>
          }
        >
          <table className="w-full text-sm">
            <caption className="sr-only">Leave taken by type</caption>
            <thead>
              <tr className="border-line border-b">
                <th scope="col" className="text-muted px-4 py-2 text-left text-xs font-medium">
                  Type
                </th>
                <th scope="col" className="text-muted px-4 py-2 text-right text-xs font-medium">
                  People
                </th>
                <th scope="col" className="text-muted px-4 py-2 text-right text-xs font-medium">
                  Working days
                </th>
              </tr>
            </thead>
            <tbody>
              {leave.map((l) => (
                <tr key={l.id} className="border-line border-b last:border-0">
                  <td className="px-4 py-2">{l.name}</td>
                  <td className="tabular px-4 py-2 text-right">{l.suppressed ? <span className="text-muted">&lt; {MIN_GROUP}</span> : l.people}</td>
                  <td className="tabular px-4 py-2 text-right">{l.suppressed ? <span className="text-muted">hidden</span> : l.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-muted px-4 py-3 text-xs">{DEFINITIONS.leaveUsage?.formula}</p>
        </Panel>
        {ackPolicies.length > 0 && (
          <Panel title="Policy acknowledgment">
            <ul className="divide-line divide-y">
              {ackPolicies.map(({ p, s }) => (
                <li key={p.id} className="px-4 py-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <span>
                      {p.title} (v{p.publishedVersion})
                    </span>
                    <span className="tabular">{s ? `${s.acknowledged}/${s.audience}` : '—'}</span>
                  </div>
                  {s && s.audience > 0 && (
                    <span
                      className="bg-subtle mt-1.5 block h-1.5 overflow-hidden rounded-full"
                      role="progressbar"
                      aria-valuenow={Math.round((s.acknowledged / s.audience) * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${p.title} acknowledged`}
                    >
                      <span className="bg-success block h-full" style={{ width: `${(s.acknowledged / s.audience) * 100}%` }} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-muted px-4 py-3 text-xs">{DEFINITIONS.ackRate?.formula}</p>
          </Panel>
        )}
      </div>
    </div>
  )
}
