import { FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { List } from '../lib/types'
import { useAuth } from '../context/AuthContext'

const EMOJIS = ['🛒', '🏠', '🎉', '🧺', '💊', '📦', '🍱', '✅']
const COLORS = ['#0d9488', '#2563eb', '#d97706', '#db2777', '#7c3aed', '#dc2626']

export default function Home() {
  const { session } = useAuth()
  const [lists, setLists] = useState<List[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(EMOJIS[0])
  const [color, setColor] = useState(COLORS[0])
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void loadLists()
    // Live-update the home screen when lists change (renames, closes, new shares)
    const channel = supabase
      .channel('home-lists')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_lists' }, () => void loadLists())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_list_members' }, () => void loadLists())
      .subscribe()
    return () => void supabase.removeChannel(channel)
  }, [])

  async function loadLists() {
    const { data } = await supabase
      .from('lv_lists')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    setLists((data as List[]) ?? [])
    setLoading(false)
  }

  async function createList(e: FormEvent) {
    e.preventDefault()
    setError('')
    const trimmed = name.trim()
    if (!trimmed || !session) return
    if (lists.length >= 100) {
      // PRD 5.1 soft cap — warn, don't hard-block
      console.warn('listvault: active list cap (100) hit')
    }
    const { data, error: err } = await supabase
      .from('lv_lists')
      .insert({ name: trimmed, emoji, color, owner_id: session.user.id })
      .select()
      .single()
    if (err) {
      setError(err.message)
      return
    }
    setName('')
    setShowCreate(false)
    setLists((prev) => [data as List, ...prev])
  }

  async function joinByCode(e: FormEvent) {
    e.preventDefault()
    setError('')
    const code = joinCode.trim()
    if (code.length !== 6) {
      setError('Codes are 6 characters')
      return
    }
    const { error: err } = await supabase.rpc('lv_join_list_by_code', { p_code: code })
    if (err) setError(err.message)
    else {
      setJoinCode('')
      void loadLists()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">My lists</h1>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700"
        >
          + New list
        </button>
      </div>

      {showCreate && (
        <form onSubmit={createList} className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="List name — e.g. Weekly groceries"
            maxLength={120}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 focus:border-brand-500 focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => setEmoji(em)}
                className={`rounded-lg p-1.5 text-xl ${emoji === em ? 'bg-brand-100 ring-2 ring-brand-500' : 'bg-slate-100 dark:bg-slate-800'}`}
              >
                {em}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`colour ${c}`}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={`h-7 w-7 rounded-full ${color === c ? 'ring-2 ring-offset-2 ring-slate-700' : ''}`}
              />
            ))}
          </div>
          <button className="w-full rounded-lg bg-brand-600 py-2 font-semibold text-white hover:bg-brand-700">
            Create list
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <p className="text-slate-500 dark:text-slate-400">Loading…</p>
      ) : lists.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-slate-500 dark:text-slate-400">
          <p className="text-3xl">🛒</p>
          <p className="mt-2">No lists yet. Create one in under 5 seconds.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {lists.map((l) => (
            <li key={l.id}>
              <Link
                to={`/list/${l.id}`}
                className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm hover:border-brand-500"
              >
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-xl"
                  style={{ backgroundColor: (l.color ?? '#0d9488') + '22' }}
                >
                  {l.emoji ?? '📝'}
                </span>
                <span className="flex-1 font-medium">{l.name}</span>
                <span className="text-slate-400">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={joinByCode} className="flex items-center gap-2 pt-4">
        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder="Have a join code? e.g. K7MPQ2"
          maxLength={6}
          className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 uppercase tracking-widest focus:border-brand-500 focus:outline-none"
        />
        <button className="rounded-lg border border-brand-600 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 dark:bg-brand-800/20">
          Join
        </button>
      </form>
    </div>
  )
}
