import { notFound } from 'next/navigation';
import { getWorkshopByToken } from '@/lib/workshops';
import { RegistrationForm } from '@/components/RegistrationForm';

export const dynamic = 'force-dynamic';

/**
 * Public registration page — the ONLY grant path for workshop accounts
 * (ROLLOUT "Risks": attribution skipped at registration is the fatal failure).
 * Target: under 60 seconds on a phone, in a room with conference wifi.
 */
export default async function RegistrationPage({ params }: { params: { token: string } }) {
  const workshop = await getWorkshopByToken(params.token);
  if (!workshop) notFound();

  const cancelled = workshop.status === 'CANCELLED';

  return (
    <main className="mx-auto flex min-h-screen max-w-[560px] flex-col justify-center px-5 py-10">
      <header className="mb-6">
        <p
          className="text-[11px] uppercase tracking-[1px] text-ink-muted"
          style={{ fontFamily: 'var(--font-mono), monospace' }}
        >
          Pucho Office workshop
        </p>
        <h1 className="text-[28px] font-extrabold leading-tight text-ink">Get your 1,000 free credits</h1>
        <p className="mt-1 text-[13.5px] text-ink-soft">
          {String(workshop.segmentName)}
          {workshop.partner ? ` · with ${String(workshop.partner)}` : ''} · takes under a minute
        </p>
      </header>

      {cancelled ? (
        <p className="card text-[14px] text-danger">This workshop was cancelled. Please contact your host.</p>
      ) : (
        <RegistrationForm token={params.token} />
      )}

      <footer className="mt-8 text-[12px] text-ink-muted">Pucho Toh Sahi!</footer>
    </main>
  );
}
