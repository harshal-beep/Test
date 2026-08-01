import { FormEvent, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { Flame, Pencil, Plus, Trash2 } from 'lucide-react'
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
const HABIT_COLORS = ['#948ce9', '#7fcfbf', '#f4c17e', '#f0a2c0', '#93bff2', '#ef9f9f']

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

const CELEBRATE = {
  particleCount: 110,
  spread: 75,
  origin: { y: 0.75 },
  colors: ['#948ce9', '#aba3f0', '#ffe0a3', '#a8e6c9']
}
const STREAK_MILESTONES = [7, 14, 30, 50, 100]

/** Days since Monday (Mon-Sun week). */
function mondayIndex(): number {
  return (new Date().getDay() + 6) % 7
}

/** Checked days in the week k weeks back (k = 0 → current week so far). */
function countWeek(days: Set<string>, k: number): number {
  const mi = mondayIndex()
  const from = k === 0 ? 0 : mi + 7 * (k - 1) + 1
  const to = k === 0 ? mi : mi + 7 * k
  let n = 0
  for (let off = from; off <= to; off++) if (days.has(isoDay(off))) n++
  return n
}

/** Consecutive weeks meeting the target; the current week counts once met. */
function weekStreakOf(days: Set<string>, target: number): number {
  let k = countWeek(days, 0) >= target ? 0 : 1
  let streak = 0
  // checks are only loaded 60 days back, so cap the walk there
  while (k <= 8 && countWeek(days, k) >= target) {
    streak++
    k++
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
  const [editing, setEditing] = useState<Habit | null>(null)
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

  // habitId -> userId -> set of checked days
  const allByHabit = useMemo(() => {
    const map = new Map<string, Map<string, Set<string>>>()
    for (const h of habits) map.set(h.id, new Map())
    for (const ch of checks) {
      const users = map.get(ch.habit_id)
      if (!users) continue
      if (!users.has(ch.user_id)) users.set(ch.user_id, new Set())
      users.get(ch.user_id)!.add(ch.day)
    }
    return map
  }, [habits, checks])

  const byHabit = useMemo(() => {
    const map = new Map<string, { mine: Set<string>; todayOthers: Profile[] }>()
    for (const h of habits) {
      const users = allByHabit.get(h.id) ?? new Map<string, Set<string>>()
      const mine = users.get(myId ?? '') ?? new Set<string>()
      const todayOthers = profiles.filter((p) => p.id !== myId && users.get(p.id)?.has(today))
      map.set(h.id, { mine, todayOthers })
    }
    return map
  }, [habits, allByHabit, profiles, myId, today])

  /** Toggle any day in the visible week — today or a forgotten past day. */
  async function toggleDay(habit: Habit, day: string) {
    if (!myId) return
    const entry = byHabit.get(habit.id)
    const done = entry?.mine.has(day) ?? false
    // optimistic
    setChecks((prev) =>
      done
        ? prev.filter((c) => !(c.habit_id === habit.id && c.day === day && c.user_id === myId))
        : [...prev, { habit_id: habit.id, day, user_id: myId }]
    )
    if (done) {
      await supabase.from('lv_habit_checks').delete().match({ habit_id: habit.id, day, user_id: myId })
      return
    }
    const { error } = await supabase.from('lv_habit_checks').insert({ habit_id: habit.id, day, user_id: myId })
    if (error) {
      toast(error.message)
      return
    }
    if (day !== today) return // backfills don't celebrate
    const mine = new Set([...(entry?.mine ?? []), day])
    if (habit.target_per_week >= 7) {
      const streak = streakOf(mine)
      if (STREAK_MILESTONES.includes(streak)) {
        confetti(CELEBRATE)
        toast(`${streak}-day streak! 🔥🔥`)
      } else if (streak > 1) {
        toast(`${streak}-day streak 🔥`)
      }
    } else if (countWeek(mine, 0) === habit.target_per_week) {
      confetti(CELEBRATE)
      toast('Week goal done ✅')
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
            const weekly = h.target_per_week < 7
            const weekCount = countWeek(mine, 0)
            const wStreak = weekStreakOf(mine, h.target_per_week)
            return (
              <motion.div
                key={h.id}
                variants={stagger.item}
                onClick={() => setManage(h)}
                className="surface flex items-center gap-3.5 p-4"
              >
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
                  style={{ backgroundColor: (h.color ?? '#948ce9') + '20' }}
                >
                  {h.emoji ?? '✨'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{h.name}</p>
                  <p className="flex items-center gap-1 text-xs text-ink-500 dark:text-ink-400">
                    {weekly ? (
                      <>
                        {wStreak > 0 && (
                          <>
                            <Flame size={12} className="text-amber-500" /> {wStreak}-week streak ·
                          </>
                        )}
                        {` ${weekCount}/${h.target_per_week} this week`}
                      </>
                    ) : streak > 0 ? (
                      <>
                        <Flame size={12} className="text-amber-500" /> {streak}-day streak
                      </>
                    ) : (
                      'Start your streak today'
                    )}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1">
                    {week.map((off) => {
                      const day = isoDay(off)
                      const on = mine.has(day)
                      return (
                        <button
                          key={off}
                          type="button"
                          title={day}
                          aria-label={`Toggle ${day}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            void toggleDay(h, day)
                          }}
                          className="p-1 transition-transform active:scale-75"
                        >
                          <span
                            className={`block h-2 w-2 rounded-full transition-colors ${
                              on ? '' : 'bg-ink-200 dark:bg-ink-700'
                            }`}
                            style={on ? { backgroundColor: h.color ?? '#948ce9' } : undefined}
                          />
                        </button>
                      )
                    })}
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
                  <AnimatedCheck checked={doneToday} onToggle={() => void toggleDay(h, today)} />
                </div>
              </motion.div>
            )
          })}
          <p className="text-center text-xs text-ink-400">Tap a day dot to log or fix a past day</p>
        </motion.div>
      )}

      <HabitComposer
        open={composerOpen}
        habit={editing}
        onClose={() => {
          setComposerOpen(false)
          setEditing(null)
        }}
      />

      <BottomSheet
        open={manage !== null}
        onClose={() => setManage(null)}
        title={manage ? `${manage.emoji ?? '✨'} ${manage.name}` : undefined}
      >
        {manage && (
          <div className="space-y-4 pb-1">
            <p className="text-sm text-ink-500 dark:text-ink-400">
              Hamaara habit — everyone tracks their own streak on the same habit.
            </p>
            <ul className="space-y-3.5">
              {profiles.map((p) => {
                const days = allByHabit.get(manage.id)?.get(p.id) ?? new Set<string>()
                const s = streakOf(days)
                return (
                  <li key={p.id} className="flex items-center gap-3">
                    <Avatar profile={p} size={9} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {p.display_name || p.email}
                        {p.id === myId && ' (you)'}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-ink-500 dark:text-ink-400">
                        {manage.target_per_week < 7 ? (
                          `${countWeek(days, 0)}/${manage.target_per_week} this week`
                        ) : s > 0 ? (
                          <>
                            <Flame size={11} className="text-amber-500" /> {s}-day streak
                          </>
                        ) : (
                          'No streak yet'
                        )}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      {week.map((off) => (
                        <span
                          key={off}
                          className={`h-2 w-2 rounded-full ${days.has(isoDay(off)) ? '' : 'bg-ink-200 dark:bg-ink-700'}`}
                          style={days.has(isoDay(off)) ? { backgroundColor: manage.color ?? '#948ce9' } : undefined}
                        />
                      ))}
                    </span>
                  </li>
                )
              })}
            </ul>
            {manage.owner_id === myId && (
              <div>
                <button
                  onClick={() => {
                    setEditing(manage)
                    setManage(null)
                    setComposerOpen(true)
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left font-medium hover:bg-ink-50 dark:hover:bg-ink-800"
                >
                  <Pencil size={18} /> Edit habit
                </button>
                <button
                  onClick={() => void deleteHabit(manage)}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Trash2 size={18} /> Delete habit
                </button>
              </div>
            )}
          </div>
        )}
      </BottomSheet>
    </Page>
  )
}

export function HabitComposer({
  open,
  onClose,
  habit
}: {
  open: boolean
  onClose: () => void
  habit?: Habit | null
}) {
  const { session } = useAuth()
  const toast = useToast()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(HABIT_EMOJIS[0])
  const [color, setColor] = useState(HABIT_COLORS[0])
  const [target, setTarget] = useState(7)
  const [busy, setBusy] = useState(false)

  // prefill when opened for editing, reset when opened for creating
  useEffect(() => {
    if (!open) return
    setName(habit?.name ?? '')
    setEmoji(habit?.emoji ?? HABIT_EMOJIS[0])
    setColor(habit?.color ?? HABIT_COLORS[0])
    setTarget(habit?.target_per_week ?? 7)
  }, [open, habit])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !session) return
    setBusy(true)
    const row = { name: name.trim(), emoji, color, target_per_week: target }
    const { error } = habit
      ? await supabase.from('lv_habits').update(row).eq('id', habit.id)
      : await supabase.from('lv_habits').insert({ ...row, owner_id: session.user.id })
    setBusy(false)
    if (error) toast(error.message)
    else {
      setName('')
      onClose()
      toast(habit ? 'Habit updated' : 'Habit created — day 1 starts now 💪')
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={habit ? 'Edit habit' : 'New habit'}>
      <form onSubmit={submit} className="space-y-4 pb-1">
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
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">How often?</p>
          <div className="flex flex-wrap gap-2">
            {[7, 1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTarget(n)}
                className={`rounded-full px-3.5 py-2 text-[13px] font-semibold transition-all active:scale-95 ${
                  target === n
                    ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900'
                    : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300'
                }`}
              >
                {n === 7 ? 'Every day' : `${n}× a week`}
              </button>
            ))}
          </div>
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
