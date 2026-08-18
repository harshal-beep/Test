'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CAMPAIGN_TAGS, SEGMENTS } from '@/lib/dropdowns';


/**
 * "Create a workshop in under 2 minutes and get a QR to paste into my last
 * slide" (PRD §5 story 2). Six fields, all but one pre-filled or a dropdown,
 * and the QR comes back in the same round trip.
 */
export function WorkshopCreator({ partners }: { partners: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ url: string; qr: string; segment: string } | null>(null);

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/workshops', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workshopDate: form.get('workshopDate'),
          segmentName: form.get('segmentName'),
          campaignTag: form.get('campaignTag') || null,
          channelPartnerId: form.get('channelPartnerId') || null,
          invitedCount: Number(form.get('invitedCount') ?? 0),
          workbookUrl: form.get('workbookUrl') || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.detail ?? body.title ?? 'Could not create the workshop');
        return;
      }
      setCreated({ url: body.registrationUrl, qr: body.qr, segment: body.workshop.segmentName });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <section className="card">
        <h2 className="card-title">Workshop created — {created.segment}</h2>
        <p className="card-sub">
          Open the workshop to add attendees — that is the normal path, and each one gets the
          1,000-credit grant with this workshop&apos;s attribution stamped on it. The QR below is an
          optional self-service fallback until Pucho&apos;s own registration system posts to the Pulse
          webhook.
        </p>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={created.qr} alt="Registration QR code" className="h-44 w-44 rounded-lg border border-line" />
          <div className="min-w-0">
            <code className="block break-all rounded-lg bg-surface-2 px-3 py-2 text-[12.5px]">{created.url}</code>
            <div className="mt-3 flex gap-2">
              <button className="btn" onClick={() => navigator.clipboard?.writeText(created.url)}>
                Copy link
              </button>
              <a className="btn" href={created.qr} download="pucho-workshop-qr.png">
                Download QR
              </a>
              <button className="btn" onClick={() => { setCreated(null); setOpen(false); }}>
                Done
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!open) {
    return (
      <div>
        <button className="btn btn-active" onClick={() => setOpen(true)}>
          + New workshop
        </button>
      </div>
    );
  }

  return (
    <section className="card">
      <h2 className="card-title">New workshop</h2>
      <p className="card-sub">Saving generates the registration link and QR.</p>
      <form
        action={submit}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div>
          <label className="label" htmlFor="workshopDate">Date & time</label>
          <input className="input" id="workshopDate" name="workshopDate" type="datetime-local" required />
        </div>
        <div>
          <label className="label" htmlFor="segmentName">Segment</label>
          <select className="input" id="segmentName" name="segmentName" required defaultValue="">
            <option value="" disabled>Choose…</option>
            {SEGMENTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="campaignTag">Campaign tag</label>
          <select className="input" id="campaignTag" name="campaignTag" defaultValue="">
            <option value="">None</option>
            {CAMPAIGN_TAGS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="channelPartnerId">Channel partner</label>
          <select className="input" id="channelPartnerId" name="channelPartnerId" defaultValue="">
            <option value="">None</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="invitedCount">Invited</label>
          <input className="input" id="invitedCount" name="invitedCount" type="number" min={0} defaultValue={0} />
        </div>
        <div>
          <label className="label" htmlFor="workbookUrl">Workbook link</label>
          <input className="input" id="workbookUrl" name="workbookUrl" type="url" placeholder="https://…" />
        </div>
        {error && <p className="text-[13px] text-danger sm:col-span-2 lg:col-span-3">{error}</p>}
        <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
          <button className="btn btn-active" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create & get QR'}
          </button>
          <button className="btn" type="button" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
