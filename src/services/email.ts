import { supabase } from '../lib/supabaseClient';

export interface SendEmailResult {
  ok: boolean;
  error?: string;
  attachmentsAttached?: number;
  attachmentFailures?: number;
  skippedAttachments?: string[];
}

/**
 * Invoke the server-side Edge Function that sends a recipient email.
 * The frontend never sees SMTP credentials — they live only inside the
 * Supabase Edge Function (set via `supabase secrets set`).
 *
 * Without `recipientId` the Edge Function notifies the currently-active (first)
 * recipient — used for the initial dispatch. With `recipientId` it emails a
 * specific recipient — used when a recipient finishes signing and we notify the
 * next one in the sequence.
 */
export async function sendEnvelopeEmail(
  envelopeId: string,
  recipientId?: string,
): Promise<SendEmailResult> {
  const body = recipientId ? { envelopeId, recipientId } : { envelopeId };
  const { data, error } = await supabase.functions.invoke('send-envelope-email', { body });
  if (error) {
    return { ok: false, error: error.message || 'Email could not be sent' };
  }
  const d = (data ?? {}) as {
    ok?: boolean;
    envelopeId?: string;
    attachmentsAttached?: number;
    attachmentFailures?: number;
    skippedAttachments?: string[];
  };
  if ((d.attachmentFailures ?? 0) > 0) {
    console.warn(
      `[email] envelope ${envelopeId} email sent but ${d.attachmentFailures} attachment(s) could not be attached: ${(d.skippedAttachments ?? []).join(', ')}`,
    );
  }
  return {
    ok: d.ok !== false,
    attachmentsAttached: d.attachmentsAttached ?? 0,
    attachmentFailures: d.attachmentFailures ?? 0,
    skippedAttachments: d.skippedAttachments ?? [],
  };
}

/** Look up the recipient that currently needs to sign (used to notify next). */
export interface ActiveRecipient {
  id: string;
  name: string;
  email: string;
  role: string;
  signingOrder: number;
}

export async function getActiveRecipient(
  envelopeId: string,
): Promise<ActiveRecipient | null> {
  const { data, error } = await supabase.rpc('active_recipient', {
    p_id: envelopeId,
  });
  if (error) {
    console.error('active_recipient failed', error);
    return null;
  }
  return (data as ActiveRecipient) ?? null;
}

/**
 * Send the final completion email with the signed PDF attachment to all
 * completed recipients. Called when the envelope status becomes 'completed'.
 */
export async function sendCompletionEmails(
  envelopeId: string,
  recipientIds: string[],
  documentName: string,
  signedPdfBase64: string,
): Promise<SendEmailResult> {
  const body = {
    completionMode: true,
    envelopeId,
    recipientIds,
    documentName,
    signedPdf: signedPdfBase64,
  };
  const { data, error } = await supabase.functions.invoke('send-envelope-email', { body });
  if (error) {
    return { ok: false, error: error.message || 'Completion email could not be sent' };
  }
  const d = (data ?? {}) as {
    ok?: boolean;
    attachmentsAttached?: number;
    attachmentFailures?: number;
    skippedAttachments?: string[];
  };
  if ((d.attachmentFailures ?? 0) > 0) {
    console.warn(
      `[email] completion emails sent but ${d.attachmentFailures} attachment(s) could not be attached`,
    );
  }
  return {
    ok: d.ok !== false,
    attachmentsAttached: d.attachmentsAttached ?? 0,
    attachmentFailures: d.attachmentFailures ?? 0,
    skippedAttachments: d.skippedAttachments ?? [],
  };
}
