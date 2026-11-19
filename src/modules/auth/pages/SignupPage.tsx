import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { MailCheck, UserPlus } from 'lucide-react'
import { AuthLayout } from '@/app/layouts/AuthLayout'
import { useAuth } from '@/app/providers/AuthProvider'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label } from '@/components/ui/Input'
import { getErrorMessage } from '@/lib/errors'
import { signupSchema, type SignupValues } from '../schemas'

export function SignupPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [formError, setFormError] = useState<string | null>(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: '', email: '', phone: '', password: '', confirmPassword: '' },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      const confirmationRequired = await signUp({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
        phone: values.phone || undefined,
      })
      if (confirmationRequired) {
        setNeedsConfirmation(true)
      } else {
        navigate(new URLSearchParams(location.search).get('redirect') ?? '/', { replace: true })
      }
    } catch (error) {
      setFormError(getErrorMessage(error))
    }
  })

  if (needsConfirmation) {
    return (
      <AuthLayout
        title="Check your inbox"
        subtitle="We sent a confirmation link to your email address."
        footer={<Link className="font-semibold text-brand-600 hover:text-brand-700" to="/login">Back to sign in</Link>}
      >
        <div className="rounded-xl border border-brand-100 bg-brand-50 p-5 text-sm text-brand-800">
          <MailCheck className="mb-3 size-6 text-brand-600" />
          Open the confirmation link, then sign in to create your business workspace. If you don't see it, check your
          spam folder.
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Set up your business workspace in under 10 minutes."
      footer={
        <p>
          Already have an account?{' '}
          <Link className="font-semibold text-brand-600 hover:text-brand-700" to="/login">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{formError}</div>
        ) : null}

        <div>
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" autoComplete="name" placeholder="Ananya Sharma" {...form.register('fullName')} />
          <FieldError>{form.formState.errors.fullName?.message}</FieldError>
        </div>

        <div>
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@business.com" {...form.register('email')} />
          <FieldError>{form.formState.errors.email?.message}</FieldError>
        </div>

        <div>
          <Label htmlFor="phone">Phone <span className="font-normal text-ink-400">(optional)</span></Label>
          <Input id="phone" type="tel" autoComplete="tel" placeholder="+91 98765 43210" {...form.register('phone')} />
          <FieldError>{form.formState.errors.phone?.message}</FieldError>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="new-password" {...form.register('password')} />
            <FieldError>{form.formState.errors.password?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input id="confirmPassword" type="password" autoComplete="new-password" {...form.register('confirmPassword')} />
            <FieldError>{form.formState.errors.confirmPassword?.message}</FieldError>
          </div>
        </div>

        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          <UserPlus className="size-4" /> Create account
        </Button>
        <p className="text-center text-xs leading-5 text-ink-400">
          By continuing you agree to use the platform in line with applicable communication consent and data protection
          requirements.
        </p>
      </form>
    </AuthLayout>
  )
}
