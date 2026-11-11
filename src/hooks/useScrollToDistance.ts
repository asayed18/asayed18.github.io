import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import type { Experience } from '../data/experiences'

const ZONE_RADIUS = 0.035

/** The hero overlay dissolves over the first 2% of the scroll. */
export const HERO_END = 0.02
/** The portfolio fades in between 88% and 98% of the scroll. */
export const PORTFOLIO_START = 0.88
export const PORTFOLIO_SPAN = 0.1

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1)

interface ScrollJourney {
  /** Raw scroll progress (0 to 1). Updated on every scroll event without a React render. */
  progressRef: MutableRefObject<number>
  /** 0 at the top, 1 once the hero overlay has dissolved. */
  heroProgress: number
  /** 0 before the end of the road, 1 once the portfolio is fully shown. */
  portfolioProgress: number
  activeExperienceId: string | null
  /**
   * Call right before a navigation link scrolls the page. The experience panels then stay closed
   * until the scroll comes to rest, instead of flashing past one by one.
   */
  beginJump: () => void
}

/** A navigation jump ends when no scroll event has arrived for this long. */
const JUMP_SETTLE_MS = 150

/**
 * Maps the scroll position to the state the page needs.
 *
 * The 3D scene reads `progressRef` once per frame. React state only covers the stretches where
 * the DOM changes with the scroll position (hero and portfolio transitions) and the active
 * experience, so scrolling along the road causes no React render at all.
 */
export function useScrollToDistance(
  scrollRef: RefObject<HTMLDivElement | null>,
  experiences: Experience[]
): ScrollJourney {
  const progressRef = useRef(0)
  const jumpingRef = useRef(false)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const updateRef = useRef<() => void>(() => {})

  const settleLater = useCallback(() => {
    clearTimeout(settleTimerRef.current)
    settleTimerRef.current = setTimeout(() => {
      jumpingRef.current = false
      updateRef.current()
    }, JUMP_SETTLE_MS)
  }, [])

  const beginJump = useCallback(() => {
    jumpingRef.current = true
    updateRef.current()
    // Also covers a jump that does not scroll at all (already at the target).
    settleLater()
  }, [settleLater])
  const [heroProgress, setHeroProgress] = useState(0)
  const [portfolioProgress, setPortfolioProgress] = useState(0)
  const [activeExperienceId, setActiveExperienceId] = useState<string | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      const maxScroll = scrollHeight - clientHeight
      const progress = maxScroll > 0 ? scrollTop / maxScroll : 0
      progressRef.current = progress

      // Setting a state to the value it already has does not re-render.
      setHeroProgress(clamp01(progress / HERO_END))
      setPortfolioProgress(clamp01((progress - PORTFOLIO_START) / PORTFOLIO_SPAN))

      let active: Experience | null = null
      if (!jumpingRef.current) {
        let minDist = ZONE_RADIUS
        for (const exp of experiences) {
          const dist = Math.abs(progress - exp.position)
          if (dist < minDist) {
            minDist = dist
            active = exp
          }
        }
      }
      setActiveExperienceId(active?.id ?? null)
    }

    const onScroll = () => {
      update()
      if (jumpingRef.current) settleLater()
    }

    updateRef.current = update
    update()
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      clearTimeout(settleTimerRef.current)
      updateRef.current = () => {}
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', update)
    }
  }, [scrollRef, experiences, settleLater])

  return { progressRef, heroProgress, portfolioProgress, activeExperienceId, beginJump }
}
