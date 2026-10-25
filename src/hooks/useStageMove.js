import { useCallback, useState } from 'react'
import { needsConfirmation } from './useRecruitmentPipeline'

/**
 * Shared "move stage" flow: moves immediately for routine forward steps,
 * otherwise opens StageChangeDialog first. `moveFn(appId, stageId, note)` performs the move.
 */
export function useStageMove(moveFn) {
  const [change, setChange] = useState(null)
  const [pending, setPending] = useState(false)

  const request = useCallback(
    async ({ app, job, toStageId, candidateName }) => {
      if (app.stageId === toStageId) return
      const reason = needsConfirmation(job, app.stageId, toStageId)
      if (reason) {
        setChange({ appId: app.id, job, fromStageId: app.stageId, toStageId, candidateName, reason })
        return
      }
      await moveFn(app.id, toStageId, '')
    },
    [moveFn],
  )

  const confirm = useCallback(
    async (note) => {
      if (!change) return
      setPending(true)
      const res = await moveFn(change.appId, change.toStageId, note)
      setPending(false)
      if (res?.ok !== false) setChange(null)
    },
    [change, moveFn],
  )

  return { change, request, confirm, cancel: () => setChange(null), pending }
}
