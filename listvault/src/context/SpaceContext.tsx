import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { Profile, Space, SpaceMember } from '../lib/types'
import { useAuth } from './AuthContext'

interface SpaceState {
  spaces: Space[]
  /** Current space; null only while loading or when the user belongs to none. */
  space: Space | null
  /** Members of the current space, profiles included. */
  members: Profile[]
  memberRows: SpaceMember[]
  isCouple: boolean
  loading: boolean
  /** True when the user already belongs to a couple space (only one allowed). */
  hasCouple: boolean
  setSpace: (id: string) => void
  createSpace: (name: string, emoji: string | null, kind?: 'group' | 'couple') => Promise<string>
  joinSpace: (code: string) => Promise<string>
  refresh: () => Promise<void>
}

const SpaceContext = createContext<SpaceState | null>(null)

const LS_KEY = 'lv-space'

export function SpaceProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [spaces, setSpaces] = useState<Space[]>([])
  const [allMembers, setAllMembers] = useState<SpaceMember[]>([])
  const [spaceId, setSpaceId] = useState<string | null>(() => localStorage.getItem(LS_KEY))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) {
      setSpaces([])
      setAllMembers([])
      setLoading(true)
      return
    }
    void refresh()
    const channel = supabase
      .channel('spaces')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_spaces' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_space_members' }, () => void refresh())
      .subscribe()
    return () => void supabase.removeChannel(channel)
  }, [session?.user.id])

  async function refresh() {
    const [s, m] = await Promise.all([
      supabase.from('lv_spaces').select('*').order('created_at'),
      supabase.from('lv_space_members').select('*, profile:lv_profiles(*)')
    ])
    // Couple space first, then groups by age.
    const rows = ((s.data as Space[]) ?? []).sort((a, b) =>
      a.kind === b.kind ? a.created_at.localeCompare(b.created_at) : a.kind === 'couple' ? -1 : 1
    )
    setSpaces(rows)
    setAllMembers((m.data as SpaceMember[]) ?? [])
    setLoading(false)
  }

  // Resolve the active space: stored choice if still a member, else first space.
  const space = useMemo(() => {
    if (spaces.length === 0) return null
    return spaces.find((s) => s.id === spaceId) ?? spaces[0]
  }, [spaces, spaceId])

  const memberRows = useMemo(
    () => (space ? allMembers.filter((m) => m.space_id === space.id) : []),
    [allMembers, space?.id]
  )
  const members = useMemo(
    () => memberRows.map((m) => m.profile).filter(Boolean) as Profile[],
    [memberRows]
  )

  const value: SpaceState = {
    spaces,
    space,
    members,
    memberRows,
    isCouple: space?.kind === 'couple',
    hasCouple: spaces.some((s) => s.kind === 'couple'),
    loading,
    setSpace: (id) => {
      localStorage.setItem(LS_KEY, id)
      setSpaceId(id)
    },
    createSpace: async (name, emoji, kind = 'group') => {
      const { data, error } = await supabase.rpc('lv_create_space', { p_name: name, p_emoji: emoji, p_kind: kind })
      if (error) throw error
      await refresh()
      return data as string
    },
    joinSpace: async (code) => {
      const { data, error } = await supabase.rpc('lv_join_space', { p_code: code })
      if (error) throw error
      await refresh()
      return data as string
    },
    refresh
  }

  return <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>
}

export function useSpace(): SpaceState {
  const ctx = useContext(SpaceContext)
  if (!ctx) throw new Error('useSpace must be used inside SpaceProvider')
  return ctx
}
