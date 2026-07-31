import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Lock, NotebookPen, Pin, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Note } from '../lib/types'
import { NOTE_COLORS, noteColorKey } from '../lib/noteColors'
import { EmptyState, Page, Skeleton, useToast } from '../components/ui'

function NoteCard({
  note,
  sortable,
  onOpen
}: {
  note: Note
  sortable: boolean
  onOpen: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: note.id,
    disabled: !sortable
  })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`select-none rounded-[20px] p-4 shadow-card transition-shadow ${NOTE_COLORS[noteColorKey(note)].card} ${
        isDragging ? 'z-10 opacity-90 shadow-float ring-2 ring-brand-500/40' : 'hover:shadow-float'
      }`}
    >
      <span className="flex items-start gap-1.5">
        <span className="flex-1 font-bold leading-snug">
          {note.title || note.body.slice(0, 60) || 'Untitled note'}
        </span>
        {note.pinned && <Pin size={14} className="mt-1 shrink-0 fill-current text-brand-600 dark:text-brand-400" />}
        {note.is_private && <Lock size={14} className="mt-1 shrink-0 text-ink-500 dark:text-ink-400" />}
      </span>
      {note.title && note.body && (
        <span className="mt-1.5 block overflow-hidden text-sm leading-relaxed text-ink-600 [-webkit-box-orient:vertical] [-webkit-line-clamp:4] [display:-webkit-box] dark:text-ink-300">
          {note.body}
        </span>
      )}
      <span className="mt-2.5 block text-xs font-medium text-ink-500 dark:text-ink-400">
        {new Date(note.updated_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
      </span>
    </div>
  )
}

export default function Notes() {
  const navigate = useNavigate()
  const toast = useToast()
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const draggingRef = useRef(false)

  // Long-press (200ms) to pick up a card; a plain tap opens it.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 8 } }))

  useEffect(() => {
    void load()
    const channel = supabase
      .channel('notes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_notes' }, () => void load())
      .subscribe()
    return () => void supabase.removeChannel(channel)
  }, [])

  async function load() {
    const { data } = await supabase.from('lv_notes').select('*').order('position', { ascending: false })
    setNotes((data as Note[]) ?? [])
    setLoading(false)
  }

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const matched = q
      ? notes.filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
      : notes
    // pinned first; stable sort keeps position order within each group
    return [...matched].sort((a, b) => Number(b.pinned) - Number(a.pinned))
  }, [notes, filter])

  const sortable = filter.trim() === ''

  async function onDragEnd(e: DragEndEvent) {
    setTimeout(() => (draggingRef.current = false), 50)
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = notes.findIndex((n) => n.id === active.id)
    const newIdx = notes.findIndex((n) => n.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const next = arrayMove(notes, oldIdx, newIdx)
    setNotes(next)
    const at = next.findIndex((n) => n.id === active.id)
    // descending order: earlier card = larger position
    const before = next[at - 1]?.position
    const after = next[at + 1]?.position
    const newPos =
      before !== undefined && after !== undefined
        ? (before + after) / 2
        : before !== undefined
          ? before - 1
          : after !== undefined
            ? after + 1
            : Date.now()
    const { error } = await supabase.from('lv_notes').update({ position: newPos }).eq('id', active.id)
    if (error) toast(error.message)
  }

  return (
    <Page className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[26px] font-extrabold tracking-tight">Notes</h1>
        <button onClick={() => navigate('/notes/new')} className="btn-primary px-4 py-2 text-sm">
          + New note
        </button>
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
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-40" />
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
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={() => (draggingRef.current = true)} onDragEnd={onDragEnd}>
            <SortableContext items={visible.map((n) => n.id)} strategy={rectSortingStrategy}>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="grid grid-cols-2 items-start gap-3"
              >
                {visible.map((n) => (
                  <NoteCard
                    key={n.id}
                    note={n}
                    sortable={sortable}
                    onOpen={() => {
                      if (!draggingRef.current) navigate(`/notes/${n.id}`)
                    }}
                  />
                ))}
              </motion.div>
            </SortableContext>
          </DndContext>
          {sortable && notes.length > 1 && (
            <p className="text-center text-xs text-ink-400">Hold a note to drag it into a new spot</p>
          )}
        </>
      )}
    </Page>
  )
}
