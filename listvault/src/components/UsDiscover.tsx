import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarDays, Compass, ExternalLink, ListPlus, MapPin, Sparkles, X } from '../lib/icons'
import { supabase } from '../lib/supabase'
import { List, Profile, UsEvent } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import TasteQuiz from './TasteQuiz'
import { BottomSheet, EmptyState, Skeleton, stagger, useToast } from './ui'

const CATEGORY_EMOJI: Record<string, string> = {
  music: '🎶',
  comedy: '🎤',
  theatre: '🎭',
  art: '🎨',
  food: '🍽️',
  workshop: '🛠️',
  market: '🛍️',
  outdoor: '🌿',
  other: '✨'
}

export default function UsDiscover({ household }: { household: Profile[] }) {
  const { session, profile } = useAuth()
  const toast = useToast()
  const myId = session?.user.id
  const [events, setEvents] = useState<UsEvent[]>([])
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [quizOpen, setQuizOpen] = useState(false)
  const [addFor, setAddFor] = useState<UsEvent | null>(null)
  const [lists, setLists] = useState<List[]>([])

  useEffect(() => {
    void load()
    // ask the server to refresh the cache; it no-ops if still fresh
    setRefreshing(true)
    supabase.functions
      .invoke('lv-us', { body: { action: 'refresh_events' } })
      .then(({ data }) => {
        if (data?.result === 'refreshed') void load()
      })
      .finally(() => setRefreshing(false))
  }, [])

  async function load() {
    const [e, h] = await Promise.all([
      supabase.from('lv_events').select('*').order('score', { ascending: false, nullsFirst: false }),
      supabase.from('lv_event_hides').select('event_id').eq('user_id', myId ?? '')
    ])
    setEvents((e.data as UsEvent[]) ?? [])
    setHidden(new Set(((h.data as { event_id: string }[]) ?? []).map((r) => r.event_id)))
    setLoading(false)
  }

  /** Every explicit action teaches the ranker what you like. */
  function learn(category: string | null, weight: number, source: string) {
    if (!myId || !category) return
    void supabase.from('lv_taste_signals').insert({ user_id: myId, category, weight, source })
  }

  async function hide(ev: UsEvent) {
    if (!myId) return
    setHidden((prev) => new Set([...prev, ev.id]))
    learn(ev.category, -4, 'event_hide')
    await supabase.from('lv_event_hides').insert({ event_id: ev.id, user_id: myId })
  }

  async function openAdd(ev: UsEvent) {
    const { data } = await supabase.from('lv_lists').select('*').eq('status', 'active').order('created_at', { ascending: false })
    setLists((data as List[]) ?? [])
    setAddFor(ev)
  }

  async function addToList(list: List) {
    if (!myId || !addFor) return
    const text = addFor.venue ? `${addFor.title} — ${addFor.venue}` : addFor.title
    const { error } = await supabase.from('lv_items').insert({
      list_id: list.id,
      text: text.slice(0, 500),
      added_by: myId,
      position: Date.now(),
      planned_for: addFor.starts_on
    })
    if (error) toast(error.message)
    else {
      toast(`Added to ${list.emoji ?? ''} ${list.name} ✨`)
      learn(addFor.category, 3, 'event_add')
    }
    setAddFor(null)
  }

  const partner = household.find((p) => p.id !== myId)
  const overlaps = useMemo(() => {
    const mine = profile?.tastes
    const theirs = partner?.tastes
    if (!mine || !theirs) return null
    const both = [
      ...mine.cuisines.filter((c) => theirs.cuisines.includes(c)),
      ...mine.interests.filter((c) => theirs.interests.includes(c))
    ]
    return both
  }, [profile, partner])

  const visible = events.filter((e) => !hidden.has(e.id))

  return (
    <div className="space-y-5">
      {/* You two */}
      {profile?.tastes ? (
        overlaps && overlaps.length > 0 ? (
          <div className="surface space-y-2 p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-600">
              <Sparkles size={13} /> You two
            </p>
            <p className="text-sm text-ink-600 dark:text-ink-300">You both love:</p>
            <div className="flex flex-wrap gap-1.5">
              {overlaps.map((o) => (
                <span key={o} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-800/30 dark:text-brand-200">
                  {o}
                </span>
              ))}
            </div>
            <button onClick={() => setQuizOpen(true)} className="pt-1 text-xs font-medium text-ink-400 underline">
              Edit my tastes
            </button>
          </div>
        ) : (
          <div className="surface flex items-center justify-between gap-3 p-4">
            <p className="text-sm text-ink-500 dark:text-ink-400">
              {partner?.tastes
                ? 'Your tastes are saved.'
                : `Waiting for ${partner?.display_name?.split(' ')[0] || 'your partner'} to fill their tastes too.`}
            </p>
            <button onClick={() => setQuizOpen(true)} className="shrink-0 text-xs font-semibold text-brand-600 underline">
              Edit mine
            </button>
          </div>
        )
      ) : (
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => setQuizOpen(true)}
          className="w-full rounded-[24px] bg-gradient-to-br from-amber-200 via-rose-200 to-brand-400 p-5 text-left text-ink-900 shadow-float"
        >
          <p className="text-xs font-bold uppercase tracking-wider opacity-85">2-minute quiz</p>
          <p className="mt-1 text-[19px] font-bold leading-snug">Tell us your tastes</p>
          <p className="mt-0.5 text-sm opacity-85">So suggestions fit what you'd both actually enjoy.</p>
        </motion.button>
      )}

      {/* Events */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Compass size={24} />}
          title={refreshing ? 'Finding things to do…' : 'Nothing here yet'}
          hint={refreshing ? 'Searching Mumbai for the next two weeks.' : 'Check back soon — the feed refreshes daily.'}
        />
      ) : (
        <motion.div variants={stagger.container} initial="initial" animate="animate" className="space-y-3">
          {visible.map((ev) => (
            <motion.div key={ev.id} variants={stagger.item} className="surface space-y-2.5 p-4">
              <div className="flex items-start gap-2.5">
                <span className="text-xl leading-none">{CATEGORY_EMOJI[ev.category ?? 'other'] ?? '✨'}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold leading-snug">{ev.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-500 dark:text-ink-400">
                    {ev.starts_on && (
                      <span className="flex items-center gap-1">
                        <CalendarDays size={11} />
                        {new Date(ev.starts_on).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                      </span>
                    )}
                    {(ev.area || ev.venue) && (
                      <span className="flex min-w-0 items-center gap-1">
                        <MapPin size={11} className="shrink-0" />
                        <span className="truncate">{ev.area ?? ev.venue}</span>
                      </span>
                    )}
                    {ev.price_text && <span>{ev.price_text}</span>}
                  </p>
                </div>
                <button onClick={() => void hide(ev)} aria-label="Hide" className="icon-btn -mr-1.5 -mt-1.5 h-8 w-8">
                  <X size={15} />
                </button>
              </div>
              {ev.reason && (
                <p className="rounded-xl bg-brand-50 px-3 py-2 text-xs leading-relaxed text-brand-800 dark:bg-brand-800/25 dark:text-brand-200">
                  ✨ {ev.reason}
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void openAdd(ev)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-ink-900 py-2.5 text-[13px] font-semibold text-white active:scale-[0.98] dark:bg-white dark:text-ink-900"
                >
                  <ListPlus size={15} /> Add to list
                </button>
                {ev.url && (
                  <a
                    href={ev.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300"
                    aria-label="Open source"
                  >
                    <ExternalLink size={15} />
                  </a>
                )}
              </div>
            </motion.div>
          ))}
          <p className="text-center text-xs text-ink-400">
            Found by AI on the public web — tap the link to verify before booking.
          </p>
        </motion.div>
      )}

      <TasteQuiz open={quizOpen} onClose={() => setQuizOpen(false)} />

      {/* list picker */}
      <BottomSheet open={addFor !== null} onClose={() => setAddFor(null)} title="Add to which list?">
        <div className="space-y-2 pb-1">
          {lists.length === 0 && <p className="text-sm text-ink-400">No active lists — create one from the + button first.</p>}
          {lists.map((l) => (
            <button
              key={l.id}
              onClick={() => void addToList(l)}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left font-medium hover:bg-ink-100 dark:hover:bg-ink-800"
            >
              <span className="text-xl">{l.emoji ?? '📝'}</span> {l.name}
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  )
}
