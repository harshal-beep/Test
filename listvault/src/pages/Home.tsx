import { FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ListTodo, Plus, Ticket } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { List } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { EmptyState, Page, Skeleton, stagger, useToast } from '../components/ui'
import { ListComposer } from '../components/Composers'

type ListRow = List & { total: number; done: number }

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

  useEffect(() => {
    void loadLists()
    const channel = supabase
      .channel('home-lists')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_lists' }, () => void loadLists())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_items' }, () => void loadLists())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_list_members' }, () => void loadLists())
      .subscribe()
    return () => void supabase.removeChannel(channel)
  }, [])

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
          {lists.length} active list{lists.length === 1 ? '' : 's'} in your vault
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
