import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound, Save } from 'lucide-react'
import { useAuth } from '@/app/providers/AuthProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { FieldError, Input, Label, Select } from '@/components/ui/Input'
import { requireSupabase } from '@/integrations/supabase/client'
import { getErrorMessage } from '@/lib/errors'
import { z } from 'zod'

const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your name'),
  phone: z.string().trim().optional(),
  locale: z.string().min(1),
})
const passwordSchema = z
  .object({ password: z.string().min(8, 'Use at least 8 characters'), confirm: z.string() })
  .refine((values) => values.password === values.confirm, { message: 'Passwords do not match', path: ['confirm'] })

type ProfileValues = z.infer<typeof profileSchema>
type PasswordValues = z.infer<typeof passwordSchema>

export function ProfileSettingsPage() {
  const { profile, user, refreshProfile, updatePassword } = useAuth()
  const { toast } = useToast()
  const [profileError, setProfileError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: '', phone: '', locale: 'en' },
  })
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', confirm: '' },
  })

  useEffect(() => {
    if (!profile) return
    form.reset({ fullName: profile.full_name ?? '', phone: profile.phone ?? '', locale: profile.locale })
  }, [profile, form])

  const saveProfile = form.handleSubmit(async (values) => {
    setProfileError(null)
    try {
      const { error } = await requireSupabase()
        .from('profiles')
        .update({ full_name: values.fullName, phone: values.phone || null, locale: values.locale })
        .eq('id', profile?.id as string)
      if (error) throw error
      await refreshProfile()
      toast({ title: 'Profile saved' })
    } catch (cause) {
      setProfileError(getErrorMessage(cause))
    }
  })

  const savePassword = passwordForm.handleSubmit(async (values) => {
    setPasswordError(null)
    try {
      await updatePassword(values.password)
      passwordForm.reset()
      toast({ title: 'Password updated' })
    } catch (cause) {
      setPasswordError(getErrorMessage(cause))
    }
  })

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Settings</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">Profile & security</h1>
        <p className="mt-1 text-sm text-ink-500">Your account across every business you belong to.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
          <CardDescription>Signed in as {user?.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="space-y-4" noValidate>
            {profileError ? <p className="text-sm text-red-600">{profileError}</p> : null}
            <div>
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" {...form.register('fullName')} />
              <FieldError>{form.formState.errors.fullName?.message}</FieldError>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" {...form.register('phone')} />
              </div>
              <div>
                <Label htmlFor="locale">Language</Label>
                <Select id="locale" {...form.register('locale')}>
                  <option value="en">English</option>
                  <option value="hi">हिन्दी (Hindi)</option>
                  <option value="te">తెలుగు (Telugu)</option>
                </Select>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" loading={form.formState.isSubmitting}><Save className="size-4" /> Save profile</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Use a strong password you don't use elsewhere.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={savePassword} className="space-y-4" noValidate>
            {passwordError ? <p className="text-sm text-red-600">{passwordError}</p> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" type="password" autoComplete="new-password" {...passwordForm.register('password')} />
                <FieldError>{passwordForm.formState.errors.password?.message}</FieldError>
              </div>
              <div>
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input id="confirm-password" type="password" autoComplete="new-password" {...passwordForm.register('confirm')} />
                <FieldError>{passwordForm.formState.errors.confirm?.message}</FieldError>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" variant="outline" loading={passwordForm.formState.isSubmitting}>
                <KeyRound className="size-4" /> Update password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
