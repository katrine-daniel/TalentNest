import { memo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { AlertCircle, CalendarClock, ClipboardCheck, MoreHorizontal, MoveRight, PanelRight, Star, CircleSlash, RotateCcw } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import Dropdown from '@/components/ui/Dropdown'
import { formatShortDate, formatTime } from '@/utils/formatDate'
import { cn } from '@/utils/cn'

/** Presentational card body — shared by the draggable card and the drag overlay. */
export function CandidateCardBody({ card, overlay = false }) {
  const { candidate, app } = card
  const rejected = app.status === 'rejected'
  return (
    <div className={cn('rounded-lg border bg-surface p-3 text-left', overlay ? 'rotate-[1.5deg] border-brand-300 shadow-lift' : 'border-line shadow-xs', rejected && 'opacity-60')}>
      <div className="flex items-start gap-2.5">
        <Avatar name={card.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-medium', rejected && 'line-through')}>{card.name}</p>
          <p className="truncate text-xs text-muted">
            {candidate.currentTitle} · {candidate.experienceYears}y
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span className={cn('tabular', card.daysInStage > 7 && !rejected && 'font-medium text-amber-700')} title="Days in current stage">
          {card.daysInStage}d in stage
        </span>
        {app.rating && (
          <span className="flex items-center gap-0.5 text-amber-600">
            <Star size={11} className="fill-current" aria-hidden />
            {app.rating}
          </span>
        )}
        {card.nextInterview && (
          <span className="flex items-center gap-1 text-brand-700" title="Next interview">
            <CalendarClock size={11} aria-hidden />
            {formatShortDate(card.nextInterview.start)} {formatTime(card.nextInterview.start)}
          </span>
        )}
        {card.openAssessment && (
          <span className="flex items-center gap-1" title="Open assessment">
            <ClipboardCheck size={11} aria-hidden />
            {card.openAssessment.status === 'submitted' ? 'To review' : 'Test'}
          </span>
        )}
        {card.pendingFeedback && (
          <span className="flex items-center gap-1 text-red-600">
            <AlertCircle size={11} aria-hidden />
            Feedback
          </span>
        )}
        {rejected && <span className="text-red-600">Not progressed</span>}
      </div>
    </div>
  )
}

/**
 * Draggable pipeline card. The overflow menu offers the same moves for
 * keyboard and screen-reader users who can't drag.
 */
function CandidateCard({ card, stages, onOpen, onMove, onReject, onRestore, canMove }) {
  const disabled = !canMove || card.app.status !== 'active'
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, data: { card }, disabled })

  const menu = [
    { label: 'Quick view', icon: PanelRight, onSelect: () => onOpen(card) },
    ...(card.app.status === 'active'
      ? [
          { divider: true },
          { heading: 'Move to' },
          ...stages.map((s) => ({ key: s.id, label: s.name, icon: MoveRight, checked: s.id === card.stageId, disabled: s.id === card.stageId || !canMove, onSelect: () => onMove(card, s.id) })),
          { divider: true },
          { label: 'Not progressing…', icon: CircleSlash, danger: true, disabled: !canMove, onSelect: () => onReject(card) },
        ]
      : [{ label: 'Restore to pipeline', icon: RotateCcw, disabled: !canMove, onSelect: () => onRestore(card) }]),
  ]

  return (
    <div ref={setNodeRef} className={cn('group relative touch-manipulation', isDragging && 'opacity-30')}>
      <div
        {...listeners}
        {...attributes}
        role="button"
        tabIndex={0}
        aria-roledescription={disabled ? undefined : 'Draggable candidate card'}
        aria-label={`${card.name}, ${card.daysInStage} days in stage. Press Enter to open, Space to pick up.`}
        onClick={() => onOpen(card)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onOpen(card)
            return
          }
          listeners?.onKeyDown?.(e)
        }}
        className={cn('block rounded-lg outline-none transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-brand-500', !disabled && 'cursor-grab active:cursor-grabbing hover:-translate-y-px')}
      >
        <CandidateCardBody card={card} />
      </div>
      <div className="absolute top-2 right-2 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <Dropdown
          items={menu}
          className="w-56"
          menuLabel={`Actions for ${card.name}`}
          renderTrigger={(props) => (
            <button {...props} type="button" className="rounded-md bg-surface p-1 text-muted shadow-xs ring-1 ring-line hover:text-ink" aria-label={`Actions for ${card.name}`}>
              <MoreHorizontal size={14} />
            </button>
          )}
        />
      </div>
    </div>
  )
}

export default memo(CandidateCard)
