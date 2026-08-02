export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  email: string | null
  provider: string
  is_admin: boolean
  tastes: Tastes | null
}

/** Per-person taste quiz answers; feeds the Discover ranking. */
export interface Tastes {
  cuisines: string[]
  diet: string
  vibe: string
  setting: string
  budget: string
  interests: string[]
  free_time: string[]
}

export type QuestionMood = 'fun' | 'memories' | 'preferences' | 'deeper'

export interface Question {
  id: string
  text: string
  mood: QuestionMood
  source: string
  /** Predefined choices; null = free-text only. Text stays optional alongside chips. */
  options: string[] | null
  created_at: string
}

export interface QuestionRound {
  id: string
  question_id: string
  opened_by: string
  opened_at: string
  revealed_at: string | null
  question?: Question
}

export interface QuestionAnswer {
  round_id: string
  user_id: string
  body: string | null
  choice: string | null
  created_at: string
}

export interface Expense {
  id: string
  description: string
  amount: number
  paid_by: string
  /** What the other person owes the payer for this expense. */
  owed_amount: number
  spent_on: string
  created_by: string
  created_at: string
}

export interface Settlement {
  id: string
  from_user: string
  to_user: string
  amount: number
  created_by: string
  created_at: string
}

export interface UsEvent {
  id: string
  source: string
  title: string
  category: string | null
  venue: string | null
  area: string | null
  starts_on: string | null
  price_text: string | null
  url: string | null
  reason: string | null
  score: number | null
  fetched_at: string
}

export interface List {
  id: string
  name: string
  emoji: string | null
  color: string | null
  owner_id: string
  status: 'active' | 'archived'
  join_code: string
  created_at: string
  closed_at: string | null
}

export interface ListMember {
  list_id: string
  user_id: string
  role: 'owner' | 'editor'
  muted: boolean
  joined_at: string
  profile?: Profile
}

export interface Item {
  id: string
  list_id: string
  text: string
  checked: boolean
  added_by: string | null
  checked_by: string | null
  checked_at: string | null
  /** Assignees; null/empty = unassigned. Can be one person or the whole household. */
  assigned_to: string[] | null
  /** The day you plan to do this together (ISO yyyy-mm-dd). */
  planned_for: string | null
  /** Set once done: what it was like, and a photo. */
  memory_note: string | null
  memory_photo: string | null
  position: number
  created_at: string
  updated_at: string
  // true while an optimistic write is awaiting server confirmation
  pending?: boolean
}

export interface ItemReaction {
  item_id: string
  user_id: string
  emoji: string
  created_at: string
}

export interface ItemComment {
  id: string
  item_id: string
  user_id: string
  body: string
  created_at: string
}

export const REACTION_EMOJIS = ['❤️', '🔥', '😍', '😂', '👍'] as const

export interface Note {
  id: string
  title: string
  body: string
  owner_id: string
  is_private: boolean
  updated_by: string | null
  position: number
  pinned: boolean
  /** Named pastel key ('lilac' | 'peach' | 'mint' | 'rose' | 'sky'); null = auto by id. */
  color: string | null
  created_at: string
  updated_at: string
}

export interface Habit {
  id: string
  name: string
  emoji: string | null
  color: string | null
  owner_id: string
  /** 7 = every day; 1-6 = "n times a week" (Mon-Sun week). */
  target_per_week: number
  created_at: string
}

export interface HabitCheck {
  habit_id: string
  day: string
  user_id: string
}

export interface SearchResult {
  list_id: string
  list_name: string
  emoji: string | null
  status: 'active' | 'archived'
  closed_at: string | null
  created_at: string
  matched_item: string | null
}

/** Reopen window after closing a list (PRD 5.4). */
export const REOPEN_WINDOW_MS = 24 * 60 * 60 * 1000

export function canReopen(list: List): boolean {
  return (
    list.status === 'archived' &&
    !!list.closed_at &&
    Date.now() - new Date(list.closed_at).getTime() < REOPEN_WINDOW_MS
  )
}
