import { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'
import InstallPrompt from './InstallPrompt'
import ThemeToggle from './ThemeToggle'

const tabs = [
  { to: '/', label: 'Lists', icon: '📝' },
  { to: '/notes', label: 'Notes', icon: '📒' },
  { to: '/archive', label: 'Archive', icon: '🗄️' },
  { to: '/search', label: 'Search', icon: '🔍' }
]

const adminTab = { to: '/admin', label: 'Admin', icon: '🛠️' }

export default function Layout({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const visibleTabs = profile?.is_admin ? [...tabs, adminTab] : tabs
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 px-4 py-3 backdrop-blur">
        <NavLink to="/" className="text-lg font-bold text-brand-700">
          ListVault
        </NavLink>
        <span className="flex items-center gap-2">
          <ThemeToggle />
          <NavLink to="/settings" aria-label="Settings">
            <Avatar profile={profile} />
          </NavLink>
        </span>
      </header>
      <main className="flex-1 px-4 py-4">{children}</main>
      <InstallPrompt />
      <nav className="sticky bottom-0 z-10 flex border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {visibleTabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
                isActive ? 'font-semibold text-brand-700' : 'text-slate-500 dark:text-slate-400'
              }`
            }
          >
            <span aria-hidden>{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
