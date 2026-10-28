import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/FormControls'
import { useCollection } from '@/hooks/useStore'
import { useCandidateActions } from '@/features/candidates/hooks/useCandidates'

/** Adds an existing candidate to another open vacancy (multiple applications per candidate). */
export default function AddApplicationModal({ open, onClose, candidate, existingJobIds = [] }) {
  const jobs = useCollection('jobs')
  const actions = useCandidateActions()
  const [jobId, setJobId] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (open) {
      setJobId('')
      setError(null)
    }
  }, [open])

  const options = useMemo(() => jobs.filter((j) => j.status === 'open' && !existingJobIds.includes(j.id)).map((j) => ({ value: j.id, label: `${j.title} · ${j.location}` })), [jobs, existingJobIds])

  const submit = async (e) => {
    e.preventDefault()
    if (!jobId) {
      setError('Select a vacancy')
      return
    }
    const res = await actions.addApplication.run(candidate.id, jobId)
    if (res.ok) onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Add to vacancy"
      description={`${candidate?.firstName} will start at the first stage of the vacancy's workflow.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="add-app-form" loading={actions.addApplication.pending}>
            Add application
          </Button>
        </>
      }
    >
      <form id="add-app-form" onSubmit={submit}>
        <Field label="Vacancy" required error={error} hint={!options.length ? 'This candidate has applied to every open vacancy.' : undefined}>
          {(a) => (
            <Select
              {...a}
              value={jobId}
              onChange={(e) => {
                setJobId(e.target.value)
                setError(null)
              }}
              options={options}
              placeholder="Select an open vacancy"
              invalid={!!error}
              data-autofocus
            />
          )}
        </Field>
      </form>
    </Modal>
  )
}
