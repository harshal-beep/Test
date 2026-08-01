import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, Monitor, Moon, Smartphone, Sun, UserPlus, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { processAvatar } from '../lib/avatarUpload'
import { applyThemeMode, getThemeMode, ThemeMode } from '../lib/theme'
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
  const [photoBusy, setPhotoBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [themeMode, setThemeMode] = useState<ThemeMode>(getThemeMode)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true

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

  async function onPhotoPicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !profile) return
    setPhotoBusy(true)
    try {
      const blob = await processAvatar(file)
      const path = `${profile.id}.jpg`
      const { error: upErr } = await supabase.storage
        .from('lv-avatars')
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('lv-avatars').getPublicUrl(path)
      // cache-bust so every client sees the new photo immediately
      const url = `${data.publicUrl}?v=${Date.now()}`
      const { error: profErr } = await supabase.from('lv_profiles').update({ avatar_url: url }).eq('id', profile.id)
      if (profErr) throw profErr
      await refreshProfile()
      toast('Photo updated 📸')
    } catch (err) {
      toast((err as Error).message)
    }
    setPhotoBusy(false)
  }

  async function removePhoto() {
    if (!profile) return
    setPhotoBusy(true)
    await supabase.storage.from('lv-avatars').remove([`${profile.id}.jpg`])
    await supabase.from('lv_profiles').update({ avatar_url: null }).eq('id', profile.id)
    await refreshProfile()
    setPhotoBusy(false)
    toast('Photo removed')
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
        <button
          onClick={() => fileRef.current?.click()}
          disabled={photoBusy}
          aria-label="Change profile photo"
          className={`relative shrink-0 transition-transform active:scale-95 ${photoBusy ? 'animate-pulse opacity-60' : ''}`}
        >
          <Avatar profile={profile} size={12} />
          <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white ring-2 ring-white dark:ring-ink-900">
            <Camera size={11} />
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onPhotoPicked(e)} />
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
          <p className="mt-1 text-xs text-ink-400">
            {profile?.email}
            {profile?.avatar_url && (
              <>
                {' · '}
                <button onClick={() => void removePhoto()} disabled={photoBusy} className="underline">
                  Remove photo
                </button>
              </>
            )}
          </p>
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

      {/* Appearance */}
      <section className="surface space-y-3 p-4 text-sm">
        <h2 className="font-semibold">Appearance</h2>
        <div className="flex gap-2">
          {(
            [
              { mode: 'light', label: 'Light', Icon: Sun },
              { mode: 'dark', label: 'Dark', Icon: Moon },
              { mode: 'system', label: 'System', Icon: Monitor }
            ] as const
          ).map(({ mode, label, Icon }) => (
            <button
              key={mode}
              onClick={() => {
                applyThemeMode(mode)
                setThemeMode(mode)
              }}
              className={`flex flex-1 flex-col items-center gap-1.5 rounded-2xl py-3 text-xs font-semibold transition-all active:scale-95 ${
                themeMode === mode
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                  : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300'
              }`}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-ink-400">System follows your phone's light/dark setting.</p>
      </section>

      {/* Install as an app */}
      <section className="surface space-y-2 p-4 text-sm">
        <h2 className="flex items-center gap-2 font-semibold">
          <Smartphone size={17} className="text-brand-600" /> HaMaara as an app
        </h2>
        {standalone ? (
          <p className="text-ink-500 dark:text-ink-400">
            Installed ✓ — you're running the full-screen app.
          </p>
        ) : (
          <p className="leading-relaxed text-ink-500 dark:text-ink-400">
            Open hamaara.vercel.app in Safari or Chrome, tap the <strong>Share</strong> icon
            (bottom bar in Safari, next to the address bar in Chrome), then{' '}
            <strong>Add to Home Screen</strong>. HaMaara opens full-screen with its own icon —
            no browser bars.
          </p>
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
        <button
          onClick={async () => {
            if (
              await confirmSheet('Sign out everywhere?', {
                body: 'Every device logged into this account is signed out, including this one. Sign back in with your password.',
                confirmLabel: 'Sign out everywhere'
              })
            ) {
              await supabase.auth.signOut({ scope: 'global' })
            }
          }}
          className="pt-1 text-xs font-medium text-ink-400 underline"
        >
          Sign out on all devices
        </button>
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

      <p className="pb-2 text-center text-xs text-ink-400">
        Ha<span className="font-semibold text-brand-600">Maara</span> · hamaara, together ❤️
      </p>
    </Page>
  )
}
