import { useState, type FormEvent } from 'react'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { env, isSupabaseConfigured } from '@/config/env'
import { useAuth } from '@/app/session'
import { createSeed, DEMO_ACCOUNTS } from '@/data/seed'
import { ROLE_LABELS } from '@/domain/permissions'
import { Button } from '@/components/ui/Button'
import { Field, FormError, Input } from '@/components/ui/Form'
import { Avatar } from '@/components/ui/Layout'
import { Logo } from '@/components/shell/Logo'

const demoPeople = (() => {
  const seed = createSeed()
  return DEMO_ACCOUNTS.map((d) => ({ ...d, account: seed.accounts.find((a) => a.id === d.id) })).filter((d) => d.account)
})()

function SupabaseForm() {
  const [mode, setMode] = useState<'signin' | 'reset'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const s = await import('@/services/supabaseSession')
      if (mode === 'signin') await s.supabaseSignIn(email, password)
      else {
        await s.sendPasswordReset(email)
        setInfo('If an account exists for that email, a reset link is on its way.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setPending(false)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormError message={error} />
      {info && <p className="bg-success-soft text-success rounded-md px-3 py-2 text-sm">{info}</p>}
      <Field label="Work email" required>
        {(a) => <Input {...a} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />}
      </Field>
      {mode === 'signin' && (
        <Field label="Password" required>
          {(a) => <Input {...a} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
      )}
      <Button type="submit" variant="primary" className="w-full" loading={pending}>
        {mode === 'signin' ? 'Sign in' : 'Send reset link'}
      </Button>
      <button type="button" className="text-brand-700 text-sm hover:underline" onClick={() => setMode(mode === 'signin' ? 'reset' : 'signin')}>
        {mode === 'signin' ? 'Forgot your password?' : 'Back to sign in'}
      </button>
    </form>
  )
}

export function SignInPage() {
  const auth = useAuth()
  const [busy, setBusy] = useState<string | null>(null)
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="bg-navy-900 relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <Logo size={34} />
          <span className="text-lg font-semibold">{env.productName}</span>
        </div>
        <div className="max-w-md">
          <p className="text-3xl leading-tight font-semibold tracking-tight">From HR questions to completed, authorized workflows.</p>
          <p className="text-navy-300 mt-4 text-[15px] leading-relaxed">
            {env.productTagline} Requests, approvals, onboarding, policies and people data in one workspace — with permissions enforced at every step.
          </p>
        </div>
        <ul className="text-navy-300 grid max-w-md grid-cols-2 gap-3 text-sm">
          {['Unified HR inbox', 'Leave & approvals', 'Onboarding checklists', 'Policy-grounded assistant'].map((t) => (
            <li key={t} className="border-navy-700 rounded-md border px-3 py-2">
              {t}
            </li>
          ))}
        </ul>
      </section>
      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo size={32} />
            <span className="text-lg font-semibold">{env.productName}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          {auth.status === 'expired' && (
            <p className="bg-warning-soft text-warning mt-3 rounded-md px-3 py-2 text-sm">Your session expired. Please sign in again.</p>
          )}
          {auth.status === 'error' && auth.error && <p className="bg-danger-soft text-danger mt-3 rounded-md px-3 py-2 text-sm">{auth.error}</p>}
          {isSupabaseConfigured ? (
            <div className="mt-6">
              <SupabaseForm />
            </div>
          ) : (
            <>
              <p className="text-muted mt-2 text-sm">
                No backend is configured for this deployment, so you can explore a demo workspace with fictional data. Choose a role to see what it can access.
              </p>
              <ul className="mt-6 space-y-2">
                {demoPeople.map(({ id, blurb, account }) => (
                  <li key={id}>
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={async () => {
                        setBusy(id)
                        await auth.signInDemo(id)
                        setBusy(null)
                      }}
                      className="border-line bg-surface hover:border-brand-600 group flex w-full items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors disabled:opacity-60"
                    >
                      <Avatar name={account?.name ?? ''} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2">
                          <span className="text-sm font-medium">{account?.name}</span>
                          <span className="text-brand-700 text-xs font-medium">{account ? ROLE_LABELS[account.role] : ''}</span>
                        </span>
                        <span className="text-muted block text-xs">{blurb}</span>
                      </span>
                      <ArrowRight size={16} className="text-muted group-hover:text-brand-600" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-muted mt-6 flex items-start gap-2 text-xs">
                <ShieldCheck size={15} className="mt-px shrink-0" aria-hidden />
                Demo data is stored only in this browser. Demo sign-in does not authenticate anyone; real deployments use Supabase Auth with row-level security.
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
