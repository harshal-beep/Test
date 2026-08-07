import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CalendarDays, CalendarHeart, ListTodo, Plus, Wallet } from '../lib/icons'
import { supabase } from '../lib/supabase'
import { computeNets, inr } from '../lib/money'
import { Expense, List, Milestone, Settlement } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { useSpace } from '../context/SpaceContext'
import Avatar from '../components/Avatar'
import { EmptyState, Page, Skeleton, stagger } from '../components/ui'
import { ListComposer } from '../components/Composers'

type ListRow = List & { total: number; done: number }

interface PlannedRow {
  id: string
  list_id: string
  text: string
  planned_for: string
}

function isoToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Days from today to an ISO day, counted in whole local days. */
function daysUntil(day: string): number {
  return Math.round((new Date(day).getTime() - new Date(isoToday()).getTime()) / 86400000)
}

function countdownLabel(days: number): string {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days} days`
}

interface FeedEntry {
  key: string
  ts: string
  actor: string | null
  text: string
}

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/** The hero follows the sky. Couple space keeps HaMaara's warm rose-lavender
 * identity; group spaces get their own cooler teal look so the two never mix. */
function heroGradient(isCouple: boolean): string {
  const h = new Date().getHours()
  if (isCouple) {
    if (h < 12) return 'from-amber-200 via-rose-200 to-brand-400'
    if (h < 17) return 'from-brand-200 via-brand-400 to-brand-500'
    return 'from-brand-400 via-brand-500 to-brand-700'
  }
  if (h < 12) return 'from-amber-100 via-sky-200 to-teal-300'
  if (h < 17) return 'from-sky-200 via-teal-300 to-emerald-400'
  return 'from-teal-300 via-sky-400 to-indigo-400'
}

export default function Home() {
  const { profile } = useAuth()
  const { space, members, isCouple } = useSpace()
  const sid = space!.id
  const [lists, setLists] = useState<ListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [composerOpen, setComposerOpen] = useState(false)
  const [feed, setFeed] = useState<FeedEntry[]>([])
  const [planned, setPlanned] = useState<PlannedRow[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [onThisDay, setOnThisDay] = useState<{ id: string; list_id: string; text: string; checked_at: string }[]>([])

  useEffect(() => {
    setLoading(true)
    void loadLists()
    void loadFeed()
    void loadPlanned()
    void loadMoney()
    void loadReminders()
    const channel = supabase
      .channel(`home-${sid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_lists' }, () => void loadLists())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_items' }, () => {
        void loadLists()
        void loadFeed()
        void loadPlanned()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_expenses' }, () => void loadMoney())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_settlements' }, () => void loadMoney())
      .subscribe()
    return () => void supabase.removeChannel(channel)
  }, [sid])

  /** Milestone reminders + "on this day" memory anniversaries. */
  async function loadReminders() {
    const [ms, mem] = await Promise.all([
      supabase.from('lv_milestones').select('*').eq('space_id', sid),
      supabase
        .from('lv_items')
        .select('id, list_id, text, checked_at, list:lv_lists!inner(space_id)')
        .eq('list.space_id', sid)
        .eq('checked', true)
        .not('checked_at', 'is', null)
        .not('memory_note', 'is', null)
    ])
    setMilestones((ms.data as Milestone[]) ?? [])
    const t = new Date()
    const mmdd = `${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
    const todayIso = isoToday()
    setOnThisDay(
      (((mem.data as { id: string; list_id: string; text: string; checked_at: string }[]) ?? []) || []).filter(
        (r) => r.checked_at.slice(5, 10) === mmdd && r.checked_at.slice(0, 10) !== todayIso
      )
    )
  }

  /** Just enough of the ledger to show the balance up top. */
  async function loadMoney() {
    const [e, st] = await Promise.all([
      supabase.from('lv_expenses').select('*, shares:lv_expense_shares(*)').eq('space_id', sid),
      supabase.from('lv_settlements').select('*').eq('space_id', sid)
    ])
    setExpenses((e.data as Expense[]) ?? [])
    setSettlements((st.data as Settlement[]) ?? [])
  }

  /** Things with a date pencilled in, today onwards. */
  async function loadPlanned() {
    const { data } = await supabase
      .from('lv_items')
      .select('id, list_id, text, planned_for, list:lv_lists!inner(space_id)')
      .eq('list.space_id', sid)
      .eq('checked', false)
      .gte('planned_for', isoToday())
      .order('planned_for')
      .limit(3)
    setPlanned((data as unknown as PlannedRow[]) ?? [])
  }

  async function loadFeed() {
    const [items, notes, habitChecks] = await Promise.all([
      supabase
        .from('lv_items')
        .select('id, text, created_at, checked, checked_at, added_by, checked_by, list:lv_lists!inner(name, emoji, space_id)')
        .eq('list.space_id', sid)
        .order('created_at', { ascending: false })
        .limit(12),
      supabase
        .from('lv_notes')
        .select('id, title, body, updated_at, updated_by')
        .eq('space_id', sid)
        .order('updated_at', { ascending: false })
        .limit(5),
      supabase
        .from('lv_habit_checks')
        .select('habit_id, day, user_id, created_at, habit:lv_habits!inner(name, emoji, space_id)')
        .eq('habit.space_id', sid)
        .order('created_at', { ascending: false })
        .limit(8)
    ])
    const entries: FeedEntry[] = []
    type ItemRow = { id: string; text: string; created_at: string; checked: boolean; checked_at: string | null; added_by: string | null; checked_by: string | null; list: { name: string; emoji: string | null } | null }
    for (const it of (items.data as ItemRow[] | null) ?? []) {
      const listName = it.list ? `${it.list.emoji ?? ''} ${it.list.name}`.trim() : 'a list'
      entries.push({ key: `add-${it.id}`, ts: it.created_at, actor: it.added_by, text: `added “${it.text}” to ${listName}` })
      if (it.checked && it.checked_at)
        entries.push({ key: `done-${it.id}`, ts: it.checked_at, actor: it.checked_by, text: `completed “${it.text}” in ${listName}` })
    }
    type NoteRow = { id: string; title: string; body: string; updated_at: string; updated_by: string | null }
    for (const n of (notes.data as NoteRow[] | null) ?? []) {
      entries.push({ key: `note-${n.id}-${n.updated_at}`, ts: n.updated_at, actor: n.updated_by, text: `updated note “${n.title || n.body.slice(0, 30) || 'Untitled'}”` })
    }
    type CheckRow = { habit_id: string; day: string; user_id: string; created_at: string; habit: { name: string; emoji: string | null } | null }
    for (const c of (habitChecks.data as CheckRow[] | null) ?? []) {
      if (c.habit) entries.push({ key: `habit-${c.habit_id}-${c.day}-${c.user_id}`, ts: c.created_at, actor: c.user_id, text: `did ${c.habit.emoji ?? ''} ${c.habit.name}`.trim() })
    }
    entries.sort((a, b) => (a.ts < b.ts ? 1 : -1))
    setFeed(entries.slice(0, 8))
  }

  async function loadLists() {
    const { data } = await supabase
      .from('lv_lists')
      .select('*, lv_items(checked)')
      .eq('space_id', sid)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    const rows = ((data as (List & { lv_items: { checked: boolean }[] })[]) ?? []).map((l) => ({
      ...l,
      total: l.lv_items?.length ?? 0,
      done: l.lv_items?.filter((i) => i.checked).length ?? 0
    }))
    setLists(rows)
    setLoading(false)
  }

  const pending = lists.reduce((sum, l) => sum + (l.total - l.done), 0)
  const firstName = (profile?.display_name ?? '').split(' ')[0]
  const balance = computeNets(expenses, settlements).get(profile?.id ?? '') ?? 0
  const partnerFirst = isCouple
    ? members.find((p) => p.id !== profile?.id)?.display_name?.split(' ')[0] || 'Partner'
    : 'the group'

  /** Nearest milestone occurrence within 45 days (yearly ones roll forward). */
  const nextMilestone = (() => {
    const t = new Date(isoToday())
    let best: { ms: Milestone; days: number; years: number } | null = null
    for (const ms of milestones) {
      const [y, m, d] = ms.date.split('-').map(Number)
      let occ = new Date(t.getFullYear(), m - 1, d)
      if (!ms.yearly) occ = new Date(y, m - 1, d)
      else if (occ < t) occ = new Date(t.getFullYear() + 1, m - 1, d)
      const days = Math.round((occ.getTime() - t.getTime()) / 86400000)
      if (days < 0 || days > 45) continue
      if (!best || days < best.days) best = { ms, days, years: occ.getFullYear() - y }
    }
    return best
  })()

  return (
    <Page className="space-y-6">
      <div>
        <p className="text-sm font-medium text-ink-500 dark:text-ink-400">{greeting()},</p>
        <h1 className="text-[26px] font-extrabold tracking-tight">{firstName || 'there'} 👋</h1>
      </div>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
        className={`relative overflow-hidden rounded-[24px] bg-gradient-to-br p-5 text-ink-900 shadow-float ${
          isCouple ? 'shadow-brand-600/25' : 'shadow-teal-600/25'
        } ${heroGradient(isCouple)}`}
      >
        <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10" />
        <div className="absolute -right-2 top-16 h-16 w-16 rounded-full bg-white/10" />
        <p className="text-sm font-medium opacity-80">Today</p>
        <p className="mt-1.5 text-[22px] font-bold leading-snug">
          {pending === 0
            ? lists.length === 0
              ? 'A fresh start ✨'
              : 'All caught up 🎉'
            : `${pending} task${pending === 1 ? '' : 's'} to go`}
        </p>
        <p className="mt-0.5 text-sm opacity-80">
          {lists.length} active list{lists.length === 1 ? '' : 's'}{isCouple ? ' — hamaara, together' : ` in ${space?.name}`}
        </p>
      </motion.div>

      {/* Money — primary card on the home menu */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Link to="/money" className="surface flex items-center gap-4 p-4">
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
              balance === 0
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
                : balance > 0
                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-rose-50 text-rose-500 dark:bg-rose-900/30 dark:text-rose-300'
            }`}
          >
            <Wallet size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold uppercase tracking-wider text-ink-400">Money</span>
            {balance === 0 ? (
              <span className="block text-[17px] font-bold">All settled ✅</span>
            ) : (
              <span className="block text-[17px] font-bold">
                {balance > 0
                  ? isCouple
                    ? `${partnerFirst} owes you `
                    : "You're owed "
                  : `You owe ${isCouple ? partnerFirst : 'the group'} `}
                <span className={balance > 0 ? 'text-emerald-600' : 'text-rose-500'}>{inr(balance)}</span>
              </span>
            )}
            <span className="block text-xs text-ink-500 dark:text-ink-400">
              {balance === 0 ? 'Add an expense whenever' : 'Tap to view or settle up'}
            </span>
          </span>
        </Link>
      </motion.div>

      {/* Reminders: upcoming milestone + on-this-day memories */}
      {nextMilestone && (
        <Link
          to="/calendar"
          className="flex items-center gap-3 rounded-[20px] bg-amber-50 p-4 ring-1 ring-amber-200/60 dark:bg-amber-900/20 dark:ring-amber-800/50"
        >
          <span className="text-2xl">{nextMilestone.ms.emoji ?? '⭐'}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold">
              {nextMilestone.ms.title}
              {nextMilestone.ms.yearly && nextMilestone.years > 0 && ` · ${nextMilestone.years} year${nextMilestone.years === 1 ? '' : 's'}`}
            </span>
            <span className="block text-xs text-amber-700 dark:text-amber-300">
              {nextMilestone.days === 0 ? '🎉 Today!' : nextMilestone.days === 1 ? 'Tomorrow' : `In ${nextMilestone.days} days`}
            </span>
          </span>
        </Link>
      )}
      {onThisDay.map((m) => (
        <Link
          key={m.id}
          to={isCouple ? '/us' : `/list/${m.list_id}`}
          className="flex items-center gap-3 rounded-[20px] bg-brand-50 p-4 ring-1 ring-brand-200/60 dark:bg-brand-800/20 dark:ring-brand-800/50"
        >
          <span className="text-2xl">💭</span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold uppercase tracking-wider text-brand-600">On this day</span>
            <span className="block truncate font-bold">{m.text}</span>
            <span className="block text-xs text-ink-500 dark:text-ink-400">
              {new Date(m.checked_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })} — remember?
            </span>
          </span>
        </Link>
      ))}

      {/* Next together */}
      {planned.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="space-y-2"
        >
          <Link to="/calendar" className="surface flex items-center gap-4 p-4">
            <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-800/30">
              <span className="text-xl font-extrabold leading-none">
                {daysUntil(planned[0].planned_for) === 0 ? '★' : daysUntil(planned[0].planned_for)}
              </span>
              {daysUntil(planned[0].planned_for) !== 0 && (
                <span className="text-[9px] font-bold uppercase tracking-wide">
                  {daysUntil(planned[0].planned_for) === 1 ? 'day' : 'days'}
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-600">
                <CalendarHeart size={12} /> {isCouple ? 'Next together' : 'Coming up'}
              </span>
              <span className="mt-0.5 block truncate text-[17px] font-bold">{planned[0].text}</span>
              <span className="block text-xs text-ink-500 dark:text-ink-400">
                {countdownLabel(daysUntil(planned[0].planned_for))} ·{' '}
                {new Date(planned[0].planned_for).toLocaleDateString(undefined, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long'
                })}
              </span>
            </span>
          </Link>
          {planned.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {planned.slice(1).map((p) => (
                <Link
                  key={p.id}
                  to={`/list/${p.list_id}`}
                  className="shrink-0 rounded-full bg-ink-100 px-3.5 py-1.5 text-xs font-semibold text-ink-600 dark:bg-ink-800 dark:text-ink-300"
                >
                  {countdownLabel(daysUntil(p.planned_for))} · {p.text}
                </Link>
              ))}
            </div>
          )}
        </motion.section>
      )}

      {/* Lists */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Lists</h2>
          <span className="flex items-center gap-1">
            <Link to="/calendar" aria-label="Calendar" className="btn-ghost flex items-center gap-1 px-3 py-1.5 text-sm">
              <CalendarDays size={16} />
            </Link>
            <button onClick={() => setComposerOpen(true)} className="btn-ghost flex items-center gap-1 px-3 py-1.5 text-sm">
              <Plus size={16} /> New
            </button>
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : lists.length === 0 ? (
          <EmptyState
            icon={<ListTodo size={24} />}
            title="No lists yet"
            hint="Tap + to create your first list — it takes five seconds."
          />
        ) : (
          <motion.div variants={stagger.container} initial="initial" animate="animate" className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {lists.map((l) => {
              const pct = l.total === 0 ? 0 : Math.round((l.done / l.total) * 100)
              return (
                <motion.div key={l.id} variants={stagger.item} whileTap={{ scale: 0.97 }}>
                  <Link to={`/list/${l.id}`} className="surface block p-4 transition-shadow hover:shadow-float">
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl"
                      style={{ backgroundColor: (l.color ?? '#948ce9') + '20' }}
                    >
                      {l.emoji ?? '📝'}
                    </span>
                    <span className="mt-3 block truncate font-bold">{l.name}</span>
                    <span className="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">
                      {l.done}/{l.total} done
                    </span>
                    <span className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                      <motion.span
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1], delay: 0.15 }}
                        className="block h-full rounded-full"
                        style={{ backgroundColor: l.color ?? '#948ce9' }}
                      />
                    </span>
                  </Link>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </section>

      {/* Recent activity */}
      {feed.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold">Recent activity</h2>
          <div className="surface divide-y divide-ink-100 dark:divide-ink-800">
            {feed.map((e) => {
              const actor = members.find((p) => p.id === e.actor)
              const isMe = e.actor === profile?.id
              return (
                <div key={e.key} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar profile={actor} size={7} />
                  <p className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-semibold">{isMe ? 'You' : actor?.display_name?.split(' ')[0] || 'Someone'}</span>{' '}
                    <span className="text-ink-600 dark:text-ink-300">{e.text}</span>
                  </p>
                  <span className="shrink-0 text-xs text-ink-400">{timeAgo(e.ts)}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <ListComposer open={composerOpen} onClose={() => setComposerOpen(false)} />
    </Page>
  )
}
