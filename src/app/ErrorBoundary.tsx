import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/** Catches render errors so one broken view does not blank the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ui] render error', error, info.componentStack)
  }

  override componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  override render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="border-line bg-surface mx-auto mt-10 max-w-lg rounded-lg border p-6 text-center">
        <p className="font-semibold">This page could not be displayed.</p>
        <p className="text-muted mt-1 text-sm">The error has been logged to the browser console. Try again, or go back to your workspace.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" className="border-line-strong rounded-md border px-3 py-1.5 text-sm" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <a href={import.meta.env.BASE_URL} className="bg-brand-600 rounded-md px-3 py-1.5 text-sm text-white">
            Go to workspace
          </a>
        </div>
      </div>
    )
  }
}
