import { CheckCircle2, ClipboardCheck, Hourglass, MessagesSquare, MessageSquareText, Users } from 'lucide-react'
import MetricCard, { MetricStrip } from '@/features/dashboard/components/MetricCard'

/** Headline KPIs for the analytics page. `null` values (no data) render as "—". */
export default function RecruitmentMetrics({
  applications,
  appToInterview,
  avgTimeToHire,
  hires,
  passRate,
  interviewToOffer,
  offerAcceptance,
  feedbackCompletion,
}) {
  return (
    <MetricStrip columns={6}>
      <MetricCard
        label="Applications"
        icon={Users}
        value={applications}
        detail={appToInterview === null ? 'No interviews yet' : `${appToInterview}% reached interview`}
      />
      <MetricCard
        label="Avg. time to hire"
        icon={Hourglass}
        value={avgTimeToHire}
        detail={hires ? `Days, across ${hires} hire${hires > 1 ? 's' : ''}` : 'No hires recorded'}
      />
      <MetricCard label="Assessment pass rate" icon={ClipboardCheck} value={passRate} suffix="%" detail="Of evaluated assessments" />
      <MetricCard label="Interview → offer" icon={MessagesSquare} value={interviewToOffer} suffix="%" detail="Of interviewed applications" />
      <MetricCard label="Offer acceptance" icon={CheckCircle2} value={offerAcceptance} suffix="%" detail="Of decided offers" emphasis />
      <MetricCard label="Feedback completion" icon={MessageSquareText} value={feedbackCompletion} suffix="%" detail="Interviews with all scorecards" />
    </MetricStrip>
  )
}
