'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Same-day attendance quick-entry: a number and Enter, marking the workshop DELIVERED. */
export function AttendanceEntry({ workshopId }: { workshopId: string }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!value) return;
    setBusy(true);
    await fetch(`/api/workshops/${workshopId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ attendedCount: Number(value), status: 'DELIVERED' }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <span className="flex items-center gap-1">
      <input
        className="w-16 rounded-lg border border-line bg-surface-1 px-2 py-1 text-[12.5px]"
        type="number"
        min={0}
        placeholder="attended"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        aria-label="Attended count"
      />
      <button className="btn px-2 py-1 text-[12px]" onClick={save} disabled={busy || !value}>
        {busy ? '…' : 'Save'}
      </button>
    </span>
  );
}
