import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts'
import ChartTooltip, { AXIS_PROPS, CHART_COLORS } from '@/components/ui/ChartTooltip'
import EmptyState from '@/components/ui/EmptyState'
import { getStatusMeta } from '@/utils/statusHelpers'

/*
 * Analytics chart set. Every chart uses the shared tooltip, axis styling and a
 * restrained palette; each sits in a ResponsiveContainer so it resizes with its panel.
 */

const pct = (v) => `${v}%`
const FUNNEL_RAMP = ['#3d1e6f', '#592ca2', '#7a4bbd', '#9670cf', '#b89de2']

function ChartFrame({ height = 260, children, empty }) {
  if (empty) return <EmptyState compact title="Not enough data" description="Adjust the filters to include more records." />
  return (
    <div className="px-2 pb-4" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  )
}

function LegendRow({ items }) {
  return (
    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2">
      {items.map((i) => (
        <li key={i.label} className="text-xxs text-muted flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: i.color }} aria-hidden />
          {i.label}
          {i.value !== undefined && <strong className="text-ink tabular font-semibold">{i.value}</strong>}
        </li>
      ))}
    </ul>
  )
}

export function FunnelChart({ data }) {
  return (
    <ChartFrame empty={!data[0]?.count}>
      <BarChart data={data} margin={{ top: 16, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis dataKey="label" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} allowDecimals={false} />
        <Tooltip
          content={
            <ChartTooltip
              formatter={(v, n, p) => `${v}${p.payload.conversion && p.payload.key !== 'application' ? ` (${p.payload.conversion}% of previous)` : ''}`}
            />
          }
          cursor={{ fill: 'var(--color-subtle)' }}
        />
        <Bar dataKey="count" name="Candidates" radius={[4, 4, 0, 0]} maxBarSize={56} label={{ position: 'top', fontSize: 11, fill: 'var(--color-ink-soft)' }}>
          {data.map((d, i) => (
            <Cell key={d.key} fill={i === data.length - 1 ? CHART_COLORS.teal : (FUNNEL_RAMP[i] ?? FUNNEL_RAMP.at(-1))} />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  )
}

export function DepartmentDistributionChart({ data }) {
  const series = [
    { key: 'early', label: 'Applied & screening', color: '#d9c9f0' },
    { key: 'assessment', label: 'Assessment', color: '#b89de2' },
    { key: 'interview', label: 'Interviews', color: '#7a4bbd' },
    { key: 'late', label: 'Decision & offer', color: '#3d1e6f' },
    { key: 'hired', label: 'Hired', color: CHART_COLORS.teal },
  ]
  return (
    <div>
      <ChartFrame height={250} empty={!data.length}>
        <BarChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }} barSize={22}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey="short" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} allowDecimals={false} />
          <Tooltip content={<ChartTooltip labelFormatter={(l, p) => p?.[0]?.payload?.name ?? l} />} cursor={{ fill: 'var(--color-subtle)' }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId="d" fill={s.color} radius={i === series.length - 1 ? [3, 3, 0, 0] : 0} />
          ))}
        </BarChart>
      </ChartFrame>
      <LegendRow items={series.map((s) => ({ label: s.label, color: s.color }))} />
    </div>
  )
}

export function PassRateChart({ data }) {
  return (
    <ChartFrame height={Math.max(180, data.length * 44 + 30)} empty={!data.length}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, left: 0, bottom: 0 }} barSize={14}>
        <CartesianGrid stroke={CHART_COLORS.grid} horizontal={false} />
        <XAxis type="number" domain={[0, 100]} {...AXIS_PROPS} tickFormatter={pct} />
        <YAxis type="category" dataKey="name" {...AXIS_PROPS} width={150} tick={{ ...AXIS_PROPS.tick, fill: 'var(--color-ink-soft)' }} />
        <Tooltip
          content={<ChartTooltip formatter={(v, n, p) => `${v}% (${p.payload.passed}/${p.payload.evaluated}, pass mark ${p.payload.passMark}%)`} />}
          cursor={{ fill: 'var(--color-subtle)' }}
        />
        <Bar dataKey="rate" name="Pass rate" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: 'var(--color-ink-soft)', formatter: pct }}>
          {data.map((d) => (
            <Cell key={d.id} fill={d.rate < 50 ? CHART_COLORS.amber : CHART_COLORS.brand} />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  )
}

export function InterviewConversionChart({ data }) {
  return (
    <ChartFrame height={Math.max(180, data.length * 40 + 30)} empty={!data.length}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, left: 0, bottom: 0 }} barSize={14}>
        <CartesianGrid stroke={CHART_COLORS.grid} horizontal={false} />
        <XAxis type="number" domain={[0, 100]} {...AXIS_PROPS} tickFormatter={pct} />
        <YAxis type="category" dataKey="stage" {...AXIS_PROPS} width={150} tick={{ ...AXIS_PROPS.tick, fill: 'var(--color-ink-soft)' }} />
        <Tooltip
          content={<ChartTooltip formatter={(v, n, p) => `${v}% advanced (${p.payload.advanced} of ${p.payload.completed})`} />}
          cursor={{ fill: 'var(--color-subtle)' }}
        />
        <Bar
          dataKey="rate"
          name="Recommended to advance"
          fill={CHART_COLORS.sky}
          radius={[0, 4, 4, 0]}
          label={{ position: 'right', fontSize: 11, fill: 'var(--color-ink-soft)', formatter: pct }}
        />
      </BarChart>
    </ChartFrame>
  )
}

