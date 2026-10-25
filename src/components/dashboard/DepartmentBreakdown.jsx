import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import ChartTooltip, { AXIS_PROPS, CHART_COLORS } from '@/components/ui/ChartTooltip'
import EmptyState from '@/components/ui/EmptyState'
import { BREAKDOWN_GROUPS } from '@/services/analyticsService'

// A single-hue ramp keeps the stacked bars calm; order follows pipeline progress.
const GROUP_COLORS = { early: '#d9c9f0', assessment: '#b89de2', interview: '#7a4bbd', late: '#3d1e6f' }

/** Active candidates per department, stacked by pipeline phase. */
export default function DepartmentBreakdown({ rows }) {
  if (!rows.length) return <EmptyState compact title="No active candidates" description="Candidates appear here once they apply to a vacancy." />
  const height = rows.length * 38 + 36

  return (
    <div className="px-2">
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 px-3">
        {BREAKDOWN_GROUPS.map((g) => (
          <li key={g.key} className="flex items-center gap-1.5 text-xxs text-muted">
            <span className="h-2 w-2 rounded-sm" style={{ background: GROUP_COLORS[g.key] }} aria-hidden />
            {g.label}
          </li>
        ))}
      </ul>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }} barSize={14}>
            <CartesianGrid stroke={CHART_COLORS.grid} horizontal={false} />
            <XAxis type="number" {...AXIS_PROPS} allowDecimals={false} />
            <YAxis type="category" dataKey="name" {...AXIS_PROPS} width={132} tick={{ ...AXIS_PROPS.tick, fill: '#3a3d46' }} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f3f3f6' }} />
            {BREAKDOWN_GROUPS.map((g, i) => (
              <Bar
                key={g.key}
                dataKey={g.key}
                name={g.label}
                stackId="a"
                fill={GROUP_COLORS[g.key]}
                radius={i === BREAKDOWN_GROUPS.length - 1 ? [0, 4, 4, 0] : 0}
                animationDuration={450}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
