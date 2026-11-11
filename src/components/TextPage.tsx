import type { Theme } from '../theme'
import { AVATAR_SRC, profile } from '../data/profile'
import { MoonIcon, SocialLinks, SunIcon } from './Icons'
import { ResumeContent } from './ResumeContent'

interface TextPageProps {
  theme: Theme
  onToggleTheme: () => void
  /**
   * Why the text version is shown: the visitor asked for it, the browser has no WebGL, or the
   * 3D scene failed.
   */
  reason: 'chosen' | 'unsupported' | 'failed'
}

/** The whole site as a plain page, for when the 3D journey cannot or should not run. */
export function TextPage({ theme, onToggleTheme, reason }: TextPageProps) {
  return (
    <div className="text-page">
      <header className="text-page-header">
        <button
          type="button"
          className="text-page-toggle"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
        </button>
        <img src={AVATAR_SRC} alt={profile.name} width={120} height={120} className="text-page-avatar" />
        <h1 className="text-page-name">{profile.name}</h1>
        <p className="text-page-headline">{profile.headline}</p>
        <nav className="text-page-links" aria-label="Contact">
          <SocialLinks size={24} />
        </nav>
      </header>

      <p className="text-page-notice">
        {reason === 'chosen' && (
          <>
            This is the text version. <a href="./">Take the 3D journey</a> instead.
          </>
        )}
        {reason === 'unsupported' &&
          'Your browser has WebGL turned off or does not support it, so this is the text version of the 3D journey.'}
        {reason === 'failed' && (
          <>
            The 3D journey could not start, so this is the text version. <a href="./">Try again</a>.
          </>
        )}
      </p>

      <ResumeContent />
    </div>
  )
}
