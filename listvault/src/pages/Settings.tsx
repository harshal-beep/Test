import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { UserPlus, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Profile } from '../lib/types'
import Avatar from '../components/Avatar'
import { Page, useConfirm, useToast } from '../components/ui'

export default function Settings() {
  const { profile, signOut, refreshProfile } = useAuth()
  const confirmSheet = useConfirm()
  const toast = useToast()
  const [newPw, setNewPw] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [name, setName] = useState(profile?.display_name ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [household, setHousehold] = useState<Profile[]>([])

  useEffect(() => {
    supabase
      .from('lv_profiles')
      .select('*')
      .order('created_at')
      .then(({ data }) => setHousehold((data as Profile[]) ?? []))
  }, [])

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

  async function changePassword() {
    if (newPw.length < 6) {
      toast('Password needs 6+ characters')
      return
    }
    setPwBusy(true)
    const { error: err } = await supabase.auth.updateUser({ password: newPw })
    setPwBusy(false)
    if (err) toast(err.message)
    else {
      setNewPw('')
      toast('Password updated 🔒')
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
    if (!(await confirmSheet('Delete your account?', {
      body: 'Your account and every list and note you own — including archived ones — are permanently removed.',
      confirmLabel: 'Delete everything',
      danger: true
    }))) return
    const { error: err } = await supabase.rpc('lv_delete_my_account')
    if (err) setError(err.message)
    else await signOut()
  }

  return (
    <Page className="space-y-6">
      <h1 className="text-[26px] font-extrabold tracking-tight">Settings</h1>

      <section className="flex items-center gap-3 surface p-4 shadow-sm">
        <Avatar profile={profile} size={12} />
        <div className="flex-1">
          <label className="text-xs font-semibold uppercase text-ink-400" htmlFor="display-name">
            Display name
          </label>
          <div className="flex gap-2">
            <input
              id="display-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-ink-200 dark:border-ink-700 px-3 py-1.5 focus:border-brand-500 focus:outline-none"
            />
            <button onClick={() => void saveName()} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white">
              {saved ? '✓' : 'Save'}
            </button>
          </div>
          <p className="mt-1 text-xs text-ink-400">{profile?.email}</p>
        </div>
      </section>

      {/* Our home — the household everyone shares */}
      <section className="surface space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-bold">
            <Users size={18} className="text-brand-600" /> Our home
          </h2>
          <span className="text-xs text-ink-400">{household.length} people</span>
        </div>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Everyone here shares all lists, notes and habits automatically.
        </p>
        <ul className="space-y-2.5">
          {household.map((m) => (
            <li key={m.id} className="flex items-center gap-3">
              <Avatar profile={m} size={8} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {m.display_name || m.email}
                {m.id === profile?.id && ' (you)'}
              </span>
              {m.is_admin && (
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-800 dark:bg-brand-800 dark:text-brand-100">
                  admin
                </span>
              )}
            </li>
          ))}
        </ul>
        {profile?.is_admin && (
          <Link to="/admin" className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-sm">
            <UserPlus size={16} /> Add or remove people
          </Link>
        )}
      </section>

      <section className="space-y-2.5 surface p-4 text-sm shadow-sm">
        <h2 className="font-semibold">Change password</h2>
        <div className="flex gap-2">
          <input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="New password (6+ characters)"
            autoComplete="new-password"
            className="field flex-1 py-2.5"
          />
          <button
            onClick={() => void changePassword()}
            disabled={pwBusy || newPw.length < 6}
            className="btn-primary shrink-0 px-4 py-2.5 text-sm"
          >
            {pwBusy ? '…' : 'Update'}
          </button>
        </div>
      </section>

      <section className="space-y-2 surface p-4 text-sm shadow-sm">
        <h2 className="font-semibold">Your data</h2>
        <p className="text-ink-500 dark:text-ink-400">
          Minimal data is stored: your name, email, and your lists. No ads, no data resale.
        </p>
        <div className="flex gap-3 pt-1">
          <button onClick={() => void exportData()} className="rounded-lg border border-ink-200 dark:border-ink-700 px-3 py-1.5">
            Export my data (JSON)
          </button>
        </div>
      </section>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <section className="flex flex-wrap gap-3 text-sm">
        <button onClick={() => void signOut()} className="rounded-lg border border-ink-200 dark:border-ink-700 px-4 py-2">
          Sign out
        </button>
        <button onClick={() => void deleteAccount()} className="rounded-lg border border-red-300 px-4 py-2 text-red-600 dark:text-red-400">
          Delete account
        </button>
      </section>
    </Page>
  )
}
