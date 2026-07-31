import { FormEvent, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Copy,
  MoreHorizontal,
  Pencil,
  Send,
  Share2,
  Trash2,
  Users
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Item, canReopen } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { useListDetail } from '../hooks/useListDetail'
import Avatar from '../components/Avatar'
import { AnimatedCheck, BottomSheet, Page, Skeleton, useConfirm, useToast } from '../components/ui'

export default function ListDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const confirm = useConfirm()
  const toast = useToast()
  const {
    list, items, members, loading, notFound, synced, isOwner,
    addItems, toggleItem, editItem, deleteItem, moveItem, profileOf
  } = useListDetail(id)

  const [input, setInput] = useState('')
  const [sheet, setSheet] = useState<'share' | 'members' | 'options' | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  if (loading)
    return (
      <div className="space-y-3 pt-2">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    )

  if (notFound || !list)
    return (
      <Page className="pt-16 text-center text-ink-500 dark:text-ink-400">
        <p>This list doesn’t exist or you’re not a member.</p>
        <Link className="mt-2 inline-block font-semibold text-brand-600" to="/">
          Back to my lists
        </Link>
      </Page>
    )

  const archived = list.status === 'archived'
  const shareUrl = `${window.location.origin}/j/${list.join_code}`
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Join my list "${list.name}" on ListVault: ${shareUrl}`)}`
  const unchecked = items.filter((i) => !i.checked)
  const checked = items.filter((i) => i.checked)
  const pct = items.length === 0 ? 0 : Math.round((checked.length / items.length) * 100)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const text = input
    setInput('')
    try {
      await addItems(text)
    } catch (err) {
      toast((err as Error).message)
      setInput(text)
    }
  }

  async function closeList() {
    if (!(await confirm(`Close “${list!.name}”?`, {
      body: 'It moves to your Archive and becomes read-only. You can reopen it within 24 hours.',
      confirmLabel: 'Close list'
    }))) return
    setSheet(null)
    await supabase.from('lv_lists').update({ status: 'archived', closed_at: new Date().toISOString() }).eq('id', id)
    toast('Moved to Archive')
  }

  async function deleteList() {
    if (!(await confirm(`Delete “${list!.name}” forever?`, {
      body: 'The list and all its tasks are permanently removed. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true
    }))) return
    await supabase.from('lv_lists').delete().eq('id', id)
    navigate('/')
    toast('List deleted')
  }

  async function renameList() {
    const name = prompt('Rename list', list!.name)?.trim()
    if (!name) return
    await supabase.from('lv_lists').update({ name }).eq('id', id)
  }

  async function regenerateCode() {
    if (!(await confirm('Regenerate the join code?', { body: 'The old link and code stop working immediately.', confirmLabel: 'Regenerate' }))) return
    const { error } = await supabase.rpc('lv_regenerate_join_code', { p_list_id: id })
    if (error) toast(error.message)
    else toast('New code generated')
  }

  async function removeMember(userId: string, name: string) {
    if (!(await confirm(`Remove ${name}?`, { body: 'They lose access to this list.', confirmLabel: 'Remove', danger: true }))) return
    await supabase.from('lv_list_members').delete().eq('list_id', id).eq('user_id', userId)
  }

  async function duplicate(includeChecked: boolean) {
    const { data, error } = await supabase.rpc('lv_duplicate_list', { p_list_id: id, p_include_checked: includeChecked })
    if (error) toast(error.message)
    else {
      toast('List duplicated')
      navigate(`/list/${data}`)
    }
  }

  function renderItem(item: Item) {
    const addedBy = profileOf(item.added_by)
    const checkedBy = profileOf(item.checked_by)
    const isExpanded = expanded === item.id
    return (
      <motion.li
        key={item.id}
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }}
        transition={{ type: 'spring', damping: 26, stiffness: 340 }}
        className={`surface overflow-hidden ${item.pending ? 'opacity-60' : ''}`}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <AnimatedCheck checked={item.checked} disabled={archived} onToggle={() => void toggleItem(item)} />
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
                className="w-full rounded-lg bg-ink-100 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500/60 dark:bg-ink-800"
              />
            </form>
          ) : (
            <button
              className={`flex-1 text-left text-[15px] transition-colors ${
                item.checked ? 'text-ink-400 line-through' : ''
              }`}
              onClick={() => setExpanded(isExpanded ? null : item.id)}
            >
              {item.text}
            </button>
          )}
          <span className="flex -space-x-1.5">
            {addedBy && <Avatar profile={addedBy} size={5} />}
            {checkedBy && item.checked && checkedBy.id !== addedBy?.id && <Avatar profile={checkedBy} size={5} />}
          </span>
        </div>
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <div className="border-t border-ink-100 px-4 py-2.5 text-xs text-ink-500 dark:border-ink-800 dark:text-ink-400">
                <p>
                  Added by <strong>{addedBy?.display_name ?? 'someone'}</strong> ·{' '}
                  {new Date(item.created_at).toLocaleString()}
                </p>
                {item.checked && item.checked_at && (
                  <p className="mt-0.5">
                    Done by <strong>{checkedBy?.display_name ?? 'someone'}</strong> ·{' '}
                    {new Date(item.checked_at).toLocaleString()}
                  </p>
                )}
                {!archived && (
                  <div className="mt-2 flex gap-1">
                    <button
                      className="icon-btn h-8 w-8"
                      aria-label="Edit"
                      onClick={() => {
                        setEditing(item.id)
                        setEditText(item.text)
                        setExpanded(null)
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                    <button className="icon-btn h-8 w-8" aria-label="Move up" onClick={() => void moveItem(item, -1)}>
                      <ArrowUp size={15} />
                    </button>
                    <button className="icon-btn h-8 w-8" aria-label="Move down" onClick={() => void moveItem(item, 1)}>
                      <ArrowDown size={15} />
                    </button>
                    <button
                      className="icon-btn h-8 w-8 text-red-500"
                      aria-label="Delete"
                      onClick={() => void deleteItem(item)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.li>
    )
  }

  return (
    <Page className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="icon-btn -ml-2" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <span className="text-2xl">{list.emoji ?? '📝'}</span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold leading-tight">{list.name}</h1>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            {archived
              ? `Archived ${list.closed_at ? new Date(list.closed_at).toLocaleDateString() : ''}`
              : synced
                ? `${checked.length}/${items.length} done · synced`
                : 'Syncing…'}
          </p>
        </div>
        <button onClick={() => setSheet('members')} className="icon-btn" aria-label="Members">
          <Users size={19} />
        </button>
        {!archived && (
          <button onClick={() => setSheet('share')} className="icon-btn text-brand-600" aria-label="Share">
            <Share2 size={19} />
          </button>
        )}
        <button onClick={() => setSheet('options')} className="icon-btn" aria-label="More">
          <MoreHorizontal size={19} />
        </button>
      </div>

      {/* Progress */}
      {items.length > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
          <motion.div
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
            className="h-full rounded-full"
            style={{ backgroundColor: list.color ?? '#6c63ff' }}
          />
        </div>
      )}

      {/* Tasks */}
      {items.length === 0 && !archived && (
        <p className="pt-8 text-center text-sm text-ink-400">No tasks yet — add the first one below.</p>
      )}
      <motion.ul layout className="space-y-2">
        <AnimatePresence mode="popLayout">{unchecked.map(renderItem)}</AnimatePresence>
      </motion.ul>
      {checked.length > 0 && (
        <>
          <p className="pt-1 text-xs font-bold uppercase tracking-wider text-ink-400">Done · {checked.length}</p>
          <motion.ul layout className="space-y-2">
            <AnimatePresence mode="popLayout">{checked.map(renderItem)}</AnimatePresence>
          </motion.ul>
        </>
      )}

      {/* Archived actions */}
      {archived && (
        <div className="space-y-2.5 pt-2">
          <button onClick={() => void duplicate(true)} className="btn-primary flex w-full items-center justify-center gap-2 py-3.5">
            <Copy size={17} /> Duplicate to a new list
          </button>
          <button onClick={() => void duplicate(false)} className="btn-ghost w-full border border-brand-200 py-3 text-sm dark:border-brand-800">
            Duplicate without completed tasks
          </button>
          {isOwner && canReopen(list) && (
            <button onClick={() => void supabase.from('lv_lists').update({ status: 'active', closed_at: null }).eq('id', id)} className="w-full py-2 text-sm font-medium text-ink-500 dark:text-ink-400">
              Reopen (within 24h)
            </button>
          )}
        </div>
      )}

      {/* Quick add — pinned above nav */}
      {!archived && (
        <form
          onSubmit={submit}
          className="fixed inset-x-0 bottom-[68px] z-10 mx-auto max-w-2xl px-5 pb-2"
        >
          <div className="flex items-center gap-2 rounded-full bg-white p-1.5 pl-5 shadow-float ring-1 ring-ink-100 dark:bg-ink-900 dark:ring-ink-700">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Add a task…"
              className="flex-1 bg-transparent text-[15px] placeholder:text-ink-400 focus:outline-none"
            />
            <motion.button
              whileTap={{ scale: 0.85 }}
              disabled={!input.trim()}
              aria-label="Add task"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white shadow-md shadow-brand-600/30 disabled:opacity-40"
            >
              <Send size={17} />
            </motion.button>
          </div>
        </form>
      )}

      {/* Share sheet */}
      <BottomSheet open={sheet === 'share'} onClose={() => setSheet(null)} title="Invite people">
        <div className="space-y-4 pb-1">
          <div className="flex items-center justify-between rounded-2xl bg-ink-100 px-5 py-4 dark:bg-ink-800">
            <span className="text-2xl font-extrabold tracking-[0.3em]">{list.join_code}</span>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(shareUrl)
                toast('Link copied')
              }}
              className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-sm"
            >
              <Copy size={15} /> Copy link
            </button>
          </div>
          <a href={whatsappUrl} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] py-3.5 font-semibold text-white shadow-lg shadow-[#25D366]/30 active:scale-[0.98]">
            Share on WhatsApp
          </a>
          <p className="text-center text-xs text-ink-400">Anyone with the link or code joins as an editor.</p>
          {isOwner && (
            <button onClick={() => void regenerateCode()} className="w-full text-center text-sm font-medium text-ink-500 underline-offset-2 hover:underline dark:text-ink-400">
              Regenerate code
            </button>
          )}
        </div>
      </BottomSheet>

      {/* Members sheet */}
      <BottomSheet open={sheet === 'members'} onClose={() => setSheet(null)} title={`Members · ${members.length}`}>
        <ul className="space-y-3 pb-1">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3">
              <Avatar profile={m.profile} size={9} />
              <span className="flex-1">
                <span className="block text-sm font-semibold">
                  {m.profile?.display_name ?? 'Member'}
                  {m.user_id === session?.user.id && ' (you)'}
                </span>
                <span className="text-xs uppercase tracking-wide text-ink-400">{m.role}</span>
              </span>
              {isOwner && m.role !== 'owner' && (
                <button
                  className="text-xs font-medium text-red-500"
                  onClick={() => void removeMember(m.user_id, m.profile?.display_name ?? 'this member')}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </BottomSheet>

      {/* Options sheet */}
      <BottomSheet open={sheet === 'options'} onClose={() => setSheet(null)} title="List options">
        <div className="space-y-1 pb-1">
          {isOwner && !archived && (
            <>
              <button onClick={() => { setSheet(null); void renameList() }} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left font-medium hover:bg-ink-100 dark:hover:bg-ink-800">
                <Pencil size={18} className="text-ink-400" /> Rename list
              </button>
              <button onClick={() => void closeList()} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left font-medium hover:bg-ink-100 dark:hover:bg-ink-800">
                <Check size={18} className="text-ink-400" /> Close &amp; archive
              </button>
            </>
          )}
          {isOwner && (
            <button onClick={() => { setSheet(null); void deleteList() }} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
              <Trash2 size={18} /> Delete list
            </button>
          )}
          {!isOwner && <p className="px-3 py-2 text-sm text-ink-400">Only the owner can manage this list.</p>}
        </div>
      </BottomSheet>
    </Page>
  )
}
