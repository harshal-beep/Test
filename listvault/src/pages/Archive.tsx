import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { List } from '../lib/types'

/** Archive view: reverse-chronological, grouped by month (PRD 5.4). */
export default function Archive() {
  const [lists, setLists] = useState<(List & { item_count: number })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('lv_lists')
      .select('*, items(count)')
      .eq('status', 'archived')
      .order('closed_at', { ascending: false })
      .then(({ data }) => {
        const rows = ((data as (List & { items: { count: number }[] })[]) ?? []).map((l) => ({
          ...l,
          item_count: l.items?.[0]?.count ?? 0
        }))
        setLists(rows)
        setLoading(false)
      })
  }, [])

  const groups = useMemo(() => {
    const byMonth = new Map<string, typeof lists>()
    for (const l of lists) {
      const d = new Date(l.closed_at ?? l.created_at)
      const key = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      byMonth.set(key, [...(byMonth.get(key) ?? []), l])
    }
    return [...byMonth.entries()]
  }, [lists])

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Archive</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Every closed list, kept forever. Reuse any of them with one tap.
      </p>
      {loading ? (
        <p className="text-slate-500 dark:text-slate-400">Loading…</p>
      ) : lists.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-slate-500 dark:text-slate-400">
          <p className="text-3xl">🗄️</p>
          <p className="mt-2">Nothing archived yet. Close a list and it lands here — permanently.</p>
        </div>
      ) : (
        groups.map(([month, rows]) => (
          <section key={month}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{month}</h2>
            <ul className="space-y-2">
              {rows.map((l) => (
                <li key={l.id}>
                  <Link
                    to={`/list/${l.id}`}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm hover:border-brand-500"
                  >
                    <span className="text-xl">{l.emoji ?? '📝'}</span>
                    <span className="flex-1">
                      <span className="block font-medium">{l.name}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {l.item_count} item{l.item_count === 1 ? '' : 's'} · closed{' '}
                        {l.closed_at ? new Date(l.closed_at).toLocaleDateString() : '—'}
                      </span>
                    </span>
                    <span className="text-slate-400">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
