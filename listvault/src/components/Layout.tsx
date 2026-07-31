import { ReactNode, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Archive, Flame, ListTodo, NotebookPen, Plus, Search, StickyNote, CheckSquare } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'
import InstallPrompt from './InstallPrompt'
import ThemeToggle from './ThemeToggle'
import { ListComposer, TaskComposer } from './Composers'
import { HabitComposer } from '../pages/Habits'

const leftTabs = [
  { to: '/', label: 'Lists', Icon: ListTodo },
  { to: '/notes', label: 'Notes', Icon: StickyNote }
]
const rightTabs = [
  { to: '/habits', label: 'Habits', Icon: Flame },
  { to: '/archive', label: 'Archive', Icon: Archive }
]

function Tab({ to, label, Icon }: { to: string; label: string; Icon: typeof ListTodo }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
          isActive ? 'text-brand-600' : 'text-ink-400 hover:text-ink-600 dark:hover:text-ink-200'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={21} strokeWidth={isActive ? 2.4 : 2} />
          {label}
          {isActive && (
            <motion.span
              layoutId="tab-dot"
              className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-brand-600"
            />
          )}
        </>
      )}
    </NavLink>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [fabOpen, setFabOpen] = useState(false)
  const [composer, setComposer] = useState<'task' | 'list' | 'habit' | null>(null)

  const fabActions = [
    { label: 'Task', Icon: CheckSquare, run: () => setComposer('task') },
    { label: 'List', Icon: ListTodo, run: () => setComposer('list') },
    { label: 'Note', Icon: NotebookPen, run: () => navigate('/notes/new') },
    { label: 'Habit', Icon: Flame, run: () => setComposer('habit') }
  ]

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-ink-50/90 px-5 py-3.5 backdrop-blur-md dark:bg-ink-950/90">
        <NavLink to="/" className="text-lg font-extrabold tracking-tight">
          Ha<span className="text-brand-600">Maara</span>
        </NavLink>
        <span className="flex items-center gap-1.5">
          <button onClick={() => navigate('/search')} aria-label="Search" className="icon-btn">
            <Search size={19} />
          </button>
          <ThemeToggle />
          {profile?.is_admin && (
            <NavLink to="/admin" aria-label="Admin" className="icon-btn text-sm font-bold">
              ⚙
            </NavLink>
          )}
          <NavLink to="/settings" aria-label="Settings" className="transition-transform active:scale-95">
            <Avatar profile={profile} size={9} />
          </NavLink>
        </span>
      </header>

      <main className="flex-1 px-5 py-2 pb-28">{children}</main>
      <InstallPrompt />

      {/* FAB actions */}
      <AnimatePresence>
        {fabOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-20 bg-ink-950/30 backdrop-blur-[2px]"
            onClick={() => setFabOpen(false)}
          >
            <div className="absolute bottom-28 left-1/2 flex -translate-x-1/2 items-end gap-2.5">
              {fabActions.map((a, i) => (
                <motion.button
                  key={a.label}
                  initial={{ opacity: 0, y: 24, scale: 0.6 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 16, scale: 0.6 }}
                  transition={{ type: 'spring', damping: 18, stiffness: 420, delay: i * 0.04 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setFabOpen(false)
                    a.run()
                  }}
                  className="flex w-[74px] flex-col items-center gap-1.5 rounded-3xl bg-white py-3.5 text-xs font-semibold shadow-float dark:bg-ink-800"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-800/40">
                    <a.Icon size={19} />
                  </span>
                  {a.label}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="fixed inset-x-0 bottom-0 z-30">
        <div className="mx-auto flex max-w-2xl items-center border-t border-ink-100 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md dark:border-ink-800 dark:bg-ink-900/95">
          {leftTabs.map((t) => (
            <Tab key={t.to} {...t} />
          ))}
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => setFabOpen((o) => !o)}
            aria-label="Create"
            className="-mt-7 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-float shadow-brand-600/40"
          >
            <motion.span animate={{ rotate: fabOpen ? 45 : 0 }} transition={{ type: 'spring', damping: 16, stiffness: 300 }}>
              <Plus size={26} strokeWidth={2.4} />
            </motion.span>
          </motion.button>
          {rightTabs.map((t) => (
            <Tab key={t.to} {...t} />
          ))}
        </div>
      </nav>

      <TaskComposer open={composer === 'task'} onClose={() => setComposer(null)} />
      <ListComposer open={composer === 'list'} onClose={() => setComposer(null)} />
      <HabitComposer open={composer === 'habit'} onClose={() => setComposer(null)} />
    </div>
  )
}
