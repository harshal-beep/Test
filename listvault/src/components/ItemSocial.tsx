import { FormEvent, useState } from 'react'
import { motion } from 'framer-motion'
import { Send, SmilePlus, X } from '../lib/icons'
import { ItemComment, ItemReaction, Profile, REACTION_EMOJIS } from '../lib/types'
import Avatar from './Avatar'

/** Reactions + a short comment thread, shown inside an expanded item row. */
export default function ItemSocial({
  itemId,
  myId,
  reactions,
  comments,
  profileOf,
  onReact,
  onComment,
  onDeleteComment
}: {
  itemId: string
  myId?: string
  reactions: ItemReaction[]
  comments: ItemComment[]
  profileOf: (id: string | null) => Profile | undefined
  onReact: (itemId: string, emoji: string) => void
  onComment: (itemId: string, body: string) => void
  onDeleteComment: (id: string) => void
}) {
  const [picker, setPicker] = useState(false)
  const [draft, setDraft] = useState('')

  // emoji -> who reacted
  const grouped = new Map<string, ItemReaction[]>()
  for (const r of reactions) {
    if (!grouped.has(r.emoji)) grouped.set(r.emoji, [])
    grouped.get(r.emoji)!.push(r)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    onComment(itemId, draft)
    setDraft('')
  }

  return (
    <div className="mt-2.5 space-y-2.5">
      {/* Reactions */}
      <div className="flex flex-wrap items-center gap-1.5">
        {[...grouped.entries()].map(([emoji, rs]) => {
          const mine = rs.some((r) => r.user_id === myId)
          return (
            <motion.button
              key={emoji}
              whileTap={{ scale: 0.85 }}
              onClick={() => onReact(itemId, emoji)}
              title={rs.map((r) => profileOf(r.user_id)?.display_name ?? 'someone').join(', ')}
              className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold transition-colors ${
                mine
                  ? 'bg-brand-100 text-brand-700 dark:bg-brand-800/40 dark:text-brand-200'
                  : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300'
              }`}
            >
              <span className="text-sm">{emoji}</span>
              {rs.length}
            </motion.button>
          )
        })}
        {picker ? (
          <span className="flex items-center gap-1 rounded-full bg-ink-100 px-1.5 py-0.5 dark:bg-ink-800">
            {REACTION_EMOJIS.map((e) => (
              <motion.button
                key={e}
                whileTap={{ scale: 0.8 }}
                onClick={() => {
                  onReact(itemId, e)
                  setPicker(false)
                }}
                className="p-1 text-base"
              >
                {e}
              </motion.button>
            ))}
            <button onClick={() => setPicker(false)} aria-label="Close" className="p-1 text-ink-400">
              <X size={13} />
            </button>
          </span>
        ) : (
          <button
            onClick={() => setPicker(true)}
            aria-label="Add reaction"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-100 text-ink-400 transition-colors hover:text-brand-600 dark:bg-ink-800"
          >
            <SmilePlus size={14} />
          </button>
        )}
      </div>

      {/* Comments */}
      {comments.length > 0 && (
        <ul className="space-y-2">
          {comments.map((c) => {
            const author = profileOf(c.user_id)
            return (
              <li key={c.id} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">
                  <Avatar profile={author} size={5} />
                </span>
                <p className="min-w-0 flex-1 text-xs leading-relaxed">
                  <span className="font-semibold">
                    {c.user_id === myId ? 'You' : author?.display_name?.split(' ')[0] || 'Someone'}
                  </span>{' '}
                  <span className="text-ink-600 dark:text-ink-300">{c.body}</span>
                </p>
                {c.user_id === myId && (
                  <button
                    onClick={() => onDeleteComment(c.id)}
                    aria-label="Delete comment"
                    className="shrink-0 p-0.5 text-ink-300 hover:text-red-500"
                  >
                    <X size={12} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={submit} className="flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Say something…"
          maxLength={1000}
          className="min-w-0 flex-1 rounded-full bg-ink-100 px-3 py-1.5 text-[16px] placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 dark:bg-ink-800"
        />
        <motion.button
          whileTap={{ scale: 0.85 }}
          disabled={!draft.trim()}
          aria-label="Send comment"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white disabled:opacity-30"
        >
          <Send size={14} />
        </motion.button>
      </form>
    </div>
  )
}
