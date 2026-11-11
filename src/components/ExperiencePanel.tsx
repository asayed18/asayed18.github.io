import { useEffect, useRef, useState } from 'react'
import type { Experience } from '../data/experiences'
import './ExperiencePanel.css'

type Side = 'left' | 'right'

interface ExperiencePanelProps {
  experience: Experience | null
  side: Side
}

/** How long the panel takes to slide out. Matches the transition in ExperiencePanel.css. */
const EXIT_MS = 500

function exitDuration(): number {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : EXIT_MS
}

/**
 * Side panel with the details of the experience the camera is looking at.
 *
 * One panel at a time: when the experience changes, the current panel slides out before the next
 * one slides in. The motion is plain CSS (a transition on the panel, keyframes on its content).
 */
export function ExperiencePanel({ experience, side }: ExperiencePanelProps) {
  // The panel in the page. It trails the `experience` prop while the previous panel slides out.
  const [shown, setShown] = useState<{ experience: Experience; side: Side } | null>(null)
  const [visible, setVisible] = useState(false)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if ((shown?.experience ?? null) === experience) {
      if (!shown) return
      // The panel was just mounted in its hidden state, or was on its way out. Reading a layout
      // value makes the browser register that state, so switching to visible animates from it.
      void panelRef.current?.offsetWidth
      setVisible(true)
      return
    }

    if (!shown) {
      setShown(experience ? { experience, side } : null)
      return
    }

    // Another panel, or none, is wanted: slide the current one out first.
    setVisible(false)
    const timer = setTimeout(() => {
      setShown(experience ? { experience, side } : null)
    }, exitDuration())
    return () => clearTimeout(timer)
  }, [experience, side, shown])

  if (!shown) return null
  const { experience: current, side: currentSide } = shown

  return (
    <aside
      key={current.id}
      ref={panelRef}
      className={`experience-panel experience-panel--${currentSide}${visible ? ' experience-panel--visible' : ''}`}
      aria-label="Experience details"
    >
      <div className="experience-panel-content">
        <h2 className="experience-panel-title">{current.title}</h2>
        <div className="experience-panel-cards">
          {current.company && <p className="experience-panel-company">{current.company}</p>}
          <p className="experience-panel-period">{current.period}</p>
          <p className="experience-panel-description">{current.description}</p>
          {current.tags && current.tags.length > 0 && (
            <div className="experience-panel-tags">
              {current.tags.map((tag) => (
                <span key={tag} className="experience-panel-tag">
                  {tag}
                </span>
              ))}
            </div>
          )}
          {current.link && (
            <a href={current.link} target="_blank" rel="noreferrer" className="experience-panel-link">
              Learn more →
            </a>
          )}
        </div>
      </div>
    </aside>
  )
}
