/**
 * Build-time rendering. `vite build` runs this module (see vite.config.ts) and writes the result
 * into index.html, so the page has real content before any script runs: for search engines,
 * link previews, browsers without JavaScript, and the first paint of everyone else.
 *
 * Nothing here ships to the browser.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { HeroOverlay } from './components/HeroOverlay'
import { ResumeContent } from './components/ResumeContent'
import { experiences } from './data/experiences'
import { profile } from './data/profile'

export const siteUrl = profile.siteUrl

/**
 * Markup for `<div id="root">`: the landing screen exactly as the app first draws it, plus the
 * text version of the whole site. The app replaces it when it starts.
 */
export function renderStaticShell(): string {
  return renderToStaticMarkup(
    <>
      <HeroOverlay progress={0} sceneReady={false} />
      <ResumeContent offscreen />
    </>
  )
}

/** schema.org description of the site and its owner, for the JSON-LD block. */
export function structuredData(): Record<string, unknown> {
  const websiteId = `${siteUrl}#website`
  const personId = `${siteUrl}#person`

  // Employers of roles that have ended. The current employer is `worksFor`.
  const formerEmployers = [
    ...new Set(
      experiences
        .filter((experience) => experience.company && !/present/i.test(experience.period))
        .map((experience) => experience.company as string)
    ),
  ]

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': websiteId,
        url: siteUrl,
        name: `${profile.name} — Portfolio`,
        inLanguage: 'en',
      },
      {
        '@type': 'ProfilePage',
        '@id': `${siteUrl}#profile`,
        url: siteUrl,
        isPartOf: { '@id': websiteId },
        mainEntity: { '@id': personId },
      },
      {
        '@type': 'Person',
        '@id': personId,
        name: profile.name,
        url: siteUrl,
        image: profile.shareImage,
        email: `mailto:${profile.email}`,
        description: profile.bio,
        jobTitle: profile.jobTitle,
        worksFor: { '@type': 'Organization', name: profile.worksFor },
        alumniOf: formerEmployers.map((name) => ({ '@type': 'Organization', name })),
        address: {
          '@type': 'PostalAddress',
          addressLocality: profile.location.locality,
          addressCountry: profile.location.country,
        },
        sameAs: [profile.github, profile.linkedin],
        knowsAbout: profile.knowsAbout,
      },
    ],
  }
}
