/** Shared Recharts tooltip so every chart in the app reads the same way. */
export default function ChartTooltip({ active, payload, label, formatter, labelFormatter }) {
  if (!active || !payload?.length) return null
  return (
    <div className="border-line bg-surface shadow-pop min-w-36 rounded-lg border px-3 py-2 text-xs">
      {label !== undefined && <p className="text-ink mb-1.5 font-medium">{labelFormatter ? labelFormatter(label, payload) : label}</p>}
      <ul className="space-y-1">
        {payload.map((p) => (
          <li key={p.dataKey ?? p.name} className="flex items-center justify-between gap-4">
            <span className="text-muted flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: p.color ?? p.payload?.fill }} aria-hidden />
              {p.name}
            </span>
            <span className="text-ink tabular font-medium">{formatter ? formatter(p.value, p.name, p) : p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export const CHART_COLORS = {
  brand: '#592ca2',
  brandSoft: '#bda2e3',
  brandFaint: '#ece4f8',
  sky: '#0ea5e9',
  teal: '#14b8a6',
  amber: '#f59e0b',
  slate: '#94a3b8',
  red: '#ef4444',
  green: '#10b981',
  grid: 'var(--color-line)',
  axis: '#9a9ea8',
}

export const AXIS_PROPS = {
  tick: { fill: CHART_COLORS.axis, fontSize: 11, fontFamily: 'Poppins' },
  axisLine: false,
  tickLine: false,
}
