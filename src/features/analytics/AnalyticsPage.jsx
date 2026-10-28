import { useMemo } from 'react'
import { Download, Lock } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
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
  SourceChart,
  TimeToHireByDepartment,
  TimeToHireTrend,
  VacancyStatusChart,
} from '@/features/analytics/components/HiringCharts'
import { useDbData } from '@/hooks/useStore'
import { useOrgOptions } from '@/features/jobs/hooks/useJobs'
import { useUrlFilters } from '@/hooks/useUrlFilters'
import { useSession } from '@/app/providers/SessionContext'
import { useToast } from '@/components/ui/Toast'
import {
  getAssessmentPassRates,
  getDepartmentBreakdown,
  getFunnel,
  getInterviewConversion,
  getOfferStats,
  getRecruiterWorkload,
  getSourceBreakdown,
  getTimeToHire,
  getVacancyStatus,
} from './analyticsService'
import { downloadCsv } from '@/utils/exportCsv'
import { toInputDate } from '@/utils/formatDate'

const RANGES = [
  { value: '30', label: '30 days', months: 1 },
  { value: '90', label: '90 days', months: 3 },
  { value: '180', label: '6 months', months: 6 },
  { value: '365', label: '12 months', months: 12 },
]

export default function AnalyticsPage() {
  const data = useDbData()
  const options = useOrgOptions()
  const { can } = useSession()
  const toast = useToast()
  const { filters, setFilter } = useUrlFilters({ range: '90', department: 'all' })
  const range = RANGES.find((r) => r.value === filters.range) ?? RANGES[1]
  const scope = useMemo(() => ({ departmentId: filters.department, sinceDays: Number(range.value) }), [filters.department, range.value])

  const report = useMemo(() => {
    const funnel = getFunnel(data, scope)
    const passRates = getAssessmentPassRates(data, scope)
    const conversion = getInterviewConversion(data, scope)
    const offers = getOfferStats(data, scope)
    const tthDept = getTimeToHire(data).filter((d) => filters.department === 'all' || d.departmentId === filters.department)
    const monthly = data.reporting.monthly.slice(-Math.max(3, range.months))
    const evaluated = passRates.reduce((s, r) => s + r.evaluated, 0)
    const passed = passRates.reduce((s, r) => s + r.passed, 0)
    const interviewed = funnel.find((f) => f.key === 'interview')?.count ?? 0
    const offered = funnel.find((f) => f.key === 'offer')?.count ?? 0
    return {
      funnel,
      passRates,
      conversion,
      offers,
      tthDept,
      monthly,
      departments: getDepartmentBreakdown(data, scope).filter((d) => filters.department === 'all' || d.departmentId === filters.department),
      vacancies: getVacancyStatus(data, scope),
      workload: getRecruiterWorkload(data),
      sources: getSourceBreakdown(data, scope),
      kpis: {
        applications: funnel[0]?.count ?? 0,
        avgTimeToHire: tthDept.length ? Math.round(tthDept.reduce((s, d) => s + d.days, 0) / tthDept.length) : 0,
        passRate: evaluated ? Math.round((passed / evaluated) * 100) : 0,
        interviewToOffer: interviewed ? Math.round((offered / interviewed) * 100) : 0,
        offerAcceptance: offers.acceptanceRate,
      },
    }
  }, [data, scope, filters.department, range.months])

  if (!can('analytics.view')) {
    return <EmptyState icon={Lock} title="Analytics isn’t available for your role" description="Ask an administrator to grant the “View reports & analytics” permission." />
  }

  const exportReport = () => {
    const rows = [
      ['TalentNest recruitment report', `Range: ${range.label}`, `Department: ${options.departments.find((d) => d.value === filters.department)?.label ?? 'All'}`],
      [],
      ['Metric', 'Value'],
      ['Applications', report.kpis.applications],
      ['Avg. time to hire (days)', report.kpis.avgTimeToHire],
      ['Assessment pass rate (%)', report.kpis.passRate],
      ['Interview → offer (%)', report.kpis.interviewToOffer],
      ['Offer acceptance (%)', report.kpis.offerAcceptance],
      [],
      ['Funnel stage', 'Candidates', 'Conversion from previous (%)'],
      ...report.funnel.map((f) => [f.label, f.count, f.conversion]),
      [],
      ['Department', 'Active', 'Hired', 'Open positions'],
      ...report.departments.map((d) => [d.name, d.total, d.hired, d.openings]),
      [],
      ['Recruiter', 'Active candidates', 'Upcoming interviews', 'Open vacancies'],
      ...report.workload.map((w) => [w.fullName, w.candidates, w.interviews, w.vacancies]),
    ]
    downloadCsv(`talentnest-report-${toInputDate(new Date())}.csv`, rows)
    toast.success('Report exported as CSV')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Analytics"
        description="Hiring performance across departments, stages and recruiters."
        actions={
          <>
            <SegmentedControl label="Date range" options={RANGES} value={range.value} onChange={(v) => setFilter('range', v)} className="w-full justify-between sm:w-auto" />
            <FilterSelect label="Department" value={filters.department} onChange={(v) => setFilter('department', v)} options={options.departments} className="w-full sm:w-52" />
            <Button icon={Download} onClick={exportReport}>
              Export CSV
            </Button>
          </>
        }
      />

      <RecruitmentMetrics {...report.kpis} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="Recruitment funnel" description="Candidates reaching each stage">
          <FunnelChart data={report.funnel} />
        </Panel>
        <Panel title="Department-wise candidates" description="Active candidates by phase, plus hires">
          <DepartmentDistributionChart data={report.departments} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="Assessment pass rates" description="Share of evaluated candidates at or above the pass mark">
          <PassRateChart data={report.passRates} />
        </Panel>
        <Panel title="Interview conversion" description="Interviews where the panel recommended advancing">
          <InterviewConversionChart data={report.conversion} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Panel title="Time to hire trend" description="Monthly average, days from application to hire (historical reporting data)" className="xl:col-span-3">
          <TimeToHireTrend data={report.monthly} />
        </Panel>
        <Panel title="Time to hire by department" description="Dark bars use live data; light bars use historical averages" className="xl:col-span-2">
          <TimeToHireByDepartment data={report.tthDept} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Offer acceptance" bodyClassName="px-5 pb-5">
          <OfferAcceptanceChart stats={report.offers} />
        </Panel>
        <Panel title="Vacancy status" bodyClassName="px-5 pb-5">
          <VacancyStatusChart data={report.vacancies} />
        </Panel>
        <Panel title="Applications by source" className="md:col-span-2 xl:col-span-1">
          <SourceChart data={report.sources} />
        </Panel>
      </div>

      <Panel title="Recruiter workload" description="Current load per recruiter (not affected by the date range)">
        <RecruiterWorkloadChart data={report.workload} />
      </Panel>
    </div>
  )
}
