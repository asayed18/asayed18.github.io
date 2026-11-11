import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Shown in place of the children after an error. */
  fallback?: ReactNode
  onError?: (error: unknown) => void
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    this.props.onError?.(error)
  }

  render() {
    return this.state.hasError ? (this.props.fallback ?? null) : this.props.children
  }
}
