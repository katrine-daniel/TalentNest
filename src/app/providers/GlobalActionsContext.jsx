import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import CandidateForm from '@/features/candidates/components/CandidateForm'
import JobForm from '@/features/jobs/components/JobForm'
import ScheduleModal from '@/features/interviews/components/ScheduleModal'
import AssessmentForm from '@/features/assessments/components/AssessmentForm'
import OfferForm from '@/features/offers/components/OfferForm'

/**
 * App-wide creation dialogs (candidate, vacancy, interview, assessment, offer).
 * Any page or the top bar can open them with optional prefilled values,
 * so each form is implemented and mounted exactly once.
 */
const GlobalActionsContext = createContext(null)

export function GlobalActionsProvider({ children }) {
  const [dialog, setDialog] = useState({ type: null, payload: null })

  const open = useCallback(
    (type) =>
      (payload = null) =>
        setDialog({ type, payload }),
    [],
  )
  const close = useCallback(() => setDialog((d) => ({ ...d, type: null })), [])

  const api = useMemo(
    () => ({
      openCandidateForm: open('candidate'),
      openJobForm: open('job'),
      openSchedule: open('schedule'),
      openAssessment: open('assessment'),
      openOffer: open('offer'),
    }),
    [open],
  )

  const { type, payload } = dialog

  return (
    <GlobalActionsContext.Provider value={api}>
      {children}
      <CandidateForm open={type === 'candidate'} onClose={close} candidate={payload?.candidate} defaultJobId={payload?.jobId} />
      <JobForm open={type === 'job'} onClose={close} job={payload?.job} />
      <ScheduleModal open={type === 'schedule'} onClose={close} interview={payload?.interview} prefill={payload} />
      <AssessmentForm open={type === 'assessment'} onClose={close} prefill={payload} />
      <OfferForm open={type === 'offer'} onClose={close} offer={payload?.offer} prefill={payload} />
    </GlobalActionsContext.Provider>
  )
}

export function useGlobalActions() {
  const ctx = useContext(GlobalActionsContext)
  if (!ctx) throw new Error('useGlobalActions must be used inside GlobalActionsProvider')
  return ctx
}
