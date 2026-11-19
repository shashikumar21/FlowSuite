import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save, ShieldAlert } from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { FieldError, Input, Label, Select } from '@/components/ui/Input'
import { requireSupabase } from '@/integrations/supabase/client'
import { getErrorMessage } from '@/lib/errors'
import { z } from 'zod'

const schema = z.object({
  name: z.string().trim().min(2, 'Enter a business name'),
  email: z.union([z.string().email('Enter a valid email address'), z.literal('')]).optional(),
  phone: z.string().trim().optional(),
  website: z.string().trim().optional(),
  timezone: z.string().min(1),
  currency: z.string().min(1),
})
type Values = z.infer<typeof schema>

export function BusinessSettingsPage() {
  const { activeTenant, can, refresh } = useTenant()
  const { toast } = useToast()
  const [error, setError] = useState<string | null>(null)
  const business = activeTenant?.businesses

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', phone: '', website: '', timezone: 'Asia/Kolkata', currency: 'INR' },
  })

  useEffect(() => {
    if (!business) return
    form.reset({
      name: business.name,
      email: business.email ?? '',
      phone: business.phone ?? '',
      website: business.website ?? '',
      timezone: business.timezone,
      currency: business.currency,
    })
  }, [business, form])

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    try {
      const { error: updateError } = await requireSupabase()
        .from('businesses')
        .update({
          name: values.name,
          email: values.email || null,
          phone: values.phone || null,
          website: values.website || null,
          timezone: values.timezone,
          currency: values.currency,
        })
        .eq('id', activeTenant?.tenant_id as string)
      if (updateError) throw updateError
      await refresh()
      toast({ title: 'Business profile saved' })
    } catch (cause) {
      setError(getErrorMessage(cause))
    }
  })

  if (!can('manage_business')) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-10 text-sm text-ink-600">
          <ShieldAlert className="size-5 text-amber-500" /> Only owners and admins can change business settings.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Settings</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">Business profile</h1>
        <p className="mt-1 text-sm text-ink-500">These details are scoped to this tenant only.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Workspace URL: flowsuite.app/{business?.slug}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <div>
              <Label htmlFor="name">Business name</Label>
              <Input id="name" {...form.register('name')} />
              <FieldError>{form.formState.errors.name?.message}</FieldError>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...form.register('email')} />
                <FieldError>{form.formState.errors.email?.message}</FieldError>
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" {...form.register('phone')} />
              </div>
              <div>
                <Label htmlFor="website">Website</Label>
                <Input id="website" placeholder="https://" {...form.register('website')} />
              </div>
              <div>
                <Label htmlFor="currency">Currency</Label>
                <Select id="currency" {...form.register('currency')}>
                  <option value="INR">INR — Indian Rupee</option>
                  <option value="USD">USD — US Dollar</option>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select id="timezone" {...form.register('timezone')}>
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="UTC">UTC</option>
                </Select>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" loading={form.formState.isSubmitting}><Save className="size-4" /> Save changes</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
