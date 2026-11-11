import { experiences } from '../data/experiences'
import { portfolioProjects } from '../data/portfolio'
import { profile } from '../data/profile'
import './Resume.css'

interface ResumeContentProps {
  /**
   * Keeps the text in the page for search engines and screen readers while the 3D journey shows
   * the same content visually. Without it the text is laid out as a normal, readable page.
   */
  offscreen?: boolean
  /** False while the text is off screen, so the Tab key does not land on links nobody can see. */
  interactive?: boolean
}

/**
 * Everything the site says, as plain semantic HTML: the text version of the 3D journey.
 * It carries no top-level heading; the page around it provides the `<h1>`.
 */
export function ResumeContent({ offscreen = false, interactive = true }: ResumeContentProps) {
  const tabIndex = interactive ? undefined : -1

  return (
    <main className={offscreen ? 'resume resume--offscreen' : 'resume'}>
      <section aria-labelledby="resume-about">
        <h2 id="resume-about">About</h2>
        <p>{profile.bio}</p>
        <ul>
          {profile.facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="resume-experience">
        <h2 id="resume-experience">Experience</h2>
        {[...experiences].reverse().map((experience) => (
          <article key={experience.id} className="resume-item">
            <h3>
              {experience.title}
              {experience.company ? `, ${experience.company}` : ''}
            </h3>
            <p className="resume-period">{experience.period}</p>
            <p>{experience.description}</p>
            {experience.tags && experience.tags.length > 0 && (
              <ul className="resume-tags" aria-label="Technologies">
                {experience.tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            )}
            {experience.link && (
              <p>
                <a href={experience.link} target="_blank" rel="noreferrer" tabIndex={tabIndex}>
                  Learn more
                </a>
              </p>
            )}
          </article>
        ))}
      </section>

      <section aria-labelledby="resume-portfolio">
        <h2 id="resume-portfolio">Portfolio</h2>
        {portfolioProjects.map((project) => (
          <article key={project.id} className="resume-item">
            <h3>
              {project.link ? (
                <a href={project.link} target="_blank" rel="noreferrer" tabIndex={tabIndex}>
                  {project.title}
                </a>
              ) : (
                project.title
              )}
            </h3>
            <p>{project.description}</p>
            <ul className="resume-tags" aria-label="Technologies">
              {project.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section aria-labelledby="resume-contact">
        <h2 id="resume-contact">Contact</h2>
        <ul>
          <li>
            <a href={`mailto:${profile.email}`} tabIndex={tabIndex}>
              {profile.email}
            </a>
          </li>
          <li>
            <a href={profile.linkedin} target="_blank" rel="noreferrer" tabIndex={tabIndex}>
              LinkedIn
            </a>
          </li>
          <li>
            <a href={profile.github} target="_blank" rel="noreferrer" tabIndex={tabIndex}>
              GitHub
            </a>
          </li>
          <li>
            <a href={profile.calendly} target="_blank" rel="noreferrer" tabIndex={tabIndex}>
              Schedule a call
            </a>
          </li>
        </ul>
      </section>
    </main>
  )
}
