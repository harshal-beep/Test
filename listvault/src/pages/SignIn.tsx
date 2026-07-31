import { useAuth } from '../context/AuthContext'

export default function SignIn({ redirectTo }: { redirectTo?: string }) {
  const { signInWithGoogle } = useAuth()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <h1 className="text-3xl font-bold text-brand-700">ListVault</h1>
        <p className="mt-2 text-slate-600">
          Shared lists that never forget. Make it together, keep it forever.
        </p>
      </div>
      <button
        onClick={() => void signInWithGoogle(redirectTo)}
        className="flex items-center gap-3 rounded-full border border-slate-300 bg-white px-6 py-3 font-medium shadow-sm hover:bg-slate-50"
      >
        <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.1 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.4 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
          <path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1z" />
          <path fill="#34A853" d="M24 48c6.1 0 11.2-2 15-5.5l-7.5-5.8c-2.1 1.4-4.7 2.2-7.5 2.2-6.3 0-11.7-3.9-13.6-9.4l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
        </svg>
        Sign in with Google
      </button>
      <p className="max-w-xs text-xs text-slate-400">
        No passwords. Minimal data — your Google name, email and photo. No ads, no data resale.
      </p>
    </div>
  )
}
