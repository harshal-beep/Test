import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Profile } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import { EmptyState, Page, Skeleton, stagger } from '../components/ui'

interface MemoryRow {
  id: string
  list_id: string
  text: string
  checked_at: string | null
  checked_by: string | null
  memory_note: string | null
  memory_photo: string | null
  list: { name: string; emoji: string | null } | null
}

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

/** Everything the two of you have actually done, newest first. */
export default function Memories() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<MemoryRow[]>([])
  const [people, setPeople] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void load()
    const channel = supabase
      .channel('memories')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_items' }, () => void load())
      .subscribe()
    return () => void supabase.removeChannel(channel)
  }, [])

  async function load() {
    const [items, profs] = await Promise.all([
      supabase
        .from('lv_items')
        .select('id, list_id, text, checked_at, checked_by, memory_note, memory_photo, list:lv_lists(name, emoji)')
        .eq('checked', true)
        .not('checked_at', 'is', null)
        .order('checked_at', { ascending: false })
        .limit(200),
      supabase.from('lv_profiles').select('*')
    ])
    setRows((items.data as unknown as MemoryRow[]) ?? [])
    setPeople((profs.data as Profile[]) ?? [])
    setLoading(false)
  }

  // group by month for a timeline feel
  const months = useMemo(() => {
    const map = new Map<string, MemoryRow[]>()
    for (const r of rows) {
      if (!r.checked_at) continue
      const key = monthLabel(r.checked_at)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return [...map.entries()]
  }, [rows])

  const withPhotos = rows.filter((r) => r.memory_photo).length

  return (
    <Page className="space-y-5">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">Memories</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          {rows.length === 0
            ? 'Things you two have done together'
            : `${rows.length} things done together${withPhotos > 0 ? ` · ${withPhotos} with photos` : ''}`}
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-20" />
          <Skeleton className="h-32" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Sparkles size={24} />}
          title="No memories yet"
          hint="Tick something off a list — you'll be asked to add a photo or a line about it."
        />
      ) : (
        months.map(([month, entries]) => (
          <section key={month} className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink-400">{month}</h2>
            <motion.div variants={stagger.container} initial="initial" animate="animate" className="space-y-3">
              {entries.map((r) => {
                const who = people.find((p) => p.id === r.checked_by)
                return (
                  <motion.div key={r.id} variants={stagger.item}>
                    <Link to={`/list/${r.list_id}`} className="surface block overflow-hidden">
                      {r.memory_photo && (
                        <img src={r.memory_photo} alt="" loading="lazy" className="max-h-64 w-full object-cover" />
                      )}
                      <div className="space-y-1.5 p-4">
                        <p className="font-bold leading-snug">{r.text}</p>
                        {r.memory_note && (
                          <p className="text-sm italic leading-relaxed text-ink-600 dark:text-ink-300">
                            “{r.memory_note}”
                          </p>
                        )}
                        <div className="flex items-center gap-2 pt-0.5 text-xs text-ink-400">
                          <Avatar profile={who} size={5} />
                          <span>
                            {r.checked_by === profile?.id ? 'You' : who?.display_name?.split(' ')[0] || 'Someone'} ·{' '}
                            {r.checked_at &&
                              new Date(r.checked_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                          </span>
                          {r.list && (
                            <span className="ml-auto truncate">
                              {r.list.emoji} {r.list.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                )
              })}
            </motion.div>
          </section>
        ))
      )}
    </Page>
  )
}
