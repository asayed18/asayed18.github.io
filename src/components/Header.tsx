import type { Theme } from '../theme'
import { AVATAR_SRC, profile } from '../data/profile'
import { MoonIcon, SunIcon } from './Icons'
import './Header.css'

interface HeaderProps {
  theme: Theme
  onToggleTheme: () => void
  showAvatar: boolean
  avatarProgress: number // 0 = just appearing, 1 = fully settled
  /** The name is the page's main heading once the landing screen, which has its own, is gone. */
  nameIsHeading: boolean
  /** Opaque bar, for when the header sits above scrolling content. */
  solid: boolean
  onNavigatePortfolio: () => void
  onOpenAbout: () => void
  onNavigateHome: () => void
}

export function Header({
  theme,
  onToggleTheme,
  showAvatar,
  avatarProgress,
  nameIsHeading,
  solid,
  onNavigatePortfolio,
  onOpenAbout,
  onNavigateHome,
}: HeaderProps) {
  // Avatar entrance: starts larger and offset from below-center
  // (continuing the hero's flight path from center toward top-left)
  const ap = Math.min(Math.max(avatarProgress, 0), 1)
  const ease = ap < 0.5 ? 2 * ap * ap : 1 - (-2 * ap + 2) ** 2 / 2
  const avatarScale = 2.2 - ease * 1.2       // 2.2 → 1.0
  const avatarOffsetX = (1 - ease) * 15       // 15px → 0 (slight offset from center-right)
  const avatarOffsetY = (1 - ease) * 25       // 25px → 0 (from below, matching hero direction)
  const avatarOpacity = ease                   // 0 → 1

  const Name = nameIsHeading ? 'h1' : 'span'

  return (
    <header className={solid ? 'header header--solid' : 'header'}>
      <div className={`header-brand ${showAvatar ? 'header-brand--with-avatar' : ''}`}>
        {showAvatar && (
          <button type="button" className="header-avatar-button" onClick={onNavigateHome} title="Back to start">
            <img
              src={AVATAR_SRC}
              alt="Back to start"
              width={36}
              height={36}
              className="header-avatar"
              style={{
                transform: `scale(${avatarScale}) translate(${avatarOffsetX}px, ${avatarOffsetY}px)`,
                opacity: avatarOpacity,
              }}
            />
          </button>
        )}
        <div className="header-brand-text">
          <Name className="header-name">{profile.name}</Name>
          <span className="header-tagline">{profile.headerTagline}</span>
        </div>
      </div>
      <nav className="header-nav" aria-label="Main">
        <a
          href="#about"
          onClick={(e) => {
            e.preventDefault()
            onOpenAbout()
          }}
        >
          About
        </a>
        <a href={`mailto:${profile.email}`}>Contact</a>
        <a href={profile.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>
        <a href={profile.github} target="_blank" rel="noreferrer">GitHub</a>
        <a
          href="#portfolio"
          onClick={(e) => {
            e.preventDefault()
            onNavigatePortfolio()
          }}
        >
          Portfolio
        </a>
      </nav>
      <div className="header-actions">
        <button
          type="button"
          className="theme-toggle"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={onToggleTheme}
        >
          <span className="theme-icon">{theme === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={16} />}</span>
        </button>
      </div>
    </header>
  )
}
