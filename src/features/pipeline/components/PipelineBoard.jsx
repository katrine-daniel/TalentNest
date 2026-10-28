import { useState } from 'react'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCorners, pointerWithin, useSensor, useSensors } from '@dnd-kit/core'

// Pointer drags use the column under the cursor; keyboard drags (no pointer) fall back to closest corners.
const columnCollision = (args) => (args.pointerCoordinates ? pointerWithin(args) : closestCorners(args))
import PipelineColumn from './PipelineColumn'
import { CandidateCardBody } from './CandidateCard'

const announcements = {
  onDragStart: ({ active }) => `Picked up ${active.data.current?.card?.name}.`,
  onDragOver: ({ active, over }) => (over ? `${active.data.current?.card?.name} is over ${over.data.current?.stage?.name}.` : undefined),
  onDragEnd: ({ active, over }) => (over ? `${active.data.current?.card?.name} dropped in ${over.data.current?.stage?.name}.` : 'Drop cancelled.'),
  onDragCancel: ({ active }) => `Moving ${active.data.current?.card?.name} cancelled.`,
}

/** Keyboard dragging jumps a whole column per arrow press instead of a few pixels. */
function columnCoordinates(event, { context, currentCoordinates }) {
  if (event.code !== 'ArrowRight' && event.code !== 'ArrowLeft') return undefined
  event.preventDefault()
  const rects = [...context.droppableRects.values()].filter(Boolean).sort((a, b) => a.left - b.left)
  const x = currentCoordinates.x
  const idx = rects.findIndex((r) => x >= r.left - 1 && x <= r.right + 1)
  const target = event.code === 'ArrowRight' ? rects[idx + 1] ?? rects.find((r) => r.left > x) : rects[idx - 1] ?? [...rects].reverse().find((r) => r.right < x)
  if (!target) return currentCoordinates
  return { x: target.left + 16, y: currentCoordinates.y }
}

/**
 * Kanban board for one vacancy's workflow. Mouse, touch (long-press) and
 * keyboard (Space to pick up, arrows to move, Space to drop) are supported.
 */
export default function PipelineBoard({ columns, onDrop, onOpen, onMove, onReject, onRestore, canMove }) {
  const [active, setActive] = useState(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnCoordinates }),
  )
  const stages = columns.map((c) => c.stage)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={columnCollision}
      accessibility={{ announcements }}
      onDragStart={({ active: a }) => setActive(a.data.current?.card ?? null)}
      onDragCancel={() => setActive(null)}
      onDragEnd={({ active: a, over }) => {
        setActive(null)
        const card = a.data.current?.card
        if (card && over && over.id !== card.stageId) onDrop(card, over.id)
      }}
    >
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 scrollbar-thin sm:-mx-6 sm:px-6 lg:mx-0 lg:snap-none lg:px-0">
        {columns.map((column, i) => (
          <PipelineColumn
            key={column.stage.id}
            index={i}
            column={column}
            stages={stages}
            onOpen={onOpen}
            onMove={onMove}
            onReject={onReject}
            onRestore={onRestore}
            canMove={canMove}
            isDragActive={Boolean(active)}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>{active ? <CandidateCardBody card={active} overlay /> : null}</DragOverlay>
    </DndContext>
  )
}
