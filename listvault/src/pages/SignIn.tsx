import AuthForm from '../components/AuthForm'

export default function SignIn() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <h1 className="text-3xl font-bold text-brand-700">ListVault</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">
          Shared lists that never forget. Make it together, keep it forever.
        </p>
      </div>
      <AuthForm />
      <p className="max-w-xs text-xs text-slate-400">
        Minimal data — your name and email. No ads, no data resale.
      </p>
    </div>
  )
}
