export type ThemeMode = 'light' | 'dark' | 'system'

export function getThemeMode(): ThemeMode {
  const saved = localStorage.getItem('lv-theme')
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

/** Apply and persist a theme mode. 'system' clears the override and follows the OS. */
export function applyThemeMode(mode: ThemeMode) {
  if (mode === 'system') {
    localStorage.removeItem('lv-theme')
    document.documentElement.classList.toggle('dark', matchMedia('(prefers-color-scheme: dark)').matches)
  } else {
    localStorage.setItem('lv-theme', mode)
    document.documentElement.classList.toggle('dark', mode === 'dark')
  }
}
