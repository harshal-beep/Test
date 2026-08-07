/**
 * A fresh account with no memberships lands here: join with a code or
 * start a group. Strangers without an invite can't see anything else.
 */
import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { useSpace } from '../context/SpaceContext'
import { SPACE_EMOJIS } from '../components/SpaceSwitcher'
import { useToast } from '../components/ui'

export default function NoSpaces() {
  const { profile, signOut } = useAuth()
  const { joinSpace, createSpace, setSpace } = useSpace()
  const toast = useToast()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(SPACE_EMOJIS[0])
  const [busy, setBusy] = useState(false)

  async function join(e: FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    try {
      const id = await joinSpace(code)
      setSpace(id)
      toast('Welcome in 🎉')
      navigate('/', { replace: true })
    } catch {
      toast("That code doesn't match any space")
    }
    setBusy(false)
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      const id = await createSpace(name.trim(), emoji)
      setSpace(id)
      navigate('/space', { replace: true })
    } catch (err) {
      toast((err as Error).message)
    }
    setBusy(false)
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-8 px-8 py-12">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 text-center">
        <h1 className="text-xl font-extrabold tracking-tight">
          Ha<span className="text-brand-600">Maara</span>
        </h1>
        <p className="text-[22px] font-extrabold tracking-tight">
          Hi {profile?.display_name?.split(' ')[0] || 'there'} 👋
        </p>
        <p className="text-sm leading-relaxed text-ink-500 dark:text-ink-400">
          Everything here lives in shared spaces. Got an invite from a friend? Enter the code. Or start your own group.
        </p>
      </motion.div>

      <form onSubmit={(e) => void join(e)} className="surface space-y-3 p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Have an invite code?</p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. GX4T7A"
          maxLength={6}
          className="field text-center text-lg font-bold tracking-[0.3em]"
        />
        <button disabled={busy || code.trim().length < 6} className="btn-primary w-full py-3">
          Join the space
        </button>
      </form>

      <form onSubmit={(e) => void create(e)} className="surface space-y-3 p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Or start a group</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Group name — e.g. Goa Trip"
          maxLength={60}
          className="field"
        />
        <div className="flex flex-wrap gap-1.5">
          {SPACE_EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => setEmoji(em)}
              className={`rounded-xl p-1.5 text-lg transition-all active:scale-90 ${
                emoji === em ? 'bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-800/40' : 'bg-ink-100 dark:bg-ink-800'
              }`}
            >
              {em}
            </button>
          ))}
        </div>
        <button disabled={busy || !name.trim()} className="btn-ghost w-full border border-brand-200 py-3 dark:border-brand-800">
          Create it
        </button>
      </form>

      <button onClick={() => void signOut()} className="text-center text-sm font-medium text-ink-400">
        Sign out
      </button>
    </div>
  )
}
