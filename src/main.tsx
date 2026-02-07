import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { SceneErrorBoundary } from './components/ErrorFallback'
import './components/ErrorFallback.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SceneErrorBoundary>
      <App />
    </SceneErrorBoundary>
  </StrictMode>,
)
