import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase, isConfigured } from '../lib/supabase'
import { Profile } from '../lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signInWithGoogle: (redirectTo?: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      return
    }
    void loadProfile(session.user.id)
  }, [session?.user.id])

  async function loadProfile(userId: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (data) setProfile(data as Profile)
  }

  const value: AuthState = {
    session,
    profile,
    loading,
    signInWithGoogle: async (redirectTo) => {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectTo ?? window.location.origin }
      })
    },
    signOut: async () => {
      await supabase.auth.signOut()
    },
    refreshProfile: async () => {
      if (session) await loadProfile(session.user.id)
    }
  }

  if (!isConfigured) {
    return (
      <div className="mx-auto mt-24 max-w-md rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm">
        <h1 className="mb-2 text-lg font-semibold">ListVault is not configured</h1>
        <p>
          Copy <code>.env.example</code> to <code>.env.local</code> and set{' '}
          <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then restart the
          dev server. See the README for Supabase setup.
        </p>
      </div>
    )
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
