import { useRef, useState, useEffect } from 'react'
import { portfolioProjects } from '../data/portfolio'
import './PortfolioSection.css'

const FIREWORKS_DURATION = 2800 // ms – total time for fireworks + buffer

interface PortfolioSectionProps {
  progress: number // 0 = just appearing, 1 = fully visible
  theme: 'dark' | 'light'
}

export function PortfolioSection({ progress, theme }: PortfolioSectionProps) {
  const [fireworksPlaying, setFireworksPlaying] = useState(false)
  const lastTouchY = useRef(0)
  const fireworksTriggered = useRef(false)

  const overlayRef = useRef<HTMLDivElement>(null)

  // Keep progress & fireworks state in refs so the wheel handler always has
  // the latest values without needing to re-register the listener every frame.
  const progressRef = useRef(progress)
  progressRef.current = progress
  const fireworksRef = useRef(fireworksPlaying)
  fireworksRef.current = fireworksPlaying

  // Register a non-passive wheel listener so preventDefault actually works
  // (React's onWheel is passive and cannot prevent default scrolling).
  useEffect(() => {
    const el = overlayRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      if (fireworksRef.current) {
        e.preventDefault()
        return
      }
      const scrollContainer = document.querySelector('.scroll-container') as HTMLElement
      if (!scrollContainer) return

      // While the portfolio is still transitioning in, forward ALL wheel
      // events to the main scroll container so scrollProgress keeps advancing.
      if (progressRef.current < 1) {
        el.scrollTop = 0 // keep overlay at top during transition
        scrollContainer.scrollBy({ top: e.deltaY, behavior: 'auto' })
        e.preventDefault()
        return
      }

      // Fully visible — if scrolling up and the overlay is at the top,
      // forward to main scroll to let the user dismiss the portfolio.
      if (e.deltaY < 0 && el.scrollTop <= 0) {
        scrollContainer.scrollBy({ top: e.deltaY, behavior: 'auto' })
        e.preventDefault()
      }
    }
    const handleTouchStart = (e: TouchEvent) => {
      lastTouchY.current = e.touches[0].pageY
    }
    const handleTouchMove = (e: TouchEvent) => {
      if (fireworksRef.current) {
        e.preventDefault()
        return
      }
      const scrollContainer = document.querySelector('.scroll-container') as HTMLElement
      if (!scrollContainer) return

      const currentY = e.touches[0].pageY
      const deltaY = lastTouchY.current - currentY
      lastTouchY.current = currentY

      if (progressRef.current < 1) {
        el.scrollTop = 0
        scrollContainer.scrollBy({ top: deltaY, behavior: 'auto' })
        e.preventDefault()
        return
      }
      if (deltaY < 0 && el.scrollTop <= 0) {
        scrollContainer.scrollBy({ top: deltaY, behavior: 'auto' })
        e.preventDefault()
      }
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })

    return () => {
      el.removeEventListener('wheel', handleWheel)
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress > 0]) // re-run when overlay mounts/unmounts; refs keep other values fresh

  // Track CTA visibility within the scrollable overlay
  const ctaRef = useRef<HTMLDivElement>(null)
  const [ctaVisible, setCtaVisible] = useState(false)

  useEffect(() => {
    const el = ctaRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setCtaVisible(entry.isIntersecting),
      { threshold: 0.15 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [progress > 0])

  // Freeze scrolling while fireworks play
  // useEffect(() => {
  //   if (ctaVisible && !fireworksTriggered.current) {
  //     fireworksTriggered.current = true
  //     setFireworksPlaying(true)
  //     const timer = setTimeout(() => setFireworksPlaying(false), FIREWORKS_DURATION)
  //     return () => clearTimeout(timer)
  //   }
  //   if (!ctaVisible) {
  //     fireworksTriggered.current = false
  //   }
  // }, [ctaVisible])

  if (progress <= 0) return null

  const ease = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2

  return (
    <div
      ref={overlayRef}
      className="portfolio-overlay"
      style={{
        pointerEvents: progress > 0.3 ? 'auto' : 'none',
      }}
    >
      <div className="portfolio-backdrop" />

      {/* Large centered title – fades in, holds longer, then fades out */}
      {ease < 0.88 && (
        <div
          className="portfolio-hero-title"
          style={{
            opacity: ease < 0.12
              ? Math.min(ease / 0.12, 1)
              : ease < 0.38
                ? 1
                : Math.max(1 - (ease - 0.38) / 0.01, 0),
            transform: `scale(${1 + (1 - Math.min(ease / 0.12, 1)) * 0.1})`,
          }}
        >
          Portfolio
        </div>
      )}

      {/* Cards – appear after a gap following the title fadeout */}
      <div
        className="portfolio-content"
        style={{
          opacity: Math.max(ease - 0.5, 0) / 0.2,
          pointerEvents: ease > 0.55 ? 'auto' : 'none',
        }}
      >
        <h2 className="portfolio-heading">Portfolio</h2>
        <p className="portfolio-subheading">Selected projects and contributions</p>

        <div className="portfolio-grid">
          {portfolioProjects.map((project, i) => {
            const gridEase = Math.max(ease - 0.55, 0) / 0.45
            const cardDelay = i * 0.03
            const cardProgress = Math.max(Math.min((gridEase - cardDelay) / (1 - cardDelay), 1), 0)
            const cardEase = cardProgress < 0.5
              ? 2 * cardProgress * cardProgress
              : 1 - (-2 * cardProgress + 2) ** 2 / 2

            const CardWrapper = project.link ? 'a' : 'div'
            const wrapperProps = project.link
              ? { href: project.link, target: '_blank', rel: 'noreferrer' }
              : {}

            return (
              <CardWrapper
                key={project.id}
                {...wrapperProps}
                className={`portfolio-card portfolio-card--${project.size}`}
                style={{
                  transform: `translateY(${(1 - cardEase) * 30}px)`,
                }}
              >
                {project.thumbnail && (
                  <div className="portfolio-card-thumb">
                    <img
                      src={project.thumbnail}
                      alt={project.title}
                      loading="lazy"
                    />
                  </div>
                )}
                <div className="portfolio-card-body">
                  <h3 className="portfolio-card-title">{project.title}</h3>
                  <p className="portfolio-card-desc">{project.description}</p>
                  <div className="portfolio-card-tags">
                    {project.tags.map((tag) => (
                      <span key={tag} className="portfolio-card-tag">{tag}</span>
                    ))}
                  </div>
                </div>
              </CardWrapper>
            )
          })}
        </div>

        {/* Call-to-action + Calendly section */}
        <div ref={ctaRef} className="portfolio-cta">
          <h2
            className={`portfolio-cta-title ${ctaVisible ? 'portfolio-cta--visible' : ''}`}
          >
            Still interested?
          </h2>

          {/* Fireworks animation – collapses after playing */}
          <div className={`portfolio-fireworks ${ctaVisible ? 'portfolio-fireworks--active' : ''} ${ctaVisible && !fireworksPlaying ? 'portfolio-fireworks--done' : ''}`}>
            {Array.from({ length: 3 }).map((_, burst) => (
              <div key={burst} className={`firework firework--${burst}`}>
                {Array.from({ length: 12 }).map((_, spark) => (
                  <div key={spark} className={`firework-spark firework-spark--${spark}`} />
                ))}
              </div>
            ))}
          </div>

          <p
            className={`portfolio-cta-subtitle ${ctaVisible ? 'portfolio-cta--visible' : ''}`}
          >
            Then let's have a call
          </p>
          <div
            className={`portfolio-calendly ${ctaVisible ? 'portfolio-cta--visible' : ''}`}
          >
            {ctaVisible && (
              <div className="portfolio-calendly-scale">
                <iframe
                  src={`https://calendly.com/ahmed-salam/meeting?hide_landing_page_details=1&hide_gdpr_banner=1&background_color=${theme === 'dark' ? '1a1a1a' : 'e0e0e0'}&text_color=${theme === 'dark' ? 'cccccc' : '333333'}&primary_color=${theme === 'dark' ? '888888' : '555555'}`}
                  width="100%"
                  height="700"
                  frameBorder="0"
                  title="Schedule a call"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
