import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Note } from '../lib/types'
import { useAuth } from '../context/AuthContext'

export default function Notes() {
  const { session } = useAuth()
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
    const { data } = await supabase
      .from('lv_notes')
      .select('*')
      .order('updated_at', { ascending: false })
    setNotes((data as Note[]) ?? [])
    setLoading(false)
  }

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return notes
    return notes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)
    )
  }, [notes, filter])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Notes</h1>
        <Link
          to="/notes/new"
          className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700"
        >
          + New note
        </Link>
      </div>

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter notes…"
        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 focus:border-brand-500 focus:outline-none"
      />

      {loading ? (
        <p className="text-slate-500 dark:text-slate-400">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-slate-500 dark:text-slate-400">
          <p className="text-3xl">📒</p>
          <p className="mt-2">
            {notes.length === 0
              ? 'No notes yet. Shared notes are visible to everyone; private notes only to you.'
              : 'No notes match your filter.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((n) => (
            <li key={n.id}>
              <Link
                to={`/notes/${n.id}`}
                className="block rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm hover:border-brand-500"
              >
                <span className="flex items-center gap-2">
                  <span className="flex-1 font-medium">
                    {n.title || n.body.slice(0, 60) || 'Untitled note'}
                  </span>
                  {n.is_private && (
                    <span
                      className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-500 dark:text-slate-400"
                      title={n.owner_id === session?.user.id ? 'Only you can see this' : ''}
                    >
                      🔒 private
                    </span>
                  )}
                </span>
                {n.title && n.body && (
                  <span className="mt-1 block truncate text-sm text-slate-500 dark:text-slate-400">
                    {n.body.split('\n')[0]}
                  </span>
                )}
                <span className="mt-1 block text-xs text-slate-400">
                  {new Date(n.updated_at).toLocaleString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
