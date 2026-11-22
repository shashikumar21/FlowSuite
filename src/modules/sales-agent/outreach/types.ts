import type {
  DecisionMakerRow,
  OutreachCampaignRow,
  OutreachMessageRow,
  OutreachOutboxRow,
  ProspectRow,
  SalesCampaignSummary,
  SalesEmailApprovalRow,
} from '@/types/database'

/** Minimal prospect shape used by the writer and campaign selection UI. */
export type ProspectOption = Pick<
  ProspectRow,
  'id' | 'business_name' | 'email' | 'industry' | 'website' | 'city' | 'lead_status'
>

export type DecisionMakerOption = Pick<
  DecisionMakerRow,
  'id' | 'prospect_id' | 'full_name' | 'job_title' | 'email' | 'verification_status'
>

/** A message plus the context needed to write or review it. No joins in SQL. */
export type DraftView = {
  message: OutreachMessageRow
  prospect: ProspectOption | null
  decisionMaker: DecisionMakerOption | null
}

export type CampaignDetail = {
  campaign: OutreachCampaignRow
  summary: SalesCampaignSummary | null
  messages: OutreachMessageRow[]
}

export type OutboxItemView = {
  outbox: OutreachOutboxRow
  message: OutreachMessageRow | null
}

export type ApprovalHistoryItem = SalesEmailApprovalRow
