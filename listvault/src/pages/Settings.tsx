import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'

export default function Settings() {
  const { profile, signOut, refreshProfile } = useAuth()
  const [name, setName] = useState(profile?.display_name ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function saveName() {
    if (!profile || !name.trim()) return
    const { error: err } = await supabase
      .from('lv_profiles')
      .update({ display_name: name.trim() })
      .eq('id', profile.id)
    if (err) setError(err.message)
    else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      await refreshProfile()
    }
  }

  async function exportData() {
    setError('')
    const { data, error: err } = await supabase.rpc('lv_export_my_data')
    if (err) {
      setError(err.message)
      return
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'listvault-export.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function deleteAccount() {
    if (!confirm('Delete your account and all lists you own? This cannot be undone.')) return
    if (!confirm('Really delete everything? Archived lists you own are removed too.')) return
    const { error: err } = await supabase.rpc('lv_delete_my_account')
    if (err) setError(err.message)
    else await signOut()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Settings</h1>

      <section className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
        <Avatar profile={profile} size={12} />
        <div className="flex-1">
          <label className="text-xs font-semibold uppercase text-slate-400" htmlFor="display-name">
            Display name
          </label>
          <div className="flex gap-2">
            <input
              id="display-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 focus:border-brand-500 focus:outline-none"
            />
            <button onClick={() => void saveName()} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white">
              {saved ? '✓' : 'Save'}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-400">{profile?.email}</p>
        </div>
      </section>

      <section className="space-y-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-sm shadow-sm">
        <h2 className="font-semibold">Your data</h2>
        <p className="text-slate-500 dark:text-slate-400">
          Minimal data is stored: your name, email, and your lists. No ads, no data resale.
        </p>
        <div className="flex gap-3 pt-1">
          <button onClick={() => void exportData()} className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5">
            Export my data (JSON)
          </button>
        </div>
      </section>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <section className="flex flex-wrap gap-3 text-sm">
        <button onClick={() => void signOut()} className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2">
          Sign out
        </button>
        <button onClick={() => void deleteAccount()} className="rounded-lg border border-red-300 px-4 py-2 text-red-600 dark:text-red-400">
          Delete account
        </button>
      </section>
    </div>
  )
}
