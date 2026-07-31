import { FormEvent, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Item, canReopen } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { useListDetail } from '../hooks/useListDetail'
import Avatar from '../components/Avatar'

export default function ListDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const {
    list, items, members, loading, notFound, synced, isOwner,
    addItems, toggleItem, editItem, deleteItem, moveItem, profileOf
  } = useListDetail(id)

  const [input, setInput] = useState('')
  const [showShare, setShowShare] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [error, setError] = useState('')

  if (loading) return <p className="text-slate-500 dark:text-slate-400">Loading…</p>
  if (notFound || !list)
    return (
      <div className="text-center text-slate-500 dark:text-slate-400">
        <p>This list doesn’t exist or you’re not a member.</p>
        <Link className="text-brand-700 underline" to="/">Back to my lists</Link>
      </div>
    )

  const archived = list.status === 'archived'
  const shareUrl = `${window.location.origin}/j/${list.join_code}`
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
    `Join my list "${list.name}" on ListVault: ${shareUrl}`
  )}`

  async function submit(e: FormEvent) {
    e.preventDefault()
    const text = input
    setInput('')
    try {
      await addItems(text)
    } catch (err) {
      setError((err as Error).message)
      setInput(text)
    }
  }

  async function closeList() {
    if (!confirm(`Close "${list!.name}"? It moves to your Archive and becomes read-only. You can reopen within 24 hours.`)) return
    await supabase.from('lv_lists').update({ status: 'archived', closed_at: new Date().toISOString() }).eq('id', id)
  }

  async function reopenList() {
    await supabase.from('lv_lists').update({ status: 'active', closed_at: null }).eq('id', id)
  }

  async function deleteList() {
    if (!confirm(`Permanently delete "${list!.name}" and all its items? This cannot be undone.`)) return
    await supabase.from('lv_lists').delete().eq('id', id)
    navigate('/')
  }

  async function renameList() {
    const name = prompt('Rename list', list!.name)?.trim()
    if (!name) return
    await supabase.from('lv_lists').update({ name }).eq('id', id)
  }

  async function regenerateCode() {
    if (!confirm('Regenerate the join code? The old link stops working.')) return
    const { error: err } = await supabase.rpc('lv_regenerate_join_code', { p_list_id: id })
    if (err) setError(err.message)
  }

  async function removeMember(userId: string) {
    if (!confirm('Remove this member from the list?')) return
    await supabase.from('lv_list_members').delete().eq('list_id', id).eq('user_id', userId)
  }

  async function duplicate(includeChecked: boolean) {
    const { data, error: err } = await supabase.rpc('lv_duplicate_list', {
      p_list_id: id,
      p_include_checked: includeChecked
    })
    if (err) setError(err.message)
    else navigate(`/list/${data}`)
  }

  const unchecked = items.filter((i) => !i.checked)
  const checked = items.filter((i) => i.checked)

  function renderItem(item: Item) {
    const addedBy = profileOf(item.added_by)
    const checkedBy = profileOf(item.checked_by)
    const expanded = expandedItem === item.id
    return (
      <li key={item.id} className={`rounded-lg border bg-white dark:bg-slate-900 ${item.pending ? 'opacity-60' : ''} border-slate-200 dark:border-slate-800`}>
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            disabled={archived}
            onClick={() => void toggleItem(item)}
            aria-label={item.checked ? 'Uncheck' : 'Check'}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
              item.checked ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 dark:border-slate-700'
            } ${archived ? 'opacity-50' : ''}`}
          >
            {item.checked && '✓'}
          </button>
          {editing === item.id ? (
            <form
              className="flex-1"
              onSubmit={(e) => {
                e.preventDefault()
                void editItem(item, editText)
                setEditing(null)
              }}
            >
              <input
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={() => {
                  void editItem(item, editText)
                  setEditing(null)
                }}
                className="w-full rounded border border-brand-500 px-2 py-1 focus:outline-none"
              />
            </form>
          ) : (
            <button
              className={`flex-1 text-left ${item.checked ? 'text-slate-400 line-through' : ''}`}
              onClick={() => setExpandedItem(expanded ? null : item.id)}
            >
              {item.text}
            </button>
          )}
          <span className="flex -space-x-1.5">
            {addedBy && <Avatar profile={addedBy} size={5} />}
            {checkedBy && item.checked && checkedBy.id !== addedBy?.id && <Avatar profile={checkedBy} size={5} />}
          </span>
        </div>
        {expanded && (
          <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
            <p>
              Added by <strong>{addedBy?.display_name ?? 'someone'}</strong>{' '}
              {new Date(item.created_at).toLocaleString()}
            </p>
            {item.checked && item.checked_at && (
              <p>
                Checked by <strong>{checkedBy?.display_name ?? 'someone'}</strong>{' '}
                {new Date(item.checked_at).toLocaleString()}
              </p>
            )}
            {!archived && (
              <div className="mt-2 flex gap-3">
                <button
                  className="text-brand-700 underline"
                  onClick={() => {
                    setEditing(item.id)
                    setEditText(item.text)
                    setExpandedItem(null)
                  }}
                >
                  Edit
                </button>
                <button className="underline" onClick={() => void moveItem(item, -1)}>Move up</button>
                <button className="underline" onClick={() => void moveItem(item, 1)}>Move down</button>
                <button className="text-red-600 dark:text-red-400 underline" onClick={() => void deleteItem(item)}>Delete</button>
              </div>
            )}
          </div>
        )}
      </li>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{list.emoji ?? '📝'}</span>
          <div>
            <h1 className="text-xl font-bold leading-tight">{list.name}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {archived
                ? `Archived ${list.closed_at ? new Date(list.closed_at).toLocaleDateString() : ''}`
                : synced
                  ? '✓ Synced'
                  : 'Syncing…'}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setShowMembers((s) => !s)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-sm"
            aria-label="Members"
          >
            👥 {members.length}
          </button>
          {!archived && (
            <button
              onClick={() => setShowShare((s) => !s)}
              className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-sm font-medium text-white"
            >
              Share
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {showShare && !archived && (
        <div className="space-y-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-sm shadow-sm">
          <p className="font-semibold">Invite people</p>
          <p>
            Join code:{' '}
            <code className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-base font-bold tracking-widest">
              {list.join_code}
            </code>
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-green-600 px-3 py-1.5 font-medium text-white"
            >
              Share on WhatsApp
            </a>
            <button
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5"
              onClick={() => void navigator.clipboard.writeText(shareUrl)}
            >
              Copy link
            </button>
            {isOwner && (
              <button className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5" onClick={() => void regenerateCode()}>
                Regenerate code
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Anyone with the link joins as an editor.</p>
        </div>
      )}

      {showMembers && (
        <ul className="space-y-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-sm shadow-sm">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-2">
              <Avatar profile={m.profile} size={6} />
              <span className="flex-1">
                {m.profile?.display_name ?? 'Member'}
                {m.user_id === session?.user.id && ' (you)'}
              </span>
              <span className="text-xs uppercase text-slate-400">{m.role}</span>
              {isOwner && m.role !== 'owner' && (
                <button className="text-xs text-red-600 dark:text-red-400 underline" onClick={() => void removeMember(m.user_id)}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!archived && (
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add items — one per line"
            className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 focus:border-brand-500 focus:outline-none"
          />
          <button className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700">
            Add
          </button>
        </form>
      )}

      <ul className="space-y-1.5">{unchecked.map(renderItem)}</ul>

      {checked.length > 0 && (
        <>
          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Done ({checked.length})
          </p>
          <ul className="space-y-1.5">{checked.map(renderItem)}</ul>
        </>
      )}

      <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
        {archived && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void duplicate(true)}
              className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Duplicate to new list
            </button>
            <button
              onClick={() => void duplicate(false)}
              className="rounded-lg border border-brand-600 px-3 py-2 text-sm font-semibold text-brand-700"
            >
              Duplicate without checked items
            </button>
            {isOwner && canReopen(list) && (
              <button onClick={() => void reopenList()} className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm">
                Reopen (within 24h)
              </button>
            )}
          </div>
        )}
        {isOwner && (
          <div className="flex flex-wrap gap-3 text-sm">
            {!archived && (
              <>
                <button className="text-slate-600 dark:text-slate-300 underline" onClick={() => void renameList()}>Rename</button>
                <button className="text-slate-600 dark:text-slate-300 underline" onClick={() => void closeList()}>
                  Close &amp; archive
                </button>
              </>
            )}
            <button className="text-red-600 dark:text-red-400 underline" onClick={() => void deleteList()}>Delete list</button>
          </div>
        )}
      </div>
    </div>
  )
}
