import { ArrowRight } from 'lucide-react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import StatusBadge from '@/components/ui/StatusBadge'
import { STAGE_TYPES } from '@/utils/statusHelpers'

const COPY = {
  backward: 'This moves the candidate back to an earlier stage. Interviewers and recruiters will see the change in the activity history.',
  skip: 'This skips one or more stages in the workflow. Make sure the skipped steps are no longer required for this candidate.',
  important: 'This is a decision stage. Hiring managers are notified and the change is recorded in the candidate’s history.',
}

/** Confirms significant stage moves (backwards, skipping stages, offer/hire) and captures a note. */
export default function StageChangeDialog({ change, job, onClose, onConfirm, loading }) {
  const from = job?.stages.find((s) => s.id === change?.fromStageId)
  const to = job?.stages.find((s) => s.id === change?.toStageId)
  return (
    <ConfirmDialog
      open={Boolean(change && from && to)}
      onClose={onClose}
      title={`Move ${change?.candidateName ?? 'candidate'}?`}
      description={COPY[change?.reason] ?? 'Confirm the stage change.'}
      confirmLabel={to?.type === 'hired' ? 'Mark as hired' : `Move to ${to?.name ?? ''}`}
      reasonLabel="Note for the activity history"
      reasonPlaceholder="Why is this candidate moving?"
      requireReason={change?.reason === 'backward'}
      loading={loading}
      onConfirm={onConfirm}
    >
      {from && to && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-subtle px-3 py-2.5">
          <StatusBadge tone={STAGE_TYPES[from.type]?.tone}>{from.name}</StatusBadge>
          <ArrowRight size={14} className="text-faint" aria-hidden />
          <StatusBadge tone={STAGE_TYPES[to.type]?.tone}>{to.name}</StatusBadge>
        </div>
      )}
    </ConfirmDialog>
  )
}
