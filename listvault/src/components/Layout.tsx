import { ReactNode, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Archive,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  Flame,
  Heart,
  ListTodo,
  NotebookPen,
  Plus,
  Search,
  StickyNote,
  Users,
  Wallet
} from '../lib/icons'
import { useAuth } from '../context/AuthContext'
import { useSpace } from '../context/SpaceContext'
import Avatar from './Avatar'
import InstallPrompt from './InstallPrompt'
import SpaceSwitcher from './SpaceSwitcher'
import ThemeToggle from './ThemeToggle'
import { ListComposer, TaskComposer } from './Composers'
import { HabitComposer } from '../pages/Habits'

const leftTabs = [
  { to: '/', label: 'Lists', Icon: ListTodo },
  { to: '/notes', label: 'Notes', Icon: StickyNote }
]

function Tab({ to, label, Icon }: { to: string; label: string; Icon: typeof ListTodo }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
          isActive ? 'text-brand-600 dark:text-brand-400' : 'text-ink-400 hover:text-ink-600 dark:hover:text-ink-200'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="tab-pill"
              transition={{ type: 'spring', damping: 26, stiffness: 380 }}
              className="absolute inset-x-1.5 inset-y-1 rounded-2xl bg-brand-50 dark:bg-brand-800/25"
            />
          )}
          <span className="relative z-10 flex flex-col items-center gap-1">
            <Icon size={21} strokeWidth={isActive ? 2.4 : 2} />
            {label}
          </span>
        </>
      )}
    </NavLink>
  )
}

/** Desktop sidebar link — the website version of the mobile tab. */
function SideLink({ to, label, Icon }: { to: string; label: string; Icon: typeof ListTodo }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-colors ${
          isActive
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-800/25 dark:text-brand-200'
            : 'text-ink-500 hover:bg-ink-100 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100'
        }`
      }
    >
      <Icon size={18} /> {label}
    </NavLink>
  )
}

/** The wordmark doubles as the space switcher trigger. */
function SpaceTrigger({ onOpen, className }: { onOpen: () => void; className?: string }) {
  const { space, isCouple } = useSpace()
  return (
    <button onClick={onOpen} className={`flex min-w-0 items-center gap-1.5 ${className ?? ''}`}>
      {isCouple ? (
        <span className="truncate text-lg font-extrabold tracking-tight md:text-xl">
          Ha<span className="text-brand-600">Maara</span>
        </span>
      ) : (
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-lg leading-none">{space?.emoji ?? '👥'}</span>
          <span className="truncate text-lg font-extrabold tracking-tight md:text-xl">{space?.name}</span>
        </span>
      )}
      <ChevronDown size={16} className="shrink-0 text-ink-400" />
    </button>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const { isCouple } = useSpace()
  const navigate = useNavigate()
  const [fabOpen, setFabOpen] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [composer, setComposer] = useState<'task' | 'list' | 'habit' | null>(null)

  const fabActions = [
    { label: 'Task', Icon: CheckSquare, run: () => setComposer('task') },
    { label: 'List', Icon: ListTodo, run: () => setComposer('list') },
    { label: 'Note', Icon: NotebookPen, run: () => navigate('/notes/new') },
    { label: 'Habit', Icon: Flame, run: () => setComposer('habit') }
  ]

  const rightTabs = isCouple
    ? [
        { to: '/habits', label: 'Habits', Icon: Flame },
        { to: '/us', label: 'Us', Icon: Heart }
      ]
    : [
        { to: '/money', label: 'Money', Icon: Wallet },
        { to: '/habits', label: 'Habits', Icon: Flame }
      ]

  const sideLinks = [
    ...leftTabs,
    { to: '/money', label: 'Money', Icon: Wallet },
    { to: '/calendar', label: 'Calendar', Icon: CalendarDays },
    { to: '/habits', label: 'Habits', Icon: Flame },
    ...(isCouple ? [{ to: '/us', label: 'Us', Icon: Heart }] : []),
    { to: '/space', label: 'Members', Icon: Users },
    { to: '/search', label: 'Search', Icon: Search },
    { to: '/archive', label: 'Archive', Icon: Archive }
  ]

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-6xl">
      {/* Desktop sidebar — the "website version" navigation */}
      <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-ink-100/70 px-4 py-6 md:flex dark:border-ink-800/70">
        <SpaceTrigger onOpen={() => setSwitcherOpen(true)} className="px-3.5" />

        <nav className="mt-7 flex flex-col gap-1">
          {sideLinks.map((l) => (
            <SideLink key={l.to} {...l} />
          ))}
          {profile?.is_admin && <SideLink to="/admin" label="Our home" Icon={Users} />}
        </nav>

        <div className="mt-7">
          <p className="px-3.5 pb-2 text-[11px] font-bold uppercase tracking-wider text-ink-400">Create</p>
          <div className="flex flex-col gap-1">
            {fabActions.map((a) => (
              <button
                key={a.label}
                onClick={a.run}
                className="flex items-center gap-3 rounded-2xl px-3.5 py-2 text-sm font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-800/30">
                  <Plus size={14} />
                </span>
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-auto flex items-center gap-2.5 px-1.5">
          <NavLink to="/settings" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl px-2 py-2 transition-colors hover:bg-ink-100 dark:hover:bg-ink-800">
            <Avatar profile={profile} size={8} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{profile?.display_name || 'You'}</span>
              <span className="block text-[11px] text-ink-400">Settings</span>
            </span>
          </NavLink>
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex min-h-[100dvh] min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-10 flex items-center justify-between bg-ink-50/80 px-5 pb-3.5 pt-[max(0.875rem,env(safe-area-inset-top))] backdrop-blur-xl md:hidden dark:bg-ink-950/80">
          <SpaceTrigger onOpen={() => setSwitcherOpen(true)} />
          <span className="flex items-center gap-1.5">
            <button onClick={() => navigate('/search')} aria-label="Search" className="icon-btn">
              <Search size={19} />
            </button>
            <ThemeToggle />
            {profile?.is_admin && (
              <NavLink to="/admin" aria-label="Manage people" className="icon-btn">
                <Users size={19} />
              </NavLink>
            )}
            <NavLink to="/settings" aria-label="Settings" className="transition-transform active:scale-95">
              <Avatar profile={profile} size={9} />
            </NavLink>
          </span>
        </header>

        <main className="flex-1 px-5 py-2 pb-[calc(7rem+env(safe-area-inset-bottom))] md:px-10 md:py-8 md:pb-28">
          <div className="mx-auto w-full max-w-2xl md:max-w-3xl">{children}</div>
        </main>
        <InstallPrompt />

        {/* FAB actions (mobile) */}
        <AnimatePresence>
          {fabOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-20 bg-ink-950/30 backdrop-blur-[2px] md:hidden"
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

        <nav className="fixed inset-x-0 bottom-0 z-30 md:hidden">
          <div className="mx-auto flex max-w-2xl items-center border-t border-ink-100/70 bg-white/80 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl dark:border-ink-800/70 dark:bg-ink-900/80">
            {leftTabs.map((t) => (
              <Tab key={t.to} {...t} />
            ))}
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={() => setFabOpen((o) => !o)}
              aria-label="Create"
              className="-mt-7 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-float shadow-brand-600/50"
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
      </div>

      <SpaceSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
      <TaskComposer open={composer === 'task'} onClose={() => setComposer(null)} />
      <ListComposer open={composer === 'list'} onClose={() => setComposer(null)} />
      <HabitComposer open={composer === 'habit'} onClose={() => setComposer(null)} />
    </div>
  )
}
