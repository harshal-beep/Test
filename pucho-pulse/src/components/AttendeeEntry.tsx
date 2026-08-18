'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { COMPANY_SIZES, INDUSTRIES } from '@/lib/dropdowns';

type Result = { row: number; company: string; status: 'created' | 'existing' | 'error'; detail?: string };

/**
 * Manual attendee entry — the primary way workshop accounts are created today.
 *
 * Two modes because a workshop has 25–30 attendees: one form for the walk-in
 * you're adding now, and a paste box for the sheet the SA collected in the
 * room. Every row is provisioned independently, so one malformed line reports
 * itself and the rest still land.
 */
export function AttendeeEntry({ workshopId }: { workshopId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'closed' | 'one' | 'bulk'>('closed');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [paste, setPaste] = useState('');

  async function post(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workshops/${workshopId}/attendees`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok && !data.results) {
        setError(
          data.errors ? Object.values(data.errors).flat().join('; ') : data.detail ?? data.title ?? 'Could not add',
        );
        return;
      }
      setResults(data.results);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function submitOne(form: FormData) {
    void post({
      attendee: {
        companyName: form.get('companyName'),
        fullName: form.get('fullName'),
        phone: form.get('phone'),
        email: form.get('email'),
        industry: form.get('industry'),
        companySize: form.get('companySize'),
      },
    });
  }

  /** company, name, phone, email, industry, size — one attendee per line. */
  function submitBulk() {
    const attendees = paste
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [companyName, fullName, phone, email, industry, companySize] = line
          .split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
          .map((c) => c.trim().replace(/^"|"$/g, ''));
        return { companyName, fullName, phone, email, industry, companySize };
      });
    if (!attendees.length) {
      setError('Nothing to add — paste one attendee per line');
      return;
    }
    void post({ attendees });
  }

  if (results) {
    const created = results.filter((r) => r.status === 'created').length;
    const existing = results.filter((r) => r.status === 'existing').length;
    const failed = results.filter((r) => r.status === 'error');
    return (
      <section className="card">
        <h3 className="card-title">
          Added {created} account{created === 1 ? '' : 's'}
          {existing > 0 && ` · ${existing} already registered`}
          {failed.length > 0 && ` · ${failed.length} failed`}
        </h3>
        <p className="card-sub">
          Each new account has its 1,000-credit grant and this workshop&apos;s attribution.
        </p>
        {failed.length > 0 && (
          <ul className="mb-3 flex flex-col gap-1">
            {failed.map((r) => (
              <li key={r.row} className="text-[12.5px] text-danger">
                Line {r.row} ({r.company || 'blank'}): {r.detail}
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <button className="btn" onClick={() => { setResults(null); setPaste(''); setMode('closed'); }}>
            Done
          </button>
          <button className="btn" onClick={() => { setResults(null); setPaste(''); setMode('bulk'); }}>
            Add more
          </button>
        </div>
      </section>
    );
  }

  if (mode === 'closed') {
    return (
      <div className="flex gap-2">
        <button className="btn btn-active" onClick={() => setMode('one')}>+ Add attendee</button>
        <button className="btn" onClick={() => setMode('bulk')}>Paste a list</button>
      </div>
    );
  }

  return (
    <section className="card">
      <div className="mb-3 flex gap-2">
        <button className={`btn ${mode === 'one' ? 'btn-active' : ''}`} onClick={() => setMode('one')}>One attendee</button>
        <button className={`btn ${mode === 'bulk' ? 'btn-active' : ''}`} onClick={() => setMode('bulk')}>Paste a list</button>
        <button className="btn ml-auto" onClick={() => setMode('closed')}>Cancel</button>
      </div>

      {mode === 'one' ? (
        <form action={submitOne} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label" htmlFor="companyName">Company</label>
            <input className="input" id="companyName" name="companyName" required minLength={2} />
          </div>
          <div>
            <label className="label" htmlFor="fullName">Attendee name</label>
            <input className="input" id="fullName" name="fullName" required minLength={2} />
          </div>
          <div>
            <label className="label" htmlFor="phone">Mobile</label>
            <input className="input" id="phone" name="phone" type="tel" inputMode="numeric" placeholder="98XXXXXXXX" required />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" required />
          </div>
          <div>
            <label className="label" htmlFor="industry">Industry</label>
            <select className="input" id="industry" name="industry" required defaultValue="">
              <option value="" disabled>Choose…</option>
              {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="companySize">Company size</label>
            <select className="input" id="companySize" name="companySize" required defaultValue="">
              <option value="" disabled>Choose…</option>
              {COMPANY_SIZES.map((s) => <option key={s} value={s}>{s} people</option>)}
            </select>
          </div>
          {error && <p className="text-[13px] text-danger sm:col-span-2 lg:col-span-3">{error}</p>}
          <div className="sm:col-span-2 lg:col-span-3">
            <button className="btn btn-active" type="submit" disabled={busy}>
              {busy ? 'Adding…' : 'Add & grant 1,000 credits'}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="label" htmlFor="paste">
            One attendee per line — company, name, mobile, email, industry, size
          </label>
          <textarea
            className="input min-h-[160px] font-mono text-[12.5px]"
            id="paste"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={'Acme Traders, Ramesh Patel, 9812345678, ramesh@acme.in, Chemicals, 51-200\nShah Textiles, Nikhil Shah, 9898765432, nikhil@shah.in, Textiles, 11-50'}
          />
          <p className="text-[12px] text-ink-muted">
            Comma or tab separated — paste straight from Excel. Industry must be one of:{' '}
            {INDUSTRIES.join(' · ')}. Size must be one of: {COMPANY_SIZES.join(' · ')}.
          </p>
          {error && <p className="text-[13px] text-danger">{error}</p>}
          <div>
            <button className="btn btn-active" onClick={submitBulk} disabled={busy || !paste.trim()}>
              {busy ? 'Adding…' : 'Add all & grant credits'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
