export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  email: string | null
  provider: string
  is_admin: boolean
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
  assigned_to: string | null
  position: number
  created_at: string
  updated_at: string
  // true while an optimistic write is awaiting server confirmation
  pending?: boolean
}

export interface Note {
  id: string
  title: string
  body: string
  owner_id: string
  is_private: boolean
  updated_by: string | null
  position: number
  created_at: string
  updated_at: string
}

export interface Habit {
  id: string
  name: string
  emoji: string | null
  color: string | null
  owner_id: string
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
