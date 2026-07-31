import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Note } from '../lib/types'
import { useAuth } from '../context/AuthContext'

const AI_ACTIONS = [
  { key: 'summarize', label: '✨ Summarize' },
  { key: 'fix_grammar', label: '✏️ Fix grammar' },
  { key: 'format_list', label: '📋 Make it a list' }
] as const

export default function NoteEditor() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const { session } = useAuth()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [aiBusy, setAiBusy] = useState<string | null>(null)
  const [aiResult, setAiResult] = useState<string | null>(null)

  useEffect(() => {
    if (isNew) return
    supabase
      .from('lv_notes')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          setError('Note not found (it may be private or deleted).')
        } else {
          const n = data as Note
          setTitle(n.title)
          setBody(n.body)
          setIsPrivate(n.is_private)
          setOwnerId(n.owner_id)
        }
        setLoading(false)
      })
  }, [id, isNew])

  const isOwner = isNew || ownerId === session?.user.id

  async function save() {
    if (!session) return
    setError('')
    setSaving(true)
    if (isNew) {
      const { data, error: err } = await supabase
        .from('lv_notes')
        .insert({
          title: title.trim(),
          body,
          owner_id: session.user.id,
          is_private: isPrivate,
          updated_by: session.user.id
        })
        .select()
        .single()
      setSaving(false)
      if (err) setError(err.message)
      else navigate(`/notes/${(data as Note).id}`, { replace: true })
    } else {
      const patch: Partial<Note> = { title: title.trim(), body, updated_by: session.user.id }
      if (isOwner) patch.is_private = isPrivate
      const { error: err } = await supabase.from('lv_notes').update(patch).eq('id', id)
      setSaving(false)
      if (err) setError(err.message)
      else navigate('/notes')
    }
  }

  async function remove() {
    if (!confirm('Delete this note? This cannot be undone.')) return
    await supabase.from('lv_notes').delete().eq('id', id)
    navigate('/notes')
  }

  async function runAi(action: string) {
    setError('')
    setAiResult(null)
    setAiBusy(action)
    const { data, error: err } = await supabase.functions.invoke('lv-ai', {
      body: { action, text: body }
    })
    setAiBusy(null)
    if (err) setError(err.message)
    else if (data?.error) setError(data.error)
    else setAiResult(data.result as string)
  }

  if (loading) return <p className="text-slate-500 dark:text-slate-400">Loading…</p>

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{isNew ? 'New note' : 'Edit note'}</h1>
        <button onClick={() => navigate('/notes')} className="text-sm text-slate-500 dark:text-slate-400 underline">
          Back
        </button>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        maxLength={200}
        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-lg font-medium focus:border-brand-500 focus:outline-none"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your note…"
        rows={12}
        maxLength={20000}
        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 leading-relaxed focus:border-brand-500 focus:outline-none"
      />

      <div className="flex flex-wrap items-center gap-2">
        {AI_ACTIONS.map((a) => (
          <button
            key={a.key}
            disabled={!body.trim() || aiBusy !== null}
            onClick={() => void runAi(a.key)}
            className="rounded-full border border-brand-600 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:hover:bg-brand-800/20 disabled:opacity-40"
          >
            {aiBusy === a.key ? 'Thinking…' : a.label}
          </button>
        ))}
      </div>

      {aiResult !== null && (
        <div className="space-y-2 rounded-xl border border-brand-100 dark:border-brand-800 bg-brand-50 dark:bg-brand-800/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">AI suggestion</p>
          <pre className="whitespace-pre-wrap font-sans text-sm">{aiResult}</pre>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setBody(aiResult)
                setAiResult(null)
              }}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white"
            >
              Replace note
            </button>
            <button
              onClick={() => {
                setBody((b) => `${b.trimEnd()}\n\n${aiResult}`)
                setAiResult(null)
              }}
              className="rounded-lg border border-brand-600 px-3 py-1.5 text-sm font-semibold text-brand-700"
            >
              Append
            </button>
            <button onClick={() => setAiResult(null)} className="px-2 text-sm text-slate-500 dark:text-slate-400 underline">
              Discard
            </button>
          </div>
        </div>
      )}

      {isOwner && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="h-4 w-4 accent-brand-600"
          />
          Private — only you can see this note
        </label>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={() => void save()}
          disabled={saving || (!title.trim() && !body.trim())}
          className="rounded-lg bg-brand-600 px-5 py-2 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {!isNew && isOwner && (
          <button onClick={() => void remove()} className="text-sm text-red-600 dark:text-red-400 underline">
            Delete note
          </button>
        )}
      </div>
    </div>
  )
}
