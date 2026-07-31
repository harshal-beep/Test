import { FormEvent, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, Info, ShieldCheck, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Profile } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import { Page, useConfirm, useToast } from '../components/ui'

interface Invite {
  name: string
  email: string
  password: string
}

function inviteMessage(inv: Invite): string {
  return (
    `You're invited to HaMaara 🎉\n\n` +
    `Open: https://hamaara.vercel.app\n` +
    `Email: ${inv.email}\n` +
    `Temporary password: ${inv.password}\n\n` +
    `Log in and you're in — no email verification needed.`
  )
}

/**
 * Admin section: manage members. Adding/removing accounts goes through the
 * lv-admin-users Edge Function, which re-verifies the caller's admin flag
 * server-side before touching auth.
 */
export default function Admin() {
  const { profile, session } = useAuth()
  const confirmSheet = useConfirm()
  const toast = useToast()
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [invite, setInvite] = useState<Invite | null>(null)

  useEffect(() => {
    void loadMembers()
  }, [])

  async function loadMembers() {
    const { data } = await supabase.from('lv_profiles').select('*').order('created_at', { ascending: true })
    setMembers((data as Profile[]) ?? [])
    setLoading(false)
  }

  if (!profile?.is_admin) {
    return <p className="text-ink-500 dark:text-ink-400">This section is only available to admins.</p>
  }

  async function addMember(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInvite(null)
    setBusy(true)
    const { data, error: err } = await supabase.functions.invoke('lv-admin-users', {
      body: { action: 'create', email: email.trim(), password, display_name: name.trim() }
    })
    setBusy(false)
    if (err || data?.error) {
      setError(err?.message || data.error)
      return
    }
    toast('Account created')
    setInvite({ name: name.trim(), email: email.trim(), password })
    setName('')
    setEmail('')
    setPassword('')
    void loadMembers()
  }

  async function removeMember(member: Profile) {
    if (!(await confirmSheet(`Remove ${member.display_name || member.email}?`, {
      body: 'Their account and any lists they own are deleted.',
      confirmLabel: 'Remove',
      danger: true
    }))) return
    setError('')
    const { data, error: err } = await supabase.functions.invoke('lv-admin-users', {
      body: { action: 'delete', user_id: member.id }
    })
    if (err) setError(err.message)
    else if (data?.error) setError(data.error)
    else {
      toast('Member removed')
      void loadMembers()
    }
  }

  async function toggleAdmin(member: Profile) {
    if (member.id === session?.user.id) return
    setError('')
    const { error: err } = await supabase.from('lv_profiles').update({ is_admin: !member.is_admin }).eq('id', member.id)
    if (err) setError(err.message)
    else void loadMembers()
  }

  return (
    <Page className="space-y-5">
      <h1 className="text-[26px] font-extrabold tracking-tight">Admin</h1>

      {/* How invites work */}
      <div className="flex gap-3 rounded-[20px] bg-brand-50 p-4 text-sm leading-relaxed text-ink-600 dark:bg-brand-800/20 dark:text-ink-300">
        <Info size={18} className="mt-0.5 shrink-0 text-brand-600" />
        <p>
          <strong>How adding members works:</strong> you create their account here with an email +
          temporary password. HaMaara does <strong>not</strong> send them an email — after creating
          the account, share the login details with them yourself (WhatsApp button below makes it
          one tap). They log in immediately, no verification needed.
        </p>
      </div>

      <form onSubmit={addMember} className="surface space-y-3 p-4">
        <h2 className="flex items-center gap-2 font-bold">
          <UserPlus size={18} className="text-brand-600" /> Add a member
        </h2>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="field" />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Their email (used as their login ID)"
          required
          className="field"
        />
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Temporary password (6+ characters)"
          minLength={6}
          required
          className="field"
        />
        <button disabled={busy} className="btn-primary w-full py-3">
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Invite card — appears after a successful creation */}
      {invite && (
        <motion.div
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', damping: 24, stiffness: 300 }}
          className="space-y-3 rounded-[20px] border-2 border-brand-200 bg-white p-4 dark:border-brand-800 dark:bg-ink-900"
        >
          <p className="flex items-center gap-2 font-bold">
            <ShieldCheck size={18} className="text-brand-600" />
            {invite.name || invite.email} can log in now
          </p>
          <div className="space-y-1 rounded-2xl bg-ink-100 p-3.5 font-mono text-sm dark:bg-ink-800">
            <p>Email: {invite.email}</p>
            <p>Password: {invite.password}</p>
          </div>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            Now share these details with them — this card disappears when you leave the page.
          </p>
          <div className="flex gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(inviteMessage(invite))}`}
              target="_blank"
              rel="noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#25D366] py-3 font-semibold text-white shadow-lg shadow-[#25D366]/30 active:scale-[0.98]"
            >
              Share on WhatsApp
            </a>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(inviteMessage(invite))
                toast('Invite copied')
              }}
              className="btn-ghost flex items-center gap-1.5 border border-brand-200 px-4 py-3 text-sm dark:border-brand-800"
            >
              <Copy size={15} /> Copy
            </button>
          </div>
        </motion.div>
      )}

      <section className="surface p-4">
        <h2 className="mb-3 font-bold">Members · {members.length}</h2>
        {loading ? (
          <p className="text-ink-500 dark:text-ink-400">Loading…</p>
        ) : (
          <ul className="space-y-3.5">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 text-sm">
                <Avatar profile={m} size={9} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {m.display_name || m.email}
                    {m.id === session?.user.id && ' (you)'}
                  </span>
                  <span className="block truncate text-xs text-ink-500 dark:text-ink-400">{m.email}</span>
                </span>
                {m.is_admin && (
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800 dark:bg-brand-800 dark:text-brand-100">
                    admin
                  </span>
                )}
                {m.id !== session?.user.id && (
                  <>
                    <button className="text-xs font-medium text-ink-500 dark:text-ink-400" onClick={() => void toggleAdmin(m)}>
                      {m.is_admin ? 'Revoke admin' : 'Make admin'}
                    </button>
                    <button className="text-xs font-medium text-red-500" onClick={() => void removeMember(m)}>
                      Remove
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  )
}
