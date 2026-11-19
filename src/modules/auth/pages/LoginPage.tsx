import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { AuthLayout } from '@/app/layouts/AuthLayout'
import { useAuth } from '@/app/providers/AuthProvider'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label } from '@/components/ui/Input'
import { getErrorMessage } from '@/lib/errors'
import { loginSchema, type LoginValues } from '../schemas'

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const destination =
    (location.state as { from?: string } | null)?.from ??
    new URLSearchParams(location.search).get('redirect') ??
    '/'

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await signIn(values.email, values.password)
      navigate(destination, { replace: true })
    } catch (error) {
      setFormError(getErrorMessage(error, 'Invalid email or password.'))
    }
  })

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to manage your business from one place."
      footer={
        <p>
          New to {import.meta.env.VITE_APP_NAME || 'FlowSuite'}?{' '}
          <Link className="font-semibold text-brand-600 hover:text-brand-700" to="/signup">
            Create an account
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {formError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{formError}</div>
        ) : null}

        <div>
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@business.com"
            aria-invalid={Boolean(form.formState.errors.email)}
            {...form.register('email')}
          />
          <FieldError>{form.formState.errors.email?.message}</FieldError>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link className="mb-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700" to="/forgot-password">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className="pr-10"
              {...form.register('password')}
            />
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-400 hover:text-ink-700"
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <FieldError>{form.formState.errors.password?.message}</FieldError>
        </div>

        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          <LogIn className="size-4" /> Sign in
        </Button>
      </form>
    </AuthLayout>
  )
}
