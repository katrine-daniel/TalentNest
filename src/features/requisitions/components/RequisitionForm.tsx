import { useEffect, useId } from 'react'
import { useForm } from 'react-hook-form'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/FormControls'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { useCollection } from '@/hooks/useStore'
import { useSession } from '@/app/providers/SessionContext'
import type { Requisition } from '@/types/domain'
import { requisitionService, type RequisitionInput } from '../requisitionService'

const EMPTY: RequisitionInput = {
  title: '',
  departmentId: '',
  justification: '',
  headcount: 1,
  budgetMin: 0,
  budgetMax: 0,
  hiringManagerId: '',
  approverId: '',
}

/** Create or revise a requisition; "Submit for approval" or keep as a draft. */
export default function RequisitionForm({ open, onClose, requisition }: { open: boolean; onClose: () => void; requisition?: Requisition | null }) {
  const formId = useId()
  const { actorId } = useSession()
  const departments = useCollection('departments')
  const users = useCollection('users')
  const isEdit = Boolean(requisition)
  const create = useAsyncAction((v: RequisitionInput, submit: boolean) => requisitionService.create(v, { actorId, submit }), {
    success: (_r, _v, submit) => (submit ? 'Requisition submitted for approval' : 'Draft saved'),
  })
  const update = useAsyncAction((v: RequisitionInput) => requisitionService.update(requisition!.id, v, { actorId }), {
    success: 'Requisition updated — submit it again when ready',
  })
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors },
  } = useForm<RequisitionInput>({ defaultValues: EMPTY })

  useEffect(() => {
    if (open) reset(requisition ? { ...EMPTY, ...requisition } : { ...EMPTY, hiringManagerId: actorId })
  }, [open, requisition, reset, actorId])

  // Roles that hold `requisitions.approve` by default.
  const approvers = users.filter((u) => u.status === 'active' && (u.role === 'Admin' || u.role === 'Hiring Manager'))
  const save = (submit: boolean) =>
    handleSubmit(async (values) => {
      const res = isEdit ? await update.run(values) : await create.run(values, submit)
      if (res.ok) onClose()
    })()

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Revise requisition' : 'Raise a requisition'}
      description="Requisitions must be approved before a vacancy can be published."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {!isEdit && (
            <Button onClick={() => save(false)} loading={create.pending}>
              Save draft
            </Button>
          )}
          <Button variant="primary" type="submit" form={formId} loading={create.pending || update.pending}>
            {isEdit ? 'Save changes' : 'Submit for approval'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          void save(true)
        }}
      >
        <Field label="Position title" required error={errors.title?.message} className="sm:col-span-2">
          {(a) => (
            <Input
              {...a}
              {...register('title', { required: 'Title is required', minLength: { value: 4, message: 'Use a descriptive title' } })}
              invalid={Boolean(errors.title)}
              data-autofocus
            />
          )}
        </Field>
        <Field label="Department" required error={errors.departmentId?.message}>
          {(a) => (
            <Select
              {...a}
              {...register('departmentId', { required: 'Choose a department' })}
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
              placeholder="Select department"
              invalid={Boolean(errors.departmentId)}
            />
          )}
        </Field>
        <Field label="Headcount" required error={errors.headcount?.message}>
          {(a) => (
            <Input
              {...a}
              type="number"
              min={1}
              {...register('headcount', { valueAsNumber: true, min: { value: 1, message: 'At least 1' }, max: { value: 200, message: 'At most 200' } })}
              invalid={Boolean(errors.headcount)}
            />
          )}
        </Field>
        <Field label="Budget from (₹/yr per hire)" required error={errors.budgetMin?.message}>
          {(a) => (
            <Input
              {...a}
              type="number"
              min={0}
              step={10000}
              {...register('budgetMin', { valueAsNumber: true, min: { value: 1, message: 'Enter a budget' } })}
              invalid={Boolean(errors.budgetMin)}
            />
          )}
        </Field>
        <Field label="Budget to (₹/yr per hire)" required error={errors.budgetMax?.message}>
          {(a) => (
            <Input
              {...a}
              type="number"
              min={0}
              step={10000}
              {...register('budgetMax', { valueAsNumber: true, validate: (v) => v >= Number(getValues('budgetMin')) || 'Must be at least the minimum' })}
              invalid={Boolean(errors.budgetMax)}
            />
          )}
        </Field>
        <Field label="Hiring manager" required error={errors.hiringManagerId?.message}>
          {(a) => (
            <Select
              {...a}
              {...register('hiringManagerId', { required: 'Assign a hiring manager' })}
              options={users
                .filter((u) => u.status === 'active' && (u.role === 'Hiring Manager' || u.role === 'Admin'))
                .map((u) => ({ value: u.id, label: u.name }))}
              placeholder="Select"
              invalid={Boolean(errors.hiringManagerId)}
            />
          )}
        </Field>
        <Field label="Approver" required error={errors.approverId?.message} hint="Cannot be the person raising the request (unless an admin).">
          {(a) => (
            <Select
              {...a}
              {...register('approverId', {
                required: 'Assign an approver',
                validate: (v) => v !== actorId || users.find((u) => u.id === actorId)?.role === 'Admin' || 'Choose someone else to approve',
              })}
              options={approvers.map((u) => ({ value: u.id, label: `${u.name} (${u.role})` }))}
              placeholder="Select"
              invalid={Boolean(errors.approverId)}
            />
          )}
        </Field>
        <Field label="Hiring justification" required error={errors.justification?.message} className="sm:col-span-2">
          {(a) => (
            <Textarea
              {...a}
              rows={4}
              placeholder="Why is this role needed now? What happens if it stays unfilled?"
              {...register('justification', {
                required: 'Explain the business need',
                minLength: { value: 30, message: 'Add a little more detail (30+ characters)' },
              })}
              invalid={Boolean(errors.justification)}
            />
          )}
        </Field>
      </form>
    </Modal>
  )
}
