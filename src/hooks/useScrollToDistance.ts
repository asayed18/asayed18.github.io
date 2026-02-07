import { useEffect, useState } from 'react'
import type { Experience } from '../data/experiences'

const ZONE_RADIUS = 0.035

export function useScrollToDistance(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  experiences: Experience[]
) {
  const [scrollProgress, setScrollProgress] = useState(0)
  const [activeExperienceId, setActiveExperienceId] = useState<string | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      const maxScroll = scrollHeight - clientHeight
      const progress = maxScroll > 0 ? scrollTop / maxScroll : 0
      setScrollProgress(progress)

      let active: Experience | null = null
      let minDist = ZONE_RADIUS
      for (const exp of experiences) {
        const dist = Math.abs(progress - exp.position)
        if (dist < minDist) {
          minDist = dist
          active = exp
        }
      }
      setActiveExperienceId(active?.id ?? null)
    }

    update()
    el.addEventListener('scroll', update, { passive: true })
    return () => el.removeEventListener('scroll', update)
  }, [scrollRef, experiences])

  return { scrollProgress, activeExperienceId }
}
