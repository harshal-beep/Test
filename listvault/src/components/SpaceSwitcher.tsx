/**
 * The space switcher: tap the wordmark, pick a world. Lists every space the
 * user belongs to, jumps to Members & invite, and creates new group spaces.
 */
import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Plus, Settings, UserPlus } from '../lib/icons'
import { useSpace } from '../context/SpaceContext'
import { BottomSheet, useToast } from './ui'

export const SPACE_EMOJIS = ['🎉', '🏖️', '🏠', '⚽', '🎬', '🍜', '🎮', '✨']

export default function SpaceSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { spaces, space, setSpace, createSpace, hasCouple } = useSpace()
  const toast = useToast()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(SPACE_EMOJIS[0])
  const [kind, setKind] = useState<'group' | 'couple'>('group')
  const [busy, setBusy] = useState(false)

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      const id = await createSpace(name.trim(), kind === 'couple' ? '💜' : emoji, kind)
      setSpace(id)
      setName('')
      setCreating(false)
      onClose()
      toast(kind === 'couple' ? 'Couple space created 💜 — now invite your partner' : 'Space created 🎉 — invite your people from Members')
      navigate('/space')
    } catch (err) {
      toast((err as Error).message)
    }
    setBusy(false)
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Your spaces">
      <div className="space-y-4 pb-1">
        <div className="space-y-1.5">
          {spaces.map((s) => (
            <div
              key={s.id}
              className={`flex w-full items-center gap-3 rounded-2xl pl-3.5 pr-1.5 transition-colors ${
                s.id === space?.id
                  ? 'bg-brand-50 dark:bg-brand-800/25'
                  : 'hover:bg-ink-100 dark:hover:bg-ink-800'
              }`}
            >
              <button
                onClick={() => {
                  setSpace(s.id)
                  onClose()
                }}
                className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-ink-100 text-xl dark:bg-ink-800">
                  {s.emoji ?? (s.kind === 'couple' ? '💜' : '👥')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{s.name}</span>
                  <span className="block text-xs text-ink-400">
                    {s.kind === 'couple' ? 'Just us two' : 'Group space'}
                  </span>
                </span>
                {s.id === space?.id && <Check size={18} className="shrink-0 text-brand-600" />}
              </button>
              <button
                onClick={() => {
                  setSpace(s.id)
                  onClose()
                  navigate('/space')
                }}
                aria-label={`${s.name} settings`}
                className="icon-btn h-9 w-9 shrink-0 text-ink-400"
              >
                <Settings size={17} />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={() => {
            onClose()
            navigate('/space')
          }}
          className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold text-ink-500 transition-colors hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800"
        >
          <UserPlus size={17} /> Members & invite
        </button>

        {creating ? (
          <form onSubmit={(e) => void create(e)} className="space-y-3 rounded-2xl bg-ink-50 p-3.5 dark:bg-ink-800/60">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setKind('group')}
                className={`flex-1 rounded-full py-2 text-[13px] font-semibold transition-all active:scale-95 ${
                  kind === 'group' ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30' : 'bg-white text-ink-500 dark:bg-ink-800 dark:text-ink-300'
                }`}
              >
                👥 Group
              </button>
              <button
                type="button"
                onClick={() => !hasCouple && setKind('couple')}
                disabled={hasCouple}
                className={`flex-1 rounded-full py-2 text-[13px] font-semibold transition-all active:scale-95 disabled:opacity-40 ${
                  kind === 'couple' ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30' : 'bg-white text-ink-500 dark:bg-ink-800 dark:text-ink-300'
                }`}
              >
                💜 Couple
              </button>
            </div>
            {hasCouple && <p className="text-[11px] text-ink-400">You already have a couple space — it's one per person 😉</p>}
            {kind === 'couple' && !hasCouple && (
              <p className="text-[11px] text-ink-400">Just you two: private questions, memories and date ideas. Locks at 2 people.</p>
            )}
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === 'couple' ? 'Name it — e.g. Us' : 'Space name — e.g. Goa Trip'}
              maxLength={60}
              className="field"
            />
            {kind === 'group' && (
            <div className="flex flex-wrap gap-1.5">
              {SPACE_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setEmoji(em)}
                  className={`rounded-xl p-1.5 text-lg transition-all active:scale-90 ${
                    emoji === em ? 'bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-800/40' : 'bg-white dark:bg-ink-800'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
            )}
            <button disabled={busy || !name.trim()} className="btn-primary w-full py-3">
              {busy ? 'Creating…' : kind === 'couple' ? 'Create couple space' : 'Create space'}
            </button>
          </form>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-ink-300 px-3.5 py-2.5 text-sm font-semibold text-ink-500 dark:border-ink-600 dark:text-ink-400"
          >
            <Plus size={17} /> New space — friends, trips, flatmates
          </button>
        )}
      </div>
    </BottomSheet>
  )
}
