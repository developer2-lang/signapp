import { supabase } from '../lib/supabaseClient';
import { sha256, mergeBody, now } from '../lib/utils';
import type { Envelope, EnvelopeAttachment, EnvelopeRecipient, RecipientRole } from '../types/envelope';
import type { EnvelopeEvent, EnvelopeEventType } from '../types/event';
import type { Signature } from '../types/signature';
import type { Template } from '../types/template';

export interface EnvelopeRecipientInput {
  personId: string | null;
  name: string;
  email: string;
  role: RecipientRole;
  order: number;
}

export interface CreateEnvelopeInput {
  template: Template;
  recipients: EnvelopeRecipientInput[];
  signingMode: 'sequential' | 'simultaneous';
  fields: Record<string, string>;
  subject?: string;
  expiryDays?: number;
}

function asRole(role: string | null | undefined): RecipientRole {
  return role === 'countersigner' ? 'countersigner' : 'signer';
}

/** A raw envelope row as returned by the `envelope_to_json` SQL helper. */
interface DbEnvelopeRow {
  id: string;
  template_id: string | null;
  subject: string | null;
  status: string;
  title: string | null;
  template_name: string | null;
  recipient_id: string | null;
  signer_id: string | null;
  signer_name: string | null;
  signer_email: string | null;
  role?: string | null;
  signing_mode?: string | null;
  body: string | null;
  fields: Record<string, string> | null;
  letterhead: string | null;
  signing_token: string | null;
  access_code: string | null;
  created_at: string | null;
  updated_at: string | null;
  sent_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  viewed_at: string | null;
  email_sent: boolean | null;
  reminders: number | null;
  doc_hash: string | null;
  countersignature: Signature | null;
  countersigned_at: string | null;
  /**
   * Admin shape (`envelope_to_json`): every recipient under `signers`, with
   * `signer_name`/`signer_email` fields. Not present on the signer portal shape.
   */
  signers?: DbSignerRow[];
  /**
   * Signer-portal shape (`signer_view`): every recipient under `recipients`,
   * with `name`/`email` fields. Not present on the admin shape (which uses
   * `signers` instead).
   */
  recipients?: DbSignerRow[];
  attachments?: DbAttachmentRow[];
}

interface DbAttachmentRow {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  created_at: string | null;
}

/**
 * A single recipient row. It is normalized from EITHER SQL shape:
 *   * admin `envelope_to_json.signers[]` -> uses `signer_name`/`signer_email`
 *   * signer `signer_view.recipients[]`  -> uses `name`/`email`
 * Both name/email variants are therefore optional/nullable here, and
 * `recipientName()` / `recipientEmail()` resolve to whichever is present.
 */
interface DbSignerRow {
  id: string;
  envelope_id?: string;
  person_id: string | null;
  signer_name?: string | null;
  signer_email?: string | null;
  name?: string | null;
  email?: string | null;
  status: string;
  signing_token?: string | null;
  access_code?: string | null;
  signature?: Signature | null;
  signed_at?: string | null;
  role?: string | null;
  order_idx: number | null;
  signing_order: number | null;
  declined_at?: string | null;
  decline_reason?: string | null;
}

function recipientName(r: DbSignerRow | undefined): string {
  return r?.signer_name ?? r?.name ?? '';
}

function recipientEmail(r: DbSignerRow | undefined): string {
  return r?.signer_email ?? r?.email ?? '';
}

function mapRecipient(r: DbSignerRow | undefined, index: number): EnvelopeRecipient {
  return {
    id: r?.id ?? '',
    personId: r?.person_id ?? null,
    name: recipientName(r),
    email: recipientEmail(r),
    role: asRole(r?.role),
    order: r?.order_idx ?? index,
    signingOrder: r?.signing_order ?? (r?.order_idx ?? index) + 1,
    status: (r?.status ?? 'pending') as EnvelopeRecipient['status'],
    signature: r?.signature ?? null,
    signedAt: r?.signed_at ?? null,
    declinedAt: r?.declined_at ?? null,
    declineReason: r?.decline_reason ?? null,
  };
}

