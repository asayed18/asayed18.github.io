import { useRef, useCallback, useEffect } from 'react'
import './HeroOverlay.css'

interface HeroOverlayProps {
  scrollProgress: number
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  sceneReady: boolean
}

export function HeroOverlay({ scrollProgress, theme, onToggleTheme, sceneReady }: HeroOverlayProps) {
  const heroRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef(0)

  // Forward wheel events to the scroll container beneath (desktop)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const scrollContainer = document.querySelector('.scroll-container') as HTMLElement
    if (scrollContainer) {
      scrollContainer.scrollBy({ top: e.deltaY, behavior: 'auto' })
    }
  }, [])

  // Forward touch events to the scroll container (mobile)
  useEffect(() => {
    const el = heroRef.current
    if (!el) return

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY
    }

    const handleTouchMove = (e: TouchEvent) => {
      const deltaY = touchStartY.current - e.touches[0].clientY
      touchStartY.current = e.touches[0].clientY
      const scrollContainer = document.querySelector('.scroll-container') as HTMLElement
      if (scrollContainer) {
        scrollContainer.scrollBy({ top: deltaY, behavior: 'auto' })
      }
      e.preventDefault()
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })

    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
    }
  }, [])

  // Transition range: 0 → 0.02 of total scroll (the very first bit of scrolling)
  const t = Math.min(scrollProgress / 0.02, 1)
  const isDone = t >= 1

  // Eased progress for smoother motion
  const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2 // easeInOutQuad

  // Backdrop – dark overlay in dark mode, light overlay in light mode
  const blur = (1 - ease) * 12
  const overlayBg = theme === 'light'
    ? `rgba(220, 220, 220, ${0.55 * (1 - ease)})`
    : `rgba(0, 0, 0, ${0.5 * (1 - ease)})`

  // Avatar + name group moves from center → top-left header position and shrinks
  // Header brand sits at roughly (1.5rem, 1.5rem) from top-left.
  // Hero content starts centered (50vw, 50vh) so we need to move ~-48vw, ~-46vh.
  const avatarScale = 1 - ease * 0.78           // 1 → 0.22
  const moveX = -ease * 46                      // vw toward left
  const moveY = -ease * 46                      // vh toward top
  // Only fade to 30% so there's still something visible at the end
  const mainOpacity = 1 - ease * 0.7            // 1 → 0.3

  // Socials fade out faster
  const socialsOpacity = Math.max(1 - t * 4, 0)

  if (isDone) return null

  return (
    <div
      ref={heroRef}
      className="hero-overlay"
      onWheel={handleWheel}
      style={{
        pointerEvents: isDone ? 'none' : 'auto',
      }}
    >
      {/* Blurry backdrop over the 3D scene */}
      <div
        className="hero-backdrop"
        style={{
          backdropFilter: `blur(${blur}px)`,
          WebkitBackdropFilter: `blur(${blur}px)`,
          background: overlayBg,
        }}
      />

      {/* Theme toggle – top right, matching the header position */}
      <button
        type="button"
        className="hero-theme-toggle"
        aria-label="Toggle theme"
        onClick={onToggleTheme}
      >
        {theme === 'dark' ? (
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
        )}
      </button>

      {/* Avatar + name fly toward top-left while fading */}
      <div
        className="hero-content"
        style={{
          transform: `translate(${moveX}vw, ${moveY}vh) scale(${avatarScale})`,
          opacity: mainOpacity,
        }}
      >
        <div className={`hero-avatar-wrapper ${!sceneReady ? 'hero-avatar-wrapper--loading' : 'hero-avatar-wrapper--ready'}`}>
          <img
            src="/avatar.png"
            alt="Ahmed Sayed"
            className="hero-avatar"
          />
        </div>

        <div className="hero-text">
          <h1 className="hero-name">Ahmed Sayed</h1>
          <p className="hero-title">Senior Software Engineer @ Forgent AI</p>
        </div>

        <nav
          className="hero-socials"
          style={{ opacity: socialsOpacity }}
        >
          <a href="https://github.com/asayed18" target="_blank" rel="noreferrer" aria-label="GitHub">
            <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </a>
          <a href="https://linkedin.com/in/a-abdelsalam" target="_blank" rel="noreferrer" aria-label="LinkedIn">
            <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </a>
          <a href="mailto:me@asayed18.top" aria-label="Email">
            <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
              <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
            </svg>
          </a>
        </nav>
      </div>

      {/* Scroll hint at the bottom – only visible once scene is loaded */}
      <div
        className={`hero-scroll-hint ${sceneReady ? 'hero-scroll-hint--visible' : ''}`}
        style={{ opacity: sceneReady ? socialsOpacity : 0 }}
      >
        <svg
          className="hero-scroll-arrow"
          viewBox="0 0 24 40"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          width="28"
          height="44"
        >
          <path d="M12 38 C12 38, 18 30, 12 24 C6 18, 12 10, 12 10" />
          <path d="M7 14 L12 6 L17 14" />
        </svg>
        <p>Scroll to journey forward</p>
      </div>
    </div>
  )
}
