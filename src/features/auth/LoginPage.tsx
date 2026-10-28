import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { AlertCircle, Clock } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/FormControls'
import AuthLayout from './AuthLayout'
import DemoAccounts from './DemoAccounts'
import { useAuth } from '@/app/providers/AuthProvider'
import { rules } from '@/utils/validation'

interface FormValues {
  email: string
  password: string
}

export default function LoginPage() {
  const { signIn, backendConfigured, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: { email: '', password: '' } })

  const goIn = () => navigate(from, { replace: true })

  const onSubmit = async (values: FormValues) => {
    setError(null)
    try {
      await signIn(values.email, values.password)
      goIn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.')
    }
  }

  return (
    <AuthLayout
      title="Sign in to TalentNest"
      subtitle={backendConfigured ? 'Use your work email and password.' : 'This deployment has no backend configured — explore the demo workspace below.'}
    >
      {status === 'expired' && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          <Clock size={15} aria-hidden /> Your session expired. Please sign in again.
        </p>
      )}

      {backendConfigured && (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="mb-6 space-y-4">
          <Field label="Email" required error={errors.email?.message}>
            {(a) => <Input {...a} type="email" autoComplete="email" {...register('email', rules.email)} invalid={!!errors.email} data-autofocus />}
          </Field>
          <Field label="Password" required error={errors.password?.message}>
            {(a) => (
              <Input
                {...a}
                type="password"
                autoComplete="current-password"
                {...register('password', { required: 'Password is required' })}
                invalid={!!errors.password}
              />
            )}
          </Field>
          {error && (
            <p className="flex items-center gap-2 text-sm text-red-600" role="alert">
              <AlertCircle size={15} aria-hidden /> {error}
            </p>
          )}
          <Button type="submit" variant="primary" className="w-full" loading={isSubmitting}>
            Sign in
          </Button>
          <div className="flex justify-between text-sm">
            <Link to="/forgot-password" className="text-brand-700 hover:underline">
              Forgot password?
            </Link>
            <Link to="/signup" className="text-brand-700 hover:underline">
              Create an account
            </Link>
          </div>
        </form>
      )}

      <DemoAccounts onSignedIn={goIn} />
    </AuthLayout>
  )
}