function asStatus(s: string | null): Envelope['status'] {
  const ok = ['draft', 'sent', 'viewed', 'signed', 'completed', 'declined', 'failed'];
  return (ok.includes(s ?? '') ? s : 'draft') as Envelope['status'];
}

function buildEvents(e: DbEnvelopeRow): EnvelopeEvent[] {
  const ev: EnvelopeEvent[] = [];
  const push = (type: EnvelopeEventType, at: string | null, label: string) => {
    if (at) ev.push({ type, label, at });
  };
  push('created', e.created_at, `Envelope created${e.title ? ` — ${e.title}` : ''}`);
  push('sent', e.sent_at, `Sent to ${e.signer_name ?? 'signer'} <${e.signer_email ?? ''}>`);
  push('viewed', e.viewed_at, 'Document opened by signer (access code entered)');
  const signers = e.signers ?? e.recipients ?? [];
  signers.forEach((s) => {
    if (s.signed_at) {
      const verb = s.role === 'countersigner' ? 'countersigned by' : 'signed by';
      push('signed', s.signed_at, `Digitally ${verb} ${recipientName(s) || 'recipient'}`);
    }
    if (s.declined_at) {
      push('declined', s.declined_at, `Declined by ${recipientName(s) || 'recipient'}`);
    }
  });
  push('completed', e.completed_at, 'Envelope completed · final PDF available');
  if (e.countersigned_at) {
    push('countersigned', e.countersigned_at, 'Countersigned by company');
  }
  return ev.sort((a, b) => a.at.localeCompare(b.at));
}

export function dbRowToEnvelope(row: DbEnvelopeRow): Envelope {
  const signers = row.signers ?? row.recipients ?? [];
  const primary = signers[0] ?? null;
  const acting =
    (row.signer_id ? signers.find((s) => s.id === row.signer_id) : undefined) ??
    (row.signer_name || row.signer_email
      ? signers.find(
          (s) =>
            recipientName(s) === row.signer_name &&
            recipientEmail(s) === row.signer_email,
        )
      : null) ??
    primary;

  const attachments: EnvelopeAttachment[] = (row.attachments ?? []).map((a) => ({
    id: a.id,
    fileName: a.file_name,
    storagePath: a.storage_path,
    mimeType: a.mime_type,
    fileSize: a.file_size,
    createdAt: a.created_at ?? now(),
  }));

  return {
    id: row.id,
    title: row.title ?? 'Untitled document',
    templateName: row.template_name ?? '',
    body: row.body ?? '',
    fields: row.fields ?? {},
    letterhead: row.letterhead ?? null,
    signerId: row.recipient_id ?? row.signer_id ?? acting?.id ?? null,
    signerName: row.signer_name ?? recipientName(acting) ?? '',
    signerEmail: row.signer_email ?? recipientEmail(acting) ?? '',
    role: asRole(row.role ?? acting?.role),
    signingMode: (row.signing_mode as Envelope['signingMode']) ?? null,
    status: asStatus(row.status),
    token: row.access_code ?? '',
    signingToken: row.signing_token ?? undefined,
    emailSent: row.email_sent ?? false,
    createdAt: row.created_at ?? now(),
    updatedAt: row.updated_at ?? now(),
    sentAt: row.sent_at ?? null,
    completedAt: row.completed_at ?? null,
    viewedAt: row.viewed_at ?? null,
    reminders: row.reminders ?? 0,
    expiresAt: row.expires_at ?? null,
    docHash: row.doc_hash ?? null,
    signature: acting?.signature ?? primary?.signature ?? null,
    countersignature: row.countersignature ?? null,
    countersignedAt: row.countersigned_at ?? null,
    recipients: signers.map(mapRecipient),
    events: buildEvents(row),
    attachments,
  };
}

