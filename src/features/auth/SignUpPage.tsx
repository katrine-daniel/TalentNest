import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { AlertCircle, MailCheck } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/FormControls'
import AuthLayout from './AuthLayout'
import { useAuth } from '@/app/providers/AuthProvider'
import { rules, passwordRules } from '@/utils/validation'

interface FormValues {
  fullName: string
  organizationName: string
  email: string
  password: string
  confirm: string
}

export default function SignUpPage() {
  const { signUp, backendConfigured } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>()

  if (!backendConfigured) return <Navigate to="/login" replace />

  const onSubmit = async (values: FormValues) => {
    setError(null)
    try {
      const { needsConfirmation } = await signUp(values)
      if (needsConfirmation) setConfirmEmail(values.email)
      else navigate('/', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create your account.')
    }
  }

  if (confirmEmail) {
    return (
      <AuthLayout title="Check your inbox">
        <p className="border-line bg-surface flex items-start gap-3 rounded-xl border p-4 text-sm">
          <MailCheck size={18} className="text-brand-600 mt-0.5 shrink-0" aria-hidden />
          <span>
            We sent a confirmation link to <strong>{confirmEmail}</strong>. After confirming, sign in and your organization will be created.
          </span>
        </p>
        <Link to="/login" className="text-brand-700 mt-4 inline-block text-sm hover:underline">
          Back to sign in
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Create your workspace" subtitle="You'll be the administrator of a new organization.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Field label="Full name" required error={errors.fullName?.message}>
          {(a) => <Input {...a} autoComplete="name" {...register('fullName', rules.name('Full name'))} invalid={!!errors.fullName} data-autofocus />}
        </Field>
        <Field label="Organization name" required error={errors.organizationName?.message}>
          {(a) => (
            <Input {...a} autoComplete="organization" {...register('organizationName', rules.name('Organization name'))} invalid={!!errors.organizationName} />
          )}
        </Field>
        <Field label="Work email" required error={errors.email?.message}>
          {(a) => <Input {...a} type="email" autoComplete="email" {...register('email', rules.email)} invalid={!!errors.email} />}
        </Field>
        <Field label="Password" required error={errors.password?.message} hint="At least 10 characters, with letters and numbers.">
          {(a) => <Input {...a} type="password" autoComplete="new-password" {...register('password', passwordRules)} invalid={!!errors.password} />}
        </Field>
        <Field label="Confirm password" required error={errors.confirm?.message}>
          {(a) => (
            <Input
              {...a}
              type="password"
              autoComplete="new-password"
              {...register('confirm', { required: 'Confirm your password', validate: (v) => v === getValues('password') || 'Passwords do not match' })}
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
          Create account
        </Button>
        <p className="text-muted text-center text-sm">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
