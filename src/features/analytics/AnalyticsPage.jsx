import { useMemo } from 'react'
import { Download, Info } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import DataTable from '@/components/ui/DataTable'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { FilterSelect } from '@/components/ui/FormControls'
import RecruitmentMetrics from '@/features/analytics/components/RecruitmentMetrics'
import {
  DepartmentDistributionChart,
  FunnelChart,
  InterviewConversionChart,
  OfferAcceptanceChart,
  PassRateChart,
  RecruiterWorkloadChart,
  TimeToHireByDepartment,
  TimeToHireTrend,
  VacancyStatusChart,
} from '@/features/analytics/components/HiringCharts'
import { useDbData } from '@/hooks/useStore'
import { useOrgOptions } from '@/features/jobs/hooks/useJobs'
import { useUrlFilters } from '@/hooks/useUrlFilters'
import { useToast } from '@/components/ui/Toast'
import {
  METRIC_DEFINITIONS,
  getAssessmentPassRates,
  getDepartmentBreakdown,
  getFunnel,
  getInterviewCompletion,
  getInterviewConversion,
  getOfferStats,
  getOpenRoles,
  getOverallTimeToHire,
  getRecruiterWorkload,
  getSourceEffectiveness,
  getTimeToHire,
  getTimeToHireTrend,
  getVacancyStatus,
  rate,
} from './analyticsService'
import { downloadCsv } from '@/utils/exportCsv'
import { toInputDate } from '@/utils/formatDate'

const RANGES = [
  { value: '30', label: '30 days', months: 3 },
  { value: '90', label: '90 days', months: 4 },
  { value: '180', label: '6 months', months: 6 },
  { value: '365', label: '12 months', months: 12 },
]