export async function createEnvelope(input: CreateEnvelopeInput): Promise<Envelope> {
  const { template, recipients, signingMode, fields } = input;
  if (!template) throw new Error('Template not selected');
  if (!recipients.length) throw new Error('Add at least one recipient before sending.');

  const body = mergeBody(template.body, fields);
  const docHash = await sha256(body);
  const expiresAt = new Date(
    Date.now() + (input.expiryDays ?? 7) * 864e5,
  ).toISOString();

  const payload = recipients
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((r) => ({
      person_id: r.personId,
      name: r.name,
      email: r.email,
      role: r.role,
      order: r.order,
    }));

  const { data, error } = await supabase.rpc('create_envelope', {
    p_template_id: template.id,
    p_subject: input.subject?.trim() || template.name,
    p_body: body,
    p_fields: fields as unknown as Record<string, unknown>,
    p_title: `${template.name} — ${payload[0].name}`,
    p_template_name: template.name,
    p_expires_at: expiresAt,
    p_doc_hash: docHash,
    p_letterhead: template.letterhead ?? null,
    p_recipients: payload as unknown as Record<string, unknown>[],
    p_signing_mode: signingMode,
  });

  if (error) throw new Error(error.message || 'Could not create envelope');
  return dbRowToEnvelope(data as DbEnvelopeRow);
}

export async function listEnvelopes(): Promise<Envelope[]> {
  const { data, error } = await supabase.rpc('list_envelopes');
  if (error) throw new Error(error.message || 'Could not load envelopes');
  return ((data as DbEnvelopeRow[]) ?? []).map(dbRowToEnvelope);
}

export async function getEnvelope(id: string): Promise<Envelope | null> {
  const { data, error } = await supabase.rpc('get_envelope_admin', { p_id: id });
  if (error) throw new Error(error.message || 'Could not load envelope');
  return data ? dbRowToEnvelope(data as DbEnvelopeRow) : null;
}

export async function adminVoid(id: string): Promise<Envelope> {
  const { data, error } = await supabase.rpc('admin_void', { p_id: id });
  if (error) throw new Error(error.message || 'Could not void envelope');
  return dbRowToEnvelope(data as DbEnvelopeRow);
}

export async function adminExtend(id: string, days = 7): Promise<Envelope> {
  const { data, error } = await supabase.rpc('admin_extend', { p_id: id, p_days: days });
  if (error) throw new Error(error.message || 'Could not extend envelope');
  return dbRowToEnvelope(data as DbEnvelopeRow);
}

/**
 * The ONLY path that moves a client-signed envelope ('signed') to 'completed'.
 * Stores the company countersignature. Throws if the client has not yet signed.
 */
export async function adminCountersign(id: string, signature: Signature): Promise<Envelope> {
  const { data, error } = await supabase.rpc('admin_countersign', {
    p_id: id,
    p_signature: signature as unknown as Record<string, unknown>,
  });
  if (error) throw new Error(error.message || 'Could not counter-sign envelope');
  return dbRowToEnvelope(data as DbEnvelopeRow);
}

export interface DeleteEnvelopeResult {
  ok: boolean;
  id: string;
  title: string | null;
  deleted_at: string;
}

/**
 * Permanently deletes ONE envelope (plus its signer records) by its UUID via
 * the secure `admin_delete_envelope` RPC. Never identified by title or email.
 * Safe for every envelope status. Throws an Error on failure so the caller can
 * keep the envelope in the table and surface a friendly message.
 *
 * Also removes the envelope's attachment files from private Storage (best
 * effort) before deleting the database rows, so no orphaned objects remain.
 */
export async function deleteEnvelope(id: string): Promise<void> {
  // Best-effort: remove attachment files from private Storage FIRST.
  try {
    const { data } = await supabase.rpc('get_envelope_admin', { p_id: id });
    const env = data ? dbRowToEnvelope(data as DbEnvelopeRow) : null;
    if (env?.attachments?.length) {
      const paths = env.attachments.map((a) => a.storagePath);
      await supabase.storage.from('attachments').remove(paths);
    }
  } catch {
    // If attachment cleanup fails, still continue with the DB delete.
  }

  const { error } = await supabase.rpc('admin_delete_envelope', { p_id: id });
  if (error) throw new Error(error.message || 'Could not delete envelope');
}

export interface VerifyResult {
  ok: boolean;
  stored: string | null;
  recomputed: string;
}

/** Recompute the SHA-256 of the stored body and compare with the sealed hash. */
export async function verifyEnvelope(env: Envelope): Promise<VerifyResult> {
  const recomputed = await sha256(env.body);
  return { ok: recomputed === env.docHash, stored: env.docHash, recomputed };
}
