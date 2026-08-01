import { useEffect, useState } from 'react'
import { applyThemeMode } from '../lib/theme'

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  // Track class changes made elsewhere (e.g. the Appearance picker in Settings)
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains('dark'))
    )
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return (
    <button
      onClick={() => applyThemeMode(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="rounded-full p-1.5 text-lg transition-colors hover:bg-ink-100 dark:hover:bg-ink-800"
    >
      {dark ? '☀️' : '🌙'}
    </button>
  )
}
