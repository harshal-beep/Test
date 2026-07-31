import { ReactNode, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'
import InstallPrompt from './InstallPrompt'
import ThemeToggle from './ThemeToggle'

const leftTabs = [
  { to: '/', label: 'Lists', icon: '📝' },
  { to: '/notes', label: 'Notes', icon: '📒' }
]
const rightTabs = [
  { to: '/archive', label: 'Archive', icon: '🗄️' },
  { to: '/search', label: 'Search', icon: '🔍' }
]

function Tab({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
          isActive ? 'font-semibold text-brand-600' : 'text-slate-400'
        }`
      }
    >
      <span aria-hidden>{icon}</span>
      {label}
    </NavLink>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [fabOpen, setFabOpen] = useState(false)

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 px-4 py-3 backdrop-blur">
        <NavLink to="/" className="text-lg font-extrabold">
          <span className="text-slate-900 dark:text-slate-100">List</span>
          <span className="text-brand-600">Vault</span>
        </NavLink>
        <span className="flex items-center gap-2">
          <ThemeToggle />
          {profile?.is_admin && (
            <NavLink to="/admin" aria-label="Admin" className="rounded-full p-1.5 text-lg hover:bg-slate-100 dark:hover:bg-slate-800">
              🛠️
            </NavLink>
          )}
          <NavLink to="/settings" aria-label="Settings">
            <Avatar profile={profile} size={8} />
          </NavLink>
        </span>
      </header>

      <main className="flex-1 px-4 py-4 pb-24">{children}</main>
      <InstallPrompt />

      {fabOpen && (
        <div className="fixed inset-0 z-20" onClick={() => setFabOpen(false)}>
          <div className="absolute bottom-24 left-1/2 flex -translate-x-1/2 flex-col gap-2">
            <button
              onClick={() => navigate('/?new=1')}
              className="rounded-full bg-white dark:bg-slate-800 px-5 py-2.5 text-sm font-semibold shadow-xl ring-1 ring-slate-200 dark:ring-slate-700"
            >
              📝 New list
            </button>
            <button
              onClick={() => navigate('/notes/new')}
              className="rounded-full bg-white dark:bg-slate-800 px-5 py-2.5 text-sm font-semibold shadow-xl ring-1 ring-slate-200 dark:ring-slate-700"
            >
              📒 New note
            </button>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-10">
        <div className="mx-auto flex max-w-2xl items-center border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 pb-[env(safe-area-inset-bottom)]">
          {leftTabs.map((t) => (
            <Tab key={t.to} {...t} />
          ))}
          <button
            onClick={() => setFabOpen((o) => !o)}
            aria-label="Create"
            className={`-mt-6 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-600 text-2xl font-light text-white shadow-lg shadow-brand-600/40 transition-transform ${
              fabOpen ? 'rotate-45' : ''
            }`}
          >
            +
          </button>
          {rightTabs.map((t) => (
            <Tab key={t.to} {...t} />
          ))}
        </div>
      </nav>
    </div>
  )
}
