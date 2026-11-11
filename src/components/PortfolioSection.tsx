import { useRef, useState, useEffect, type RefObject } from 'react'
import { portfolioProjects, type PortfolioProject } from '../data/portfolio'
import { profile } from '../data/profile'
import type { Theme } from '../theme'
import './PortfolioSection.css'

interface PortfolioSectionProps {
  progress: number // 0 = just appearing, 1 = fully visible
  theme: Theme
  /** The element whose scrolling drives the journey. */
  scrollRef: RefObject<HTMLElement | null>
  /** Receives the scrollable overlay, so the page can send keyboard scrolling to it. */
  overlayRef: RefObject<HTMLDivElement>
}

/**
 * Card image. Projects with a clip get a muted, looping video that only loads and plays while
 * the card is on screen; its poster is the still image.
 */
function CardMedia({ project }: { project: PortfolioProject }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    // The still image is all that is shown to people who asked for less motion.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Browsers may refuse to autoplay (low power mode); the poster stays in that case.
          video.play().catch(() => {})
        } else {
          video.pause()
        }
      },
      { threshold: 0.25 }
    )
    observer.observe(video)
    return () => observer.disconnect()
  }, [])

  if (!project.thumbnail) return null
  const [width, height] = project.thumbnailSize ?? []

  return (
    <div className="portfolio-card-thumb">
      {project.video ? (
        <video
          ref={videoRef}
          src={project.video}
          poster={project.thumbnail}
          width={width}
          height={height}
          muted
          loop
          playsInline
          preload="none"
          aria-label={project.title}
        />
      ) : (
        <img src={project.thumbnail} alt={project.title} width={width} height={height} loading="lazy" decoding="async" />
      )}
    </div>
  )
}

export function PortfolioSection({ progress, theme, scrollRef, overlayRef }: PortfolioSectionProps) {
  const lastTouchY = useRef(0)

  // Keep progress in a ref so the wheel handler always has the latest value
  // without needing to re-register the listener every frame.
  const progressRef = useRef(progress)
  progressRef.current = progress

  const mounted = progress > 0

  // Register a non-passive wheel listener so preventDefault actually works
  // (React's onWheel is passive and cannot prevent default scrolling).
  useEffect(() => {
    const el = overlayRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      const scrollContainer = scrollRef.current
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
      const scrollContainer = scrollRef.current
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
  }, [mounted, overlayRef, scrollRef]) // re-run when overlay mounts/unmounts; refs keep other values fresh

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
  }, [mounted])

  // The fireworks below are switched off. The effect that played them, and froze scrolling for
  // their duration, was commented out, so they collapse (--done) the moment they would start
  // (--active). The markup and styles are kept for whoever brings them back:
  //
  // const FIREWORKS_DURATION = 2800 // ms – total time for fireworks + buffer
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

  if (!mounted) return null

  const ease = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2

  const calendlyUrl =
    `${profile.calendly}?hide_landing_page_details=1&hide_gdpr_banner=1` +
    `&background_color=${theme === 'dark' ? '1a1a1a' : 'e0e0e0'}` +
    `&text_color=${theme === 'dark' ? 'cccccc' : '333333'}` +
    `&primary_color=${theme === 'dark' ? '888888' : '555555'}`

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
          aria-hidden="true"
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
                <CardMedia project={project} />
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

          {/* Fireworks animation – collapses after playing (switched off, see above) */}
          <div
            className={`portfolio-fireworks ${ctaVisible ? 'portfolio-fireworks--active portfolio-fireworks--done' : ''}`}
            aria-hidden="true"
          >
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
                <iframe src={calendlyUrl} width="100%" height="700" title="Schedule a call" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
