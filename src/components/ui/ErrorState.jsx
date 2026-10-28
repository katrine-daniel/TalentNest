import { AlertTriangle, RotateCcw } from 'lucide-react'
import Button from './Button'

export default function ErrorState({ title = 'Something went wrong', description, onRetry, retryLabel = 'Try again' }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center" role="alert">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
        <AlertTriangle size={18} aria-hidden />
      </span>
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && <p className="text-muted mt-1 max-w-md text-xs">{description}</p>}
      {onRetry && (
        <Button className="mt-4" size="sm" icon={RotateCcw} onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  )
}
