import { useState } from 'react'
import AuthForm from '../components/AuthForm'

/** Walkthrough-style landing (hero + tagline) that flows into log in / sign up. */
export default function SignIn() {
  const [screen, setScreen] = useState<'walkthrough' | 'auth'>('walkthrough')
  const [mode, setMode] = useState<'signin' | 'signup'>('signup')

  if (screen === 'walkthrough') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-between px-8 py-14 text-center">
        <h1 className="text-2xl font-extrabold">
          <span className="text-slate-900 dark:text-slate-100">List</span>
          <span className="text-brand-600">Vault</span>
        </h1>

        <div className="space-y-8">
          <svg viewBox="0 0 200 200" className="mx-auto h-52 w-52" aria-hidden>
            <circle cx="100" cy="100" r="88" fill="#6c63ff" opacity="0.08" />
            <rect x="52" y="42" width="96" height="122" rx="14" fill="#6c63ff" />
            <rect x="64" y="56" width="72" height="94" rx="8" fill="#f5f4ff" />
            <rect x="74" y="72" width="52" height="7" rx="3.5" fill="#8b83ff" />
            <rect x="74" y="88" width="40" height="7" rx="3.5" fill="#cdc9ff" />
            <path d="M76 112l8 8 16-18" stroke="#6c63ff" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="108" y="108" width="20" height="7" rx="3.5" fill="#cdc9ff" />
            <circle cx="152" cy="60" r="12" fill="#8b83ff" />
            <circle cx="46" cy="140" r="8" fill="#cdc9ff" />
          </svg>
          <div>
            <p className="text-xl font-bold">Save and share lists &amp; notes</p>
            <p className="mx-auto mt-2 max-w-xs text-sm text-slate-500 dark:text-slate-400">
              Groceries, plans, and notes — together in real time, archived forever.
            </p>
          </div>
        </div>

        <div className="w-full max-w-sm space-y-4">
          <button
            onClick={() => {
              setMode('signup')
              setScreen('auth')
            }}
            className="w-full rounded-full bg-brand-600 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/30 hover:bg-brand-700"
          >
            Create account
          </button>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Have an account?{' '}
            <button
              className="font-semibold text-brand-600"
              onClick={() => {
                setMode('signin')
                setScreen('auth')
              }}
            >
              Log in
            </button>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-8">
      <button
        onClick={() => setScreen('walkthrough')}
        className="mb-6 self-start text-2xl text-slate-500 dark:text-slate-400"
        aria-label="Back"
      >
        ‹
      </button>
      <h1 className="mb-8 text-center text-xl font-bold">
        {mode === 'signup' ? 'Sign up' : 'Log in'}
      </h1>
      <AuthForm initialMode={mode} />
    </div>
  )
}
