import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import AuthForm from '../components/AuthForm'

interface Peek {
  name: string
  emoji: string | null
  member_count: number
}

/**
 * /j/{code} — invitee lands here (PRD 5.2). Unauthenticated visitors see
 * list name + member count + "Sign in with Google to join"; signed-in users
 * are joined and dropped straight into the list.
 */
export default function Join() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const { session, loading } = useAuth()
  const [peek, setPeek] = useState<Peek | null>(null)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    supabase.rpc('lv_peek_list', { p_code: code }).then(({ data }) => {
      const row = (data as Peek[] | null)?.[0]
      if (row) setPeek(row)
      else setError('This invite link is invalid or the list was closed.')
    })
  }, [code])

  useEffect(() => {
    if (loading || !session || !peek || joining) return
    setJoining(true)
    supabase.rpc('lv_join_list_by_code', { p_code: code }).then(({ data, error: err }) => {
      if (err) setError(err.message)
      else navigate(`/list/${data}`, { replace: true })
    })
  }, [loading, session, peek, code, joining, navigate])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <h1 className="text-2xl font-bold text-brand-700">ListVault</h1>
      {error ? (
        <p className="text-red-600 dark:text-red-400">{error}</p>
      ) : !peek ? (
        <p className="text-ink-500 dark:text-ink-400">Checking invite…</p>
      ) : (
        <>
          <div className="surface p-6 shadow-sm">
            <p className="text-3xl">{peek.emoji ?? '📝'}</p>
            <p className="mt-2 text-lg font-semibold">{peek.name}</p>
            <p className="text-sm text-ink-500 dark:text-ink-400">
              {peek.member_count} member{peek.member_count === 1 ? '' : 's'}
            </p>
          </div>
          {session ? (
            <p className="text-ink-500 dark:text-ink-400">Joining…</p>
          ) : (
            <>
              <p className="text-sm text-ink-600 dark:text-ink-300">Sign in or create an account to join:</p>
              <AuthForm />
            </>
          )}
        </>
      )}
    </div>
  )
}
