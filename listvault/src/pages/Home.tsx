import { FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ListTodo, Plus, Ticket } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { List, Profile } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import { EmptyState, Page, Skeleton, stagger, useToast } from '../components/ui'
import { ListComposer } from '../components/Composers'

type ListRow = List & { total: number; done: number }

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

export default function Home() {
  const { profile } = useAuth()
  const toast = useToast()
  const [lists, setLists] = useState<ListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [composerOpen, setComposerOpen] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [feed, setFeed] = useState<FeedEntry[]>([])
  const [feedProfiles, setFeedProfiles] = useState<Profile[]>([])

  useEffect(() => {
    void loadLists()
    void loadFeed()
    const channel = supabase
      .channel('home-lists')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_lists' }, () => void loadLists())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_items' }, () => { void loadLists(); void loadFeed() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_list_members' }, () => void loadLists())
      .subscribe()
    return () => void supabase.removeChannel(channel)
  }, [])

  async function loadFeed() {
    const [items, notes, habitChecks, profs] = await Promise.all([
      supabase
        .from('lv_items')
        .select('id, text, created_at, checked, checked_at, added_by, checked_by, list:lv_lists(name, emoji)')
        .order('created_at', { ascending: false })
        .limit(12),
      supabase.from('lv_notes').select('id, title, body, updated_at, updated_by').order('updated_at', { ascending: false }).limit(5),
      supabase
        .from('lv_habit_checks')
        .select('habit_id, day, user_id, created_at, habit:lv_habits(name, emoji)')
        .order('created_at', { ascending: false })
        .limit(8),
      supabase.from('lv_profiles').select('*')
    ])
    setFeedProfiles((profs.data as Profile[]) ?? [])
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

  async function joinByCode(e: FormEvent) {
    e.preventDefault()
    const code = joinCode.trim()
    if (code.length !== 6) {
      toast('Codes are 6 characters')
      return
    }
    const { error } = await supabase.rpc('lv_join_list_by_code', { p_code: code })
    if (error) toast(error.message)
    else {
      setJoinCode('')
      toast('Joined the list 🎉')
      void loadLists()
    }
  }

  const pending = lists.reduce((sum, l) => sum + (l.total - l.done), 0)
  const firstName = (profile?.display_name ?? '').split(' ')[0]

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
        className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 p-5 text-white shadow-float shadow-brand-600/25"
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
          {lists.length} active list{lists.length === 1 ? '' : 's'} — hamaara, together
        </p>
      </motion.div>

      {/* Lists */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">My lists</h2>
          <button onClick={() => setComposerOpen(true)} className="btn-ghost flex items-center gap-1 px-3 py-1.5 text-sm">
            <Plus size={16} /> New
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3">
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
          <motion.div variants={stagger.container} initial="initial" animate="animate" className="grid grid-cols-2 gap-3">
            {lists.map((l) => {
              const pct = l.total === 0 ? 0 : Math.round((l.done / l.total) * 100)
              return (
                <motion.div key={l.id} variants={stagger.item} whileTap={{ scale: 0.97 }}>
                  <Link to={`/list/${l.id}`} className="surface block p-4 transition-shadow hover:shadow-float">
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl"
                      style={{ backgroundColor: (l.color ?? '#6c63ff') + '20' }}
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
                        style={{ backgroundColor: l.color ?? '#6c63ff' }}
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
              const actor = feedProfiles.find((p) => p.id === e.actor)
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

      {/* Join by code */}
      <form onSubmit={joinByCode} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Ticket size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Join with a code"
            maxLength={6}
            className="field pl-11 uppercase tracking-[0.2em] placeholder:normal-case placeholder:tracking-normal"
          />
        </div>
        <button className="btn-ghost border border-brand-200 px-5 py-3 text-sm dark:border-brand-800">Join</button>
      </form>

      <ListComposer open={composerOpen} onClose={() => setComposerOpen(false)} />
    </Page>
  )
}
