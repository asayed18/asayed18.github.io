import { motion, AnimatePresence } from 'framer-motion'
import type { Experience } from '../data/experiences'
import './ExperiencePanel.css'

interface ExperiencePanelProps {
  experience: Experience | null
  side: 'left' | 'right'
}

export function ExperiencePanel({ experience, side }: ExperiencePanelProps) {
  const slideFrom = side === 'left' ? -60 : 60

  return (
    <AnimatePresence mode="wait">
      {experience ? (
        <motion.aside
          key={experience.id}
          className={`experience-panel experience-panel--${side}`}
          initial={{ x: slideFrom, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: slideFrom, opacity: 0 }}
          transition={{ 
            duration: 0.5, 
            ease: [0.25, 0.1, 0.25, 1], // cubic-bezier for smoother motion
            opacity: { duration: 0.4 } // Slightly faster opacity for better perceived performance
          }}
          // Prevent layout shifts and force GPU acceleration
          style={{ 
            willChange: 'transform, opacity',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
        >
          <div className="experience-panel-content">
            <motion.h2
              className="experience-panel-title"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ 
                delay: 0.1, 
                duration: 0.35,
                ease: [0.25, 0.1, 0.25, 1]
              }}
            >
              {experience.title}
            </motion.h2>
            <motion.div
              className="experience-panel-cards"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ 
                delay: 0.2, 
                duration: 0.35,
                ease: [0.25, 0.1, 0.25, 1]
              }}
            >
              {experience.company && (
                <p className="experience-panel-company">
                  {experience.company}
                </p>
              )}
              <p className="experience-panel-period">
                {experience.period}
              </p>
              <p className="experience-panel-description">
                {experience.description}
              </p>
              {experience.tags && experience.tags.length > 0 && (
                <div className="experience-panel-tags">
                  {experience.tags.map((tag) => (
                    <span key={tag} className="experience-panel-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {experience.link && (
                <a
                  href={experience.link}
                  target="_blank"
                  rel="noreferrer"
                  className="experience-panel-link"
                >
                  Learn more →
                </a>
              )}
            </motion.div>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  )
}