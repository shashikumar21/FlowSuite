import {
  ArrowRightLeft,
  CalendarDays,
  CircleCheck,
  Handshake,
  Mail,
  Phone,
  StickyNote,
  UserCheck,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { ActivityType, ContactStatus, DealStatus, LeadStatus } from '@/types/database'

type Variant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'

const LEAD_VARIANTS: Record<LeadStatus, Variant> = {
  new: 'brand',
  contacted: 'warning',
  qualified: 'success',
  unqualified: 'danger',
  converted: 'success',
}

const CONTACT_VARIANTS: Record<ContactStatus, Variant> = {
  lead: 'brand',
  customer: 'success',
  inactive: 'neutral',
}

const DEAL_VARIANTS: Record<DealStatus, Variant> = {
  open: 'brand',
  won: 'success',
  lost: 'danger',
}

const ACTIVITY_ICONS: Record<ActivityType, LucideIcon> = {
  note: StickyNote,
  call: Phone,
  email: Mail,
  meeting: CalendarDays,
  task: CircleCheck,
  status_change: ArrowRightLeft,
  stage_change: ArrowRightLeft,
  assignment: UserCheck,
  lead_created: UserPlus,
  deal_created: Handshake,
}

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <Badge variant={LEAD_VARIANTS[status]}>{status}</Badge>
}

export function ContactStatusBadge({ status }: { status: ContactStatus }) {
  return <Badge variant={CONTACT_VARIANTS[status]}>{status}</Badge>
}

export function DealStatusBadge({ status }: { status: DealStatus }) {
  return <Badge variant={DEAL_VARIANTS[status]}>{status}</Badge>
}

export function ActivityIcon({ type }: { type: ActivityType }) {
  const Icon = ACTIVITY_ICONS[type] ?? StickyNote
  return <Icon className="size-4" />
}
