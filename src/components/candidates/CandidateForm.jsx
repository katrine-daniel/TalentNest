import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Controller, useForm } from 'react-hook-form'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import TagInput from '@/components/ui/TagInput'
import FileDropzone from '@/components/ui/FileDropzone'
import MockNotice from '@/components/ui/MockNotice'
import { Field, Input, Select, Textarea } from '@/components/ui/FormControls'
import { useCandidateActions } from '@/hooks/useCandidates'
import { useOrgOptions } from '@/hooks/useJobs'
import { useCollection } from '@/hooks/useStore'
import { useSession } from '@/context/SessionContext'
import { rules } from '@/utils/validation'
import { CANDIDATE_SOURCES, NOTICE_PERIODS } from '@/data/mockCandidates'

const EMPTY = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  location: '',
  currentTitle: '',
  currentCompany: '',
  experienceYears: 0,
  noticePeriod: '30 days',
  expectedSalary: '',
  source: 'LinkedIn',
  recruiterId: '',
  skills: [],
  jobId: '',
  education: '',
  note: '',
}

const EDITABLE_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'location', 'currentTitle', 'currentCompany', 'experienceYears', 'noticePeriod', 'expectedSalary', 'source', 'recruiterId', 'skills']

function Section({ title, children }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">{title}</legend>
      {children}
    </fieldset>
  )
}

