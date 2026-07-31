/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f4ff',
          100: '#e6e4ff',
          200: '#cdc9ff',
          400: '#a49dff',
          500: '#8b83ff',
          600: '#6c63ff',
          700: '#574ee0',
          800: '#3d37a3',
          900: '#1d1b4c'
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
