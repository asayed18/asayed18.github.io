import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { experiences, TOTAL_SCROLL_HEIGHT_VH } from './data/experiences'
import { profile } from './data/profile'
import { useScrollToDistance } from './hooks/useScrollToDistance'
import { getPerf } from './utils/devicePerf'
import type { Theme } from './theme'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ExperiencePanel } from './components/ExperiencePanel'
import { Header } from './components/Header'
import { HeroOverlay } from './components/HeroOverlay'
import { PortfolioSection } from './components/PortfolioSection'
import { AboutOverlay } from './components/AboutOverlay'
import { ResumeContent } from './components/ResumeContent'
import './App.css'

// three.js and the scene are a chunk of their own: the page around them paints first.
const Experience3D = lazy(() => import('./three/Experience3D'))

interface JourneyProps {
  theme: Theme
  onToggleTheme: () => void
  /** The 3D scene could not start or crashed. */
  onSceneError: () => void
}

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1)

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Whether `el` still has room to scroll in the direction of `deltaY`. */
function canScroll(el: Element | null, deltaY: number): boolean {
  if (!el) return false
  return deltaY < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1
}

/** Distance of one arrow-key step, in CSS pixels. */
const ARROW_KEY_STEP = 80
/** Share of the screen height that Page Up, Page Down and Space scroll. */
const PAGE_KEY_STEP = 0.85

