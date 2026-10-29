import { Check, Circle, CornerUpLeft, X } from 'lucide-react'
import { describeApprover } from '@/domain/approvals'
import type { Account, ApprovalStep } from '@/domain/types'
import { formatDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'

/** Ordered approval steps with decisions, approvers and comments. */
export function ApprovalTrail({ steps, accounts }: { steps: ApprovalStep[]; accounts: Account[] }) {
  if (!steps.length) return <p className="text-muted px-4 py-3 text-sm">No approval needed — handled directly by HR.</p>
  const firstPending = steps.findIndex((s) => s.decision === 'pending')
  return (
    <ol className="space-y-0 px-4 py-3">
      {steps.map((s, i) => {
        const Icon = s.decision === 'approved' ? Check : s.decision === 'rejected' ? X : s.decision === 'changes_requested' ? CornerUpLeft : Circle
        const label =
          s.decision === 'pending'
            ? i === firstPending
              ? 'Waiting for decision'
              : 'Not started'
            : s.decision === 'approved'
              ? 'Approved'
              : s.decision === 'rejected'
                ? 'Rejected'
                : s.decision === 'changes_requested'
                  ? 'Changes requested'
                  : 'Skipped'
        return (
          <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 && <span className="bg-line absolute top-6 left-[11px] h-[calc(100%-1.25rem)] w-px" aria-hidden />}
            <span
              className={cn(
                'grid size-6 shrink-0 place-items-center rounded-full',
                s.decision === 'approved'
                  ? 'bg-success-soft text-success'
                  : s.decision === 'rejected'
                    ? 'bg-danger-soft text-danger'
                    : s.decision === 'changes_requested'
                      ? 'bg-warning-soft text-warning'
                      : i === firstPending
                        ? 'bg-brand-50 text-brand-700'
                        : 'bg-subtle text-muted',
              )}
            >
              <Icon size={13} aria-hidden />
            </span>
            <div className="min-w-0 text-sm">
              <p className="font-medium">{s.stageName}</p>
              <p className="text-muted text-xs">
                {label} · {s.decidedBy ? (accounts.find((a) => a.id === s.decidedBy)?.name ?? 'Unknown') : describeApprover(s, accounts)}
                {s.delegatedTo && s.decision === 'pending' && ' (delegated)'}
                {s.decidedAt && ` · ${formatDateTime(s.decidedAt)}`}
              </p>
              {s.comment && <p className="text-ink-soft mt-1 text-sm">“{s.comment}”</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
