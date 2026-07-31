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
          500: '#8b83ff',
          600: '#6c63ff',
          700: '#574ee0',
          800: '#3d37a3',
          900: '#1d1b4c'
        }
      }
    }
  },
  plugins: []
}
