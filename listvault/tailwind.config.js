/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Pastel lavender scale — soft by design; 600 is the primary action tint
        brand: {
          50: '#f8f7ff',
          100: '#efedff',
          200: '#e0dcff',
          400: '#c0baf7',
          500: '#aba3f0',
          600: '#948ce9',
          700: '#8078d6',
          800: '#4c4694',
          900: '#262350'
        },
        // Warm neutral scale ("ink") — softer than slate, tuned for the Notely look
        ink: {
          50: '#f6f6f9',
          100: '#ededf2',
          200: '#dcdce4',
          300: '#c2c2cd',
          400: '#9a9aa6',
          500: '#71717d',
          600: '#52525c',
          700: '#3b3b44',
          800: '#26262e',
          900: '#17171d',
          950: '#0c0c10'
        }
      },
      boxShadow: {
        card: '0 2px 16px rgba(23, 23, 29, 0.05)',
        float: '0 8px 32px rgba(23, 23, 29, 0.14)'
      }
    }
  },
  plugins: []
}
