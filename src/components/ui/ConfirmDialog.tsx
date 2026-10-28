import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import Modal from './Modal'
import Button from './Button'
import { Field, Textarea } from './FormControls'

/**
 * Confirmation for important or irreversible actions.
 * With `requireReason` the user must enter a note, passed to onConfirm(reason).
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'primary',
  loading = false,
  reasonLabel,
  requireReason = false,
  reasonPlaceholder,
  children,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (reason: string) => void | Promise<void>
  title: ReactNode
  description?: ReactNode
  confirmLabel?: ReactNode
  tone?: 'primary' | 'danger'
  loading?: boolean
  reasonLabel?: string
  requireReason?: boolean
  reasonPlaceholder?: string
  children?: ReactNode
}) {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const formId = useId()

  useEffect(() => {
    if (open) {
      setReason('')
      setTouched(false)
    }
  }, [open])

  const invalid = requireReason && !reason.trim()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (invalid) return
    onConfirm(reason.trim())
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} type="submit" form={formId} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        {description && <p className="text-ink-soft text-sm leading-relaxed">{description}</p>}
        {children}
        {reasonLabel && (
          <Field label={reasonLabel} required={requireReason} optional={!requireReason} error={touched && invalid ? `${reasonLabel} is required` : null}>
            {(a11y) => (
              <Textarea
                {...a11y}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={reasonPlaceholder}
                invalid={touched && invalid}
                data-autofocus
              />
            )}
          </Field>
        )}
      </form>
    </Modal>
  )
}
