// Historical aggregates that pre-date the records in the demo data set.
// In production these would come from a reporting endpoint.
import { createRng } from './seedUtils'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function buildMonthlyHistory(months = 12) {
  const rng = createRng(19)
  const now = new Date()
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1)
    const growth = 1 + i * 0.045
    const applications = Math.round((140 + rng() * 60) * growth)
    const interviews = Math.round(applications * (0.28 + rng() * 0.06))
    const offers = Math.round(interviews * (0.27 + rng() * 0.05))
    const hires = Math.round(offers * (0.72 + rng() * 0.12))
    return {
      key: `${d.getFullYear()}-${d.getMonth() + 1}`,
      month: `${MONTH_LABELS[d.getMonth()]}${d.getMonth() === 0 ? ` ’${String(d.getFullYear()).slice(2)}` : ''}`,
      applications,
      interviews,
      offers,
      hires,
      timeToHire: Math.round(31 - i * 0.7 + rng() * 5),
    }
  })
}

export function buildWeeklyHistory(weeks = 12) {
  const rng = createRng(23)
  return Array.from({ length: weeks }, (_, i) => {
    const applications = Math.round(34 + i * 1.6 + rng() * 14)
    const interviews = Math.round(applications * (0.3 + rng() * 0.08))
    return {
      key: `w${i}`,
      week: i === weeks - 1 ? 'This wk' : `W-${weeks - 1 - i}`,
      applications,
      interviews,
      hires: Math.round(interviews * (0.18 + rng() * 0.08)),
    }
  })
}

export const mockTimeToHireByDepartment = [
  { departmentId: 'dep-cc', days: 14 },
  { departmentId: 'dep-travel', days: 22 },
  { departmentId: 'dep-hotel', days: 19 },
  { departmentId: 'dep-ofr', days: 33 },
  { departmentId: 'dep-bcf', days: 26 },
  { departmentId: 'dep-eng', days: 38 },
]
