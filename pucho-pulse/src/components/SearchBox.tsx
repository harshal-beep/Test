'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const TYPES = [
  { key: 'all', label: 'All' },
  { key: 'partner', label: 'Partners' },
  { key: 'org', label: 'Organizations' },
  { key: 'user', label: 'Users' },
] as const;

export function SearchBox({
  initialQuery,
  initialType,
}: {
  initialQuery: string;
  initialType: 'all' | 'partner' | 'org' | 'user';
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [type, setType] = useState(initialType);

  const go = (nextQ: string, nextType: typeof type) => {
    const params = new URLSearchParams();
    if (nextQ) params.set('q', nextQ);
    params.set('type', nextType);
    router.push(`/search?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(q, type);
        }}
        className="flex gap-2"
      >
        <input
          className="input"
          placeholder="Name, company or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search partners, organizations and users"
        />
        <button className="btn btn-active" type="submit">
          Search
        </button>
      </form>
      <div className="flex flex-wrap gap-1">
        {TYPES.map((t) => (
          <button
            key={t.key}
            className={`btn ${type === t.key ? 'btn-active' : ''}`}
            onClick={() => {
              setType(t.key);
              go(q, t.key);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
