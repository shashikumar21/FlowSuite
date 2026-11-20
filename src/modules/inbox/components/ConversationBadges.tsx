import { Badge } from '@/components/ui/Badge'
import type { ConversationRow, ConversationStatus } from '@/types/database'

export function ConversationStatusBadge({ status }: { status: ConversationStatus }) {
  const variant = status === 'open' ? 'success' : status === 'pending' ? 'warning' : 'neutral'
  return <Badge variant={variant}>{status}</Badge>
}

export function PriorityBadge({ priority }: { priority: ConversationRow['priority'] }) {
  const variant =
    priority === 'urgent' ? 'danger' : priority === 'high' ? 'warning' : priority === 'low' ? 'neutral' : 'brand'
  return <Badge variant={variant}>{priority}</Badge>
}
