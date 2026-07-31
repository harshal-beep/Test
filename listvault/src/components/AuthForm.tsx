import { FormEvent, useState } from 'react'
import { useAuth } from '../context/AuthContext'

/**
 * Email/password sign-in + sign-up form (PRD v1 auth, adjusted: email signup
 * instead of Google-only). Used on the sign-in screen and inline on join links.
 */
export default function AuthForm() {
  const { signInWithEmail, signUpWithEmail } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        if (!name.trim()) throw new Error('Please enter your name')
        const needsConfirmation = await signUpWithEmail(email.trim(), password, name.trim())
        if (needsConfirmation) {
          setNotice('Almost there — check your email for a confirmation link, then sign in.')
          setMode('signin')
        }
      } else {
        await signInWithEmail(email.trim(), password)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-3">
      {mode === 'signup' && (
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoComplete="name"
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2.5 focus:border-brand-500 focus:outline-none"
        />
      )}
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        autoComplete="email"
        required
        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2.5 focus:border-brand-500 focus:outline-none"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password (6+ characters)"
        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        minLength={6}
        required
        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2.5 focus:border-brand-500 focus:outline-none"
      />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {notice && <p className="text-sm text-brand-700">{notice}</p>}
      <button
        disabled={busy}
        className="w-full rounded-lg bg-brand-600 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
      </button>
      <button
        type="button"
        onClick={() => {
          setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
          setError('')
        }}
        className="w-full text-sm text-brand-700 underline"
      >
        {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
      </button>
    </form>
  )
}
