import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  // Surfaced in the UI by AuthContext; the app renders a setup hint instead of crashing.
  console.warn('ListVault: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set')
}

export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'anon', {
  auth: { persistSession: true, autoRefreshToken: true }
})

export const isConfigured = Boolean(url && anonKey)
