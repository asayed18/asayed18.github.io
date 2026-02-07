import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class SceneErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return <StaticFallback />
    }
    return this.props.children
  }
}

function StaticFallback() {
  return (
    <div className="fallback-wrap">
      <div className="fallback-content">
        <img src="/avatar.png" alt="Ahmed Sayed" className="fallback-avatar" />
        <h1 className="fallback-name">Ahmed Sayed</h1>
        <p className="fallback-role">Senior Software Engineer @ Babbel GmbH</p>
        <p className="fallback-bio">
          7+ years of experience in full-stack development, specializing in
          scalable architectures and modern web technologies. Based in Berlin, Germany.
        </p>
        <p className="fallback-note">
          Your browser doesn't support the 3D experience.
          Please try a modern browser with WebGL enabled.
        </p>
        <div className="fallback-links">
          <a href="https://github.com/asayed18" target="_blank" rel="noreferrer">GitHub</a>
          <a href="https://linkedin.com/in/a-abdelsalam" target="_blank" rel="noreferrer">LinkedIn</a>
          <a href="mailto:me@asayed18.top">Email</a>
        </div>
      </div>
    </div>
  )
}
