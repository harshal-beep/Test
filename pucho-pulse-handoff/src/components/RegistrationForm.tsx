'use client';

import { useState } from 'react';
import { COMPANY_SIZES, INDUSTRIES } from '@/lib/dropdowns';

type Stage = 'form' | 'otp' | 'done';

export function RegistrationForm({ token }: { token: string }) {
  const [stage, setStage] = useState<Stage>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [fields, setFields] = useState({
    companyName: '',
    fullName: '',
    phone: '',
    email: '',
    industry: '',
    companySize: '',
    website: '', // honeypot
  });
  const [otp, setOtp] = useState('');

  const set = (key: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFields((f) => ({ ...f, [key]: e.target.value }));

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/register/${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'otp', phone: fields.phone }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.detail ?? body.title ?? 'Could not send the code');
      return;
    }
    setDevCode(body.devCode ?? null);
    setStage('otp');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/register/${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'submit', ...fields, otp }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.detail ?? body.title ?? 'Registration failed');
      return;
    }
    setStage('done');
  }

  if (stage === 'done') {
    return (
      <div className="card">
        <h2 className="text-[20px] font-extrabold text-ink">You&apos;re in 🎉</h2>
        <p className="mt-2 text-[14px] text-ink-soft">
          1,000 credits are on your account. Open your own Excel file in Pucho Office and ask it three questions —
          that first session is what makes the rest of the workshop click.
        </p>
      </div>
    );
  }

  return (
    <form className="card flex flex-col gap-3" onSubmit={stage === 'form' ? requestOtp : submit}>
      {stage === 'form' ? (
        <>
          <div>
            <label className="label" htmlFor="companyName">Company</label>
            <input className="input" id="companyName" value={fields.companyName} onChange={set('companyName')} required minLength={2} />
          </div>
          <div>
            <label className="label" htmlFor="fullName">Your name</label>
            <input className="input" id="fullName" value={fields.fullName} onChange={set('fullName')} required minLength={2} />
          </div>
          <div>
            <label className="label" htmlFor="phone">Mobile number</label>
            <input
              className="input"
              id="phone"
              type="tel"
              inputMode="numeric"
              placeholder="98XXXXXXXX"
              value={fields.phone}
              onChange={set('phone')}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" type="email" value={fields.email} onChange={set('email')} required />
          </div>
          {/* Industry and company size are required dropdowns — they are the
              firmographic prior in the propensity score, so free text won't do. */}
          <div>
            <label className="label" htmlFor="industry">Industry</label>
            <select className="input" id="industry" value={fields.industry} onChange={set('industry')} required>
              <option value="" disabled>Choose…</option>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="companySize">Company size</label>
            <select className="input" id="companySize" value={fields.companySize} onChange={set('companySize')} required>
              <option value="" disabled>Choose…</option>
              {COMPANY_SIZES.map((s) => (
                <option key={s} value={s}>{s} people</option>
              ))}
            </select>
          </div>
          {/* Honeypot — visually hidden, never focusable, bots fill it anyway. */}
          <input
            className="absolute left-[-9999px] h-0 w-0"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            id="website"
            name="website"
            value={fields.website}
            onChange={set('website')}
          />
        </>
      ) : (
        <>
          <p className="text-[13.5px] text-ink-soft">
            We sent a 6-digit code to {fields.phone}.
            {devCode && <span className="ml-1 text-ink-muted">(dev code: {devCode})</span>}
          </p>
          <div>
            <label className="label" htmlFor="otp">Verification code</label>
            <input
              className="input tracking-[6px]"
              id="otp"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              required
            />
          </div>
          <button className="text-left text-[12.5px] text-ink-muted underline" type="button" onClick={() => setStage('form')}>
            Change my details
          </button>
        </>
      )}

      {error && <p className="text-[13px] text-danger">{error}</p>}

      <button className="btn btn-active w-full py-2.5" type="submit" disabled={busy}>
        {busy ? 'Please wait…' : stage === 'form' ? 'Send code' : 'Claim 1,000 credits'}
      </button>
    </form>
  );
}