/** Create or edit a candidate. Mounted once by GlobalActionsProvider. */
export default function CandidateForm({ open, onClose, candidate, defaultJobId }) {
  const isEdit = Boolean(candidate)
  const navigate = useNavigate()
  const { actorId } = useSession()
  const options = useOrgOptions()
  const jobs = useCollection('jobs')
  const actions = useCandidateActions()
  const [resume, setResume] = useState(null)

  const skillSuggestions = useMemo(() => Array.from(new Set(jobs.flatMap((j) => j.skills))).sort(), [jobs])

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm({ defaultValues: EMPTY })

  useEffect(() => {
    if (!open) return
    setResume(null)
    reset(
      candidate
        ? { ...EMPTY, ...candidate, expectedSalary: candidate.expectedSalary || '' }
        : { ...EMPTY, recruiterId: actorId, jobId: defaultJobId ?? '' },
    )
  }, [open, candidate, defaultJobId, actorId, reset])

  const pending = actions.create.pending || actions.update.pending

  const onSubmit = async (values) => {
    if (isEdit) {
      const patch = Object.fromEntries(EDITABLE_FIELDS.map((k) => [k, values[k]]))
      const res = await actions.update.run(candidate.id, patch)
      if (res.ok) onClose()
      else if (/email/i.test(res.error?.message)) setError('email', { message: res.error.message })
      return
    }
    const res = await actions.create.run({
      ...values,
      resume: resume ? { fileName: resume.name, size: resume.size, uploadedAt: new Date().toISOString() } : null,
    })
    if (res.ok) {
      onClose()
      navigate(`/candidates/${res.data.id}`)
    } else if (/email/i.test(res.error?.message)) {
      setError('email', { message: res.error.message })
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? `Edit ${candidate.firstName} ${candidate.lastName}` : 'Add candidate'}
      description={isEdit ? 'Update profile details. Application stages are managed from the pipeline.' : 'Create a candidate profile and optionally add them to a vacancy.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="candidate-form" loading={pending} disabled={isEdit && !isDirty}>
            {isEdit ? 'Save changes' : 'Add candidate'}
          </Button>
        </>
      }
    >
      <form id="candidate-form" onSubmit={handleSubmit(onSubmit)} className="space-y-7" noValidate>
        <Section title="Personal details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" required error={errors.firstName?.message}>
              {(a) => <Input {...a} {...register('firstName', rules.name('First name'))} invalid={!!errors.firstName} autoComplete="off" data-autofocus />}
            </Field>
            <Field label="Last name" required error={errors.lastName?.message}>
              {(a) => <Input {...a} {...register('lastName', rules.name('Last name'))} invalid={!!errors.lastName} autoComplete="off" />}
            </Field>
            <Field label="Email" required error={errors.email?.message}>
              {(a) => <Input {...a} type="email" {...register('email', rules.email)} invalid={!!errors.email} autoComplete="off" />}
            </Field>
            <Field label="Phone" optional error={errors.phone?.message}>
              {(a) => <Input {...a} type="tel" {...register('phone', rules.phone)} invalid={!!errors.phone} placeholder="+91 98xxx xxxxx" />}
            </Field>
            <Field label="Location" optional className="sm:col-span-2">
              {(a) => <Input {...a} {...register('location')} placeholder="City" />}
            </Field>
          </div>
        </Section>

        <Section title="Professional background">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Current title" optional>
              {(a) => <Input {...a} {...register('currentTitle')} placeholder="e.g. Travel Consultant" />}
            </Field>
            <Field label="Current company" optional>
              {(a) => <Input {...a} {...register('currentCompany')} />}
            </Field>
            <Field label="Total experience (years)" required error={errors.experienceYears?.message}>
              {(a) => <Input {...a} type="number" min={0} max={45} step={1} {...register('experienceYears', rules.positiveInt('Experience', { min: 0, max: 45 }))} invalid={!!errors.experienceYears} />}
            </Field>
            <Field label="Notice period">
              {(a) => <Select {...a} {...register('noticePeriod')} options={NOTICE_PERIODS.map((n) => ({ value: n, label: n }))} />}
            </Field>
            <Field label="Expected salary (₹ per annum)" optional error={errors.expectedSalary?.message}>
              {(a) => <Input {...a} type="number" min={0} step={10000} {...register('expectedSalary', { min: { value: 0, message: 'Must be positive' } })} />}
            </Field>
            {!isEdit && (
              <Field label="Highest qualification" optional>
                {(a) => <Input {...a} {...register('education')} placeholder="e.g. BBA, Travel & Tourism" />}
              </Field>
            )}
            <Field label="Skills" hint="Press Enter to add. Suggestions come from open vacancies." className="sm:col-span-2" error={errors.skills?.message}>
              {(a) => (
                <Controller
                  name="skills"
                  control={control}
                  rules={{ validate: (v) => v.length > 0 || 'Add at least one skill' }}
                  render={({ field }) => <TagInput {...a} value={field.value} onChange={field.onChange} suggestions={skillSuggestions} invalid={!!errors.skills} />}
                />
              )}
            </Field>
          </div>
        </Section>

        <Section title="Sourcing">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Source">
              {(a) => <Select {...a} {...register('source')} options={[...CANDIDATE_SOURCES, 'Recruiter sourced'].map((s) => ({ value: s, label: s }))} />}
            </Field>
            <Field label="Recruiter" required error={errors.recruiterId?.message}>
              {(a) => <Select {...a} {...register('recruiterId', rules.required('Recruiter'))} options={options.recruiters} placeholder="Select recruiter" invalid={!!errors.recruiterId} />}
            </Field>
            {!isEdit && (
              <>
                <Field label="Apply to vacancy" optional hint="You can add more vacancies later from the profile." className="sm:col-span-2">
                  {(a) => <Select {...a} {...register('jobId')} options={options.openJobs} placeholder="Don't add to a vacancy yet" />}
                </Field>
                <div className="sm:col-span-2">
                  <p className="mb-1.5 text-xs font-medium text-ink-soft">Resume</p>
                  <FileDropzone file={resume} onFile={setResume} onClear={() => setResume(null)} />
                  <MockNotice className="mt-2">Demo mode stores only the file name and size in this browser. Connect object storage to keep the actual document.</MockNotice>
                </div>
                <Field label="Recruiter note" optional className="sm:col-span-2">
                  {(a) => <Textarea {...a} {...register('note')} rows={2} placeholder="Context from the first conversation…" />}
                </Field>
              </>
            )}
          </div>
        </Section>
      </form>
    </Modal>
  )
}
