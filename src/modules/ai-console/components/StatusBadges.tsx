import { Badge } from '@/components/ui/Badge'
import type {
  AiAgentStatus,
  AiClassification,
  AiConsentStatus,
  AiFollowUpJobStatus,
  ChannelCredentialRow,
  ConversationRow,
} from '@/types/database'
import {
  agentStatusVariant,
  classificationLabel,
  consentStatusVariant,
  conversationAiStatusVariant,
  credentialStatusVariant,
  jobStatusVariant,
} from '../utils'

export function AgentStatusBadge({ status }: { status: AiAgentStatus }) {
  return <Badge variant={agentStatusVariant(status)}>{status}</Badge>
}

export function ConversationAiStatusBadge({ status }: { status: ConversationRow['ai_status'] }) {
  return <Badge variant={conversationAiStatusVariant(status)}>{status.replace('_', ' ')}</Badge>
}

export function CredentialStatusBadge({ status }: { status: ChannelCredentialRow['status'] }) {
  return <Badge variant={credentialStatusVariant(status)}>{status}</Badge>
}

export function JobStatusBadge({ status }: { status: AiFollowUpJobStatus }) {
  return <Badge variant={jobStatusVariant(status)}>{status}</Badge>
}

export function ConsentStatusBadge({ status }: { status: AiConsentStatus | null }) {
  return <Badge variant={consentStatusVariant(status)}>{status ?? 'none'}</Badge>
}

export function ClassificationBadge({ value }: { value: AiClassification | string }) {
  return <Badge variant="brand">{classificationLabel(value)}</Badge>
}
