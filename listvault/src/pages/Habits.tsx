import { FormEvent, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Flame, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Habit, HabitCheck, Profile } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import {
  AnimatedCheck,
  BottomSheet,
  EmptyState,
  Page,
  Skeleton,
  stagger,
  useConfirm,
  useToast
} from '../components/ui'

const HABIT_EMOJIS = ['💧', '🏃', '🧘', '📖', '💊', '🥗', '🛏️', '📵']
const HABIT_COLORS = ['#6c63ff', '#0d9488', '#d97706', '#db2777', '#2563eb', '#dc2626']

function isoDay(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Consecutive days ending today (or yesterday if today is not yet checked). */
function streakOf(days: Set<string>): number {
  let streak = 0
  let offset = days.has(isoDay(0)) ? 0 : 1
  while (days.has(isoDay(offset))) {
    streak++
    offset++
  }
  return streak
}

export default function Habits() {
  const { session } = useAuth()
  const confirm = useConfirm()
  const toast = useToast()
  const [habits, setHabits] = useState<Habit[]>([])
  const [checks, setChecks] = useState<HabitCheck[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [composerOpen, setComposerOpen] = useState(false)
  const [manage, setManage] = useState<Habit | null>(null)

  useEffect(() => {
    void load()
    const channel = supabase
      .channel('habits')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_habits' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_habit_checks' }, () => void load())
      .subscribe()
    return () => void supabase.removeChannel(channel)
  }, [])

  async function load() {
    const [h, c, p] = await Promise.all([
      supabase.from('lv_habits').select('*').order('created_at'),
      supabase.from('lv_habit_checks').select('habit_id, day, user_id').gte('day', isoDay(60)),
      supabase.from('lv_profiles').select('*')
    ])
    setHabits((h.data as Habit[]) ?? [])
    setChecks((c.data as HabitCheck[]) ?? [])
    setProfiles((p.data as Profile[]) ?? [])
    setLoading(false)
  }

  const myId = session?.user.id
  const today = isoDay(0)

  const byHabit = useMemo(() => {
    const map = new Map<string, { mine: Set<string>; todayOthers: Profile[] }>()
    for (const h of habits) map.set(h.id, { mine: new Set(), todayOthers: [] })
    for (const ch of checks) {
      const entry = map.get(ch.habit_id)
      if (!entry) continue
      if (ch.user_id === myId) entry.mine.add(ch.day)
      else if (ch.day === today) {
        const prof = profiles.find((p) => p.id === ch.user_id)
        if (prof) entry.todayOthers.push(prof)
      }
    }
    return map
  }, [habits, checks, profiles, myId, today])

  async function toggleToday(habit: Habit) {
    if (!myId) return
    const entry = byHabit.get(habit.id)
    const done = entry?.mine.has(today) ?? false
    // optimistic
    setChecks((prev) =>
      done
        ? prev.filter((c) => !(c.habit_id === habit.id && c.day === today && c.user_id === myId))
        : [...prev, { habit_id: habit.id, day: today, user_id: myId }]
    )
    if (done) {
      await supabase.from('lv_habit_checks').delete().match({ habit_id: habit.id, day: today, user_id: myId })
    } else {
      const { error } = await supabase.from('lv_habit_checks').insert({ habit_id: habit.id, day: today, user_id: myId })
      if (error) toast(error.message)
      else {
        const streak = streakOf(new Set([...(entry?.mine ?? []), today]))
        if (streak > 1) toast(`${streak}-day streak 🔥`)
      }
    }
  }

  async function deleteHabit(habit: Habit) {
    if (!(await confirm(`Delete “${habit.name}”?`, {
      body: 'The habit and its whole history are removed for everyone.',
      confirmLabel: 'Delete',
      danger: true
    }))) return
    setManage(null)
    await supabase.from('lv_habits').delete().eq('id', habit.id)
    toast('Habit deleted')
  }

  const week = [6, 5, 4, 3, 2, 1, 0] // offsets, oldest → today

  return (
    <Page className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[26px] font-extrabold tracking-tight">Habits</h1>
        <button onClick={() => setComposerOpen(true)} className="btn-ghost flex items-center gap-1 px-3 py-1.5 text-sm">
          <Plus size={16} /> New
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : habits.length === 0 ? (
        <EmptyState
          icon={<Flame size={24} />}
          title="No habits yet"
          hint="Daily water, a walk, reading — track it together and keep each other honest."
        />
      ) : (
        <motion.div variants={stagger.container} initial="initial" animate="animate" className="space-y-3">
          {habits.map((h) => {
            const entry = byHabit.get(h.id)
            const mine = entry?.mine ?? new Set<string>()
            const streak = streakOf(mine)
            const doneToday = mine.has(today)
            return (
              <motion.div
                key={h.id}
                variants={stagger.item}
                onClick={() => setManage(h)}
                className="surface flex items-center gap-3.5 p-4"
              >
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
                  style={{ backgroundColor: (h.color ?? '#6c63ff') + '20' }}
                >
                  {h.emoji ?? '✨'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{h.name}</p>
                  <p className="flex items-center gap-1 text-xs text-ink-500 dark:text-ink-400">
                    {streak > 0 ? (
                      <>
                        <Flame size={12} className="text-amber-500" /> {streak}-day streak
                      </>
                    ) : (
                      'Start your streak today'
                    )}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5">
                    {week.map((off) => (
                      <span
                        key={off}
                        title={isoDay(off)}
                        className={`h-2 w-2 rounded-full transition-colors ${
                          mine.has(isoDay(off)) ? '' : 'bg-ink-200 dark:bg-ink-700'
                        }`}
                        style={mine.has(isoDay(off)) ? { backgroundColor: h.color ?? '#6c63ff' } : undefined}
                      />
                    ))}
                    {(entry?.todayOthers.length ?? 0) > 0 && (
                      <span className="ml-2 flex -space-x-1.5" title="Also done today">
                        {entry!.todayOthers.slice(0, 3).map((p) => (
                          <Avatar key={p.id} profile={p} size={4} />
                        ))}
                      </span>
                    )}
                  </div>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <AnimatedCheck checked={doneToday} onToggle={() => void toggleToday(h)} />
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      <HabitComposer open={composerOpen} onClose={() => setComposerOpen(false)} />

      <BottomSheet open={manage !== null} onClose={() => setManage(null)} title={manage?.name}>
        {manage && (
          <div className="space-y-1 pb-1">
            <p className="px-3 pb-2 text-sm text-ink-500 dark:text-ink-400">
              Everyone in HaMaara sees this habit and tracks their own streak.
            </p>
            {manage.owner_id === myId ? (
              <button
                onClick={() => void deleteHabit(manage)}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 size={18} /> Delete habit
              </button>
            ) : (
              <p className="px-3 py-2 text-sm text-ink-400">Only the creator can delete this habit.</p>
            )}
          </div>
        )}
      </BottomSheet>
    </Page>
  )
}

export function HabitComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session } = useAuth()
  const toast = useToast()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(HABIT_EMOJIS[0])
  const [color, setColor] = useState(HABIT_COLORS[0])
  const [busy, setBusy] = useState(false)

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !session) return
    setBusy(true)
    const { error } = await supabase
      .from('lv_habits')
      .insert({ name: name.trim(), emoji, color, owner_id: session.user.id })
    setBusy(false)
    if (error) toast(error.message)
    else {
      setName('')
      onClose()
      toast('Habit created — day 1 starts now 💪')
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="New habit">
      <form onSubmit={create} className="space-y-4 pb-1">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Habit — e.g. Drink 2L water"
          maxLength={80}
          className="field"
        />
        <div className="flex flex-wrap gap-2">
          {HABIT_EMOJIS.map((em) => (
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
          {HABIT_COLORS.map((c) => (
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
        <button disabled={busy || !name.trim()} className="btn-primary w-full py-3.5">
          {busy ? 'Creating…' : 'Create habit'}
        </button>
      </form>
    </BottomSheet>
  )
}
