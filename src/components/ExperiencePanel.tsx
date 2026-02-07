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
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          <div className="experience-panel-content">
            <motion.h2
              className="experience-panel-title"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.25 }}
            >
              {experience.title}
            </motion.h2>
            {experience.company && (
              <motion.p
                className="experience-panel-company"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.25 }}
              >
                {experience.company}
              </motion.p>
            )}
            <motion.p
              className="experience-panel-period"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.25 }}
            >
              {experience.period}
            </motion.p>
            <motion.p
              className="experience-panel-description"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.25 }}
            >
              {experience.description}
            </motion.p>
            {experience.tags && experience.tags.length > 0 && (
              <motion.div
                className="experience-panel-tags"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.25 }}
              >
                {experience.tags.map((tag) => (
                  <span key={tag} className="experience-panel-tag">
                    {tag}
                  </span>
                ))}
              </motion.div>
            )}
            {experience.link && (
              <motion.a
                href={experience.link}
                target="_blank"
                rel="noreferrer"
                className="experience-panel-link"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18, duration: 0.25 }}
              >
                Learn more →
              </motion.a>
            )}
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  )
}
