/**
 * Creation flows: TaskComposer (add tasks to any list, one per line, with an
 * inline new-list path) and ListComposer (name + emoji + colour). Both are
 * bottom sheets reachable from the FAB on every screen.
 */
import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { List } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { BottomSheet, useToast } from './ui'

export const LIST_EMOJIS = ['🛒', '🏠', '🎉', '🧺', '💊', '📦', '🍱', '✅']
export const LIST_COLORS = ['#948ce9', '#93bff2', '#f4c17e', '#f0a2c0', '#7fcfbf', '#ef9f9f']

export function ListComposer({
  open,
  onClose,
  onCreated
}: {
  open: boolean
  onClose: () => void
  onCreated?: (list: List) => void
}) {
  const { session } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(LIST_EMOJIS[0])
  const [color, setColor] = useState(LIST_COLORS[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !session) return
    setBusy(true)
    setError('')
    const { data, error: err } = await supabase
      .from('lv_lists')
      .insert({ name: name.trim(), emoji, color, owner_id: session.user.id })
      .select()
      .single()
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    setName('')
    onClose()
    toast('List created')
    if (onCreated) onCreated(data as List)
    else navigate(`/list/${(data as List).id}`)
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="New list">
      <form onSubmit={create} className="space-y-4 pb-1">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="List name — e.g. Weekly groceries"
          maxLength={120}
          className="field"
        />
        <div className="flex flex-wrap gap-2">
          {LIST_EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => setEmoji(em)}
              className={`rounded-2xl p-2 text-xl transition-all active:scale-90 ${
                emoji === em ? 'bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-800/40' : 'bg-ink-100 dark:bg-ink-800'
              }`}
            >
              {em}
            </button>
          ))}
        </div>
        <div className="flex gap-2.5">
          {LIST_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`colour ${c}`}
              onClick={() => setColor(c)}
              style={{ backgroundColor: c }}
              className={`h-8 w-8 rounded-full transition-transform active:scale-90 ${
                color === c ? 'ring-2 ring-ink-700 ring-offset-2 dark:ring-ink-200 dark:ring-offset-ink-900' : ''
              }`}
            />
          ))}
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button disabled={busy || !name.trim()} className="btn-primary w-full py-3.5">
          {busy ? 'Creating…' : 'Create list'}
        </button>
      </form>
    </BottomSheet>
  )
}

export function TaskComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session } = useAuth()
  const toast = useToast()
  const [lists, setLists] = useState<List[]>([])
  const [target, setTarget] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showNewList, setShowNewList] = useState(false)

  useEffect(() => {
    if (!open) return
    supabase
      .from('lv_lists')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const rows = (data as List[]) ?? []
        setLists(rows)
        setTarget((t) => t ?? rows[0]?.id ?? null)
      })
  }, [open])

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!session || !target) return
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.slice(0, 500))
    if (lines.length === 0) return
    setBusy(true)
    setError('')
    const { data: existing } = await supabase
      .from('lv_items')
      .select('position')
      .eq('list_id', target)
      .order('position', { ascending: false })
      .limit(1)
    const base = ((existing?.[0]?.position as number | undefined) ?? 0) + 1
    const { error: err } = await supabase.from('lv_items').insert(
      lines.map((t, i) => ({
        list_id: target,
        text: t,
        added_by: session.user.id,
        position: base + i
      }))
    )
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    setText('')
    onClose()
    toast(lines.length === 1 ? 'Task added' : `${lines.length} tasks added`)
  }

  return (
    <>
      <BottomSheet open={open && !showNewList} onClose={onClose} title="Add tasks">
        <form onSubmit={add} className="space-y-4 pb-1">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {lists.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setTarget(l.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all active:scale-95 ${
                  target === l.id
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                    : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300'
                }`}
              >
                <span>{l.emoji ?? '📝'}</span>
                {l.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowNewList(true)}
              className="shrink-0 rounded-full border border-dashed border-ink-300 px-3.5 py-2 text-sm font-medium text-ink-500 dark:border-ink-600 dark:text-ink-400"
            >
              + New list
            </button>
          </div>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Milk\nBread\nCall the electrician…\n\nOne task per line'}
            rows={5}
            className="field resize-none leading-relaxed"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button disabled={busy || !text.trim() || !target} className="btn-primary w-full py-3.5">
            {busy ? 'Adding…' : 'Add to list'}
          </button>
        </form>
      </BottomSheet>
      <ListComposer
        open={open && showNewList}
        onClose={() => setShowNewList(false)}
        onCreated={(l) => {
          setLists((prev) => [l, ...prev])
          setTarget(l.id)
          setShowNewList(false)
        }}
      />
    </>
  )
}
