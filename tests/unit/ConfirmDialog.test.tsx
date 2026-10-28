import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

describe('ConfirmDialog', () => {
  it('blocks confirmation until a required reason is entered, then passes it trimmed', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        open
        onClose={() => undefined}
        onConfirm={onConfirm}
        title="Reject requisition?"
        confirmLabel="Reject"
        reasonLabel="Comment"
        requireReason
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Reject requisition?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reject' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByText('Comment is required')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: /Comment/ }), '  Budget not available  ')
    await user.click(screen.getByRole('button', { name: 'Reject' }))
    expect(onConfirm).toHaveBeenCalledWith('Budget not available')
  })

  it('closes with Escape', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<ConfirmDialog open onClose={onClose} onConfirm={() => undefined} title="Delete?" />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
