import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, CalendarHeart, Plus, Trash2 } from '../lib/icons'
import { supabase } from '../lib/supabase'
import { Milestone } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { useSpace } from '../context/SpaceContext'
import { BottomSheet, Page, Skeleton, useConfirm, useToast } from './../components/ui'

interface CalItem {
  id: string
  list_id: string
  text: string
  planned_for: string | null
  checked: boolean
  checked_at: string | null
}

interface DayEntry {
  kind: 'plan' | 'memory' | 'milestone'
  label: string
  emoji: string
  link?: string
  milestone?: Milestone
  years?: number
}

const MILESTONE_EMOJIS = ['💍', '🎂', '❤️', '🏠', '✈️', '⭐']

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Plans, memories and milestones on one shared month grid. */
export default function CalendarPage() {
  const { session } = useAuth()
  const { space } = useSpace()
  const sid = space!.id
  const toast = useToast()
  const confirm = useConfirm()
  const myId = session?.user.id
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [items, setItems] = useState<CalItem[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string>(iso(new Date()))
  const [addOpen, setAddOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState(MILESTONE_EMOJIS[0])
  const [date, setDate] = useState(iso(new Date()))
  const [yearly, setYearly] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setLoading(true)
    void load()
    const channel = supabase
      .channel(`calendar-${sid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_items' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_milestones' }, () => void load())
      .subscribe()
    return () => void supabase.removeChannel(channel)
  }, [sid])

  async function load() {
    const [it, ms] = await Promise.all([
      supabase
        .from('lv_items')
        .select('id, list_id, text, planned_for, checked, checked_at, list:lv_lists!inner(space_id)')
        .eq('list.space_id', sid)
        .or('planned_for.not.is.null,checked_at.not.is.null'),
      supabase.from('lv_milestones').select('*').eq('space_id', sid).order('date')
    ])
    setItems((it.data as unknown as CalItem[]) ?? [])
    setMilestones((ms.data as Milestone[]) ?? [])
    setLoading(false)
  }

  /** day (yyyy-mm-dd) → entries, for the visible month. */
  const byDay = useMemo(() => {
    const map = new Map<string, DayEntry[]>()
    const push = (day: string, e: DayEntry) => {
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(e)
    }
    const y = month.getFullYear()
    const m = month.getMonth()
    for (const it of items) {
      if (it.planned_for && !it.checked) {
        push(it.planned_for, { kind: 'plan', label: it.text, emoji: '📌', link: `/list/${it.list_id}` })
      }
      if (it.checked && it.checked_at) {
        push(it.checked_at.slice(0, 10), { kind: 'memory', label: it.text, emoji: '💜', link: `/list/${it.list_id}` })
      }
    }
    for (const ms of milestones) {
      const [my, mm, md] = ms.date.split('-').map(Number)
      if (ms.yearly) {
        if (mm - 1 === m) {
          const occurs = new Date(y, m, md)
          const years = y - my
          push(iso(occurs), {
            kind: 'milestone',
            label: years > 0 ? `${ms.title} (${years} year${years === 1 ? '' : 's'})` : ms.title,
            emoji: ms.emoji ?? '⭐',
            milestone: ms,
            years
          })
        }
      } else if (my === y && mm - 1 === m) {
        push(ms.date, { kind: 'milestone', label: ms.title, emoji: ms.emoji ?? '⭐', milestone: ms })
      }
    }
    return map
  }, [items, milestones, month])

  // Monday-first grid
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const lead = (first.getDay() + 6) % 7
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    const out: (string | null)[] = Array(lead).fill(null)
    for (let d = 1; d <= daysInMonth; d++) out.push(iso(new Date(month.getFullYear(), month.getMonth(), d)))
    return out
  }, [month])

  const today = iso(new Date())
  const dayEntries = byDay.get(selected) ?? []

  async function addMilestone(e: FormEvent) {
    e.preventDefault()
    if (!myId || !title.trim()) return
    setBusy(true)
    const { error } = await supabase
      .from('lv_milestones')
      .insert({ title: title.trim().slice(0, 120), emoji, date, yearly, created_by: myId, space_id: sid })
    setBusy(false)
    if (error) toast(error.message)
    else {
      setAddOpen(false)
      setTitle('')
      toast('Milestone added 🌟')
    }
  }

  async function removeMilestone(ms: Milestone) {
    if (!(await confirm(`Remove "${ms.title}"?`, { confirmLabel: 'Remove', danger: true }))) return
    await supabase.from('lv_milestones').delete().eq('id', ms.id)
  }

  const dotColor = { plan: 'bg-brand-500', memory: 'bg-emerald-400', milestone: 'bg-amber-400' } as const

  return (
    <Page className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/" className="icon-btn -ml-2" aria-label="Back">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="flex-1 text-[26px] font-extrabold tracking-tight">Calendar</h1>
        <button onClick={() => setAddOpen(true)} className="btn-ghost flex items-center gap-1 px-3 py-1.5 text-sm">
          <Plus size={16} /> Milestone
        </button>
      </div>

      {/* Month switcher */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          className="icon-btn"
          aria-label="Previous month"
        >
          ‹
        </button>
        <p className="font-bold">
          {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </p>
        <button
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          className="icon-btn"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      {loading ? (
        <Skeleton className="h-72" />
      ) : (
        <div className="surface p-3">
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase text-ink-400">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <span key={i} className="py-1">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) =>
              day === null ? (
                <span key={`x${i}`} />
              ) : (
                <button
                  key={day}
                  onClick={() => setSelected(day)}
                  className={`flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition-colors ${
                    selected === day
                      ? 'bg-brand-600 font-bold text-white'
                      : day === today
                        ? 'bg-brand-50 font-bold text-brand-700 dark:bg-brand-800/30 dark:text-brand-200'
                        : 'hover:bg-ink-100 dark:hover:bg-ink-800'
                  }`}
                >
                  {Number(day.slice(8))}
                  <span className="mt-0.5 flex h-1.5 gap-0.5">
                    {(byDay.get(day) ?? []).slice(0, 3).map((e, j) => (
                      <span
                        key={j}
                        className={`h-1.5 w-1.5 rounded-full ${selected === day ? 'bg-white/85' : dotColor[e.kind]}`}
                      />
                    ))}
                  </span>
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <p className="flex justify-center gap-4 text-[11px] text-ink-400">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand-500" /> planned</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> memory</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> milestone</span>
      </p>

      {/* Selected day */}
      <div className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink-400">
          {new Date(selected).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </h2>
        {dayEntries.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-400">Nothing here — plan something? 💜</p>
        ) : (
          dayEntries.map((e, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="surface flex items-center gap-3 p-3.5">
              <span className="text-xl">{e.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{e.label}</span>
                <span className="block text-xs capitalize text-ink-400">{e.kind}</span>
              </span>
              {e.link && (
                <Link to={e.link} className="text-xs font-semibold text-brand-600">
                  open
                </Link>
              )}
              {e.milestone && e.milestone.created_by === myId && (
                <button onClick={() => void removeMilestone(e.milestone!)} aria-label="Remove" className="icon-btn h-8 w-8 text-ink-300">
                  <Trash2 size={14} />
                </button>
              )}
            </motion.div>
          ))
        )}
      </div>

      {/* Add milestone */}
      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)} title="Add a milestone">
        <form onSubmit={(e) => void addMilestone(e)} className="space-y-4 pb-1">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Our anniversary, Amaara's birthday"
            maxLength={120}
            className="field"
          />
          <div className="flex flex-wrap gap-2">
            {MILESTONE_EMOJIS.map((em) => (
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
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" />
          <button
            type="button"
            onClick={() => setYearly((v) => !v)}
            className={`flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-[13px] font-semibold transition-all active:scale-95 ${
              yearly ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30' : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300'
            }`}
          >
            <CalendarHeart size={15} /> {yearly ? 'Repeats every year ✓' : 'One-time date'}
          </button>
          <button disabled={busy || !title.trim()} className="btn-primary w-full py-3.5">
            {busy ? 'Saving…' : 'Add milestone'}
          </button>
        </form>
      </BottomSheet>
    </Page>
  )
}
