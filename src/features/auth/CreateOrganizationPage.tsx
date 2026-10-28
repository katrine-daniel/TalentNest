import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { AlertCircle } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/FormControls'
import AuthLayout from './AuthLayout'
import { useAuth } from '@/app/providers/AuthProvider'
import { rules } from '@/utils/validation'

/** Shown to signed-in users who don't belong to any organization yet. */
export default function CreateOrganizationPage() {
  const { createOrganization, signOut } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ name: string }>()

  return (
    <AuthLayout title="Set up your organization" subtitle="You aren't a member of any organization yet. Create one, or ask an administrator to invite you.">
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async ({ name }) => {
          setError(null)
          try {
            await createOrganization(name)
            navigate('/', { replace: true })
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not create the organization.')
          }
        })}
      >
        <Field label="Organization name" required error={errors.name?.message}>
          {(a) => <Input {...a} {...register('name', rules.name('Organization name'))} invalid={!!errors.name} data-autofocus />}
        </Field>
        {error && (
          <p className="flex items-center gap-2 text-sm text-red-600" role="alert">
            <AlertCircle size={15} aria-hidden /> {error}
          </p>
        )}
        <Button type="submit" variant="primary" className="w-full" loading={isSubmitting}>
          Create organization
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => signOut()}>
          Sign out
        </Button>
      </form>
    </AuthLayout>
  )
}
