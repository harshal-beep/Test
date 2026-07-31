import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { SearchResult } from '../lib/types'

const YEARS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i)

/** Full-text search over list names + item text (PRD 5.3). */
export default function Search() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'archived'>('all')
  const [year, setYear] = useState<number | ''>('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [error, setError] = useState('')

  async function run(e?: FormEvent) {
    e?.preventDefault()
    if (!query.trim()) return
    setError('')
    const { data, error: err } = await supabase.rpc('lv_search_lists', {
      p_query: query.trim(),
      p_status: status,
      p_year: year === '' ? null : year
    })
    if (err) setError(err.message)
    else setResults((data as SearchResult[]) ?? [])
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Search</h1>
      <form onSubmit={run} className="space-y-2">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search lists and items…"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-500 focus:outline-none"
          />
          <button className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white">Go</button>
        </div>
        <div className="flex gap-2 text-sm">
          {(['all', 'active', 'archived'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1 capitalize ${
                status === s ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {s}
            </button>
          ))}
          <select
            value={year}
            onChange={(e) => setYear(e.target.value === '' ? '' : Number(e.target.value))}
            className="ml-auto rounded-lg border border-slate-300 px-2 py-1"
          >
            <option value="">Any year</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {results !== null &&
        (results.length === 0 ? (
          <p className="text-slate-500">No matches.</p>
        ) : (
          <ul className="space-y-2">
            {results.map((r) => (
              <li key={r.list_id}>
                <Link
                  to={`/list/${r.list_id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-500"
                >
                  <span className="flex items-center gap-2">
                    <span>{r.emoji ?? '📝'}</span>
                    <span className="flex-1 font-medium">{r.list_name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        r.status === 'archived' ? 'bg-slate-100 text-slate-500' : 'bg-brand-100 text-brand-800'
                      }`}
                    >
                      {r.status}
                    </span>
                  </span>
                  {r.matched_item && (
                    <span className="mt-1 block text-sm text-slate-500">↳ “{r.matched_item}”</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}
