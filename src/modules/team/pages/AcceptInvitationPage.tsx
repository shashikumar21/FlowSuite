import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, UserPlus } from 'lucide-react'
import { useAuth } from '@/app/providers/AuthProvider'
import { useTenant } from '@/app/providers/TenantProvider'
import { AuthLayout } from '@/app/layouts/AuthLayout'
import { Button } from '@/components/ui/Button'
import { requireSupabase } from '@/integrations/supabase/client'
import { getErrorMessage } from '@/lib/errors'

export function AcceptInvitationPage() {
  const { token } = useParams<{ token: string }>()
  const { user, loading: authLoading } = useAuth()
  const { refresh } = useTenant()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading || !user || !token || status !== 'idle') return
    let active = true
    setStatus('working')

    void (async () => {
      try {
        const { error } = await requireSupabase().rpc('accept_business_invitation', { p_token: token })
        if (error) throw error
        await refresh()
        if (!active) return
        setStatus('done')
        window.setTimeout(() => navigate('/', { replace: true }), 900)
      } catch (error) {
        if (!active) return
        setMessage(getErrorMessage(error))
        setStatus('error')
      }
    })()

    return () => {
      active = false
    }
  }, [authLoading, user, token, status, refresh, navigate])

  return (
    <AuthLayout
      title="Join your team"
      subtitle="Accept your invitation to a FlowSuite business workspace."
      footer={<Link className="font-semibold text-brand-600 hover:text-brand-700" to="/">Go to dashboard</Link>}
    >
      {authLoading ? (
        <p className="text-sm text-ink-500">Checking your session…</p>
      ) : !user ? (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-ink-600">
            Sign in with the email address the invitation was sent to, then come back to this link.
          </p>
          <Link to={`/login?redirect=/invite/${token ?? ''}`}>
            <Button className="w-full" size="lg">Sign in to accept <UserPlus className="size-4" /></Button>
          </Link>
          <Link to={`/signup?redirect=/invite/${token ?? ''}`}>
            <Button className="w-full" variant="outline" size="lg">Create an account</Button>
          </Link>
        </div>
      ) : status === 'done' ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
          <CheckCircle2 className="mb-2 size-6 text-emerald-600" />
          You're in! Taking you to your workspace…
        </div>
      ) : status === 'error' ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {message ?? 'This invitation could not be accepted.'}
        </div>
      ) : (
        <p className="text-sm text-ink-500">Validating your invitation…</p>
      )}
    </AuthLayout>
  )
}
