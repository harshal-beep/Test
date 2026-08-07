/**
 * /reset — landing page of the "Forgot password?" email link. Supabase logs
 * the user in with a recovery session; this page sets the new password.
 */
import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ui'

export default function ResetPassword() {
  const toast = useToast()
  const navigate = useNavigate()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (pw.length < 6) {
      setError('At least 6 characters, please')
      return
    }
    if (pw !== pw2) {
      setError("The two passwords don't match")
      return
    }
    setBusy(true)
    const { error: err } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (err) setError(err.message)
    else {
      toast('Password updated ✓')
      navigate('/', { replace: true })
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-8">
      <motion.form
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={(e) => void save(e)}
        className="space-y-5"
      >
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-extrabold tracking-tight">
            Ha<span className="text-brand-600">Maara</span>
          </h1>
          <p className="text-[22px] font-extrabold tracking-tight">Set a new password</p>
        </div>
        <input
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="New password (6+ characters)"
          autoComplete="new-password"
          minLength={6}
          className="field"
        />
        <input
          type="password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          placeholder="Same password again"
          autoComplete="new-password"
          minLength={6}
          className="field"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button disabled={busy || !pw || !pw2} className="btn-primary w-full py-3.5">
          {busy ? 'Saving…' : 'Save new password'}
        </button>
      </motion.form>
    </div>
  )
}
