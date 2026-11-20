// Small, reliable follow-up worker. It claims one job at a time through the
// service-role RPC, re-checks consent, then sends only an approved template via
// the official WhatsApp Cloud API. This is not the Milestone 5 automation engine.

import type { AppendMessageInput } from './chat.ts';
import { sendWhatsAppMessage, WhatsAppSendError, type WhatsAppMessagingState } from './whatsapp_send.ts';

export interface FollowUpTemplate {
  key: string;
  providerName: string | null;
  content: string;
  language: string;
}

export interface FollowUpJob {
  jobId: string;
  tenantId: string;
  contactId: string;
  conversationId: string | null;
  channel: string;
  idempotencyKey: string;
  contactName: string | null;
  contactPhone: string | null;
  contactMobile: string | null;
  template: FollowUpTemplate | null;
}

export interface FollowUpStore {
  claimJob(jobId: string): Promise<FollowUpJob | null>;
  getMessagingState(tenantId: string, contactId: string): Promise<WhatsAppMessagingState>;
  getWhatsappCredentialForTenant(tenantId: string): Promise<{ phoneNumberId: string; secretRef: string } | null>;
  completeJob(input: {
    jobId: string;
    status: 'sent' | 'skipped' | 'failed';
    providerMessageId?: string | null;
    error?: string | null;
  }): Promise<void>;
  appendMessage(input: AppendMessageInput): Promise<string>;
}

export interface ProcessFollowUpInput {
  jobIds: string[];
  store: FollowUpStore;
  resolveAccessToken: (tenantId: string, secretRef: string) => string;
  fetchImpl?: typeof fetch;
}

export type FollowUpOutcomeStatus = 'sent' | 'skipped' | 'failed';

export interface FollowUpOutcome {
  jobId: string;
  status: FollowUpOutcomeStatus;
  reason?: string;
  providerMessageId?: string | null;
}

function reasonFor(error: unknown): string {
  if (error instanceof WhatsAppSendError) return error.code;
  if (error instanceof Error) return error.message.slice(0, 200);
  return 'unknown_error';
}

function renderTemplate(content: string, job: FollowUpJob): string {
  const name = job.contactName?.trim() || 'there';
  return content
    .replace(/\{\{\s*(?:name|contact_name)\s*\}\}/gi, name)
    .slice(0, 4000);
}

async function skip(
  store: FollowUpStore,
  jobId: string,
  reason: string
): Promise<FollowUpOutcome> {
  await store.completeJob({ jobId, status: 'skipped', error: reason });
  return { jobId, status: 'skipped', reason };
}

async function fail(
  store: FollowUpStore,
  jobId: string,
  reason: string
): Promise<FollowUpOutcome> {
  await store.completeJob({ jobId, status: 'failed', error: reason });
  return { jobId, status: 'failed', reason };
}

/** Processes claimed jobs sequentially so retries and template windows stay predictable. */
export async function processFollowUpJobs(input: ProcessFollowUpInput): Promise<FollowUpOutcome[]> {
  const { jobIds, store, resolveAccessToken, fetchImpl } = input;
  const outcomes: FollowUpOutcome[] = [];

  for (const jobId of jobIds.slice(0, 50)) {
    try {
      const job = await store.claimJob(jobId);
      if (!job) {
        outcomes.push({ jobId, status: 'skipped', reason: 'not_due_or_claimed' });
        continue;
      }
      if (job.channel !== 'whatsapp') {
        outcomes.push(await skip(store, jobId, 'unsupported_channel'));
        continue;
      }

      const state = await store.getMessagingState(job.tenantId, job.contactId);
      if (state.optedOut) {
        outcomes.push(await skip(store, jobId, 'opted_out'));
        continue;
      }

      const credential = await store.getWhatsappCredentialForTenant(job.tenantId);
      if (!credential) {
        outcomes.push(await fail(store, jobId, 'credential_not_found'));
        continue;
      }
      const accessToken = resolveAccessToken(job.tenantId, credential.secretRef);
      if (!accessToken) {
        outcomes.push(await fail(store, jobId, 'whatsapp_not_configured'));
        continue;
      }

      const to = job.contactPhone || job.contactMobile;
      if (!to) {
        outcomes.push(await fail(store, jobId, 'invalid_recipient'));
        continue;
      }
      if (!job.template) {
        outcomes.push(await fail(store, jobId, 'approved_template_missing'));
        continue;
      }

      const result = await sendWhatsAppMessage({
        tenantId: job.tenantId,
        contactId: job.contactId,
        to,
        content: renderTemplate(job.template.content, job),
        accessToken,
        phoneNumberId: credential.phoneNumberId,
        state,
        idempotencyKey: job.idempotencyKey,
        templateName: job.template.providerName || job.template.key,
        templateLanguage: job.template.language,
        fetchImpl,
      });

      await store.completeJob({
        jobId,
        status: 'sent',
        providerMessageId: result.providerMessageId,
      });
      if (job.conversationId) {
        await store.appendMessage({
          tenantId: job.tenantId,
          conversationId: job.conversationId,
          direction: 'outbound',
          content: renderTemplate(job.template.content, job),
          authorType: 'bot',
          aiGenerated: false,
          metadata: {
            channel: 'whatsapp',
            followUpJobId: jobId,
            providerMessageId: result.providerMessageId,
          },
        });
      }
      outcomes.push({ jobId, status: 'sent', providerMessageId: result.providerMessageId });
    } catch (error) {
      outcomes.push(await fail(store, jobId, reasonFor(error)));
    }
  }

  return outcomes;
}
