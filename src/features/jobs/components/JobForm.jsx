import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Controller, useForm } from 'react-hook-form'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import TagInput from '@/components/ui/TagInput'
import { Field, Input, Select, Textarea } from '@/components/ui/FormControls'
import WorkflowBuilder from './WorkflowBuilder'
import { useJobActions, useOrgOptions } from '@/features/jobs/hooks/useJobs'
import { useCollection } from '@/hooks/useStore'
import { rules } from '@/utils/validation'
import { toOptions } from '@/utils/statusHelpers'
import { JOB_CATEGORIES, WORK_MODES, EMPLOYMENT_TYPES } from '@/data/mockJobs'

const EMPTY = {
  title: '',
  departmentId: '',
  category: '',
  location: '',
  workMode: 'On-site',
  employmentType: 'Full-time',
  openings: 1,
  experienceMin: 0,
  experienceMax: 3,
  salaryMin: '',
  salaryMax: '',
  skills: [],
  description: '',
  hiringManagerId: '',
  recruiterId: '',
  status: 'open',
  workflowTemplateId: '',
}

const stagesFromTemplate = (template) => template?.stages.map((s, i) => ({ id: `tmp-${template.id}-${i}`, name: s.name, type: s.type })) ?? []

/** Create or edit a vacancy, including its job-specific recruitment workflow. */
export default function JobForm({ open, onClose, job }) {
  const isEdit = Boolean(job)
  const navigate = useNavigate()
  const options = useOrgOptions()
  const templates = useCollection('workflowTemplates')
  const applications = useCollection('applications')
  const jobs = useCollection('jobs')
  const actions = useJobActions()
  const [stages, setStages] = useState([])
  const [stagesError, setStagesError] = useState(null)
  const [stagesDirty, setStagesDirty] = useState(false)

  const skillSuggestions = useMemo(() => Array.from(new Set(jobs.flatMap((j) => j.skills))).sort(), [jobs])
  const counts = useMemo(() => {
    if (!job) return {}
    const c = {}
    applications.filter((a) => a.jobId === job.id && a.status !== 'withdrawn').forEach((a) => (c[a.stageId] = (c[a.stageId] ?? 0) + 1))
    return c
  }, [applications, job])

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    getValues,
    formState: { errors, isDirty },
  } = useForm({ defaultValues: EMPTY })

  useEffect(() => {
    if (!open) return
    setStagesError(null)
    setStagesDirty(false)
    if (job) {
      reset({ ...EMPTY, ...job })
      setStages(job.stages)
    } else {
      reset(EMPTY)
      setStages([])
    }
  }, [open, job, reset])

  const templateId = watch('workflowTemplateId')
  useEffect(() => {
    if (isEdit || !templateId) return
    setStages(stagesFromTemplate(templates.find((t) => t.id === templateId)))
  }, [templateId, templates, isEdit])

  const pending = actions.create.pending || actions.update.pending

  const onSubmit = async (values) => {
    if (!stages.length) {
      setStagesError('Choose a workflow template to define recruitment stages')
      return
    }
    if (stages.some((s) => !s.name.trim())) {
      setStagesError('Every stage needs a name')
      return
    }
    const payload = { ...values, stages }
    const res = isEdit ? await actions.update.run(job.id, payload) : await actions.create.run(payload)
    if (res.ok) {
      onClose()
      if (!isEdit) navigate(`/jobs/${res.data.id}`)
    } else {
      setStagesError(res.error?.message?.toLowerCase().includes('stage') ? res.error.message : null)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={isEdit ? `Edit vacancy` : 'Create vacancy'}
      description={isEdit ? job.title : 'Describe the role, assign owners and choose the recruitment workflow.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="job-form" loading={pending} disabled={isEdit && !isDirty && !stagesDirty}>
            {isEdit ? 'Save vacancy' : 'Create vacancy'}
          </Button>
        </>
      }
    >
      <form id="job-form" onSubmit={handleSubmit(onSubmit)} noValidate className="grid grid-cols-1 gap-8 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Field label="Job title" required error={errors.title?.message}>
            {(a) => <Input {...a} {...register('title', { ...rules.required('Job title'), minLength: { value: 4, message: 'Use a descriptive title' } })} invalid={!!errors.title} placeholder="e.g. Travel Consultant — International" data-autofocus />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Department" required error={errors.departmentId?.message}>
              {(a) => <Select {...a} {...register('departmentId', rules.required('Department'))} options={options.departments} placeholder="Select department" invalid={!!errors.departmentId} />}
            </Field>
            <Field label="Job category" required error={errors.category?.message}>
              {(a) => <Select {...a} {...register('category', rules.required('Category'))} options={JOB_CATEGORIES.map((c) => ({ value: c, label: c }))} placeholder="Select category" invalid={!!errors.category} />}
            </Field>
            <Field label="Location" required error={errors.location?.message}>
              {(a) => <Input {...a} {...register('location', rules.required('Location'))} invalid={!!errors.location} placeholder="City" />}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Work mode">{(a) => <Select {...a} {...register('workMode')} options={WORK_MODES.map((m) => ({ value: m, label: m }))} />}</Field>
              <Field label="Type">{(a) => <Select {...a} {...register('employmentType')} options={EMPLOYMENT_TYPES.map((m) => ({ value: m, label: m }))} />}</Field>
            </div>
            <Field label="Openings" required error={errors.openings?.message}>
              {(a) => <Input {...a} type="number" min={1} {...register('openings', rules.positiveInt('Openings', { min: 1, max: 200 }))} invalid={!!errors.openings} />}
            </Field>
            <Field label="Status">{(a) => <Select {...a} {...register('status')} options={toOptions('job')} />}</Field>
            <div className="grid grid-cols-2 gap-3 sm:col-span-2">
              <Field label="Min. experience (yrs)" required error={errors.experienceMin?.message}>
                {(a) => <Input {...a} type="number" min={0} {...register('experienceMin', rules.positiveInt('Minimum', { min: 0, max: 30 }))} invalid={!!errors.experienceMin} />}
              </Field>
              <Field label="Max. experience (yrs)" required error={errors.experienceMax?.message}>
                {(a) => (
                  <Input
                    {...a}
                    type="number"
                    min={0}
                    {...register('experienceMax', { ...rules.positiveInt('Maximum', { min: 0, max: 40 }), validate: (v) => v >= Number(getValues('experienceMin')) || 'Must be ≥ minimum' })}
                    invalid={!!errors.experienceMax}
                  />
                )}
              </Field>
              <Field label="Salary from (₹/yr)" optional>
                {(a) => <Input {...a} type="number" min={0} step={10000} {...register('salaryMin')} />}
              </Field>
              <Field label="Salary to (₹/yr)" optional error={errors.salaryMax?.message}>
                {(a) => (
                  <Input
                    {...a}
                    type="number"
                    min={0}
                    step={10000}
                    {...register('salaryMax', { validate: (v) => !v || !getValues('salaryMin') || Number(v) >= Number(getValues('salaryMin')) || 'Must be ≥ starting salary' })}
                    invalid={!!errors.salaryMax}
                  />
                )}
              </Field>
            </div>
          </div>
          <Field label="Required skills" required error={errors.skills?.message}>
            {(a) => (
              <Controller
                name="skills"
                control={control}
                rules={{ validate: (v) => v.length >= 2 || 'Add at least two skills' }}
                render={({ field }) => <TagInput {...a} value={field.value} onChange={field.onChange} suggestions={skillSuggestions} invalid={!!errors.skills} />}
              />
            )}
          </Field>
          <Field label="Job description" required error={errors.description?.message}>
            {(a) => <Textarea {...a} rows={5} {...register('description', { ...rules.required('Description'), minLength: { value: 40, message: 'Add at least a few sentences (40+ characters)' } })} invalid={!!errors.description} />}
          </Field>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <Field label="Hiring manager" required error={errors.hiringManagerId?.message}>
              {(a) => <Select {...a} {...register('hiringManagerId', rules.required('Hiring manager'))} options={options.hiringManagers} placeholder="Select hiring manager" invalid={!!errors.hiringManagerId} />}
            </Field>
            <Field label="Recruiter" required error={errors.recruiterId?.message}>
              {(a) => <Select {...a} {...register('recruiterId', rules.required('Recruiter'))} options={options.recruiters} placeholder="Select recruiter" invalid={!!errors.recruiterId} />}
            </Field>
          </div>
          <Field
            label="Workflow template"
            required={!isEdit}
            hint={isEdit ? 'Stages below belong to this vacancy only.' : 'Stages are copied to this vacancy so you can tailor them.'}
            error={errors.workflowTemplateId?.message}
          >
            {(a) => <Select {...a} {...register('workflowTemplateId', isEdit ? {} : rules.required('Workflow template'))} options={options.workflowTemplates} placeholder="Choose a template" disabled={isEdit} invalid={!!errors.workflowTemplateId} />}
          </Field>
          <div>
            <p className="mb-2 text-xs font-medium text-ink-soft">Recruitment stages</p>
            {stages.length ? (
              <WorkflowBuilder
                stages={stages}
                counts={counts}
                error={stagesError}
                onChange={(s) => {
                  setStages(s)
                  setStagesDirty(true)
                  setStagesError(null)
                }}
              />
            ) : (
              <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-xs text-muted">
                {stagesError ?? 'Select a workflow template to load its stages.'}
              </p>
            )}
          </div>
        </div>
      </form>
    </Modal>
  )
}
