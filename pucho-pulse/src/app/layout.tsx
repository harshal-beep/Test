import type { Metadata } from 'next';
import './globals.css';
import { Shell } from '@/components/Shell';

export const metadata: Metadata = {
  title: 'Pucho Pulse — Analytics Command Center',
  description: 'Internal analytics + GTM platform for Pucho.ai',
};

/**
 * Theme is applied before first paint by the inline script below, so a dark-mode
 * user never sees a white flash. Fonts load non-blocking (the reference
 * prototype's three Google families).
 */
const themeBootstrap = `
try {
  var t = localStorage.getItem('pulse-theme') ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', t);
} catch (e) {}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anek+Latin:wght@600;700;800&family=Lato:wght@300;400;500;700&family=Chivo+Mono:wght@600;700&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
