import { useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import SegmentedControl from '@/components/ui/SegmentedControl'
import ChartTooltip, { AXIS_PROPS, CHART_COLORS } from '@/components/ui/ChartTooltip'

const SERIES = [
  { key: 'applications', label: 'Applications', color: CHART_COLORS.brand },
  { key: 'interviews', label: 'Interviews', color: CHART_COLORS.sky },
  { key: 'hires', label: 'Hires', color: CHART_COLORS.teal },
]

/** Applications, interviews and hires over time (weekly or monthly). */
export default function HiringActivityChart({ weekly, monthly, height = 260 }) {
  const [range, setRange] = useState('weekly')
  const data = range === 'weekly' ? weekly : monthly
  const xKey = range === 'weekly' ? 'week' : 'month'
  const totals = SERIES.map((s) => ({ ...s, total: data.reduce((sum, d) => sum + d[s.key], 0) }))

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5">
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          {totals.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-xs text-muted">
              <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} aria-hidden />
              {s.label}
              <span className="font-semibold text-ink tabular">{s.total.toLocaleString('en-IN')}</span>
            </li>
          ))}
        </ul>
        <SegmentedControl
          size="sm"
          label="Chart range"
          value={range}
          onChange={setRange}
          options={[
            { value: 'weekly', label: '12 weeks' },
            { value: 'monthly', label: '12 months' },
          ]}
        />
      </div>
      <div className="mt-3 px-2" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="fillApplications" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS.brand} stopOpacity={0.18} />
                <stop offset="100%" stopColor={CHART_COLORS.brand} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis dataKey={xKey} {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={12} />
            <YAxis {...AXIS_PROPS} width={44} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: CHART_COLORS.brandSoft, strokeDasharray: '3 3' }} />
            <Area type="monotone" dataKey="applications" name="Applications" stroke={CHART_COLORS.brand} strokeWidth={2} fill="url(#fillApplications)" animationDuration={500} />
            <Line type="monotone" dataKey="interviews" name="Interviews" stroke={CHART_COLORS.sky} strokeWidth={2} dot={false} animationDuration={500} />
            <Line type="monotone" dataKey="hires" name="Hires" stroke={CHART_COLORS.teal} strokeWidth={2} dot={false} animationDuration={500} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="px-5 pt-1 text-xxs text-faint">Historical series from reporting data (demo).</p>
    </div>
  )
}
