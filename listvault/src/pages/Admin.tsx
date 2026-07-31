import { FormEvent, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Profile } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'

/**
 * Admin section: manage members. Adding/removing accounts goes through the
 * lv-admin-users Edge Function, which re-verifies the caller's admin flag
 * server-side before touching auth.
 */
export default function Admin() {
  const { profile, session } = useAuth()
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    void loadMembers()
  }, [])

  async function loadMembers() {
    const { data } = await supabase
      .from('lv_profiles')
      .select('*')
      .order('created_at', { ascending: true })
    setMembers((data as Profile[]) ?? [])
    setLoading(false)
  }

  if (!profile?.is_admin) {
    return <p className="text-slate-500">This section is only available to admins.</p>
  }

  async function addMember(e: FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    const { data, error: err } = await supabase.functions.invoke('lv-admin-users', {
      body: { action: 'create', email: email.trim(), password, display_name: name.trim() }
    })
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    if (data?.error) {
      setError(data.error)
      return
    }
    setNotice(`Added ${email.trim()} — share the password with them so they can sign in.`)
    setName('')
    setEmail('')
    setPassword('')
    void loadMembers()
  }

  async function removeMember(member: Profile) {
    if (!confirm(`Remove ${member.display_name || member.email}? Their account and any lists they own are deleted.`)) return
    setError('')
    const { data, error: err } = await supabase.functions.invoke('lv-admin-users', {
      body: { action: 'delete', user_id: member.id }
    })
    if (err) setError(err.message)
    else if (data?.error) setError(data.error)
    else void loadMembers()
  }

  async function toggleAdmin(member: Profile) {
    if (member.id === session?.user.id) return
    setError('')
    const { error: err } = await supabase
      .from('lv_profiles')
      .update({ is_admin: !member.is_admin })
      .eq('id', member.id)
    if (err) setError(err.message)
    else void loadMembers()
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Admin</h1>

      <form onSubmit={addMember} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Add a member</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-500 focus:outline-none"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-500 focus:outline-none"
        />
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Temporary password (6+ characters)"
          minLength={6}
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-500 focus:outline-none"
        />
        <button
          disabled={busy}
          className="w-full rounded-lg bg-brand-600 py-2 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? 'Adding…' : 'Add member'}
        </button>
        <p className="text-xs text-slate-500">
          The account is created ready to use — no email confirmation needed. Share the password
          with them; they can change it later.
        </p>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-brand-700">{notice}</p>}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">Members ({members.length})</h2>
        {loading ? (
          <p className="text-slate-500">Loading…</p>
        ) : (
          <ul className="space-y-3">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 text-sm">
                <Avatar profile={m} size={8} />
                <span className="flex-1">
                  <span className="block font-medium">
                    {m.display_name || m.email}
                    {m.id === session?.user.id && ' (you)'}
                  </span>
                  <span className="text-xs text-slate-500">{m.email}</span>
                </span>
                {m.is_admin && (
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800">
                    admin
                  </span>
                )}
                {m.id !== session?.user.id && (
                  <>
                    <button className="text-xs text-slate-600 underline" onClick={() => void toggleAdmin(m)}>
                      {m.is_admin ? 'Revoke admin' : 'Make admin'}
                    </button>
                    <button className="text-xs text-red-600 underline" onClick={() => void removeMember(m)}>
                      Remove
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
