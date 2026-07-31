import { FormEvent, ReactNode, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion, PanInfo } from 'framer-motion'
import confetti from 'canvas-confetti'
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowLeft,
  Check,
  Copy,
  GripVertical,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Send,
  Trash2,
  Users,
  X
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Item, canReopen } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { useKeyboardInset } from '../lib/useKeyboardInset'
import { useListDetail } from '../hooks/useListDetail'
import Avatar from '../components/Avatar'
import { AnimatedCheck, BottomSheet, Page, Skeleton, useConfirm, useToast } from '../components/ui'

const SWIPE_THRESHOLD = 72

export default function ListDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const confirm = useConfirm()
  const toast = useToast()
  const kbInset = useKeyboardInset()
  const {
    list, items, household, loading, notFound, synced, isOwner,
    addItems, toggleItem, editItem, deleteItem, placeItem, assignItem, profileOf
  } = useListDetail(id)

  const [input, setInput] = useState('')
  const [sheet, setSheet] = useState<'members' | 'options' | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [filter, setFilter] = useState<'all' | 'mine'>('all')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const myId = session?.user.id

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
  const matchesFilter = (i: Item) => filter === 'all' || i.assigned_to === myId
  const unchecked = items.filter((i) => !i.checked)
  const checked = items.filter((i) => i.checked)
  const uncheckedVisible = unchecked.filter(matchesFilter)
  const checkedVisible = checked.filter(matchesFilter)
  const pct = items.length === 0 ? 0 : Math.round((checked.length / items.length) * 100)
  const myOpenCount = unchecked.filter((i) => i.assigned_to === myId).length

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

  /** Toggle with a celebration when the last open task gets done. */
  function handleToggle(item: Item) {
    if (!item.checked && unchecked.length === 1) {
      confetti({ particleCount: 110, spread: 75, origin: { y: 0.75 }, colors: ['#6c63ff', '#8b83ff', '#ffd166', '#25D366'] })
      toast('Sab ho gaya! 🎉')
    }
    void toggleItem(item)
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = unchecked.findIndex((i) => i.id === active.id)
    const newIdx = unchecked.findIndex((i) => i.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const next = arrayMove(unchecked, oldIdx, newIdx)
    const at = next.findIndex((i) => i.id === active.id)
    const before = next[at - 1]?.position
    const after = next[at + 1]?.position
    const newPos =
      before !== undefined && after !== undefined
        ? (before + after) / 2
        : before !== undefined
          ? before + 1
          : after !== undefined
            ? after - 1
            : 1
    void placeItem(next[at], newPos)
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

  async function duplicate(includeChecked: boolean) {
    const { data, error } = await supabase.rpc('lv_duplicate_list', { p_list_id: id, p_include_checked: includeChecked })
    if (error) toast(error.message)
    else {
      toast('List duplicated')
      navigate(`/list/${data}`)
    }
  }

  /** Reset all done tasks back to open — great for reusing a grocery list. */
  async function uncheckAll() {
    const { error } = await supabase
      .from('lv_items')
      .update({ checked: false, checked_by: null, checked_at: null })
      .eq('list_id', id)
      .eq('checked', true)
    if (error) toast(error.message)
    else toast('All tasks reset')
  }

  async function clearCompleted() {
    if (!(await confirm(`Clear ${checked.length} completed task${checked.length === 1 ? '' : 's'}?`, {
      body: 'They are removed from this list for everyone.',
      confirmLabel: 'Clear',
      danger: true
    }))) return
    const { error } = await supabase.from('lv_items').delete().eq('list_id', id).eq('checked', true)
    if (error) toast(error.message)
    else toast('Completed tasks cleared')
  }

  function onSwipeEnd(item: Item, info: PanInfo) {
    if (info.offset.x > SWIPE_THRESHOLD) {
      handleToggle(item)
    } else if (info.offset.x < -SWIPE_THRESHOLD) {
      void deleteItem(item)
      toast('Task deleted')
    }
  }

  function rowBody(item: Item, dragHandle?: ReactNode) {
    const addedBy = profileOf(item.added_by)
    const checkedBy = profileOf(item.checked_by)
    const assignee = profileOf(item.assigned_to)
    const isExpanded = expanded === item.id
    const swipeable = !archived && editing !== item.id

    const row = (
      <div className="relative">
        {/* swipe action hints behind the row */}
        {swipeable && (
          <div className="absolute inset-0 flex items-center justify-between rounded-[20px] px-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check size={16} strokeWidth={3} />
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white">
              <Trash2 size={15} />
            </span>
          </div>
        )}
        <motion.div
          drag={swipeable ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: 0.35, right: 0.35 }}
          dragSnapToOrigin
          onDragEnd={(_, info) => onSwipeEnd(item, info)}
          className="relative flex items-center gap-2.5 rounded-[20px] bg-white px-3 py-3 [touch-action:pan-y] dark:bg-ink-900"
        >
          {dragHandle}
          <AnimatedCheck checked={item.checked} disabled={archived} onToggle={() => handleToggle(item)} />
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
              className={`min-w-0 flex-1 text-left text-[15px] transition-colors ${item.checked ? 'text-ink-400 line-through' : ''}`}
              onClick={() => setExpanded(isExpanded ? null : item.id)}
            >
              <span className="block truncate">{item.text}</span>
              {assignee && !item.checked && (
                <span className={`mt-0.5 block text-xs ${item.assigned_to === myId ? 'font-semibold text-brand-600' : 'text-ink-400'}`}>
                  for {item.assigned_to === myId ? 'you' : assignee.display_name?.split(' ')[0] || 'someone'}
                </span>
              )}
            </button>
          )}
          <span className="flex shrink-0 -space-x-1.5">
            {assignee && !item.checked ? (
              <span className="rounded-full ring-2 ring-brand-500/70">
                <Avatar profile={assignee} size={6} />
              </span>
            ) : (
              addedBy && <Avatar profile={addedBy} size={5} />
            )}
            {checkedBy && item.checked && <Avatar profile={checkedBy} size={5} />}
          </span>
        </motion.div>
      </div>
    )

    return (
      <>
        {row}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <div className="border-t border-ink-100 px-4 py-3 dark:border-ink-800">
                {/* Assignment */}
                {!archived && household.length > 1 && (
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="text-xs font-semibold text-ink-500 dark:text-ink-400">For:</span>
                    {household.map((p) => {
                      const selected = item.assigned_to === p.id
                      return (
                        <motion.button
                          key={p.id}
                          whileTap={{ scale: 0.85 }}
                          onClick={() => void assignItem(item, selected ? null : p.id)}
                          title={p.display_name || p.email || ''}
                          className={`rounded-full transition-all ${selected ? 'ring-2 ring-brand-500 ring-offset-2 dark:ring-offset-ink-900' : 'opacity-55 hover:opacity-100'}`}
                        >
                          <Avatar profile={p} size={8} />
                        </motion.button>
                      )
                    })}
                    {item.assigned_to && (
                      <button onClick={() => void assignItem(item, null)} aria-label="Unassign" className="icon-btn h-7 w-7">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                )}
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  Added by <strong>{addedBy?.display_name ?? 'someone'}</strong> ·{' '}
                  {new Date(item.created_at).toLocaleString()}
                </p>
                {item.checked && item.checked_at && (
                  <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
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
                    <button className="icon-btn h-8 w-8 text-red-500" aria-label="Delete" onClick={() => void deleteItem(item)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    )
  }

  function SortableRow({ item }: { item: Item }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
    return (
      <li
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className={`surface overflow-hidden ${item.pending ? 'opacity-60' : ''} ${
          isDragging ? 'z-10 shadow-float ring-2 ring-brand-500/40' : ''
        }`}
      >
        {rowBody(
          item,
          archived ? undefined : (
            <button
              {...attributes}
              {...listeners}
              aria-label="Drag to reorder"
              className="-ml-1 cursor-grab touch-none p-1 text-ink-300 active:cursor-grabbing dark:text-ink-600"
            >
              <GripVertical size={17} />
            </button>
          )
        )}
      </li>
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

      {/* All / Mine filter */}
      {household.length > 1 && items.length > 0 && (
        <div className="flex gap-2">
          {(['all', 'mine'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-all active:scale-95 ${
                filter === f
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                  : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400'
              }`}
            >
              {f === 'all' ? 'All tasks' : `For me${myOpenCount > 0 ? ` · ${myOpenCount}` : ''}`}
            </button>
          ))}
        </div>
      )}

      {/* Tasks — drag the grip to reorder, swipe right to finish, left to delete */}
      {items.length === 0 && !archived && (
        <p className="pt-8 text-center text-sm text-ink-400">No tasks yet — add the first one below.</p>
      )}
      {items.length > 0 && uncheckedVisible.length === 0 && checkedVisible.length === 0 && (
        <p className="pt-8 text-center text-sm text-ink-400">Nothing assigned to you here. Enjoy the break ☕</p>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
        <SortableContext items={uncheckedVisible.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {uncheckedVisible.map((item) => (
              <SortableRow key={item.id} item={item} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {checkedVisible.length > 0 && (
        <>
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Done · {checkedVisible.length}</p>
            {!archived && (
              <span className="flex gap-1">
                <button
                  onClick={() => void uncheckAll()}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-800/20"
                >
                  <RotateCcw size={12} /> Reset
                </button>
                <button
                  onClick={() => void clearCompleted()}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-ink-500 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800"
                >
                  <Trash2 size={12} /> Clear
                </button>
              </span>
            )}
          </div>
          <ul className="space-y-2">
            {checkedVisible.map((item) => (
              <li key={item.id} className={`surface overflow-hidden ${item.pending ? 'opacity-60' : ''}`}>
                {rowBody(item)}
              </li>
            ))}
          </ul>
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
            <button
              onClick={() => void supabase.from('lv_lists').update({ status: 'active', closed_at: null }).eq('id', id)}
              className="w-full py-2 text-sm font-medium text-ink-500 dark:text-ink-400"
            >
              Reopen (within 24h)
            </button>
          )}
        </div>
      )}

      {/* Quick add — pinned above nav, lifts above the iOS keyboard */}
      {!archived && (
        <form
          onSubmit={submit}
          className="fixed inset-x-0 z-10 mx-auto max-w-2xl px-5 pb-2 transition-[bottom] duration-150"
          style={{ bottom: kbInset > 0 ? kbInset + 8 : 68 }}
        >
          <div className="flex items-center gap-2 rounded-full bg-white p-1.5 pl-5 shadow-float ring-1 ring-ink-100 dark:bg-ink-900 dark:ring-ink-700">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Add a task…"
              className="min-w-0 flex-1 bg-transparent text-[16px] placeholder:text-ink-400 focus:outline-none"
            />
            <motion.button
              whileTap={{ scale: 0.85 }}
              disabled={!input.trim()}
              aria-label="Add task"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-md shadow-brand-600/30 disabled:opacity-40"
            >
              <Send size={17} />
            </motion.button>
          </div>
        </form>
      )}

      {/* Household sheet */}
      <BottomSheet open={sheet === 'members'} onClose={() => setSheet(null)} title={`Our home · ${household.length}`}>
        <div className="space-y-4 pb-1">
          <p className="text-sm text-ink-500 dark:text-ink-400">
            Everyone in HaMaara shares this list automatically — no invites needed. Admins add
            people from the Admin page.
          </p>
          <ul className="space-y-3">
            {household.map((m) => (
              <li key={m.id} className="flex items-center gap-3">
                <Avatar profile={m} size={9} />
                <span className="flex-1 text-sm font-semibold">
                  {m.display_name || m.email}
                  {m.id === session?.user.id && ' (you)'}
                </span>
                {m.id === list.owner_id && (
                  <span className="text-xs uppercase tracking-wide text-ink-400">created it</span>
                )}
              </li>
            ))}
          </ul>
        </div>
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
