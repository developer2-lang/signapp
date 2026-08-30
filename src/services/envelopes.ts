import { supabase } from '../lib/supabaseClient';
import { sha256, mergeBody, now } from '../lib/utils';
import type { Envelope } from '../types/envelope';
import type { EnvelopeEvent, EnvelopeEventType } from '../types/event';
import type { Signature } from '../types/signature';
import type { Template } from '../types/template';
import type { Contact } from '../types/contact';

export interface CreateEnvelopeInput {
  template: Template;
  person: Contact;
  fields: Record<string, string>;
  subject?: string;
  expiryDays?: number;
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
  signers: DbSignerRow[];
}

interface DbSignerRow {
  id: string;
  envelope_id: string;
  person_id: string | null;
  signer_name: string | null;
  signer_email: string | null;
  status: string;
  signing_token: string | null;
  access_code: string | null;
  signature: Signature | null;
  signed_at: string | null;
  role: string | null;
  order_idx: number | null;
  declined_at: string | null;
  decline_reason: string | null;
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
  const primary = e.signers[0];
  if (primary?.signed_at) {
    push('signed', primary.signed_at, `Digitally signed by ${primary.signer_name ?? 'signer'}`);
  }
  push('completed', e.completed_at, 'Envelope completed · final PDF available');
  if (e.countersigned_at) {
    push('countersigned', e.countersigned_at, 'Countersigned by company');
  }
  if (primary?.declined_at) {
    push('declined', primary.declined_at, `Declined by ${primary.signer_name ?? 'signer'}`);
  }
  return ev.sort((a, b) => a.at.localeCompare(b.at));
}

export function dbRowToEnvelope(row: DbEnvelopeRow): Envelope {
  const primary = row.signers?.[0] ?? null;
  return {
    id: row.id,
    title: row.title ?? 'Untitled document',
    templateName: row.template_name ?? '',
    body: row.body ?? '',
    fields: row.fields ?? {},
    letterhead: row.letterhead ?? null,
    signerId: row.recipient_id ?? row.signer_id ?? null,
    signerName: row.signer_name ?? '',
    signerEmail: row.signer_email ?? '',
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
    signature: primary?.signature ?? null,
    countersignature: row.countersignature ?? null,
    countersignedAt: row.countersigned_at ?? null,
    events: buildEvents(row),
  };
}

export async function createEnvelope(input: CreateEnvelopeInput): Promise<Envelope> {
  const { template, person, fields } = input;
  if (!template || !person) throw new Error('Template or person not selected');

  const body = mergeBody(template.body, fields);
  const docHash = await sha256(body);
  const expiresAt = new Date(
    Date.now() + (input.expiryDays ?? 7) * 864e5,
  ).toISOString();

  const { data, error } = await supabase.rpc('create_envelope', {
    p_template_id: template.id,
    p_subject: input.subject?.trim() || template.name,
    p_body: body,
    p_fields: fields as unknown as Record<string, unknown>,
    p_title: `${template.name} — ${person.name}`,
    p_template_name: template.name,
    p_recipient_id: person.id,
    p_signer_name: person.name,
    p_signer_email: person.email,
    p_expires_at: expiresAt,
    p_doc_hash: docHash,
    p_letterhead: template.letterhead ?? null,
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
 */
export async function deleteEnvelope(id: string): Promise<void> {
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
