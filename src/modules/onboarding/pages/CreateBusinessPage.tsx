import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, Building2, Check, Loader2 } from 'lucide-react'
import { useAuth } from '@/app/providers/AuthProvider'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { FieldError, Input, Label } from '@/components/ui/Input'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { requireSupabase } from '@/integrations/supabase/client'
import { getErrorMessage } from '@/lib/errors'
import { slugify } from '@/lib/format'
import type { IndustryTemplateRow } from '@/types/database'
import { businessSchema, type BusinessValues } from '../schemas'

export function CreateBusinessPage() {
  const { user, signOut, profile } = useAuth()
  const { refresh } = useTenant()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const [nameTouched, setNameTouched] = useState(false)

  const templatesQuery = useQuery({
    queryKey: ['industry-templates'],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('industry_templates')
        .select('*')
        .eq('active', true)
        .order('name')
        .returns<IndustryTemplateRow[]>()
      if (error) throw error
      return data
    },
  })

  const form = useForm<BusinessValues>({
    resolver: zodResolver(businessSchema),
    defaultValues: { name: '', slug: '', industry: '', email: '', phone: '' },
  })

  const name = form.watch('name')
  useEffect(() => {
    if (!nameTouched && name) form.setValue('slug', slugify(name), { shouldValidate: true })
  }, [name, nameTouched, form])

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      const supabase = requireSupabase()
      const tenantId = await supabase.rpc('create_business', {
        p_name: values.name,
        p_slug: values.slug,
        p_industry: values.industry,
        p_email: values.email || null,
        p_phone: values.phone || null,
      })
      if (tenantId.error) throw tenantId.error

      const template = templatesQuery.data?.find((item) => item.slug === values.industry)
      if (template) {
        const applied = await supabase.rpc('apply_industry_template', {
          p_tenant_id: tenantId.data,
          p_template_slug: template.slug,
        })
        if (applied.error) throw applied.error
      }

      await refresh()
      toast({ title: 'Workspace ready', description: `${values.name} has been created.` })
      navigate('/', { replace: true })
    } catch (error) {
      setFormError(getErrorMessage(error))
    }
  })

  return (
    <main className="min-h-svh bg-ink-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-black text-white">F</span>
            <span className="text-lg font-bold tracking-tight text-ink-900">FlowSuite</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-ink-500">
            <span className="hidden sm:inline">{profile?.full_name ?? user?.email}</span>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>

        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Step 1 of 1</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink-900">Create your business workspace</h1>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            Choose your industry and we'll set up a relevant pipeline, booking defaults and dashboard — without changing
            the underlying CRM.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {formError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Building2 className="size-4 text-brand-600" /> Business details</CardTitle>
              <CardDescription>This becomes your tenant — isolated from every other business on the platform.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="name">Business name</Label>
                <Input
                  id="name"
                  placeholder="e.g. Sharma Dental Clinic"
                  {...form.register('name', { onChange: () => setNameTouched(false) })}
                />
                <FieldError>{form.formState.errors.name?.message}</FieldError>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="slug">Workspace URL</Label>
                <div className="flex items-center rounded-lg border border-ink-300 bg-white shadow-xs focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
                  <span className="pl-3 text-sm text-ink-400">flowsuite.app/</span>
                  <input
                    id="slug"
                    className="h-10 min-w-0 flex-1 bg-transparent pr-3 text-sm text-ink-900 outline-none"
                    {...form.register('slug', { onChange: () => setNameTouched(true) })}
                  />
                </div>
                <FieldError>{form.formState.errors.slug?.message}</FieldError>
              </div>
              <div>
                <Label htmlFor="email">Business email <span className="font-normal text-ink-400">(optional)</span></Label>
                <Input id="email" type="email" placeholder="hello@business.com" {...form.register('email')} />
                <FieldError>{form.formState.errors.email?.message}</FieldError>
              </div>
              <div>
                <Label htmlFor="phone">Business phone <span className="font-normal text-ink-400">(optional)</span></Label>
                <Input id="phone" type="tel" placeholder="+91 98765 43210" {...form.register('phone')} />
                <FieldError>{form.formState.errors.phone?.message}</FieldError>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Choose your industry</CardTitle>
              <CardDescription>You can change this later. The same CRM powers every template.</CardDescription>
            </CardHeader>
            <CardContent>
              {templatesQuery.isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-24" />)}
                </div>
              ) : templatesQuery.isError ? (
                <ErrorState
                  message={getErrorMessage(templatesQuery.error)}
                  onRetry={() => void templatesQuery.refetch()}
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {templatesQuery.data?.map((template) => {
                    const selected = form.watch('industry') === template.slug
                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => form.setValue('industry', template.slug, { shouldValidate: true })}
                        className={`flex gap-3 rounded-xl border p-4 text-left transition ${
                          selected
                            ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20'
                            : 'border-ink-200 bg-white hover:border-brand-300 hover:bg-ink-50'
                        }`}
                      >
                        <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600'}`}>
                          {selected ? <Check className="size-4" /> : <Building2 className="size-4" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-ink-900">{template.name}</span>
                          <span className="mt-1 block text-xs leading-5 text-ink-500">{template.description}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              <FieldError>{form.formState.errors.industry?.message}</FieldError>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-ink-400">Defaults, INR currency and Asia/Kolkata timezone are applied automatically.</p>
            <Button type="submit" size="lg" loading={form.formState.isSubmitting || templatesQuery.isLoading}>
              Create workspace <ArrowRight className="size-4" />
            </Button>
          </div>
        </form>

        {form.formState.isSubmitting ? (
          <p className="mt-4 flex items-center justify-end gap-2 text-xs text-ink-500">
            <Loader2 className="size-3.5 animate-spin" /> Provisioning your tenant and applying template…
          </p>
        ) : null}
      </div>
    </main>
  )
}
