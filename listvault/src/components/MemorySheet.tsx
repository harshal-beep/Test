import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ImagePlus, Trash2 } from '../lib/icons'
import { supabase } from '../lib/supabase'
import { processPhoto } from '../lib/images'
import { Item } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { BottomSheet, useToast } from './ui'

/**
 * Asked right after something is ticked off: what was it like, and a photo.
 * Both optional — skipping is one tap.
 */
export default function MemorySheet({
  item,
  onClose,
  onSave
}: {
  item: Item | null
  onClose: () => void
  onSave: (item: Item, note: string | null, photo: string | null) => void | Promise<void>
}) {
  const { session } = useAuth()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!item) return
    setNote(item.memory_note ?? '')
    setPhoto(item.memory_photo)
  }, [item])

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !session || !item) return
    setBusy(true)
    try {
      const blob = await processPhoto(file)
      const path = `${session.user.id}/${item.id}.jpg`
      const { error } = await supabase.storage
        .from('lv-memories')
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' })
      if (error) throw error
      const { data } = supabase.storage.from('lv-memories').getPublicUrl(path)
      setPhoto(`${data.publicUrl}?v=${Date.now()}`)
    } catch (err) {
      toast((err as Error).message)
    }
    setBusy(false)
  }

  async function save() {
    if (!item) return
    setBusy(true)
    await onSave(item, note.trim() || null, photo)
    setBusy(false)
    onClose()
  }

  return (
    <BottomSheet open={item !== null} onClose={onClose} title="Keep this as a memory">
      {item && (
        <div className="space-y-4 pb-1">
          <p className="text-sm text-ink-500 dark:text-ink-400">
            You did <strong className="text-ink-900 dark:text-ink-100">{item.text}</strong> 🎉 Add a
            photo or a line about it — it goes into Memories.
          </p>

          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pick(e)} />
          {photo ? (
            <div className="relative overflow-hidden rounded-2xl">
              <img src={photo} alt="" className="max-h-56 w-full object-cover" />
              <button
                onClick={() => setPhoto(null)}
                aria-label="Remove photo"
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-ink-950/60 text-white backdrop-blur-sm"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-ink-200 py-7 text-sm font-medium text-ink-500 transition-colors hover:border-brand-400 hover:text-brand-600 disabled:opacity-50 dark:border-ink-700 dark:text-ink-400"
            >
              <ImagePlus size={22} />
              {busy ? 'Uploading…' : 'Add a photo'}
            </button>
          )}

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="How was it?"
            rows={2}
            maxLength={500}
            className="field resize-none"
          />

          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 rounded-full bg-ink-100 py-3 font-semibold dark:bg-ink-800">
              Skip
            </button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => void save()}
              disabled={busy}
              className="btn-primary flex-1 py-3"
            >
              {busy ? 'Saving…' : 'Save memory'}
            </motion.button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
