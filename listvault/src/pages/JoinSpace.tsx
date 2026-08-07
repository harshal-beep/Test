/**
 * /join/:code — the landing page of an invite link. Shows what you're
 * joining, one tap to confirm. Logged-out visitors see the sign-in flow
 * first (App routes them there) and land back here after.
 */
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useSpace } from '../context/SpaceContext'
import { useToast } from '../components/ui'

interface Preview {
  space_id: string
  name: string
  emoji: string | null
  member_count: number
}

export default function JoinSpace() {
  const { code } = useParams<{ code: string }>()
  const { joinSpace, setSpace } = useSpace()
  const toast = useToast()
  const navigate = useNavigate()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'bad' | 'joining'>('loading')

  useEffect(() => {
    if (!code) return
    supabase.rpc('lv_invite_preview', { p_code: code }).then(({ data }) => {
      const row = (data as Preview[] | null)?.[0]
      if (row) {
        setPreview(row)
        setState('ready')
      } else setState('bad')
    })
  }, [code])

  async function join() {
    if (!code) return
    setState('joining')
    try {
      const id = await joinSpace(code)
      setSpace(id)
      toast(`Welcome to ${preview?.name ?? 'the space'} 🎉`)
      navigate('/', { replace: true })
    } catch (err) {
      toast((err as Error).message)
      setState('ready')
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-8 text-center">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="w-full space-y-6">
        <h1 className="text-xl font-extrabold tracking-tight">
          Ha<span className="text-brand-600">Maara</span>
        </h1>
        {state === 'loading' ? (
          <p className="text-ink-400">Checking your invite…</p>
        ) : state === 'bad' ? (
          <div className="space-y-4">
            <p className="text-4xl">🫤</p>
            <p className="font-bold">This invite link doesn't work</p>
            <p className="text-sm text-ink-500 dark:text-ink-400">
              It may have been regenerated. Ask your friend for a fresh one.
            </p>
            <button onClick={() => navigate('/')} className="btn-ghost px-6 py-2.5 text-sm">
              Go home
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-brand-50 text-4xl dark:bg-brand-800/30">
              {preview?.emoji ?? '👥'}
            </span>
            <div>
              <p className="text-[22px] font-extrabold tracking-tight">Join {preview?.name}?</p>
              <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
                {preview?.member_count} {Number(preview?.member_count) === 1 ? 'person is' : 'people are'} already in — shared
                lists, notes, plans and split expenses.
              </p>
            </div>
            <button onClick={() => void join()} disabled={state === 'joining'} className="btn-primary w-full py-3.5">
              {state === 'joining' ? 'Joining…' : "I'm in 🎉"}
            </button>
            <button onClick={() => navigate('/')} className="text-sm font-medium text-ink-400">
              Not now
            </button>
          </div>
        )}
      </motion.div>
    </div>
  )
}
