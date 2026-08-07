import { FormEvent, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, Info, ShieldCheck, UserPlus } from '../lib/icons'
import { supabase } from '../lib/supabase'
import { Profile } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { useSpace } from '../context/SpaceContext'
import Avatar from '../components/Avatar'
import { Page, useConfirm, useToast } from '../components/ui'

interface Invite {
  name: string
  email: string
  password: string
}

function inviteMessage(inv: Invite): string {
  const hi = inv.name ? `Hi ${inv.name}! ` : ''
  return (
    `🏠 *Welcome to HaMaara!*\n` +
    `_Hamaara ghar, hamaari lists_ ✨\n\n` +
    `${hi}Your account is ready — shared lists, notes & habits for all of us.\n\n` +
    `👉 https://hamaara.vercel.app\n\n` +
    `📧 *Email:* ${inv.email}\n` +
    `🔑 *Password:* ${inv.password}\n\n` +
    `Log in straight away (no verification email). ` +
    `💡 Change your password anytime from Settings → Change password.`
  )
}

/**
 * Accounts admin — logins, not membership. Who can see a given space is
 * managed per-space on the Members page; the only thing that happens here
 * is creating a login and (rarely, loudly) deleting one for good.
 */
export default function Admin() {
  const { profile, session } = useAuth()
  const { space, memberRows, isCouple, refresh: refreshSpaces } = useSpace()
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

  const inSpace = (id: string) => memberRows.some((m) => m.user_id === id)

  async function addMember(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInvite(null)
    setBusy(true)
    const { data, error: err } = await supabase.functions.invoke('lv-admin-users', {
      body: { action: 'create', email: email.trim(), password, display_name: name.trim() }
    })
    if (err || data?.error) {
      setBusy(false)
      setError(err?.message || data.error)
      return
    }
    // A login on its own shows an empty app — put them in the space you're in.
    if (data?.user_id && space) {
      const { error: joinErr } = await supabase.rpc('lv_add_member', { p_space: space.id, p_user: data.user_id })
      if (joinErr) toast(`Account made, but adding to ${space.name} failed: ${joinErr.message}`)
      await refreshSpaces()
    }
    setBusy(false)
    toast(`Account created — added to ${space?.name ?? 'your space'}`)
    setInvite({ name: name.trim(), email: email.trim(), password })
    setName('')
    setEmail('')
    setPassword('')
    void loadMembers()
  }

  /** Space-scoped: touches this one space's membership, nothing else. */
  async function toggleSpaceMembership(member: Profile) {
    if (!space) return
    if (inSpace(member.id)) {
      if (isCouple) {
        toast('The couple space always keeps both of you')
        return
      }
      if (
        !(await confirmSheet(`Remove ${member.display_name || member.email} from ${space.name}?`, {
          body: 'They lose access to this space only. Their account and everything they made stay put.',
          confirmLabel: 'Remove from space',
          danger: true
        }))
      )
        return
      const { error: err } = await supabase
        .from('lv_space_members')
        .delete()
        .match({ space_id: space.id, user_id: member.id })
      if (err) toast(err.message)
    } else {
      const { error: err } = await supabase.rpc('lv_add_member', { p_space: space.id, p_user: member.id })
      if (err) toast(err.message)
      else toast(`Added to ${space.name}`)
    }
    await refreshSpaces()
  }

  /** Irreversible: kills the login itself, everywhere. */
  async function deleteAccount(member: Profile) {
    const label = member.display_name || member.email
    if (
      !(await confirmSheet(`Delete ${label}'s account permanently?`, {
        body:
          'This is not "remove from a space". It deletes their login and removes them from EVERY space. ' +
          'Lists, notes and habits they made stay, but lose their name. If they appear anywhere in Money, ' +
          'the deletion is refused — settle up first.',
        confirmLabel: 'Delete account',
        danger: true
      }))
    )
      return
    setError('')
    const { data, error: err } = await supabase.functions.invoke('lv-admin-users', {
      body: { action: 'delete', user_id: member.id }
    })
    if (err) setError(err.message)
    else if (data?.error) setError(data.error)
    else {
      toast('Account deleted')
      void loadMembers()
      await refreshSpaces()
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
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">Accounts</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Logins for everyone who uses HaMaara. Membership of a space is managed on its Members page.
        </p>
      </div>

      <div className="flex gap-3 rounded-[20px] bg-brand-50 p-4 text-sm leading-relaxed text-ink-600 dark:bg-brand-800/20 dark:text-ink-300">
        <Info size={18} className="mt-0.5 shrink-0 text-brand-600" />
        <p>
          <strong>Accounts vs spaces:</strong> an account is someone's login. A space is one shared world of lists,
          notes and money. Creating an account here also adds them to{' '}
          <strong>{space?.emoji} {space?.name}</strong> — use the toggle below to put them in or out of this space.
          Deleting an <em>account</em> is permanent and affects every space, so it sits apart, in red.
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
          {busy ? 'Creating…' : `Create account & add to ${space?.name ?? 'this space'}`}
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
        <h2 className="mb-1 font-bold">Everyone with a login · {members.length}</h2>
        <p className="mb-3 text-xs text-ink-500 dark:text-ink-400">
          The toggle controls {space?.name} only.
        </p>
        {loading ? (
          <p className="text-ink-500 dark:text-ink-400">Loading…</p>
        ) : (
          <ul className="space-y-4">
            {members.map((m) => {
              const here = inSpace(m.id)
              const isMe = m.id === session?.user.id
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                  <Avatar profile={m} size={9} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {m.display_name || m.email}
                      {isMe && ' (you)'}
                    </span>
                    <span className="block truncate text-xs text-ink-500 dark:text-ink-400">{m.email}</span>
                  </span>
                  {m.is_admin && (
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800 dark:bg-brand-800 dark:text-brand-100">
                      admin
                    </span>
                  )}
                  <button
                    onClick={() => void toggleSpaceMembership(m)}
                    disabled={isMe || (here && isCouple)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                      here
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-800/30 dark:text-brand-200'
                        : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300'
                    }`}
                  >
                    {here ? `In ${space?.name} ✓` : `Add to ${space?.name}`}
                  </button>
                  {!isMe && (
                    <span className="flex w-full items-center gap-3 pl-12 sm:w-auto sm:pl-0">
                      <button className="text-xs font-medium text-ink-500 dark:text-ink-400" onClick={() => void toggleAdmin(m)}>
                        {m.is_admin ? 'Revoke admin' : 'Make admin'}
                      </button>
                      <button className="text-xs font-medium text-red-500" onClick={() => void deleteAccount(m)}>
                        Delete account
                      </button>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </Page>
  )
}
