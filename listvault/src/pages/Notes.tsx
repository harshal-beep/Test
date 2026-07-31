import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Lock, NotebookPen, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Note } from '../lib/types'
import { EmptyState, Page, Skeleton, stagger } from '../components/ui'

// Pastel note-card palette, cycled by position
const PASTELS = [
  'bg-[#edebff] dark:bg-[#2b2952]',
  'bg-[#fff1e0] dark:bg-[#3d3325]',
  'bg-[#e4f7ee] dark:bg-[#22382f]',
  'bg-[#ffe9f0] dark:bg-[#3c2733]',
  'bg-[#e8f1ff] dark:bg-[#24314a]'
]

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    void load()
    const channel = supabase
      .channel('notes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_notes' }, () => void load())
      .subscribe()
    return () => void supabase.removeChannel(channel)
  }, [])

  async function load() {
    const { data } = await supabase.from('lv_notes').select('*').order('updated_at', { ascending: false })
    setNotes((data as Note[]) ?? [])
    setLoading(false)
  }

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return notes
    return notes.filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
  }, [notes, filter])

  return (
    <Page className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[26px] font-extrabold tracking-tight">Notes</h1>
        <Link to="/notes/new" className="btn-primary px-4 py-2 text-sm">
          + New note
        </Link>
      </div>

      <div className="relative">
        <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search notes…"
          className="field pl-11"
        />
      </div>

      {loading ? (
        <div className="columns-2 gap-3">
          <Skeleton className="mb-3 h-36" />
          <Skeleton className="mb-3 h-28" />
          <Skeleton className="mb-3 h-28" />
          <Skeleton className="mb-3 h-40" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<NotebookPen size={24} />}
          title={notes.length === 0 ? 'No notes yet' : 'No matches'}
          hint={
            notes.length === 0
              ? 'Shared notes are visible to everyone in HaMaara; private notes only to you.'
              : 'Try a different search.'
          }
        />
      ) : (
        <motion.div
          variants={stagger.container}
          initial="initial"
          animate="animate"
          className="columns-2 gap-3 [column-fill:_balance]"
        >
          {visible.map((n, i) => (
            <motion.div key={n.id} variants={stagger.item} className="mb-3 break-inside-avoid">
              <motion.div whileTap={{ scale: 0.97 }}>
                <Link
                  to={`/notes/${n.id}`}
                  className={`block rounded-[20px] p-4 shadow-card transition-shadow hover:shadow-float ${PASTELS[i % PASTELS.length]}`}
                >
                  <span className="flex items-start gap-1.5">
                    <span className="flex-1 font-bold leading-snug">
                      {n.title || n.body.slice(0, 60) || 'Untitled note'}
                    </span>
                    {n.is_private && <Lock size={14} className="mt-1 shrink-0 text-ink-500 dark:text-ink-400" />}
                  </span>
                  {n.title && n.body && (
                    <span className="mt-1.5 block overflow-hidden text-sm leading-relaxed text-ink-600 [-webkit-box-orient:vertical] [-webkit-line-clamp:4] [display:-webkit-box] dark:text-ink-300">
                      {n.body}
                    </span>
                  )}
                  <span className="mt-2.5 block text-xs font-medium text-ink-500 dark:text-ink-400">
                    {new Date(n.updated_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </span>
                </Link>
              </motion.div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </Page>
  )
}
