import { useEffect, useMemo, useState } from 'react'
import { CalendarPlus, ChevronLeft, ChevronRight, ClipboardCheck } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { FilterSelect } from '@/components/ui/FormControls'
import InterviewCalendar from '@/components/scheduling/InterviewCalendar'
import EventDetailsDrawer from '@/components/scheduling/EventDetailsDrawer'
import UpcomingInterviews from '@/components/dashboard/UpcomingInterviews'
import { useAssessmentEvents, useInterviewEvents } from '@/hooks/useScheduling'
import { useUrlFilters } from '@/hooks/useUrlFilters'
import { useOrgOptions } from '@/hooks/useJobs'
import { useDbData } from '@/hooks/useStore'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { useGlobalActions } from '@/context/GlobalActionsContext'
import { useSession } from '@/context/SessionContext'
import { getUpcomingSchedule } from '@/services/analyticsService'
import { addDays, addMonths, formatMonthYear, formatShortDate, formatDate, startOfWeek } from '@/utils/formatDate'
import { EVENT_ACCENTS, toOptions } from '@/utils/statusHelpers'

const DEFAULTS = { view: 'week', department: 'all', interviewer: 'all', status: 'all', assessments: 'show', event: '' }

function rangeTitle(view, cursor) {
  if (view === 'month') return formatMonthYear(cursor)
  if (view === 'day') return formatDate(cursor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const start = startOfWeek(cursor)
  return `${formatShortDate(start)} – ${formatShortDate(addDays(start, 6))} ${start.getFullYear()}`
}

export default function CalendarPage() {
  const { filters, setFilter } = useUrlFilters(DEFAULTS)
  const [cursor, setCursor] = useState(() => new Date())
  const isMobile = useIsMobile()
  const options = useOrgOptions()
  const data = useDbData()
  const global = useGlobalActions()
  const { can } = useSession()

  const interviewEvents = useInterviewEvents({ department: filters.department, interviewer: filters.interviewer, status: filters.status, includeCancelled: true })
  const assessmentEvents = useAssessmentEvents({ department: filters.department })
  const events = useMemo(
    () => [...interviewEvents, ...(filters.assessments === 'show' && filters.interviewer === 'all' ? assessmentEvents : [])],
    [interviewEvents, assessmentEvents, filters.assessments, filters.interviewer],
  )

  // Deep links (?event=…) open the event and jump the calendar to its date.
  const allEvents = useInterviewEvents({ includeCancelled: true })
  const selected = useMemo(() => allEvents.find((e) => e.id === filters.event) ?? assessmentEvents.find((e) => e.id === filters.event) ?? null, [allEvents, assessmentEvents, filters.event])
  useEffect(() => {
    if (selected) setCursor(new Date(selected.start))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  const step = (dir) => {
    if (filters.view === 'month') setCursor((c) => addMonths(c, dir))
    else if (filters.view === 'week') setCursor((c) => addDays(c, 7 * dir))
    else setCursor((c) => addDays(c, dir))
  }

  const upcoming = useMemo(() => getUpcomingSchedule(data, { departmentId: filters.department, days: 14 }), [data, filters.department])

  return (
    <div>
      <PageHeader
        title="Interviews & Calendar"
        description="Plan interview rounds, track attendance and collect feedback."
        actions={
          <>
            <Button icon={ClipboardCheck} onClick={() => global.openAssessment()} disabled={!can('interviews.schedule')}>
              Assign assessment
            </Button>
            <Button variant="primary" icon={CalendarPlus} onClick={() => global.openSchedule()} disabled={!can('interviews.schedule')}>
              Schedule interview
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-4">
        <Panel className="2xl:col-span-3" bodyClassName="">
          <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setCursor(new Date())}>
                Today
              </Button>
              <Button size="sm" variant="ghost" iconOnly icon={ChevronLeft} aria-label="Previous period" onClick={() => step(-1)} />
              <Button size="sm" variant="ghost" iconOnly icon={ChevronRight} aria-label="Next period" onClick={() => step(1)} />
              <h2 className="ml-1 text-sm font-semibold sm:text-base" aria-live="polite">
                {rangeTitle(filters.view, cursor)}
              </h2>
            </div>
            <SegmentedControl
              label="Calendar view"
              value={filters.view}
              onChange={(v) => setFilter('view', v)}
              options={[
                { value: 'day', label: 'Day' },
                { value: 'week', label: isMobile ? 'Agenda' : 'Week' },
                { value: 'month', label: 'Month' },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 border-b border-line p-3 sm:grid-cols-4">
            <FilterSelect label="Department" value={filters.department} onChange={(v) => setFilter('department', v)} options={options.departments} />
            <FilterSelect label="Interviewer" value={filters.interviewer} onChange={(v) => setFilter('interviewer', v)} options={options.interviewers} />
            <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilter('status', v)} options={toOptions('interview')} allLabel="Any" />
            <FilterSelect
              label="Assessments"
              value={filters.assessments === 'show' ? 'all' : 'hide'}
              onChange={(v) => setFilter('assessments', v === 'all' ? 'show' : 'hide')}
              options={[{ value: 'hide', label: 'Hidden' }]}
              allLabel="Shown"
            />
          </div>
          <InterviewCalendar
            view={filters.view}
            cursor={cursor}
            events={events}
            isMobile={isMobile}
            onSelectEvent={(ev) => setFilter('event', ev.id)}
            onSelectSlot={(date, time) => can('interviews.schedule') && global.openSchedule({ date, time })}
            onDrillDay={(day) => {
              setCursor(day)
              setFilter('view', 'day')
            }}
          />
          <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-3">
            {Object.entries(EVENT_ACCENTS).map(([key, a]) => (
              <li key={key} className="flex items-center gap-1.5 text-xxs text-muted">
                <span className={`h-2 w-2 rounded-full ${a.dot}`} aria-hidden />
                {a.label}
              </li>
            ))}
            <li className="text-xxs text-faint sm:ml-auto">Click an empty slot to schedule.</li>
          </ul>
        </Panel>

        <Panel title="Next 14 days" description="Upcoming interviews and deadlines" className="self-start">
          <UpcomingInterviews items={upcoming} limit={10} />
        </Panel>
      </div>

      <EventDetailsDrawer event={selected} onClose={() => setFilter('event', '')} />
    </div>
  )
}
