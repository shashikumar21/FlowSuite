import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound } from 'lucide-react'
import { AuthLayout } from '@/app/layouts/AuthLayout'
import { useAuth } from '@/app/providers/AuthProvider'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label } from '@/components/ui/Input'
import { getErrorMessage } from '@/lib/errors'
import { resetPasswordSchema, type ResetPasswordValues } from '../schemas'

export function ResetPasswordPage() {
  const { updatePassword } = useAuth()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await updatePassword(values.password)
      navigate('/', { replace: true })
    } catch (error) {
      setFormError(getErrorMessage(error))
    }
  })

  return (
    <AuthLayout title="Choose a new password" subtitle="Use at least 8 characters for your account.">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {formError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{formError}</div>
        ) : null}
        <div>
          <Label htmlFor="password">New password</Label>
          <Input id="password" type="password" autoComplete="new-password" {...form.register('password')} />
          <FieldError>{form.formState.errors.password?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input id="confirmPassword" type="password" autoComplete="new-password" {...form.register('confirmPassword')} />
          <FieldError>{form.formState.errors.confirmPassword?.message}</FieldError>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          <KeyRound className="size-4" /> Update password
        </Button>
      </form>
    </AuthLayout>
  )
}
