import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { Tastes } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { BottomSheet, useToast } from './ui'

export const TASTE_OPTIONS = {
  cuisines: ['Street food', 'North Indian', 'South Indian', 'Chinese', 'Italian', 'Japanese', 'Cafés & desserts'],
  diet: ['Veg', 'Non-veg', 'Eggetarian'],
  vibe: ['Chill', 'Balanced', 'Adventurous'],
  setting: ['Indoor', 'Outdoor', 'Both'],
  budget: ['₹', '₹₹', '₹₹₹'],
  interests: ['Live music', 'Comedy', 'Art', 'Films', 'Nature & walks', 'Sports', 'Shopping', 'Theatre', 'Photography', 'Board games'],
  free_time: ['Weekday evenings', 'Weekends', 'Late nights']
} as const

const EMPTY: Tastes = {
  cuisines: [],
  diet: '',
  vibe: '',
  setting: '',
  budget: '',
  interests: [],
  free_time: []
}

function Chip({ on, label, onTap }: { on: boolean; label: string; onTap: () => void }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.93 }}
      onClick={onTap}
      className={`rounded-full px-3.5 py-2 text-[13px] font-semibold transition-all ${
        on
          ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
          : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300'
      }`}
    >
      {label}
    </motion.button>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wider text-ink-400">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

/** ~2-minute chips quiz; answers feed the Discover ranking. */
export default function TasteQuiz({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, refreshProfile } = useAuth()
  const toast = useToast()
  const [t, setT] = useState<Tastes>(EMPTY)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setT(profile?.tastes ?? EMPTY)
  }, [open, profile])

  const flip = (key: 'cuisines' | 'interests' | 'free_time', v: string) =>
    setT((p) => ({ ...p, [key]: p[key].includes(v) ? p[key].filter((x) => x !== v) : [...p[key], v] }))
  const pick = (key: 'diet' | 'vibe' | 'setting' | 'budget', v: string) => setT((p) => ({ ...p, [key]: v }))

  async function save() {
    if (!profile) return
    setBusy(true)
    const { error } = await supabase.from('lv_profiles').update({ tastes: t }).eq('id', profile.id)
    setBusy(false)
    if (error) {
      toast(error.message)
      return
    }
    await refreshProfile()
    onClose()
    toast('Tastes saved — Discover just got smarter ✨')
    // re-score the cached events against the new tastes, in the background
    void supabase.functions.invoke('lv-us', { body: { action: 'rerank_events' } })
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Your tastes">
      <div className="max-h-[65dvh] space-y-5 overflow-y-auto pb-2">
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Two minutes, all taps. This helps HaMaara suggest things in Mumbai you'd{' '}
          <em>both</em> enjoy.
        </p>
        <Group title="Food you love">
          {TASTE_OPTIONS.cuisines.map((c) => (
            <Chip key={c} on={t.cuisines.includes(c)} label={c} onTap={() => flip('cuisines', c)} />
          ))}
        </Group>
        <Group title="Diet">
          {TASTE_OPTIONS.diet.map((c) => (
            <Chip key={c} on={t.diet === c} label={c} onTap={() => pick('diet', c)} />
          ))}
        </Group>
        <Group title="Your vibe">
          {TASTE_OPTIONS.vibe.map((c) => (
            <Chip key={c} on={t.vibe === c} label={c} onTap={() => pick('vibe', c)} />
          ))}
        </Group>
        <Group title="Indoor or outdoor?">
          {TASTE_OPTIONS.setting.map((c) => (
            <Chip key={c} on={t.setting === c} label={c} onTap={() => pick('setting', c)} />
          ))}
        </Group>
        <Group title="Usual budget for an outing">
          {TASTE_OPTIONS.budget.map((c) => (
            <Chip key={c} on={t.budget === c} label={c} onTap={() => pick('budget', c)} />
          ))}
        </Group>
        <Group title="Into">
          {TASTE_OPTIONS.interests.map((c) => (
            <Chip key={c} on={t.interests.includes(c)} label={c} onTap={() => flip('interests', c)} />
          ))}
        </Group>
        <Group title="When are you usually free?">
          {TASTE_OPTIONS.free_time.map((c) => (
            <Chip key={c} on={t.free_time.includes(c)} label={c} onTap={() => flip('free_time', c)} />
          ))}
        </Group>
      </div>
      <button onClick={() => void save()} disabled={busy} className="btn-primary mt-4 w-full py-3.5">
        {busy ? 'Saving…' : 'Save my tastes'}
      </button>
    </BottomSheet>
  )
}
