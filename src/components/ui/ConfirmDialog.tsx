import { useEffect, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { Field, Textarea } from './Form'
import { Dialog } from './Overlay'

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (note: string) => void | Promise<void>
  title: ReactNode
  description?: ReactNode
  confirmLabel?: string
  tone?: 'primary' | 'danger'
  /** Shows a note field; `required` blocks confirmation until it is filled. */
  note?: { label: string; required?: boolean; placeholder?: string }
  loading?: boolean
  children?: ReactNode
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'primary',
  note,
  loading,
  children,
}: ConfirmDialogProps) {
  const [text, setText] = useState('')
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    if (open) {
      setText('')
      setTouched(false)
    }
  }, [open])
  const invalid = Boolean(note?.required && !text.trim())
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={loading}
            onClick={() => {
              setTouched(true)
              if (!invalid) void onConfirm(text.trim())
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {description && <p className="text-ink-soft text-sm leading-relaxed">{description}</p>}
        {children}
        {note && (
          <Field label={note.label} required={note.required} error={touched && invalid ? `${note.label} is required.` : null}>
            {(a) => <Textarea {...a} value={text} onChange={(e) => setText(e.target.value)} placeholder={note.placeholder} data-autofocus />}
          </Field>
        )}
      </div>
    </Dialog>
  )
}
