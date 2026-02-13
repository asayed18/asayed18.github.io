import type { Theme } from '../App'
import './Header.css'

interface HeaderProps {
  theme: Theme
  onToggleTheme: () => void
  showAvatar: boolean
  avatarProgress: number // 0 = just appearing, 1 = fully settled
  onNavigatePortfolio?: () => void
  onOpenAbout?: () => void
  onNavigateHome?: () => void
}

export function Header({
  theme,
  onToggleTheme,
  showAvatar,
  avatarProgress,
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

  return (
    <header className="header">
      <div className={`header-brand ${showAvatar ? 'header-brand--with-avatar' : ''}`}>
        {showAvatar && (
          <img
            src="/avatar.png"
            alt="Ahmed Sayed"
            className="header-avatar"
            style={{
              transform: `scale(${avatarScale}) translate(${avatarOffsetX}px, ${avatarOffsetY}px)`,
              opacity: avatarOpacity,
              cursor: 'pointer',
            }}
            onClick={onNavigateHome}
            title="Back to start"
          />
        )}
        <div className="header-brand-text">
          <span className="header-name">Ahmed Sayed</span>
          <span className="header-tagline">Sr. Software Engineer</span>
        </div>
      </div>
      <nav className="header-nav">
        <a
          href="#about"
          onClick={(e) => {
            e.preventDefault()
            onOpenAbout?.()
          }}
        >
          About
        </a>
        <a href="mailto:me@asayed18.top">Contact</a>
        <a href="https://linkedin.com/in/a-abdelsalam" target="_blank" rel="noreferrer">LinkedIn</a>
        <a href="https://github.com/asayed18" target="_blank" rel="noreferrer">GitHub</a>
        <a
          href="#portfolio"
          onClick={(e) => {
            e.preventDefault()
            onNavigatePortfolio?.()
          }}
        >
          Portfolio
        </a>
      </nav>
      <div className="header-actions">
        <button type="button" className="theme-toggle" aria-label="Toggle theme" onClick={onToggleTheme}>
        <span className="theme-icon">
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
          )}
        </span>
        </button>
      </div>
    </header>
  )
}
