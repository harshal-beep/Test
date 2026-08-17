import type { Config } from 'tailwindcss';

/**
 * Colours are CSS variables, not Tailwind literals, because the theme switch is
 * an attribute on <html> (data-theme) exactly as in the reference prototype.
 * Token values live in src/app/globals.css — one source, both themes.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
        },
        line: 'var(--border)',
        ink: {
          DEFAULT: 'var(--text-primary)',
          soft: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        brand: {
          DEFAULT: 'var(--brand)',
          soft: 'var(--brand-soft)',
        },
        series: {
          1: 'var(--series-1)',
          2: 'var(--series-2)',
          3: 'var(--series-3)',
          4: 'var(--series-4)',
          5: 'var(--series-5)',
        },
        good: 'var(--good)',
        warn: 'var(--warn)',
        danger: 'var(--danger)',
        grid: 'var(--grid)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Arial', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      borderRadius: { card: '14px' },
    },
  },
  plugins: [],
};

export default config;
