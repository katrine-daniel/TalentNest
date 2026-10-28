import { useDroppable } from '@dnd-kit/core'
import { AnimatePresence, motion } from 'framer-motion'
import CandidateCard from './CandidateCard'
import { STAGE_TYPES } from '@/utils/statusHelpers'
import { cn } from '@/utils/cn'

/** One stage column; highlights while a card hovers over it. */
export default function PipelineColumn({ column, stages, index, onOpen, onMove, onReject, onRestore, canMove, isDragActive }) {
  const { stage, cards, count } = column
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, data: { stage } })
  const meta = STAGE_TYPES[stage.type]

  return (
    <section
      ref={setNodeRef}
      aria-label={`${stage.name}, ${count} candidates`}
      className={cn(
        'flex w-[82vw] max-w-[300px] shrink-0 snap-start flex-col rounded-xl border bg-subtle/70 transition-colors duration-150 sm:w-72',
        isOver ? 'border-brand-400 bg-brand-50/70' : 'border-line',
        isDragActive && !isOver && 'border-dashed',
      )}
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span className={cn('h-2 w-2 rounded-full', meta?.dot)} aria-hidden />
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium" title={stage.name}>
          <span className="mr-1 text-xs text-faint tabular">{index + 1}.</span>
          {stage.name}
        </h2>
        <span className="rounded bg-surface px-1.5 text-xs font-medium text-muted tabular ring-1 ring-line">{count}</span>
      </header>
      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 scrollbar-thin" style={{ maxHeight: 'calc(100dvh - 300px)' }}>
        <AnimatePresence initial={false}>
          {cards.map((card) => (
            <motion.div key={card.id} layout="position" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.16 }}>
              <CandidateCard card={card} stages={stages} onOpen={onOpen} onMove={onMove} onReject={onReject} onRestore={onRestore} canMove={canMove} />
            </motion.div>
          ))}
        </AnimatePresence>
        {!cards.length && (
          <p className={cn('flex flex-1 items-center justify-center rounded-lg border border-dashed px-3 py-6 text-center text-xs', isOver ? 'border-brand-300 text-brand-700' : 'border-line-strong text-faint')}>
            {isDragActive ? 'Drop here' : 'No candidates'}
          </p>
        )}
      </div>
    </section>
  )
}
