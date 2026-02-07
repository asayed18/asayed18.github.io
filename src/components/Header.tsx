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

export function Header({ theme, onToggleTheme, showAvatar, avatarProgress, onNavigatePortfolio, onOpenAbout, onNavigateHome }: HeaderProps) {
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
      <button type="button" className="theme-toggle" aria-label="Toggle theme" onClick={onToggleTheme}>
        <span className="theme-icon">{theme === 'dark' ? '☀' : '☾'}</span>
      </button>
    </header>
  )
}
