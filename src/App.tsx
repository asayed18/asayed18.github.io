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

  // --- Experience-zone hold: pause briefly when entering, then resume at full speed ---
  const experienceHeldRef = useRef(false)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevExperienceRef = useRef<string | null>(null)

  useEffect(() => {
    // Entering a NEW experience zone → freeze scroll briefly
    if (activeExperienceId && activeExperienceId !== prevExperienceRef.current) {
      experienceHeldRef.current = true
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
      holdTimerRef.current = setTimeout(() => {
        experienceHeldRef.current = false
      }, 1200) // 1.2 s pause — enough to notice the panel
    }

    // Left any zone → cancel hold immediately
    if (!activeExperienceId) {
      experienceHeldRef.current = false
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current)
        holdTimerRef.current = null
      }
    }

    prevExperienceRef.current = activeExperienceId
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
    }
  }, [activeExperienceId]) // only re-run when zone changes — timer survives between renders

  // Global scroll forwarding — single handler for both wheel (desktop) and touch (mobile)
  const touchStartY = useRef(0)

  useEffect(() => {
    // Elements that handle their own scrolling
    const isScrollableTarget = (el: HTMLElement) =>
      !!el.closest?.('.experience-panel') || !!el.closest?.('.portfolio-content')

    // Desktop: forward wheel
    const handleWheel = (e: WheelEvent) => {
      if (isScrollableTarget(e.target as HTMLElement)) return

      if (e.deltaY < 0 && experienceHeldRef.current) {
        experienceHeldRef.current = false
        if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null }
      }
      if (experienceHeldRef.current) { e.preventDefault(); return }

      scrollRef.current?.scrollBy({ top: e.deltaY, behavior: 'auto' })
      e.preventDefault()
    }

    // Mobile: forward touch
    const handleTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (isScrollableTarget(e.target as HTMLElement)) return
      // Let the native scroll container handle if touch lands directly on it
      if ((e.target as HTMLElement).closest?.('.scroll-container')) return

      const deltaY = touchStartY.current - e.touches[0].clientY
      touchStartY.current = e.touches[0].clientY

      if (deltaY < 0 && experienceHeldRef.current) {
        experienceHeldRef.current = false
        if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null }
      }
      if (experienceHeldRef.current) { e.preventDefault(); return }

      scrollRef.current?.scrollBy({ top: deltaY, behavior: 'auto' })
      e.preventDefault()
    }

    // Attach to document so it captures touch on ALL overlays (hero, ui, portfolio)
    document.addEventListener('wheel', handleWheel, { passive: false })
    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: false })

    return () => {
      document.removeEventListener('wheel', handleWheel)
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
    }
  }, []) // all dynamic state accessed via refs

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
          shadows
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
