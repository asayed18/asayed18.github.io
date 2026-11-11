import { useEffect, useRef } from 'react'
import { AVATAR_SRC, profile } from '../data/profile'
import { SocialLinks } from './Icons'
import './AboutOverlay.css'

interface AboutOverlayProps {
  open: boolean
  onClose: () => void
}

/**
 * The About dialog. A native modal `<dialog>`: the browser keeps keyboard focus inside it, closes
 * it on Escape, makes the page behind it inert and gives focus back to the link that opened it.
 */
export function AboutOverlay({ open, onClose }: AboutOverlayProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    if (!dialog.open) dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [open])

  if (!open) return null

  return (
    <dialog
      ref={dialogRef}
      className="about-overlay"
      aria-labelledby="about-title"
      // Fires for Escape and for the close button alike.
      onClose={onClose}
      // A click that lands outside the content closes the dialog.
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('.about-content')) onClose()
      }}
    >
      <div className="about-backdrop" />
      <div className="about-content">
        <button type="button" className="about-close" onClick={onClose} aria-label="Close">
          &times;
        </button>

        <div className="about-header">
          <img src={AVATAR_SRC} alt="" width={64} height={64} className="about-avatar" />
          <div>
            <h2 className="about-name" id="about-title">
              {profile.name}
            </h2>
            <p className="about-role">{profile.role}</p>
          </div>
        </div>

        <p className="about-bio">{profile.bio}</p>

        <ul className="about-facts">
          {profile.facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>

        <div className="about-links">
          <SocialLinks size={22} />
        </div>
      </div>
    </dialog>
  )
}
