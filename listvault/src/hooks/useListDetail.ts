import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Item, List, ListMember, Profile } from '../lib/types'
import { useAuth } from '../context/AuthContext'

/**
 * Server-authoritative list state with optimistic UI and last-write-wins per
 * item (PRD: sync model). Realtime changes arrive over a Supabase channel and
 * reconcile against local optimistic rows.
 */
export function useListDetail(listId: string) {
  const { session } = useAuth()
  const [list, setList] = useState<List | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [members, setMembers] = useState<ListMember[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [synced, setSynced] = useState(true)
  const pendingIds = useRef(new Set<string>())

  const load = useCallback(async () => {
    const [listRes, itemsRes, membersRes] = await Promise.all([
      supabase.from('lv_lists').select('*').eq('id', listId).maybeSingle(),
      supabase.from('lv_items').select('*').eq('list_id', listId).order('position'),
      supabase.from('lv_list_members').select('*, profile:lv_profiles(*)').eq('list_id', listId)
    ])
    if (!listRes.data) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setList(listRes.data as List)
    setItems((itemsRes.data as Item[]) ?? [])
    setMembers((membersRes.data as ListMember[]) ?? [])
    setLoading(false)
  }, [listId])

  useEffect(() => {
    void load()
    const channel = supabase
      .channel(`list-${listId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lv_items', filter: `list_id=eq.${listId}` },
        (payload) => {
          setItems((prev) => {
            if (payload.eventType === 'DELETE') {
              const old = payload.old as { id: string }
              return prev.filter((i) => i.id !== old.id)
            }
            const row = payload.new as Item
            pendingIds.current.delete(row.id)
            const idx = prev.findIndex((i) => i.id === row.id)
            const next = idx === -1 ? [...prev, row] : prev.map((i) => (i.id === row.id ? row : i))
            return next.sort((a, b) => a.position - b.position)
          })
          setSynced(pendingIds.current.size === 0)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lv_lists', filter: `id=eq.${listId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') setNotFound(true)
          else setList(payload.new as List)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lv_list_members', filter: `list_id=eq.${listId}` },
        () => void load()
      )
      .subscribe()
    return () => void supabase.removeChannel(channel)
  }, [listId, load])

  function track(id: string) {
    pendingIds.current.add(id)
    setSynced(false)
  }

  function settle(id: string) {
    pendingIds.current.delete(id)
    setSynced(pendingIds.current.size === 0)
  }

  /** Add one or more items (one per line) with instant optimistic rows. */
  async function addItems(rawText: string) {
    if (!session) return
    const lines = rawText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.slice(0, 500))
    if (lines.length === 0) return
    if (items.length + lines.length > 500) {
      // PRD 5.1 soft cap: 500 items/list
      console.warn('listvault: item cap (500) hit for list', listId)
    }
    const basePos = items.length ? Math.max(...items.map((i) => i.position)) + 1 : 1
    const rows = lines.map((text, i) => ({
      id: crypto.randomUUID(),
      list_id: listId,
      text,
      checked: false,
      added_by: session.user.id,
      checked_by: null,
      checked_at: null,
      position: basePos + i,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      pending: true
    }))
    rows.forEach((r) => track(r.id))
    setItems((prev) => [...prev, ...rows])
    const { error } = await supabase.from('lv_items').insert(
      rows.map(({ pending: _p, created_at: _c, updated_at: _u, checked_at: _ca, checked_by: _cb, ...r }) => r)
    )
    if (error) {
      rows.forEach((r) => settle(r.id))
      setItems((prev) => prev.filter((i) => !rows.some((r) => r.id === i.id)))
      throw error
    }
    rows.forEach((r) => settle(r.id))
  }

  async function toggleItem(item: Item) {
    if (!session) return
    const checked = !item.checked
    const patch = {
      checked,
      checked_by: checked ? session.user.id : null,
      checked_at: checked ? new Date().toISOString() : null
    }
    track(item.id)
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...patch } : i)))
    const { error } = await supabase.from('lv_items').update(patch).eq('id', item.id)
    settle(item.id)
    if (error) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)))
    }
  }

  async function editItem(item: Item, text: string) {
    const trimmed = text.trim().slice(0, 500)
    if (!trimmed || trimmed === item.text) return
    track(item.id)
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, text: trimmed } : i)))
    await supabase.from('lv_items').update({ text: trimmed }).eq('id', item.id)
    settle(item.id)
  }

  async function deleteItem(item: Item) {
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    await supabase.from('lv_items').delete().eq('id', item.id)
  }

  /** Reorder by fractional position: cheap, conflict-tolerant. */
  async function moveItem(item: Item, direction: -1 | 1) {
    const sorted = [...items].sort((a, b) => a.position - b.position)
    const idx = sorted.findIndex((i) => i.id === item.id)
    const targetIdx = idx + direction
    if (targetIdx < 0 || targetIdx >= sorted.length) return
    const neighbor = sorted[targetIdx]
    const beyond = sorted[targetIdx + direction]
    const newPos = beyond
      ? (neighbor.position + beyond.position) / 2
      : neighbor.position + direction
    track(item.id)
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, position: newPos } : i)).sort((a, b) => a.position - b.position)
    )
    await supabase.from('lv_items').update({ position: newPos }).eq('id', item.id)
    settle(item.id)
  }

  const profileOf = useCallback(
    (userId: string | null): Profile | undefined =>
      members.find((m) => m.user_id === userId)?.profile,
    [members]
  )

  return {
    list,
    items: [...items].sort((a, b) => a.position - b.position),
    members,
    loading,
    notFound,
    synced,
    isOwner: !!list && !!session && list.owner_id === session.user.id,
    addItems,
    toggleItem,
    editItem,
    deleteItem,
    moveItem,
    profileOf,
    reload: load
  }
}