const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`)

function ExportButton({ name, rows, label = 'CSV' }) {
  const toast = useToast()
  return (
    <Button
      size="xs"
      variant="ghost"
      icon={Download}
      aria-label={`Export ${name} as CSV`}
      onClick={() => {
        downloadCsv(`talentnest-${name}-${toInputDate(new Date())}.csv`, rows())
        toast.success(`Exported ${name.replace(/-/g, ' ')}`)
      }}
    >
      {label}
    </Button>
  )
}

export default function AnalyticsPage() {
  const data = useDbData()
  const options = useOrgOptions()
  const { filters, setFilter } = useUrlFilters({ range: '90', department: 'all' })
  const range = RANGES.find((r) => r.value === filters.range) ?? RANGES[1]
  const scope = useMemo(() => ({ departmentId: filters.department, sinceDays: Number(range.value) }), [filters.department, range.value])

  const report = useMemo(() => {
    const funnel = getFunnel(data, scope)
    const passRates = getAssessmentPassRates(data, scope)
    const evaluated = passRates.reduce((s, r) => s + r.evaluated, 0)
    const passed = passRates.reduce((s, r) => s + r.passed, 0)
    const count = (key) => funnel.find((f) => f.key === key)?.count ?? 0
    const offers = getOfferStats(data, scope)
    const tth = getOverallTimeToHire(data, scope)
    const completion = getInterviewCompletion(data, scope)
    return {
      funnel,
      passRates,
      offers,
      completion,
      conversion: getInterviewConversion(data, scope),
      tthDept: getTimeToHire(data).filter((d) => filters.department === 'all' || d.departmentId === filters.department),
      trend: getTimeToHireTrend(data, { months: range.months, departmentId: filters.department }),
      departments: getDepartmentBreakdown(data, scope).filter((d) => filters.department === 'all' || d.departmentId === filters.department),
      vacancies: getVacancyStatus(data, scope),
      workload: getRecruiterWorkload(data),
      sources: getSourceEffectiveness(data, scope),
      openRoles: getOpenRoles(data, scope),
      kpis: {
        applications: count('application'),
        appToInterview: rate(count('interview'), count('application')),
        avgTimeToHire: tth.days,
        hires: tth.hires,
        passRate: rate(passed, evaluated),
        interviewToOffer: rate(count('offer'), count('interview')),
        offerAcceptance: offers.acceptanceRate,
        feedbackCompletion: completion.rate,
      },
    }
  }, [data, scope, filters.department, range.months])

  const deptLabel = options.departments.find((d) => d.value === filters.department)?.label ?? 'All departments'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Analytics"
        description={`Computed from recorded applications, interviews and offers · ${deptLabel} · last ${range.label}`}
        actions={
          <>
            <SegmentedControl
              label="Date range"
              options={RANGES}
              value={range.value}
              onChange={(v) => setFilter('range', v)}
              className="w-full justify-between sm:w-auto"
            />
            <FilterSelect
              label="Department"
              value={filters.department}
              onChange={(v) => setFilter('department', v)}
              options={options.departments}
              className="w-full sm:w-52"
            />
            <ExportButton
              name="summary"
              label="Export summary"
              rows={() => [
                ['TalentNest recruitment report', `Range: last ${range.label}`, `Department: ${deptLabel}`],
                [],
                ['Metric', 'Value', 'Definition'],
                ['Applications', report.kpis.applications, METRIC_DEFINITIONS.applications],
                ['Application → interview (%)', report.kpis.appToInterview ?? '', METRIC_DEFINITIONS.applicationToInterview],
                ['Avg. time to hire (days)', report.kpis.avgTimeToHire ?? '', METRIC_DEFINITIONS.timeToHire],
                ['Assessment pass rate (%)', report.kpis.passRate ?? '', METRIC_DEFINITIONS.passRate],
                ['Interview → offer (%)', report.kpis.interviewToOffer ?? '', METRIC_DEFINITIONS.interviewToOffer],
                ['Offer acceptance (%)', report.kpis.offerAcceptance ?? '', METRIC_DEFINITIONS.offerAcceptance],
                ['Feedback completion (%)', report.kpis.feedbackCompletion ?? '', METRIC_DEFINITIONS.feedbackCompletion],
                [],
                ['Funnel stage', 'Applications', 'Conversion from previous (%)'],
                ...report.funnel.map((f) => [f.label, f.count, f.conversion]),
              ]}
            />
          </>
        }
      />

      <RecruitmentMetrics {...report.kpis} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel
          title="Recruitment funnel"
          description="Applications reaching each step"
          actions={
            <ExportButton
              name="funnel"
              rows={() => [['Step', 'Applications', 'Conversion (%)'], ...report.funnel.map((f) => [f.label, f.count, f.conversion])]}
            />
          }
        >
          <FunnelChart data={report.funnel} />
        </Panel>
        <Panel title="Department-wise candidates" description="Active candidates by phase, plus hires">
          <DepartmentDistributionChart data={report.departments} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel
          title="Source effectiveness"
          description="Interview reach and hires per candidate source"
          actions={
            <ExportButton
              name="sources"
              rows={() => [
                ['Source', 'Applications', 'Reached interview', 'Hired', 'Interview rate (%)', 'Hire rate (%)'],
                ...report.sources.map((s) => [s.source, s.applications, s.interviewed, s.hired, s.interviewRate ?? '', s.hireRate ?? '']),
              ]}
            />
          }
        >
          <DataTable
            dense
            rows={report.sources}
            getRowId={(r) => r.source}
            empty={<p className="text-muted px-5 pb-5 text-sm">No applications in this period.</p>}
            columns={[
              { key: 'source', header: 'Source', render: (r) => <span className="font-medium">{r.source}</span> },
              { key: 'applications', header: 'Apps', align: 'right' },
              { key: 'interviewRate', header: '→ Interview', align: 'right', render: (r) => pct(r.interviewRate) },
              { key: 'hireRate', header: '→ Hired', align: 'right', render: (r) => pct(r.hireRate) },
            ]}
          />
        </Panel>
        <Panel
          title="Open roles & applicants"
          description="Applicants received per open vacancy (all time)"
          actions={
            <ExportButton
              name="open-roles"
              rows={() => [
                ['Vacancy', 'Openings', 'Applicants', 'Active', 'Hired'],
                ...report.openRoles.map((r) => [r.title, r.openings, r.applicants, r.active, r.hired]),
              ]}
            />
          }
        >
          <DataTable
            dense
            rows={report.openRoles}
            empty={<p className="text-muted px-5 pb-5 text-sm">No open vacancies.</p>}
            columns={[
              { key: 'title', header: 'Vacancy', render: (r) => <span className="block max-w-56 truncate font-medium">{r.title}</span> },
              { key: 'openings', header: 'Openings', align: 'right', hideBelow: 'md' },
              { key: 'applicants', header: 'Applicants', align: 'right' },
              { key: 'hired', header: 'Hired', align: 'right' },
            ]}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="Assessment pass rates" description="Evaluated assessments at or above the pass mark">
          <PassRateChart data={report.passRates} />
        </Panel>
        <Panel
          title="Interview outcomes"
          description={`Scorecards recommending to advance · ${report.completion.withAllFeedback}/${report.completion.completed} completed interviews have full feedback · ${report.completion.overdue} overdue`}
        >
          <InterviewConversionChart data={report.conversion} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Panel
          title="Time to hire trend"
          description="Average days from application to hire, by month of hire. Gaps = no hires that month."
          className="xl:col-span-3"
        >
          <TimeToHireTrend data={report.trend} />
        </Panel>
        <Panel title="Time to hire by department" description="Departments without recorded hires are omitted" className="xl:col-span-2">
          <TimeToHireByDepartment data={report.tthDept.filter((d) => d.days !== null)} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Panel title="Offer acceptance" bodyClassName="px-5 pb-5">
          <OfferAcceptanceChart stats={report.offers} />
        </Panel>
        <Panel title="Vacancy status" bodyClassName="px-5 pb-5">
          <VacancyStatusChart data={report.vacancies} />
        </Panel>
      </div>

      <Panel title="Recruiter workload" description="Current load per recruiter (not affected by the date range)">
        <RecruiterWorkloadChart data={report.workload} />
      </Panel>

      <Panel title="How these metrics are calculated" bodyClassName="px-5 pb-5">
        <dl className="grid gap-x-8 gap-y-3 text-sm md:grid-cols-2">
          {Object.entries(METRIC_DEFINITIONS).map(([key, text]) => (
            <div key={key} className="flex gap-2">
              <Info size={14} className="text-faint mt-0.5 shrink-0" aria-hidden />
              <div>
                <dt className="text-ink font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}</dt>
                <dd className="text-muted">{text}</dd>
              </div>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  )
}
