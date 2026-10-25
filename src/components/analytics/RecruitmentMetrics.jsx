import { CheckCircle2, ClipboardCheck, Hourglass, MessagesSquare, Users } from 'lucide-react'
import MetricCard, { MetricStrip } from '@/components/dashboard/MetricCard'

/** Headline KPIs for the analytics page. */
export default function RecruitmentMetrics({ applications, avgTimeToHire, offerAcceptance, passRate, interviewToOffer }) {
  return (
    <MetricStrip columns={5}>
      <MetricCard label="Applications" icon={Users} value={applications} detail="In selected period" />
      <MetricCard label="Avg. time to hire" icon={Hourglass} value={avgTimeToHire} detail="Days, application → hire" />
      <MetricCard label="Assessment pass rate" icon={ClipboardCheck} value={passRate} detail="% of evaluated" />
      <MetricCard label="Interview → offer" icon={MessagesSquare} value={interviewToOffer} detail="% of interviewed candidates" />
      <MetricCard label="Offer acceptance" icon={CheckCircle2} value={offerAcceptance} detail="% of decided offers" emphasis />
    </MetricStrip>
  )
}
