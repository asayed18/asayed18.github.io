export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'theme'

function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light'
}

/**
 * Theme for the first render. The inline script in index.html has already resolved it (stored
 * choice first, then the system preference) and set `data-theme` before first paint, so this
 * only reads that back.
 */
export function getInitialTheme(): Theme {
  const applied = document.documentElement.getAttribute('data-theme')
  if (isTheme(applied)) return applied
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
}

/** Remembers an explicit choice. Storage can be unavailable (private mode, blocked cookies). */
export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // The choice then lasts for this visit only.
  }
}
