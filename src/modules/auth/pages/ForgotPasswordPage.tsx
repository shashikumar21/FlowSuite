import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Send } from 'lucide-react'
import { AuthLayout } from '@/app/layouts/AuthLayout'
import { useAuth } from '@/app/providers/AuthProvider'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label } from '@/components/ui/Input'
import { getErrorMessage } from '@/lib/errors'
import { forgotPasswordSchema, type ForgotPasswordValues } from '../schemas'

export function ForgotPasswordPage() {
  const { resetPassword } = useAuth()
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await resetPassword(values.email)
      setSent(true)
    } catch (error) {
      setFormError(getErrorMessage(error))
    }
  })

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll send you a secure link to choose a new password."
      footer={<Link className="font-semibold text-brand-600 hover:text-brand-700" to="/login">Back to sign in</Link>}
    >
      {sent ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
          Check your inbox for the password reset link. It expires shortly for your security.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {formError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{formError}</div>
          ) : null}
          <div>
            <Label htmlFor="email">Work email</Label>
            <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
            <FieldError>{form.formState.errors.email?.message}</FieldError>
          </div>
          <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
            <Send className="size-4" /> Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
