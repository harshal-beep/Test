'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface PartnerRow {
  id: string;
  name: string;
  tier: string;
  accounts: number;
  fallbackPhone: string | null;
  preferredLanguage: string | null;
  whatsappNumber: string | null;
  digestEnabled: boolean;
  notes: string;
}

const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'hi', label: 'Hindi' },
] as const;

/** Inline-editable partner settings — one Save per row, no modal ceremony. */
export function PartnerSettingsEditor({ partners }: { partners: PartnerRow[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Partial<PartnerRow>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const draft = (p: PartnerRow): PartnerRow => ({ ...p, ...drafts[p.id] });
  const setField = (id: string, field: keyof PartnerRow, value: unknown) => {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [field]: value } }));
    setSaved((s) => ({ ...s, [id]: false }));
  };

  async function save(p: PartnerRow) {
    const row = draft(p);
    setSaving(p.id);
    setErrors((e) => ({ ...e, [p.id]: '' }));
    try {
      const res = await fetch('/api/inputs/partners', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          channelPartnerId: p.id,
          preferredLanguage: row.preferredLanguage ?? 'en',
          whatsappNumber: row.whatsappNumber ?? '',
          digestEnabled: row.digestEnabled,
          notes: row.notes || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        const fieldError = body.errors ? Object.values(body.errors).flat().join('; ') : null;
        setErrors((e) => ({ ...e, [p.id]: fieldError ?? body.detail ?? body.title ?? 'Could not save' }));
        return;
      }
      setSaved((s) => ({ ...s, [p.id]: true }));
      router.refresh();
    } catch (err) {
      setErrors((e) => ({ ...e, [p.id]: (err as Error).message }));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {partners.map((p) => {
        const row = draft(p);
        const effectivePhone = row.whatsappNumber || p.fallbackPhone;
        return (
          <div key={p.id} className="rounded-lg border border-line p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <strong className="text-[14px] text-ink">{p.name}</strong>
              <span className="pill bg-surface-2 text-ink-soft">{p.tier}</span>
              <span className="text-[12px] text-ink-muted">{p.accounts} accounts</span>
              {!effectivePhone && <span className="pill bg-[color:var(--danger)]/15 text-danger">no send route</span>}
              {saved[p.id] && <span className="pill bg-[color:var(--good)]/15 text-good">saved</span>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="label" htmlFor={`lang-${p.id}`}>WhatsApp language</label>
                <select
                  className="input"
                  id={`lang-${p.id}`}
                  value={row.preferredLanguage ?? 'en'}
                  onChange={(e) => setField(p.id, 'preferredLanguage', e.target.value)}
                >
                  {LANGS.map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor={`wa-${p.id}`}>WhatsApp number</label>
                <input
                  className="input"
                  id={`wa-${p.id}`}
                  type="tel"
                  inputMode="numeric"
                  placeholder={p.fallbackPhone ? `default: ${p.fallbackPhone}` : 'no number on record'}
                  value={row.whatsappNumber ?? ''}
                  onChange={(e) => setField(p.id, 'whatsappNumber', e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor={`digest-${p.id}`}>Monday digest</label>
                <select
                  className="input"
                  id={`digest-${p.id}`}
                  value={row.digestEnabled ? 'on' : 'off'}
                  onChange={(e) => setField(p.id, 'digestEnabled', e.target.value === 'on')}
                >
                  <option value="on">Sends</option>
                  <option value="off">Paused</option>
                </select>
              </div>
              <div className="flex items-end">
                <button className="btn btn-active w-full" onClick={() => save(p)} disabled={saving === p.id}>
                  {saving === p.id ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
            {errors[p.id] && <p className="mt-2 text-[12.5px] text-danger">{errors[p.id]}</p>}
          </div>
        );
      })}
    </div>
  );
}
