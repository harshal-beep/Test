import { FormEvent, useState } from 'react'
import { useAuth } from '../context/AuthContext'

/**
 * Email/password sign-in + sign-up form (PRD v1 auth, adjusted: email signup
 * instead of Google-only). Used on the sign-in screen and inline on join links.
 */
export default function AuthForm({ initialMode = 'signin' }: { initialMode?: 'signin' | 'signup' }) {
  const { signInWithEmail, signUpWithEmail } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode)
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
          setNotice('Almost there — check your email for a confirmation link, then log in.')
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

  const inputClass = 'field'

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 self-center">
      {mode === 'signup' && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-500 dark:text-ink-400">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
            className={inputClass}
          />
        </div>
      )}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-ink-500 dark:text-ink-400">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-ink-500 dark:text-ink-400">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="6+ characters"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          minLength={6}
          required
          className={inputClass}
        />
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {notice && <p className="text-sm text-brand-600">{notice}</p>}
      <button
        disabled={busy}
        className="btn-primary w-full py-3.5"
      >
        {busy ? 'Please wait…' : mode === 'signup' ? 'Sign up' : 'Log in'}
      </button>
      <button
        type="button"
        onClick={() => {
          setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
          setError('')
        }}
        className="w-full text-center text-sm text-ink-500 dark:text-ink-400"
      >
        {mode === 'signin' ? (
          <>New here? <span className="font-semibold text-brand-600">Create an account</span></>
        ) : (
          <>Already have an account? <span className="font-semibold text-brand-600">Log in</span></>
        )}
      </button>
    </form>
  )
}