/** The scroll-driven 3D journey: canvas, landing screen, header, panels and portfolio. */
export function Journey({ theme, onToggleTheme, onSceneError }: JourneyProps) {
  const perf = useMemo(() => getPerf(), [])
  const scrollRef = useRef<HTMLDivElement>(null)
  const portfolioRef = useRef<HTMLDivElement>(null)
  const { progressRef, heroProgress, portfolioProgress, activeExperienceId, beginJump } = useScrollToDistance(
    scrollRef,
    experiences
  )
  const activeExperience = experiences.find((e) => e.id === activeExperienceId) ?? null
  const activeIndex = activeExperience ? experiences.findIndex((e) => e.id === activeExperience.id) : -1
  // Building side: even=right(+1), odd=left(-1). Panel goes on the opposite side.
  const panelSide: 'left' | 'right' = activeIndex >= 0 && activeIndex % 2 === 0 ? 'right' : 'left'

  // Header fades in during the last 40% of the hero transition for a seamless crossfade
  const headerOpacity = clamp01((heroProgress - 0.6) / 0.4)

  const [aboutOpen, setAboutOpen] = useState(false)
  const [sceneReady, setSceneReady] = useState(false)
  const openAbout = useCallback(() => setAboutOpen(true), [])
  const closeAbout = useCallback(() => setAboutOpen(false), [])
  const markSceneReady = useCallback(() => setSceneReady(true), [])

  // The event handlers below are registered once and read the latest values through refs.
  const aboutOpenRef = useRef(aboutOpen)
  aboutOpenRef.current = aboutOpen
  const portfolioProgressRef = useRef(portfolioProgress)
  portfolioProgressRef.current = portfolioProgress

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
    // Whether the element under the pointer scrolls by itself for this gesture.
    const scrollsItself = (el: HTMLElement, deltaY: number) => {
      // The portfolio is a scroller of its own and forwards to the journey when it has to.
      if (el.closest?.('.portfolio-overlay')) return true
      // A panel only keeps the gesture while its text can still scroll that way. Otherwise the
      // journey goes on, instead of the wheel going dead over the panel.
      const panel = el.closest?.('.experience-panel')
      return !!panel && canScroll(panel.querySelector('.experience-panel-content'), deltaY)
    }

    const releaseHoldOnScrollBack = (deltaY: number) => {
      if (deltaY < 0 && experienceHeldRef.current) {
        experienceHeldRef.current = false
        if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null }
      }
    }

    // Desktop: forward wheel
    const handleWheel = (e: WheelEvent) => {
      // The About dialog scrolls by itself, and the journey behind it stays put.
      if (aboutOpenRef.current) return
      // Ctrl + wheel is the browser's zoom gesture (also a trackpad pinch).
      if (e.ctrlKey) return
      if (scrollsItself(e.target as HTMLElement, e.deltaY)) return

      releaseHoldOnScrollBack(e.deltaY)
      if (experienceHeldRef.current) { e.preventDefault(); return }

      scrollRef.current?.scrollBy({ top: e.deltaY, behavior: 'auto' })
      e.preventDefault()
    }

    // Mobile: forward touch
    const handleTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (aboutOpenRef.current) return
      // Two fingers: leave pinch-zoom to the browser.
      if (e.touches.length > 1) return
      const target = e.target as HTMLElement
      // Let the native scroll container handle if touch lands directly on it
      if (target.closest?.('.scroll-container')) return

      const deltaY = touchStartY.current - e.touches[0].clientY
      touchStartY.current = e.touches[0].clientY
      if (scrollsItself(target, deltaY)) return

      releaseHoldOnScrollBack(deltaY)
      if (experienceHeldRef.current) { e.preventDefault(); return }

      scrollRef.current?.scrollBy({ top: deltaY, behavior: 'auto' })
      e.preventDefault()
    }

    // Keyboard: the page itself does not scroll (everything is fixed in place), so the keys that
    // normally scroll a page are sent to the journey, or to the portfolio once it is open.
    const handleKeyDown = (e: KeyboardEvent) => {
      if (aboutOpenRef.current || e.defaultPrevented) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement
      if (target.closest?.('input, textarea, select, [contenteditable="true"]')) return
      // Space and Enter belong to the focused control.
      if (e.key === ' ' && target.closest?.('a, button, summary, video, iframe')) return

      const journey = scrollRef.current
      if (!journey) return
      const page = journey.clientHeight * PAGE_KEY_STEP

      let deltaY: number
      switch (e.key) {
        case 'ArrowDown': deltaY = ARROW_KEY_STEP; break
        case 'ArrowUp': deltaY = -ARROW_KEY_STEP; break
        case 'PageDown': deltaY = page; break
        case 'PageUp': deltaY = -page; break
        case ' ': deltaY = e.shiftKey ? -page : page; break
        case 'Home': deltaY = -Infinity; break
        case 'End': deltaY = Infinity; break
        default: return
      }
      e.preventDefault()

      // Once the portfolio is fully open the keys scroll its content. Going up from its top
      // returns to the journey, like the wheel does.
      const portfolio = portfolioRef.current
      const inPortfolio = !!portfolio && portfolioProgressRef.current >= 1 && (deltaY > 0 || portfolio.scrollTop > 0)
      const scroller = inPortfolio ? portfolio : journey

      const behavior: ScrollBehavior = e.repeat || prefersReducedMotion() ? 'auto' : 'smooth'
      if (Number.isFinite(deltaY)) {
        scroller.scrollBy({ top: deltaY, behavior })
      } else if (inPortfolio) {
        scroller.scrollTo({ top: deltaY < 0 ? 0 : scroller.scrollHeight, behavior })
      } else {
        // Home and End travel the whole road: skip the stops on the way.
        beginJump()
        journey.scrollTo({ top: deltaY < 0 ? 0 : journey.scrollHeight, behavior })
      }
    }

    // Attach to document so it captures touch on ALL overlays (hero, ui, portfolio)
    document.addEventListener('wheel', handleWheel, { passive: false })
    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('wheel', handleWheel)
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [beginJump]) // all dynamic state accessed via refs

  const navigateTo = useCallback(
    (fraction: number) => {
      const el = scrollRef.current
      if (!el) return
      beginJump()
      const maxScroll = el.scrollHeight - el.clientHeight
      el.scrollTo({ top: maxScroll * fraction, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    },
    [beginJump]
  )
  const navigateToHome = useCallback(() => navigateTo(0), [navigateTo])
  // Scroll to 98% — fully into the portfolio cards
  const navigateToPortfolio = useCallback(() => navigateTo(0.98), [navigateTo])

  const portfolioOpen = portfolioProgress > 0

  // The scene's ambient animation is only drawn while the scene can be seen: not behind the
  // landing blur, the portfolio (once it covers the screen) or the About dialog.
  const sceneVisible = heroProgress > 0 && portfolioProgress < 1 && !aboutOpen

  return (
    <div className="app-wrap">
      <a className="skip-link" href="?view=text">
        Skip the 3D journey: read the text version
      </a>

      <div
        ref={scrollRef}
        className="scroll-container"
        // An empty scroll surface: nothing in it for a screen reader or the Tab key.
        aria-hidden="true"
        tabIndex={-1}
      >
        <div
          className="scroll-spacer"
          style={{ height: `${TOTAL_SCROLL_HEIGHT_VH}vh` }}
        />
      </div>
      <div className="canvas-wrapper" aria-hidden="true">
        <ErrorBoundary onError={onSceneError}>
          <Suspense fallback={null}>
            <Experience3D
              progressRef={progressRef}
              scrollRef={scrollRef}
              experiences={experiences}
              activeExperienceId={activeExperienceId}
              theme={theme}
              perf={perf}
              ambient={sceneVisible}
              onReady={markSceneReady}
            />
          </Suspense>
        </ErrorBoundary>
      </div>

      {/* Hero overlay – visible until the user starts scrolling */}
      <HeroOverlay progress={heroProgress} theme={theme} onToggleTheme={onToggleTheme} sceneReady={sceneReady} />

      <div
        className={portfolioOpen ? 'ui-overlay ui-overlay--above-portfolio' : 'ui-overlay'}
        style={{
          opacity: headerOpacity,
          // Hidden, not just transparent: keeps the links out of reach of the Tab key meanwhile.
          visibility: headerOpacity > 0 ? 'visible' : 'hidden',
          // Above the portfolio only the header itself takes clicks; the cards stay reachable.
          pointerEvents: headerOpacity > 0.1 && !portfolioOpen ? 'auto' : 'none',
        }}
      >
        <Header
          theme={theme}
          onToggleTheme={onToggleTheme}
          showAvatar={headerOpacity > 0.3}
          avatarProgress={clamp01((headerOpacity - 0.3) / 0.7)}
          nameIsHeading={heroProgress >= 1}
          solid={portfolioOpen}
          onNavigatePortfolio={navigateToPortfolio}
          onOpenAbout={openAbout}
          onNavigateHome={navigateToHome}
        />
        <ExperiencePanel experience={activeExperience} side={panelSide} />
      </div>

      {/* Portfolio section – appears at the end of the road */}
      <PortfolioSection progress={portfolioProgress} theme={theme} scrollRef={scrollRef} overlayRef={portfolioRef} />

      {/* About overlay */}
      <AboutOverlay open={aboutOpen} onClose={closeAbout} />

      {/* The same content as text, for search engines and screen readers */}
      <ResumeContent offscreen interactive={false} />

      <footer className="site-footer">
        &copy; {new Date().getFullYear()} {profile.name}. All rights reserved.
      </footer>
    </div>
  )
}
