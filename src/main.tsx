import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ResumeContent } from './components/ResumeContent'

// Replaces the static page that the build put into #root (see src/prerender.tsx).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Last resort: if the app itself crashes, the text of the site is still shown. */}
    <ErrorBoundary fallback={<ResumeContent />}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
