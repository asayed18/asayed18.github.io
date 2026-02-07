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
  const prevScrollProgress = useRef(scrollProgress)

  useEffect(() => {
    // Determine scroll direction (forward = toward portfolio, backward = toward hero)
    const scrollingForward = scrollProgress >= prevScrollProgress.current
    prevScrollProgress.current = scrollProgress

    // Entering a NEW experience zone while scrolling FORWARD → freeze briefly.
    // Scrolling backward (retreating from portfolio / revisiting) should never freeze.
    if (
      activeExperienceId &&
      activeExperienceId !== prevExperienceRef.current &&
      scrollingForward
    ) {
      experienceHeldRef.current = true
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
      holdTimerRef.current = setTimeout(() => {
        experienceHeldRef.current = false
      }, 1200) // 1.2 s pause — enough to notice the panel
    }

    // Left any zone or scrolling backward → cancel hold immediately
    if (!activeExperienceId || !scrollingForward) {
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
  }, [activeExperienceId, scrollProgress])

  // Register non-passive wheel listener so preventDefault works
  useEffect(() => {
    const el = uiOverlayRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest?.('.experience-panel')) return
      // Don't intercept when portfolio overlay is active — let it scroll naturally
      if ((e.target as HTMLElement).closest?.('.portfolio-overlay')) return

      // During the brief hold after entering an experience zone, block scrolling
      if (experienceHeldRef.current) {
        e.preventDefault()
        return
      }

      // Normal speed — no artificial slowdown
      scrollRef.current?.scrollBy({ top: e.deltaY, behavior: 'auto' })
      e.preventDefault()
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
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
