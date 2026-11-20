import { Badge } from '@/components/ui/Badge'
import type { AppointmentStatus } from '@/types/database'
import { appointmentStatusLabel, appointmentStatusTone } from '../utils'

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  return <Badge variant={appointmentStatusTone(status)}>{appointmentStatusLabel(status)}</Badge>
}
