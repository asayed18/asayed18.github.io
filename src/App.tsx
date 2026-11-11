import { useCallback, useEffect, useState } from 'react'
import { applyTheme, getInitialTheme, storeTheme, type Theme } from './theme'
import { isWebGLAvailable } from './utils/devicePerf'
import { Journey } from './Journey'
import { TextPage } from './components/TextPage'

/** `?view=text` asks for the text version of the site. */
function textVersionRequested(): boolean {
  return new URLSearchParams(window.location.search).get('view') === 'text'
}

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      storeTheme(next)
      return next
    })
  }, [])

  const [sceneFailed, setSceneFailed] = useState(false)
  const failScene = useCallback(() => setSceneFailed(true), [])

  const [textReason] = useState<'chosen' | 'unsupported' | null>(() => {
    if (textVersionRequested()) return 'chosen'
    return isWebGLAvailable() ? null : 'unsupported'
  })

  const reason = textReason ?? (sceneFailed ? 'failed' : null)
  if (reason) return <TextPage theme={theme} onToggleTheme={toggleTheme} reason={reason} />

  return <Journey theme={theme} onToggleTheme={toggleTheme} onSceneError={failScene} />
}

export default App
