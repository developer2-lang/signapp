import { supabase } from '../lib/supabaseClient';
import type { Envelope, RecipientRole } from '../types/envelope';
import type { Signature } from '../types/signature';
import { dbRowToEnvelope } from './envelopes';
import { sendEnvelopeEmail, getActiveRecipient, sendCompletionEmails } from './email';
import { getPDFBytes } from '../lib/pdf';
import { toErrorMessage } from '../lib/utils';

export interface SignerMeta {
  id: string;
  title: string;
  signerName: string;
  signerEmail: string;
  role: RecipientRole;
  status: Envelope['status'];
  signingMode: Envelope['signingMode'];
  expiresAt: string | null;
  createdAt: string;
  alreadySigned: boolean;
  isActive: boolean;
}

function friendly(err: unknown, fallback: string): Error {
  // supabase.rpc returns a plain object ({ code, message, details, hint }), NOT an
  // Error instance. Extract the real message explicitly so it is never hidden
  // behind "[object Object]".
  const msg = toErrorMessage(err, fallback);

  // Log the real error so it is never hidden from the console.
  console.error('[signers]', err);

  if (msg.includes('invalid_access_code')) return new Error('Invalid access code');
  if (msg.includes('invalid_token')) return new Error('Signing link is invalid or expired');
  if (msg.includes('envelope_declined')) return new Error('This envelope has been declined');
  if (msg.includes('already_signed')) return new Error('This step has already been signed');
  if (msg.includes('already_completed')) return new Error('This envelope is already completed');
  if (msg.includes('not_your_turn'))
    return new Error('It is not your turn yet — an earlier recipient must sign first.');
  if (msg.includes('client_not_signed')) return new Error('The recipient has not signed yet');
  if (msg.includes('already_closed')) return new Error('This envelope is already closed');
  if (msg.includes('signer_not_found')) return new Error('Signer record not found');
  if (msg.includes('recipients_required')) return new Error('At least one recipient is required');
  if (msg.includes('not_found')) return new Error('Envelope not found');
  if (msg.includes('envelopes_status_check')) {
    return new Error('This envelope is in a state that can no longer be opened. Contact the sender.');
  }
  return new Error(msg || fallback);
}

export async function getEnvelopeMeta(token: string): Promise<SignerMeta | null> {
  const { data, error } = await supabase.rpc('get_envelope_meta', { p_token: token });
  if (error) throw friendly(error, 'Could not load envelope');
  if (!data) return null;
  const d = data as Record<string, unknown>;
  return {
    id: String(d.id ?? ''),
    title: String(d.title ?? ''),
    signerName: String(d.signer_name ?? ''),
    signerEmail: String(d.signer_email ?? ''),
    role: (d.role === 'countersigner' ? 'countersigner' : 'signer') as RecipientRole,
    status: (d.status ?? 'draft') as Envelope['status'],
    signingMode: (d.signing_mode ?? null) as Envelope['signingMode'],
    expiresAt: (d.expires_at as string) ?? null,
    createdAt: String(d.created_at ?? ''),
    alreadySigned: Boolean(d.already_signed),
    isActive: Boolean(d.is_active),
  };
}

export async function unlockEnvelope(token: string, code: string): Promise<Envelope> {
  const { data, error } = await supabase.rpc('unlock_envelope', {
    p_token: token,
    p_access_code: code,
  });
  if (error) throw friendly(error, 'Could not open document');
  if (!data) throw new Error('Could not open document');
  return dbRowToEnvelope(data as Parameters<typeof dbRowToEnvelope>[0]);
}

export async function signEnvelope(
  token: string,
  code: string,
  signature: Signature,
): Promise<Envelope> {
  const { data, error } = await supabase.rpc('sign_envelope', {
    p_token: token,
    p_access_code: code,
    p_signature: signature as unknown as Record<string, unknown>,
  });
  if (error) throw friendly(error, 'Could not sign document');
  if (!data) throw new Error('Could not sign document');
  return dbRowToEnvelope(data as Parameters<typeof dbRowToEnvelope>[0]);
}

export async function declineEnvelope(
  token: string,
  code: string,
  reason: string,
): Promise<Envelope> {
  const { data, error } = await supabase.rpc('decline_envelope', {
    p_token: token,
    p_access_code: code,
    p_reason: reason,
  });
  if (error) throw friendly(error, 'Could not decline document');
  if (!data) throw new Error('Could not decline document');
  return dbRowToEnvelope(data as Parameters<typeof dbRowToEnvelope>[0]);
}

/**
 * After a recipient signs (sequential mode), notify the next active recipient.
 * Server-side order is already enforced by sign_envelope; this only dispatches
 * the email to whoever is now active. Returns false when nothing to send.
 */
export async function notifyNextRecipient(env: Envelope): Promise<boolean> {
  // Sequential only: for simultaneous everyone is already notified.
  if (env.signingMode !== 'sequential') return false;
  if (env.status === 'completed' || env.status === 'declined') return false;

  const active = await getActiveRecipient(env.id);
  if (!active) return false;

  // The acting signer's own recipient id (this view) — skip self unless it is a
  // genuine next recipient (handled by active_recipient ordering). We only send
  // when the active recipient differs from the one who just signed.
  const selfId = env.signerId ?? env.recipients.find((r) => r.id)?.id;
  if (active.id === selfId) return false;

  const res = await sendEnvelopeEmail(env.id, active.id);
  if (!res.ok) {
    console.error('[signers] email to next recipient failed', res.error);
  } else if (res.attachmentFailures && res.attachmentFailures > 0) {
    console.warn(
      `[signers] next recipient email sent but ${res.attachmentFailures} attachment(s) were skipped: ${(res.skippedAttachments ?? []).join(', ')}`,
    );
  }
  return res.ok;
}

/**
 * Guard against duplicate completion emails by atomically claiming a flag on
 * the envelope. Returns true if THIS caller wins the claim (first time) or
 * false if it was already claimed (duplicate attempt / retry / refresh).
 */
async function claimCompletionEmail(envelopeId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('claim_completion_email', {
    p_id: envelopeId,
  });
  if (error) {
    console.error('[signers] claim_completion_email failed', error);
    return false;
  }
  // The RPC returns true only if it flipped completion_email_sent from false to
  // true on this call (i.e. this is the first and only claim).
  return data === true;
}

/**
 * After a recipient signs, if the envelope is now 'completed', send the final
 * completion email (with the final signed PDF attached) to every completed
 * recipient at their own email address. A server-side claim flag guarantees
 * the email is dispatched only once even if the signing request is retried or
 * the page is refreshed.
 */
export async function sendCompletionAfterSign(
  env: Envelope,
): Promise<boolean> {
  if (env.status !== 'completed') return false;

  const signed = env.recipients.filter((r) => r.status === 'signed');
  if (signed.length === 0) return false;

  // Atomically claim the right to send. If another attempt already claimed it
  // (refresh / retry), do not send a duplicate completion email.
  const claimed = await claimCompletionEmail(env.id);
  if (!claimed) {
    console.log('[signers] completion email already sent — skipping duplicate');
    return false;
  }

  // Build the final signed PDF (contains both signatures) and send to every
  // completed recipient as a real MIME email attachment.
  const pdfBytes = getPDFBytes(env);
  const pdfBase64 = toBase64(pdfBytes);
  const recipientIds = signed.map((r) => r.id);
  const documentName = env.title || env.templateName || 'Document';

  const res = await sendCompletionEmails(
    env.id,
    recipientIds,
    documentName,
    pdfBase64,
  );
  if (!res.ok) {
    console.error('[signers] completion email failed', res.error);
  }
  return res.ok;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
