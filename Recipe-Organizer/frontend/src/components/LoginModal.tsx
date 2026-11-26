import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/dbClient'
import { t } from '../strings'

/** Phase 2 only: single shared household account (Supabase Auth, email + password). */
export default function LoginModal() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (err) setError(t.login.failed)
    setBusy(false)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={(e) => void onSubmit(e)} className="card w-full max-w-sm space-y-4 p-6">
        <div className="text-center">
          <img src="/icon.svg" alt="" className="mx-auto mb-3 h-14 w-14 rounded-2xl" />
          <h1 className="text-2xl font-bold">{t.login.title}</h1>
          <p className="mt-1 text-sm text-muted">{t.app.subtitle}</p>
        </div>
        <div>
          <label className="label" htmlFor="login-email">
            {t.login.email}
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            required
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="login-password">
            {t.login.password}
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary-hover">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {t.login.submit}
        </button>
      </form>
    </div>
  )
}

