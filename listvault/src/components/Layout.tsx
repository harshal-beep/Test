import { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'
import InstallPrompt from './InstallPrompt'

const tabs = [
  { to: '/', label: 'Lists', icon: '📝' },
  { to: '/archive', label: 'Archive', icon: '🗄️' },
  { to: '/search', label: 'Search', icon: '🔍' }
]

export default function Layout({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
        <NavLink to="/" className="text-lg font-bold text-brand-700">
          ListVault
        </NavLink>
        <NavLink to="/settings" aria-label="Settings">
          <Avatar profile={profile} />
        </NavLink>
      </header>
      <main className="flex-1 px-4 py-4">{children}</main>
      <InstallPrompt />
      <nav className="sticky bottom-0 z-10 flex border-t border-slate-200 bg-white">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
                isActive ? 'font-semibold text-brand-700' : 'text-slate-500'
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
