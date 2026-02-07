import { useRef, useState, useCallback, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { experiences, TOTAL_SCROLL_HEIGHT_VH } from './data/experiences'
import { useScrollToDistance } from './hooks/useScrollToDistance'
import { Scene } from './components/Scene'
import { ExperiencePanel } from './components/ExperiencePanel'
import { Header } from './components/Header'
import { HeroOverlay } from './components/HeroOverlay'
import { PortfolioSection } from './components/PortfolioSection'
import { AboutOverlay } from './components/AboutOverlay'
import './App.css'

export type Theme = 'dark' | 'light'

// Hero transition completes at this scroll fraction
const HERO_DONE_AT = 0.02

function App() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { scrollProgress, activeExperienceId } = useScrollToDistance(scrollRef, experiences)
  const activeExperience = experiences.find((e) => e.id === activeExperienceId) ?? null
  const activeIndex = activeExperience ? experiences.findIndex((e) => e.id === activeExperience.id) : -1
  // Building side: even=right(+1), odd=left(-1). Panel goes on the opposite side.
  const panelSide: 'left' | 'right' = activeIndex >= 0 && activeIndex % 2 === 0 ? 'right' : 'left'

  // Header fades in during the last 40% of the hero transition for a seamless crossfade
  const headerOpacity = Math.min(Math.max((scrollProgress - HERO_DONE_AT * 0.6) / (HERO_DONE_AT * 0.4), 0), 1)

  // Portfolio section fades in at end of road (0.88 → 0.98)
  const portfolioProgress = Math.min(Math.max((scrollProgress - 0.88) / 0.10, 0), 1)

  const [theme, setTheme] = useState<Theme>(
    () => window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  )
  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const uiOverlayRef = useRef<HTMLDivElement>(null)

  // Register non-passive wheel listener so preventDefault works
  useEffect(() => {
    const el = uiOverlayRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest?.('.experience-panel')) return
      // Don't intercept when portfolio overlay is active — let it scroll naturally
      if ((e.target as HTMLElement).closest?.('.portfolio-overlay')) return
      const scrollSpeed = activeExperienceId ? 0.3 : 1
      scrollRef.current?.scrollBy({ top: e.deltaY * scrollSpeed, behavior: 'auto' })
      e.preventDefault()
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [activeExperienceId])

  const [aboutOpen, setAboutOpen] = useState(false)
  const [sceneReady, setSceneReady] = useState(false)

  const navigateToHome = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const navigateToPortfolio = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const maxScroll = el.scrollHeight - el.clientHeight
    // Scroll to 98% — fully into the portfolio cards
    el.scrollTo({ top: maxScroll * 0.98, behavior: 'smooth' })
  }, [])

  return (
    <div className="app-wrap">
      <div
        ref={scrollRef}
        className="scroll-container"
        aria-label="Scroll to journey forward"
      >
        <div
          className="scroll-spacer"
          style={{ height: `${TOTAL_SCROLL_HEIGHT_VH}vh` }}
        />
      </div>
      <div className="canvas-wrapper">
        <Canvas
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          shadows="soft"
          camera={{ position: [0, 3, 0], fov: 60 }}
          dpr={[1, 1.5]}
          performance={{ min: 0.5 }}
        >
          <Scene
            scrollProgress={scrollProgress}
            experiences={experiences}
            activeExperienceId={activeExperienceId}
            theme={theme}
            onReady={() => setSceneReady(true)}
          />
        </Canvas>
      </div>

      {/* Hero overlay – visible until the user starts scrolling */}
      <HeroOverlay scrollProgress={scrollProgress} theme={theme} onToggleTheme={toggleTheme} sceneReady={sceneReady} />

      <div
        ref={uiOverlayRef}
        className="ui-overlay"
        style={{
          opacity: headerOpacity,
          pointerEvents: headerOpacity > 0.1 ? 'auto' : 'none',
        }}
      >
        <Header
          theme={theme}
          onToggleTheme={toggleTheme}
          showAvatar={headerOpacity > 0.3}
          avatarProgress={Math.min(Math.max((headerOpacity - 0.3) / 0.7, 0), 1)}
          onNavigatePortfolio={navigateToPortfolio}
          onOpenAbout={() => setAboutOpen(true)}
          onNavigateHome={navigateToHome}
        />
        <ExperiencePanel experience={activeExperience} side={panelSide} />
      </div>

      {/* Portfolio section – appears at the end of the road */}
      <PortfolioSection progress={portfolioProgress} theme={theme} />

      {/* About overlay */}
      <AboutOverlay open={aboutOpen} onClose={() => setAboutOpen(false)} />

      <footer className="site-footer">
        &copy; {new Date().getFullYear()} Ahmed Sayed. All rights reserved.
      </footer>
    </div>
  )
}

export default App
