'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, Suspense } from 'react';
import { ALLOWED_DAYS } from '@/lib/scope';

const NAV = [
  { href: '/', label: 'Command Center' },
  { href: '/credits', label: 'Credits & Revenue' },
  { href: '/engagement', label: 'Users & Engagement' },
  { href: '/features', label: 'Feature Usage' },
  { href: '/partners', label: 'Partners & Funnel' },
  { href: '/grant', label: 'Credit Grant' },
  { href: '/search', label: 'Search & 360' },
  { href: '/workshops', label: 'Workshops' },
];

/** Routes whose numbers are not scoped by the global date range. */
const NO_RANGE = ['/workshops', '/search', '/grant'];

function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    setTheme((document.documentElement.getAttribute('data-theme') as 'light' | 'dark') ?? 'light');
  }, []);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('pulse-theme', next);
    setTheme(next);
  };
  return (
    <button className="btn" onClick={toggle} aria-label="Toggle colour theme">
      {theme === 'dark' ? '☀︎ Light' : '☾ Dark'}
    </button>
  );
}

function RangeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = Number(params.get('days') ?? 30);

  const setDays = useCallback(
    (d: number) => {
      const next = new URLSearchParams(params.toString());
      next.set('days', String(d));
      router.push(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  if (NO_RANGE.includes(pathname)) return null;

  return (
    <div className="mx-auto flex max-w-[1280px] items-center gap-2 px-4 pt-4 sm:px-7">
      <span className="text-[12.5px] text-ink-muted">Range</span>
      {ALLOWED_DAYS.map((d) => (
        <button
          key={d}
          className={`btn ${current === d ? 'btn-active' : ''}`}
          onClick={() => setDays(d)}
          aria-pressed={current === d}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The public registration page is not part of the internal dashboard chrome.
  if (pathname.startsWith('/r/')) return <>{children}</>;

  return (
    <>
      <header className="sticky top-0 z-50 flex flex-wrap items-center gap-3 border-b border-line bg-surface-1 px-4 py-3 sm:px-7">
        <Link href="/" className="flex items-baseline gap-2">
          <span
            className="text-[22px] font-extrabold tracking-tight text-brand"
            style={{ fontFamily: 'var(--font-display), Arial, sans-serif' }}
          >
            Pucho Pulse
          </span>
          <span
            className="hidden text-[11px] uppercase tracking-[1px] text-ink-muted sm:inline"
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            Analytics
          </span>
        </Link>
        <nav className="order-3 -mx-4 flex w-screen gap-1 overflow-x-auto px-4 sm:order-none sm:mx-0 sm:w-auto sm:px-0">
          {NAV.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-[13.5px] ${
                  active ? 'bg-brand-soft font-bold text-brand' : 'text-ink-soft hover:bg-surface-2'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>
      <Suspense fallback={null}>
        <RangeFilter />
      </Suspense>
      <main className="mx-auto max-w-[1280px] px-4 pb-16 pt-4 sm:px-7">{children}</main>
      <footer className="mx-auto max-w-[1280px] px-4 pb-10 text-[12px] text-ink-muted sm:px-7">
        Pucho Toh Sahi!
      </footer>
    </>
  );
}
