import { useMemo, useState } from 'react'
import { BellRing, BriefcaseBusiness, CalendarClock, CalendarPlus, ClipboardList, FileSignature, UserPlus, Users } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { FilterSelect } from '@/components/ui/FormControls'
import MetricCard, { MetricStrip } from '@/components/dashboard/MetricCard'
import RecruitmentFunnel from '@/components/dashboard/RecruitmentFunnel'
import HiringActivityChart from '@/components/dashboard/HiringActivityChart'
import DepartmentBreakdown from '@/components/dashboard/DepartmentBreakdown'
import UpcomingInterviews from '@/components/dashboard/UpcomingInterviews'
import AttentionList from '@/components/dashboard/AttentionList'
import RecentActivity from '@/components/dashboard/RecentActivity'
import { useDbData } from '@/hooks/useStore'
import { useOrgOptions } from '@/hooks/useJobs'
import { useSession } from '@/context/SessionContext'
import { useGlobalActions } from '@/context/GlobalActionsContext'
import { getAttentionItems, getDashboardMetrics, getDepartmentBreakdown, getFunnel, getUpcomingSchedule } from '@/services/analyticsService'
import { formatDate, greeting } from '@/utils/formatDate'

const FUNNEL_RANGES = [
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
  { value: 'all', label: 'All' },
]

export default function DashboardPage() {
  const data = useDbData()
  const { user, can } = useSession()
  const actions = useGlobalActions()
  const options = useOrgOptions()
  const [department, setDepartment] = useState('all')
  const [funnelRange, setFunnelRange] = useState('90')

  const filters = useMemo(() => ({ departmentId: department }), [department])
  const metrics = useMemo(() => getDashboardMetrics(data, filters), [data, filters])
  const funnel = useMemo(() => getFunnel(data, { ...filters, sinceDays: funnelRange === 'all' ? null : Number(funnelRange) }), [data, filters, funnelRange])
  const breakdown = useMemo(() => getDepartmentBreakdown(data), [data])
  const upcoming = useMemo(() => getUpcomingSchedule(data, { departmentId: department, days: 7 }), [data, department])
  const attention = useMemo(() => getAttentionItems(data, filters), [data, filters])
  const activity = useMemo(
    () => (department === 'all' ? data.activities : data.activities.filter((a) => !a.jobId || data.jobs.find((j) => j.id === a.jobId)?.departmentId === department)),
    [data, department],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        description={`${formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })} · Here’s where hiring stands today.`}
        actions={
          <>
            <FilterSelect label="Department" value={department} onChange={setDepartment} options={options.departments} allLabel="All" className="w-full sm:w-56" />
            <div className="flex w-full gap-2 sm:w-auto">
              <Button icon={UserPlus} onClick={() => actions.openCandidateForm()} disabled={!can('candidates.manage')} className="flex-1 sm:flex-none">
                Add candidate
              </Button>
              <Button icon={BriefcaseBusiness} onClick={() => actions.openJobForm()} disabled={!can('jobs.manage')} className="max-lg:hidden">
                New vacancy
              </Button>
              <Button variant="primary" icon={CalendarPlus} onClick={() => actions.openSchedule()} disabled={!can('interviews.schedule')} className="flex-1 sm:flex-none">
                Schedule
              </Button>
            </div>
          </>
        }
      />

      <MetricStrip>
        <MetricCard label="Active candidates" icon={Users} value={metrics.activeCandidates} detail={`${metrics.newThisWeek} new this week`} to="/candidates" />
        <MetricCard label="Open vacancies" icon={BriefcaseBusiness} value={metrics.openVacancies} detail={`${metrics.openings} positions to fill`} to="/jobs?status=open" />
        <MetricCard label="Interviews scheduled" icon={CalendarClock} value={metrics.interviewsScheduled} detail={`${metrics.interviewsToday} today`} to="/calendar" />
        <MetricCard
          label="Assessments pending"
          icon={ClipboardList}
          value={metrics.assessmentsPending}
          detail={metrics.overdueAssessments ? `${metrics.overdueAssessments} past deadline` : 'All within deadline'}
          detailTone={metrics.overdueAssessments ? 'warn' : 'muted'}
          to="/assessments"
        />
        <MetricCard
          label="Offers awaiting reply"
          icon={FileSignature}
          value={metrics.offersAwaiting}
          detail={metrics.expiringOffers ? `${metrics.expiringOffers} expiring in 48h` : 'None expiring soon'}
          detailTone={metrics.expiringOffers ? 'warn' : 'muted'}
          to="/offers"
        />
        <MetricCard
          label="Needs attention"
          icon={BellRing}
          value={metrics.needsAttention}
          detail={`${metrics.pendingFeedback} feedback pending`}
          detailTone={metrics.pendingFeedback ? 'danger' : 'muted'}
          emphasis
          to="#attention"
        />
      </MetricStrip>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel title="Hiring activity" description="Applications, interviews and hires across all vacancies" className="xl:col-span-2" bodyClassName="pb-4">
          <HiringActivityChart weekly={data.reporting.weekly} monthly={data.reporting.monthly} />
        </Panel>
        <Panel
          title="Recruitment funnel"
          description={department === 'all' ? 'All departments' : options.departments.find((d) => d.value === department)?.label}
          actions={<SegmentedControl size="sm" label="Funnel range" options={FUNNEL_RANGES} value={funnelRange} onChange={setFunnelRange} />}
          bodyClassName="px-5 pb-5"
        >
          <RecruitmentFunnel steps={funnel} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Upcoming this week" description="Interviews and assessment deadlines" actions={<Button size="sm" variant="ghost" to="/calendar">Open calendar</Button>}>
          <UpcomingInterviews items={upcoming} />
        </Panel>
        <Panel id="attention" title="Pending feedback & overdue actions" description="Sorted by urgency">
          <AttentionList items={attention} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Panel title="Department pipeline" description="Active candidates by phase" className="xl:col-span-3" bodyClassName="pb-4">
          <DepartmentBreakdown rows={breakdown} />
        </Panel>
        <Panel title="Recent activity" className="xl:col-span-2">
          <RecentActivity items={activity} limit={7} />
        </Panel>
      </div>
    </div>
  )
}
