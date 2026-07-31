import { FormEvent, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { List } from '../lib/types'
import { useAuth } from '../context/AuthContext'

const EMOJIS = ['🛒', '🏠', '🎉', '🧺', '💊', '📦', '🍱', '✅']
const COLORS = ['#6c63ff', '#2563eb', '#d97706', '#db2777', '#0d9488', '#dc2626']

type ListWithCount = List & { item_count: number }

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function Home() {
  const { session, profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const [lists, setLists] = useState<ListWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(params.get('new') === '1')
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(EMOJIS[0])
  const [color, setColor] = useState(COLORS[0])
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (params.get('new') === '1') {
      setShowCreate(true)
      setParams({}, { replace: true })
    }
  }, [params, setParams])

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
      .select('*, lv_items(count)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    const rows = ((data as (List & { lv_items: { count: number }[] })[]) ?? []).map((l) => ({
      ...l,
      item_count: l.lv_items?.[0]?.count ?? 0
    }))
    setLists(rows)
    setLoading(false)
  }

  async function createList(e: FormEvent) {
    e.preventDefault()
    setError('')
    const trimmed = name.trim()
    if (!trimmed || !session) return
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
    setLists((prev) => [{ ...(data as List), item_count: 0 }, ...prev])
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

  const totalItems = lists.reduce((sum, l) => sum + l.item_count, 0)
  const firstName = (profile?.display_name ?? '').split(' ')[0]

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">{greeting()},</p>
        <h1 className="text-2xl font-extrabold">{firstName || 'there'} 👋</h1>
      </div>

      {/* Gradient hero card */}
      <div className="rounded-3xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 p-5 text-white shadow-lg shadow-brand-600/30">
        <p className="text-sm/relaxed opacity-80">Your vault</p>
        <p className="mt-1 text-2xl font-bold">
          {lists.length} active list{lists.length === 1 ? '' : 's'}
        </p>
        <p className="text-sm opacity-80">{totalItems} item{totalItems === 1 ? '' : 's'} across them</p>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="mt-4 rounded-full bg-white/20 px-4 py-2 text-sm font-semibold backdrop-blur hover:bg-white/30"
        >
          + New list
        </button>
      </div>

      {showCreate && (
        <form onSubmit={createList} className="space-y-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="List name — e.g. Weekly groceries"
            maxLength={120}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-3 focus:border-brand-500 focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => setEmoji(em)}
                className={`rounded-xl p-1.5 text-xl ${emoji === em ? 'bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-800' : 'bg-slate-100 dark:bg-slate-800'}`}
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
                className={`h-7 w-7 rounded-full ${color === c ? 'ring-2 ring-slate-700 ring-offset-2 dark:ring-slate-300' : ''}`}
              />
            ))}
          </div>
          <button className="w-full rounded-full bg-brand-600 py-3 font-semibold text-white hover:bg-brand-700">
            Create list
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <p className="text-slate-500 dark:text-slate-400">Loading…</p>
      ) : lists.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-slate-500 dark:text-slate-400">
          <p className="text-3xl">🛒</p>
          <p className="mt-2">No lists yet. Create one in under 5 seconds.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {lists.map((l) => (
            <Link
              key={l.id}
              to={`/list/${l.id}`}
              className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm transition-colors hover:border-brand-500"
            >
              <span
                className="flex h-11 w-11 items-center justify-center rounded-xl text-xl"
                style={{ backgroundColor: (l.color ?? '#6c63ff') + '22' }}
              >
                {l.emoji ?? '📝'}
              </span>
              <span className="mt-3 block truncate font-semibold">{l.name}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {l.item_count} item{l.item_count === 1 ? '' : 's'}
              </span>
            </Link>
          ))}
        </div>
      )}

      <form onSubmit={joinByCode} className="flex items-center gap-2 pt-2">
        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder="Have a join code? e.g. K7MPQ2"
          maxLength={6}
          className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-2.5 uppercase tracking-widest focus:border-brand-500 focus:outline-none"
        />
        <button className="rounded-full border border-brand-600 px-4 py-2.5 text-sm font-semibold text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-800/20">
          Join
        </button>
      </form>
    </div>
  )
}
