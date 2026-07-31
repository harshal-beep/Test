import { Note } from './types'

export const NOTE_COLOR_KEYS = ['lilac', 'peach', 'mint', 'rose', 'sky'] as const
export type NoteColorKey = (typeof NOTE_COLOR_KEYS)[number]

/** Card background (light/dark) and picker-dot swatch per named pastel. */
export const NOTE_COLORS: Record<NoteColorKey, { card: string; dot: string }> = {
  lilac: { card: 'bg-[#edebff] dark:bg-[#2b2952]', dot: '#cdc8ff' },
  peach: { card: 'bg-[#fff1e0] dark:bg-[#3d3325]', dot: '#ffd9ad' },
  mint: { card: 'bg-[#e4f7ee] dark:bg-[#22382f]', dot: '#b5e8d0' },
  rose: { card: 'bg-[#ffe9f0] dark:bg-[#3c2733]', dot: '#ffc2d6' },
  sky: { card: 'bg-[#e8f1ff] dark:bg-[#24314a]', dot: '#bcd8ff' }
}

/**
 * Stable color for a note: its chosen color, else one derived from the note
 * id — so cards keep their color when the grid is reordered.
 */
export function noteColorKey(note: Pick<Note, 'id' | 'color'>): NoteColorKey {
  if (note.color && note.color in NOTE_COLORS) return note.color as NoteColorKey
  let h = 0
  for (let i = 0; i < note.id.length; i++) h = (h + note.id.charCodeAt(i)) % NOTE_COLOR_KEYS.length
  return NOTE_COLOR_KEYS[h]
}
