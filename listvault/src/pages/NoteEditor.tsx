import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Check, ListChecks, Lock, LockOpen, Sparkles, SpellCheck, Trash2, WrapText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Note } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { Page, Skeleton, useConfirm, useToast } from '../components/ui'

const AI_ACTIONS = [
  { key: 'summarize', label: 'Summarize', Icon: WrapText },
  { key: 'fix_grammar', label: 'Fix grammar', Icon: SpellCheck },
  { key: 'format_list', label: 'Make a list', Icon: ListChecks }
] as const

export default function NoteEditor() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const { session } = useAuth()
  const confirm = useConfirm()
  const toast = useToast()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [aiBusy, setAiBusy] = useState<string | null>(null)
  const [aiResult, setAiResult] = useState<string | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isNew) return
    supabase
      .from('lv_notes')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          toast('Note not found')
          navigate('/notes')
          return
        }
        const n = data as Note
        setTitle(n.title)
        setBody(n.body)
        setIsPrivate(n.is_private)
        setOwnerId(n.owner_id)
        setLoading(false)
      })
  }, [id, isNew]) // eslint-disable-line react-hooks/exhaustive-deps

  // auto-grow the textarea
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [body, loading])

  const isOwner = isNew || ownerId === session?.user.id
  const dirty = title.trim().length > 0 || body.trim().length > 0

  async function save() {
    if (!session || !dirty) return
    setSaving(true)
    if (isNew) {
      const { data, error } = await supabase
        .from('lv_notes')
        .insert({ title: title.trim(), body, owner_id: session.user.id, is_private: isPrivate, updated_by: session.user.id })
        .select()
        .single()
      setSaving(false)
      if (error) toast(error.message)
      else {
        toast('Note saved')
        navigate(`/notes/${(data as Note).id}`, { replace: true })
      }
    } else {
      const patch: Partial<Note> = { title: title.trim(), body, updated_by: session.user.id }
      if (isOwner) patch.is_private = isPrivate
      const { error } = await supabase.from('lv_notes').update(patch).eq('id', id)
      setSaving(false)
      if (error) toast(error.message)
      else {
        toast('Note saved')
        navigate('/notes')
      }
    }
  }

  async function remove() {
    if (!(await confirm('Delete this note?', { body: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return
    await supabase.from('lv_notes').delete().eq('id', id)
    toast('Note deleted')
    navigate('/notes')
  }

  async function runAi(action: string) {
    setAiResult(null)
    setAiBusy(action)
    const { data, error } = await supabase.functions.invoke('lv-ai', { body: { action, text: body } })
    setAiBusy(null)
    if (error) toast(error.message)
    else if (data?.error) toast(data.error)
    else setAiResult(data.result as string)
  }

  if (loading)
    return (
      <div className="space-y-3 pt-2">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-48" />
      </div>
    )

  return (
    <Page className="flex min-h-[70vh] flex-col">
      {/* Top bar */}
      <div className="mb-2 flex items-center gap-1">
        <button onClick={() => navigate('/notes')} className="icon-btn -ml-2" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <span className="flex-1" />
        {isOwner && (
          <button
            onClick={() => setIsPrivate((p) => !p)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-all active:scale-95 ${
              isPrivate
                ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900'
                : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300'
            }`}
          >
            {isPrivate ? <Lock size={13} /> : <LockOpen size={13} />}
            {isPrivate ? 'Private' : 'Shared'}
          </button>
        )}
        {!isNew && isOwner && (
          <button onClick={() => void remove()} className="icon-btn text-red-500" aria-label="Delete">
            <Trash2 size={18} />
          </button>
        )}
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="btn-primary ml-1 flex items-center gap-1.5 px-4 py-2 text-sm"
        >
          <Check size={16} /> {saving ? 'Saving…' : 'Save'}
        </motion.button>
      </div>

      {/* Editor */}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        maxLength={200}
        className="w-full bg-transparent text-[26px] font-extrabold tracking-tight placeholder:text-ink-300 focus:outline-none dark:placeholder:text-ink-600"
      />
      <textarea
        ref={bodyRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Start writing…"
        rows={6}
        maxLength={20000}
        className="mt-3 w-full flex-1 resize-none bg-transparent text-[16px] leading-relaxed placeholder:text-ink-300 focus:outline-none dark:placeholder:text-ink-600"
      />

      {/* AI toolbar */}
      <div className="sticky bottom-[86px] mt-4">
        <AnimatePresence>
          {aiResult !== null && (
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="mb-3 space-y-3 rounded-[20px] bg-white p-4 shadow-float ring-1 ring-brand-100 dark:bg-ink-900 dark:ring-brand-800"
            >
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-600">
                <Sparkles size={13} /> AI suggestion
              </p>
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-relaxed">{aiResult}</pre>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setBody(aiResult)
                    setAiResult(null)
                  }}
                  className="btn-primary flex-1 py-2.5 text-sm"
                >
                  Replace
                </button>
                <button
                  onClick={() => {
                    setBody((b) => `${b.trimEnd()}\n\n${aiResult}`)
                    setAiResult(null)
                  }}
                  className="btn-ghost flex-1 border border-brand-200 py-2.5 text-sm dark:border-brand-800"
                >
                  Append
                </button>
                <button onClick={() => setAiResult(null)} className="px-3 text-sm font-medium text-ink-400">
                  Discard
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-2 overflow-x-auto rounded-full bg-white p-1.5 shadow-float ring-1 ring-ink-100 dark:bg-ink-900 dark:ring-ink-700">
          {AI_ACTIONS.map((a) => (
            <motion.button
              key={a.key}
              whileTap={{ scale: 0.94 }}
              disabled={!body.trim() || aiBusy !== null}
              onClick={() => void runAi(a.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-40 ${
                aiBusy === a.key ? 'bg-brand-600 text-white' : 'text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-800/20'
              }`}
            >
              {aiBusy === a.key ? (
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                >
                  <Sparkles size={15} />
                </motion.span>
              ) : (
                <a.Icon size={15} />
              )}
              {aiBusy === a.key ? 'Thinking…' : a.label}
            </motion.button>
          ))}
        </div>
      </div>
    </Page>
  )
}
