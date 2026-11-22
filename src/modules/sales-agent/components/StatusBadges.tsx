import { Badge } from '@/components/ui/Badge'
import type { SalesLeadStatus, SalesVerificationStatus } from '@/types/database'
import { leadStatusLabel, verificationStatusLabel } from '../utils'

type Variant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'

export function LeadStatusBadge({ status }: { status: SalesLeadStatus }) {
  const variant: Variant =
    status === 'qualified' || status === 'converted'
      ? 'success'
      : status === 'unqualified'
        ? 'danger'
        : status === 'contacted'
          ? 'brand'
          : 'neutral'
  return <Badge variant={variant}>{leadStatusLabel(status)}</Badge>
}

export function VerificationStatusBadge({ status }: { status: SalesVerificationStatus }) {
  const variant: Variant =
    status === 'verified'
      ? 'success'
      : status === 'invalid'
        ? 'danger'
        : status === 'pending'
          ? 'warning'
          : 'neutral'
  return (
    <Badge
      variant={variant}
      title="Only an explicit manual attestation or a configured provider can mark a contact verified."
    >
      {verificationStatusLabel(status)}
    </Badge>
  )
}
