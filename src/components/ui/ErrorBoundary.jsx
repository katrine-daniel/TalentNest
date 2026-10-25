import { Component } from 'react'
import ErrorState from './ErrorState'

/** Catches render errors so one broken view doesn't blank the whole app. */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Hook point for an error-reporting service (e.g. Sentry) once configured.
    console.error('UI error boundary caught:', error, info?.componentStack)
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-lg py-10">
          <ErrorState
            title="This view failed to load"
            description={this.state.error.message || 'An unexpected error occurred while rendering.'}
            onRetry={() => this.setState({ error: null })}
          />
        </div>
      )
    }
    return this.props.children
  }
}
