import type { CSSProperties } from 'react'
import type { Theme } from '../theme'
import { AVATAR_SRC, profile } from '../data/profile'
import { MoonIcon, SocialLinks, SunIcon } from './Icons'
import './HeroOverlay.css'

interface HeroOverlayProps {
  /** 0 at the top of the page, 1 once the overlay has dissolved. */
  progress: number
  sceneReady: boolean
  /** Theme and toggle are left out of the static page that is shown before the app starts. */
  theme?: Theme
  onToggleTheme?: () => void
}

export function HeroOverlay({ progress, sceneReady, theme, onToggleTheme }: HeroOverlayProps) {
  const t = Math.min(Math.max(progress, 0), 1)
  if (t >= 1) return null

  // Eased progress for smoother motion
  const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2 // easeInOutQuad

  // Avatar + name group moves from center → top-left header position and shrinks
  // Header brand sits at roughly (1.5rem, 1.5rem) from top-left.
  // Hero content starts centered (50vw, 50vh) so we need to move ~-48vw, ~-46vh.
  const avatarScale = 1 - ease * 0.78           // 1 → 0.22
  const moveX = -ease * 46                      // vw toward left
  const moveY = -ease * 46                      // vh toward top
  // Only fade to 30% so there's still something visible at the end
  const mainOpacity = 1 - ease * 0.7            // 1 → 0.3

  // Socials fade out faster
  const socialsOpacity = Math.max(1 - t * 4, 0)

  return (
    <div className="hero-overlay">
      {/* Blurry backdrop over the 3D scene. Its colour comes from the theme in CSS; the scroll
          only drives how much of it is left. */}
      <div className="hero-backdrop" style={{ '--hero-fade': 1 - ease } as CSSProperties} />

      {/* Theme toggle – top right, matching the header position */}
      {theme && onToggleTheme && (
        <button
          type="button"
          className="hero-theme-toggle"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
        </button>
      )}

      {/* Avatar + name fly toward top-left while fading */}
      <div
        className="hero-content"
        style={{
          transform: `translate(${moveX}vw, ${moveY}vh) scale(${avatarScale})`,
          opacity: mainOpacity,
        }}
      >
        <div className={`hero-avatar-wrapper ${!sceneReady ? 'hero-avatar-wrapper--loading' : 'hero-avatar-wrapper--ready'}`}>
          <img src={AVATAR_SRC} alt={profile.name} width={160} height={160} className="hero-avatar" />
        </div>

        <div className="hero-text">
          <h1 className="hero-name">{profile.name}</h1>
          <p className="hero-title">{profile.headline}</p>
        </div>

        <nav className="hero-socials" aria-label="Contact" style={{ opacity: socialsOpacity }}>
          <SocialLinks size={28} />
        </nav>
      </div>

      {/* Scroll hint at the bottom – only visible once scene is loaded */}
      <div
        className={`hero-scroll-hint ${sceneReady ? 'hero-scroll-hint--visible' : ''}`}
        style={{ opacity: sceneReady ? socialsOpacity : 0 }}
      >
        <svg
          className="hero-scroll-arrow"
          viewBox="0 0 24 40"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          width="28"
          height="44"
          aria-hidden="true"
        >
          <path d="M12 38 C12 38, 18 30, 12 24 C6 18, 12 10, 12 10" />
          <path d="M7 14 L12 6 L17 14" />
        </svg>
        <p>Scroll to journey forward</p>
      </div>
    </div>
  )
}
