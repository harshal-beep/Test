/**
 * Per-space membership: who's in, invite link, owner controls
 * (rename, new code, remove members, delete group), member leave.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Copy, LogOut, Share2, Trash2 } from '../lib/icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useSpace } from '../context/SpaceContext'
import Avatar from '../components/Avatar'
import { SPACE_EMOJIS } from '../components/SpaceSwitcher'
import { Page, useConfirm, useToast } from '../components/ui'

const COUPLE_SPACE_EMOJIS = ['💜', '❤️', '🏡', '✨', '🌙', '🦋']

export default function SpaceMembers() {
  const { session } = useAuth()
  const { space, memberRows, isCouple, refresh, setSpace, spaces } = useSpace()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const myId = session?.user.id
  const myRole = memberRows.find((m) => m.user_id === myId)?.role
  const owner = myRole === 'owner'
  const [name, setName] = useState(space?.name ?? '')
  const [emoji, setEmoji] = useState<string | null>(space?.emoji ?? null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  // Re-seed the form when the user switches spaces while on this page.
  useEffect(() => {
    setName(space?.name ?? '')
    setEmoji(space?.emoji ?? null)
  }, [space?.id])

  if (!space) return null
  const inviteLink = `${window.location.origin}/join/${space.invite_code}`
  const dirty = name.trim() !== space.name || (emoji ?? null) !== (space.emoji ?? null)
  const emojiChoices = isCouple ? COUPLE_SPACE_EMOJIS : SPACE_EMOJIS

  async function copyLink() {
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  async function shareLink() {
    const text = `Join "${space!.name}" on HaMaara: ${inviteLink}`
    if (navigator.share) await navigator.share({ text }).catch(() => undefined)
    else await copyLink()
  }

  async function regenCode() {
    if (!(await confirm('Make a new invite code? Old links stop working.', { confirmLabel: 'New code' }))) return
    const { error } = await supabase.rpc('lv_regen_invite', { p_space: space!.id })
    if (error) toast(error.message)
    else {
      await refresh()
      toast('New code ready — old links are dead 🔒')
    }
  }

  async function saveSpace() {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    const { error } = await supabase
      .from('lv_spaces')
      .update({ name: trimmed.slice(0, 60), emoji })
      .eq('id', space!.id)
    setSaving(false)
    if (error) toast(error.message)
    else {
      await refresh()
      toast('Space updated ✓')
    }
  }

  async function removeMember(userId: string, label: string) {
    if (!(await confirm(`Remove ${label} from ${space!.name}?`, { confirmLabel: 'Remove', danger: true }))) return
    const { error } = await supabase.from('lv_space_members').delete().match({ space_id: space!.id, user_id: userId })
    if (error) toast(error.message)
    else await refresh()
  }

  async function leave() {
    if (!(await confirm(`Leave ${space!.name}? You'll need a new invite to come back.`, { confirmLabel: 'Leave', danger: true })))
      return
    const { error } = await supabase.from('lv_space_members').delete().match({ space_id: space!.id, user_id: myId })
    if (error) toast(error.message)
    else {
      const next = spaces.find((s) => s.id !== space!.id)
      if (next) setSpace(next.id)
      await refresh()
      navigate('/')
    }
  }

  async function deleteSpace() {
    if (
      !(await confirm(`Delete ${space!.name} for everyone? Lists, notes and money in it are gone forever.`, {
        confirmLabel: 'Delete space',
        danger: true
      }))
    )
      return
    const { error } = await supabase.from('lv_spaces').delete().eq('id', space!.id)
    if (error) toast(error.message)
    else {
      const next = spaces.find((s) => s.id !== space!.id)
      if (next) setSpace(next.id)
      await refresh()
      navigate('/')
    }
  }

  return (
    <Page className="space-y-5">
      <div className="flex items-center gap-2">
        <Link to="/" className="icon-btn -ml-2" aria-label="Back">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="flex-1 truncate text-[26px] font-extrabold tracking-tight">
          {space.emoji ?? (isCouple ? '💜' : '👥')} {space.name}
        </h1>
      </div>

      {/* Space settings — name and emoji, owner only */}
      {owner && (
        <div className="surface space-y-3 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Space settings</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Space name"
            className="field"
          />
          <div className="flex flex-wrap gap-2">
            {[...new Set([...(space.emoji ? [space.emoji] : []), ...emojiChoices])].map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => setEmoji(em)}
                className={`rounded-2xl p-2 text-xl transition-all active:scale-90 ${
                  emoji === em ? 'bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-800/40' : 'bg-ink-100 dark:bg-ink-800'
                }`}
              >
                {em}
              </button>
            ))}
          </div>
          {dirty && (
            <button onClick={() => void saveSpace()} disabled={saving || !name.trim()} className="btn-primary flex w-full items-center justify-center gap-2 py-2.5 text-sm">
              <Check size={15} /> {saving ? 'Saving…' : 'Save changes'}
            </button>
          )}
        </div>
      )}

      {/* Invite — group spaces only; the couple space stays just you two */}
      {!isCouple && (
        <div className="surface space-y-3 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Invite friends</p>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            Anyone with this link can join <strong className="text-ink-800 dark:text-ink-100">{space.name}</strong>. Share it
            on WhatsApp — they sign up and land right here.
          </p>
          <div className="flex items-center gap-2 rounded-2xl bg-ink-50 px-3.5 py-3 dark:bg-ink-800/60">
            <code className="min-w-0 flex-1 truncate text-sm font-bold tracking-widest">{space.invite_code}</code>
            <button onClick={() => void copyLink()} className="icon-btn h-8 w-8" aria-label="Copy invite link">
              {copied ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void shareLink()} className="btn-primary flex flex-1 items-center justify-center gap-2 py-2.5 text-sm">
              <Share2 size={15} /> Share invite link
            </button>
            {owner && (
              <button onClick={() => void regenCode()} className="btn-ghost px-4 py-2.5 text-sm">
                New code
              </button>
            )}
          </div>
        </div>
      )}

      {/* Members */}
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-400">
          {memberRows.length} member{memberRows.length === 1 ? '' : 's'}
        </p>
        {memberRows.map((m) => (
          <div key={m.user_id} className="surface flex items-center gap-3 p-3.5">
            <Avatar profile={m.profile ?? null} size={9} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">
                {m.user_id === myId ? 'You' : m.profile?.display_name || 'Someone'}
              </span>
              <span className="block text-xs text-ink-400">{m.role === 'owner' ? '⭐ Owner' : 'Member'}</span>
            </span>
            {owner && m.user_id !== myId && !isCouple && (
              <button
                onClick={() => void removeMember(m.user_id, m.profile?.display_name || 'them')}
                className="icon-btn h-8 w-8 text-ink-300"
                aria-label="Remove member"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Danger zone — never on the couple space */}
      {!isCouple && (
        <div className="space-y-2 pt-2">
          {!owner && (
            <button
              onClick={() => void leave()}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-ink-100 py-3 text-sm font-semibold text-ink-600 dark:bg-ink-800 dark:text-ink-300"
            >
              <LogOut size={15} /> Leave this space
            </button>
          )}
          {owner && (
            <button
              onClick={() => void deleteSpace()}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-rose-50 py-3 text-sm font-semibold text-rose-500 dark:bg-rose-900/20"
            >
              <Trash2 size={15} /> Delete this space
            </button>
          )}
        </div>
      )}
    </Page>
  )
}