export function TimeToHireTrend({ data }) {
  const withHires = data.filter((d) => d.timeToHire !== null)
  const avg = withHires.length ? Math.round(withHires.reduce((s, d) => s + d.timeToHire, 0) / withHires.length) : null
  return (
    <ChartFrame empty={!withHires.length}>
      <LineChart data={data} margin={{ top: 12, right: 16, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis dataKey="month" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} unit="d" />
        <Tooltip content={<ChartTooltip formatter={(v, n, p) => `${v} days · ${p.payload.hires} hire(s)`} />} />
        {avg !== null && (
          <ReferenceLine
            y={avg}
            stroke={CHART_COLORS.slate}
            strokeDasharray="4 4"
            label={{ value: `avg ${avg}d`, position: 'insideTopRight', fontSize: 10, fill: CHART_COLORS.axis }}
          />
        )}
        <Line
          type="monotone"
          dataKey="timeToHire"
          name="Time to hire"
          stroke={CHART_COLORS.brand}
          strokeWidth={2}
          dot={{ r: 3, fill: CHART_COLORS.brand }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ChartFrame>
  )
}

export function TimeToHireByDepartment({ data }) {
  return (
    <ChartFrame height={240} empty={!data.length}>
      <BarChart data={data} margin={{ top: 16, right: 12, left: -18, bottom: 0 }} barSize={28}>
        <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis dataKey="short" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} unit="d" />
        <Tooltip
          content={<ChartTooltip labelFormatter={(l, p) => p?.[0]?.payload?.name ?? l} formatter={(v, n, p) => `${v} days · ${p.payload.hires} hire(s)`} />}
          cursor={{ fill: 'var(--color-subtle)' }}
        />
        <Bar
          dataKey="days"
          name="Avg. time to hire"
          fill={CHART_COLORS.brand}
          radius={[4, 4, 0, 0]}
          label={{ position: 'top', fontSize: 11, fill: CHART_COLORS.axis }}
        />
      </BarChart>
    </ChartFrame>
  )
}

function Donut({ data, centerLabel, centerValue }) {
  return (
    <div>
      <div className="relative h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<ChartTooltip />} />
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="none" animationDuration={500}>
              {data.map((d) => (
                <Cell key={d.label} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular text-2xl font-semibold">{centerValue}</span>
          <span className="text-xxs text-muted">{centerLabel}</span>
        </div>
      </div>
      <LegendRow items={data.map((d) => ({ label: d.label, color: d.color, value: d.value }))} />
    </div>
  )
}

export function OfferAcceptanceChart({ stats }) {
  const data = [
    { label: 'Accepted', value: stats.accepted, color: CHART_COLORS.teal },
    { label: 'Declined', value: stats.declined, color: CHART_COLORS.red },
    { label: 'Pending', value: stats.pending, color: CHART_COLORS.amber },
    { label: 'Draft', value: stats.draft, color: CHART_COLORS.slate },
  ].filter((d) => d.value > 0)
  if (!data.length) return <EmptyState compact title="No offers yet" />
  return <Donut data={data} centerValue={stats.acceptanceRate === null ? '—' : `${stats.acceptanceRate}%`} centerLabel="acceptance" />
}

export function VacancyStatusChart({ data }) {
  const colors = { open: CHART_COLORS.brand, 'on-hold': CHART_COLORS.amber, draft: CHART_COLORS.slate, closed: '#d5d6dd' }
  const rows = data.filter((d) => d.count > 0).map((d) => ({ label: getStatusMeta('job', d.status).label, value: d.count, color: colors[d.status] }))
  if (!rows.length) return <EmptyState compact title="No vacancies" />
  return <Donut data={rows} centerValue={rows.reduce((s, r) => s + r.value, 0)} centerLabel="vacancies" />
}

export function RecruiterWorkloadChart({ data }) {
  return (
    <ChartFrame height={Math.max(200, data.length * 52 + 40)} empty={!data.length}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barSize={10} barGap={2}>
        <CartesianGrid stroke={CHART_COLORS.grid} horizontal={false} />
        <XAxis type="number" {...AXIS_PROPS} allowDecimals={false} />
        <YAxis type="category" dataKey="name" {...AXIS_PROPS} width={70} tick={{ ...AXIS_PROPS.tick, fill: 'var(--color-ink-soft)' }} />
        <Tooltip content={<ChartTooltip labelFormatter={(l, p) => p?.[0]?.payload?.fullName ?? l} />} cursor={{ fill: 'var(--color-subtle)' }} />
        <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11, color: CHART_COLORS.axis }} />
        <Bar dataKey="candidates" name="Active candidates" fill={CHART_COLORS.brand} radius={[0, 3, 3, 0]} />
        <Bar dataKey="interviews" name="Upcoming interviews" fill={CHART_COLORS.sky} radius={[0, 3, 3, 0]} />
        <Bar dataKey="vacancies" name="Open vacancies" fill={CHART_COLORS.brandSoft} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ChartFrame>
  )
}

export function SourceChart({ data }) {
  return (
    <ChartFrame height={Math.max(180, data.length * 32 + 30)} empty={!data.length}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 32, left: 0, bottom: 0 }} barSize={12}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="source" {...AXIS_PROPS} width={100} tick={{ ...AXIS_PROPS.tick, fill: 'var(--color-ink-soft)' }} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-subtle)' }} />
        <Bar
          dataKey="count"
          name="Applications"
          fill={CHART_COLORS.brand}
          radius={[0, 4, 4, 0]}
          label={{ position: 'right', fontSize: 11, fill: 'var(--color-ink-soft)' }}
        />
      </BarChart>
    </ChartFrame>
  )
}
