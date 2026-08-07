import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft } from '../lib/icons'
import { supabase } from '../lib/supabase'
import AuthForm from '../components/AuthForm'

const SLIDES = [
  {
    title: 'Lists you make together',
    hint: 'Plans, notes, habits and split money — with your partner or any group, live on every phone.',
    art: (
      <g>
        <rect x="52" y="42" width="96" height="122" rx="14" fill="#948ce9" />
        <rect x="64" y="56" width="72" height="94" rx="8" fill="#f5f4ff" />
        <path d="M76 78l7 7 14-16" stroke="#948ce9" strokeWidth="6.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="102" y="76" width="26" height="6" rx="3" fill="#cdc9ff" />
        <path d="M76 106l7 7 14-16" stroke="#948ce9" strokeWidth="6.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="102" y="104" width="26" height="6" rx="3" fill="#cdc9ff" />
        <circle cx="76" cy="134" r="7" fill="none" stroke="#cdc9ff" strokeWidth="4" />
        <rect x="94" y="131" width="34" height="6" rx="3" fill="#cdc9ff" />
      </g>
    )
  },
  {
    title: 'Notes with a spark of AI',
    hint: 'Summarize, fix grammar, or turn rambles into clean lists with one tap.',
    art: (
      <g>
        <rect x="48" y="52" width="104" height="100" rx="16" fill="#948ce9" />
        <rect x="60" y="66" width="80" height="8" rx="4" fill="#f5f4ff" />
        <rect x="60" y="84" width="62" height="6" rx="3" fill="#cdc9ff" />
        <rect x="60" y="98" width="72" height="6" rx="3" fill="#cdc9ff" />
        <rect x="60" y="112" width="48" height="6" rx="3" fill="#cdc9ff" />
        <path d="M144 132l4.5 10 10 4.5-10 4.5-4.5 10-4.5-10-10-4.5 10-4.5z" fill="#ffe0a3" />
        <path d="M56 148l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#aba3f0" />
      </g>
    )
  },
  {
    title: 'Nothing is ever lost',
    hint: 'Closed lists live forever in your Archive — search them, reuse them, any time.',
    art: (
      <g>
        <rect x="50" y="70" width="100" height="84" rx="14" fill="#948ce9" />
        <rect x="44" y="52" width="112" height="28" rx="10" fill="#aba3f0" />
        <rect x="82" y="92" width="36" height="10" rx="5" fill="#f5f4ff" />
        <circle cx="100" cy="128" r="14" fill="none" stroke="#f5f4ff" strokeWidth="5" />
        <path d="M110 138l10 10" stroke="#f5f4ff" strokeWidth="5" strokeLinecap="round" />
      </g>
    )
  }
]

interface InvitePreview {
  name: string
  emoji: string | null
  kind: string
  member_count: number
}

/** Onboarding walkthrough → auth. Invite links skip the tour and say who's inviting. */
export default function SignIn() {
  const location = useLocation()
  const joinCode = location.pathname.match(/^\/join\/([A-Za-z0-9]+)/)?.[1] ?? null
  const [screen, setScreen] = useState<'walkthrough' | 'auth'>(joinCode ? 'auth' : 'walkthrough')
  const [slide, setSlide] = useState(0)
  const [mode, setMode] = useState<'signin' | 'signup'>('signup')
  const [invite, setInvite] = useState<InvitePreview | null>(null)
  const last = slide === SLIDES.length - 1

  useEffect(() => {
    if (!joinCode) return
    supabase.rpc('lv_invite_preview', { p_code: joinCode }).then(({ data }) => {
      const row = (data as InvitePreview[] | null)?.[0]
      if (row) setInvite(row)
    })
  }, [joinCode])

  if (screen === 'walkthrough') {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-between px-8 py-12 text-center">
        <div className="flex w-full items-center justify-between">
          <h1 className="text-xl font-extrabold tracking-tight">
            Ha<span className="text-brand-600">Maara</span>
          </h1>
          {!last && (
            <button onClick={() => setSlide(SLIDES.length - 1)} className="text-sm font-medium text-ink-400">
              Skip
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={slide}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="space-y-7"
          >
            <svg viewBox="0 0 200 200" className="mx-auto h-52 w-52" aria-hidden>
              <circle cx="100" cy="100" r="88" fill="#948ce9" opacity="0.08" />
              {SLIDES[slide].art}
            </svg>
            <div>
              <p className="text-[22px] font-extrabold tracking-tight">{SLIDES[slide].title}</p>
              <p className="mx-auto mt-2 max-w-xs text-[15px] leading-relaxed text-ink-500 dark:text-ink-400">
                {SLIDES[slide].hint}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="w-full max-w-sm space-y-6">
          <div className="flex justify-center gap-2">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlide(i)}
                aria-label={`Slide ${i + 1}`}
                className="p-1"
              >
                <motion.span
                  animate={{ width: i === slide ? 24 : 8, opacity: i === slide ? 1 : 0.35 }}
                  transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                  className="block h-2 rounded-full bg-brand-600"
                />
              </button>
            ))}
          </div>

          {last ? (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <button
                onClick={() => {
                  setMode('signup')
                  setScreen('auth')
                }}
                className="btn-primary w-full py-3.5"
              >
                Create account
              </button>
              <p className="text-sm text-ink-500 dark:text-ink-400">
                Have an account?{' '}
                <button
                  className="font-bold text-brand-600"
                  onClick={() => {
                    setMode('signin')
                    setScreen('auth')
                  }}
                >
                  Log in
                </button>
              </p>
            </motion.div>
          ) : (
            <button onClick={() => setSlide((s) => s + 1)} className="btn-primary w-full py-3.5">
              Next
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
      className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-6 py-8"
    >
      <button onClick={() => setScreen('walkthrough')} className="icon-btn -ml-2 mb-6" aria-label="Back">
        <ArrowLeft size={20} />
      </button>
      {invite && (
        <div className="mb-6 flex items-center gap-3 rounded-[20px] bg-brand-50 p-4 dark:bg-brand-800/20">
          <span className="text-3xl">{invite.emoji ?? (invite.kind === 'couple' ? '💜' : '👥')}</span>
          <p className="text-sm leading-snug">
            <strong>You're invited to {invite.name}!</strong>
            <span className="block text-ink-500 dark:text-ink-400">
              {invite.kind === 'couple'
                ? 'Someone wants to pair up with you. Create an account and you two are in.'
                : `${invite.member_count} ${Number(invite.member_count) === 1 ? 'person is' : 'people are'} in — create an account to join them.`}
            </span>
          </p>
        </div>
      )}
      <h1 className="mb-8 text-center text-2xl font-extrabold tracking-tight">
        {mode === 'signup' ? 'Create your account' : 'Welcome back'}
      </h1>
      <AuthForm initialMode={mode} />
    </motion.div>
  )
}
