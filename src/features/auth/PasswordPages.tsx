import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { AlertCircle, MailCheck } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/FormControls'
import AuthLayout from './AuthLayout'
import { requestPasswordReset, updatePassword } from '@/services/auth/authService'
import { useAuth } from '@/app/providers/AuthProvider'
import { rules, passwordRules } from '@/utils/validation'

/** Step 1: request a reset link (the provider emails it; we never reveal whether the account exists). */
export function ForgotPasswordPage() {
  const { backendConfigured } = useAuth()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>()

  if (!backendConfigured) {
    return (
      <AuthLayout title="Password reset unavailable" subtitle="This deployment has no authentication backend configured.">
        <Link to="/login" className="text-brand-700 text-sm hover:underline">
          Back to sign in
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a link to choose a new password.">
      {sent ? (
        <p className="border-line bg-surface flex items-start gap-3 rounded-xl border p-4 text-sm" role="status">
          <MailCheck size={18} className="text-brand-600 mt-0.5 shrink-0" aria-hidden />
          If an account exists for that email, a reset link is on its way.
        </p>
      ) : (
        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit(async ({ email }) => {
            setError(null)
            try {
              await requestPasswordReset(email)
              setSent(true)
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Something went wrong.')
            }
          })}
        >
          <Field label="Email" required error={errors.email?.message}>
            {(a) => <Input {...a} type="email" autoComplete="email" {...register('email', rules.email)} invalid={!!errors.email} data-autofocus />}
          </Field>
          {error && (
            <p className="flex items-center gap-2 text-sm text-red-600" role="alert">
              <AlertCircle size={15} aria-hidden /> {error}
            </p>
          )}
          <Button type="submit" variant="primary" className="w-full" loading={isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
      <Link to="/login" className="text-brand-700 mt-4 inline-block text-sm hover:underline">
        Back to sign in
      </Link>
    </AuthLayout>
  )
}

/** Step 2: the email link opens this page with a recovery session; the user sets a new password. */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<{ password: string; confirm: string }>()

  return (
    <AuthLayout title="Choose a new password">
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async ({ password }) => {
          setError(null)
          try {
            await updatePassword(password)
            navigate('/', { replace: true })
          } catch (e) {
            setError(e instanceof Error ? e.message : 'The reset link may have expired. Request a new one.')
          }
        })}
      >
        <Field label="New password" required error={errors.password?.message}>
          {(a) => (
            <Input {...a} type="password" autoComplete="new-password" {...register('password', passwordRules)} invalid={!!errors.password} data-autofocus />
          )}
        </Field>
        <Field label="Confirm password" required error={errors.confirm?.message}>
          {(a) => (
            <Input
              {...a}
              type="password"
              autoComplete="new-password"
              {...register('confirm', { validate: (v) => v === getValues('password') || 'Passwords do not match' })}
              invalid={!!errors.confirm}
            />
          )}
        </Field>
        {error && (
          <p className="flex items-center gap-2 text-sm text-red-600" role="alert">
            <AlertCircle size={15} aria-hidden /> {error}
          </p>
        )}
        <Button type="submit" variant="primary" className="w-full" loading={isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  )
}
