import StatusBadge from '@/components/ui/StatusBadge'
import { STAGE_TYPES } from '@/utils/statusHelpers'

/** Shows an application's stage, or its terminal status when not progressed. */
export default function StageBadge({ app, stage }) {
  if (!app || !stage) return <StatusBadge tone="neutral">No application</StatusBadge>
  if (app.status === 'rejected') return <StatusBadge tone="red">Not progressed · {stage.name}</StatusBadge>
  if (app.status === 'withdrawn') return <StatusBadge tone="neutral">Withdrawn</StatusBadge>
  return <StatusBadge tone={STAGE_TYPES[stage.type]?.tone}>{stage.name}</StatusBadge>
}
