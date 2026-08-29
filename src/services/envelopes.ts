import { uid, token, sha256, now, addDays, mergeBody } from '../lib/utils';
import { getDB, mutate } from '../lib/store';
import { finalizeSignature, type SignatureInput } from './signatures';
import type { Envelope } from '../types/envelope';

export interface CreateEnvelopeInput {
  templateId: string;
  personId: string;
  fields: Record<string, string>;
  expiryDays?: number;
  send: boolean;
}

export async function createEnvelope(input: CreateEnvelopeInput): Promise<Envelope> {
  const db = getDB();
  const t = db.templates.find((x) => x.id === input.templateId);
  const p = db.people.find((x) => x.id === input.personId);
  if (!t || !p) throw new Error('Template or person not found');
  const body = mergeBody(t.body, input.fields);
  const env: Envelope = {
    id: uid('env'),
    title: `${t.name} — ${p.name}`,
    templateName: t.name,
    body,
    fields: { ...input.fields },
    letterhead: t.letterhead || db.settings.letterhead || null,
    signerId: p.id,
    signerName: p.name,
    signerEmail: p.email,
    status: 'draft',
    token: token(),
    createdAt: now(),
    updatedAt: now(),
    reminders: 0,
    expiresAt: null,
    docHash: null,
    signature: null,
    countersignature: null,
    events: [
      {
        type: 'created',
        label: `Envelope drafted by ${db.settings.signerName} (admin)`,
        at: now(),
        ua: navigator.userAgent,
      },
    ],
  };
  if (input.send) {
    env.docHash = await sha256(`${body}|${env.id}|${p.email}`);
    env.status = 'sent';
    env.expiresAt = addDays(input.expiryDays || 7);
    env.events.push({
      type: 'sent',
      label: `Sent to ${p.name} <${p.email}> · valid ${input.expiryDays || 7} days · document fingerprint sealed`,
      at: now(),
      hash: env.docHash,
      ua: navigator.userAgent,
    });
  }
  mutate((d) => {
    d.envelopes.push(env);
  });
  return env;
}

export function getEnvelope(id: string): Envelope | undefined {
  return getDB().envelopes.find((x) => x.id === id);
}

export async function sendDraft(id: string): Promise<Envelope | undefined> {
  const db = getDB();
  const e = db.envelopes.find((x) => x.id === id);
  if (!e) return;
  e.docHash = await sha256(`${e.body}|${e.id}|${e.signerEmail}`);
  e.status = 'sent';
  e.updatedAt = now();
  e.expiresAt = addDays(7);
  e.reminders = e.reminders || 0;
  e.events.push({
    type: 'sent',
    label: `Sent to ${e.signerName} <${e.signerEmail}> · valid 7 days · document fingerprint sealed`,
    at: now(),
    hash: e.docHash,
    ua: navigator.userAgent,
  });
  mutate((d) => {
    const t = d.envelopes.find((x) => x.id === id);
    if (t) Object.assign(t, e);
  });
  return e;
}

/** Record that the signer opened the document (access code entered). */
export function recordSignerViewed(id: string): void {
  const e = getDB().envelopes.find((x) => x.id === id);
  if (!e) return;
  e.events.push({
    type: 'viewed',
    label: 'Document opened by signer (access code entered)',
    at: now(),
    ua: navigator.userAgent,
  });
  e.updatedAt = now();
  mutate((d) => {
    const t = d.envelopes.find((x) => x.id === id);
    if (t) Object.assign(t, e);
  });
}

/** Record the signer's consent declaration (once). */
export function recordSignerConsent(id: string): void {
  const e = getDB().envelopes.find((x) => x.id === id);
  if (!e) return;
  if (e.events.some((ev) => ev.type === 'consent')) return;
  e.events.push({
    type: 'consent',
    label: 'Consent declaration accepted by signer',
    at: now(),
    ua: navigator.userAgent,
  });
  e.updatedAt = now();
  mutate((d) => {
    const t = d.envelopes.find((x) => x.id === id);
    if (t) Object.assign(t, e);
  });
}

/** Signer adopts their signature — status moves sent → signed. */
export async function signEnvelope(id: string, input: SignatureInput): Promise<Envelope | undefined> {
  const e = getDB().envelopes.find((x) => x.id === id);
  if (!e) return;
  const sig = await finalizeSignature(input, e.docHash);
  e.signature = sig;
  e.status = 'signed';
  e.updatedAt = now();
  e.events.push({
    type: 'signed',
    label: `Digitally signed by ${e.signerName} (${
      sig.mode === 'draw' ? 'drawn' : sig.mode === 'upload' ? 'uploaded image' : 'typed'
    } signature)`,
    at: sig.at,
    hash: sig.hash,
    ua: navigator.userAgent,
  });
  mutate((d) => {
    const t = d.envelopes.find((x) => x.id === id);
    if (t) Object.assign(t, e);
  });
  return e;
}

/** Admin countersigns — status moves signed → completed. */
export async function countersignEnvelope(
  id: string,
  input: SignatureInput,
): Promise<Envelope | undefined> {
  const db = getDB();
  const e = db.envelopes.find((x) => x.id === id);
  if (!e) return;
  const sig = await finalizeSignature(input, e.docHash);
  e.countersignature = sig;
  e.status = 'completed';
  e.updatedAt = now();
  e.events.push({
    type: 'countersigned',
    label: `Countersigned by ${db.settings.signerName}, ${db.settings.signerTitle}`,
    at: sig.at,
    hash: sig.hash,
    ua: navigator.userAgent,
  });
  e.events.push({ type: 'completed', label: 'Envelope completed · final PDF available', at: now() });
  mutate((d) => {
    const t = d.envelopes.find((x) => x.id === id);
    if (t) Object.assign(t, e);
  });
  return e;
}

export function nudgeEnvelope(id: string): Envelope | undefined {
  const e = getDB().envelopes.find((x) => x.id === id);
  if (!e) return;
  e.reminders = (e.reminders || 0) + 1;
  e.updatedAt = now();
  e.events.push({
    type: 'reminder',
    label: `Reminder #${e.reminders} sent to ${e.signerName}`,
    at: now(),
    ua: navigator.userAgent,
  });
  mutate((d) => {
    const t = d.envelopes.find((x) => x.id === id);
    if (t) Object.assign(t, e);
  });
  return e;
}

export function extendEnvelope(id: string): Envelope | undefined {
  const e = getDB().envelopes.find((x) => x.id === id);
  if (!e) return;
  e.expiresAt = addDays(7);
  e.updatedAt = now();
  e.events.push({
    type: 'extended',
    label: `Validity extended by 7 days (now till ${new Date(e.expiresAt).toLocaleString('en-IN')})`,
    at: now(),
    ua: navigator.userAgent,
  });
  mutate((d) => {
    const t = d.envelopes.find((x) => x.id === id);
    if (t) Object.assign(t, e);
  });
  return e;
}

export function declineEnvelope(id: string, reason: string): Envelope | undefined {
  const e = getDB().envelopes.find((x) => x.id === id);
  if (!e) return;
  e.status = 'declined';
  e.updatedAt = now();
  e.events.push({
    type: 'declined',
    label: `Declined by ${e.signerName}. Reason: "${reason}"`,
    at: now(),
    ua: navigator.userAgent,
  });
  mutate((d) => {
    const t = d.envelopes.find((x) => x.id === id);
    if (t) Object.assign(t, e);
  });
  return e;
}

export function voidEnvelope(id: string): Envelope | undefined {
  const e = getDB().envelopes.find((x) => x.id === id);
  if (!e) return;
  e.status = 'declined';
  e.updatedAt = now();
  e.events.push({ type: 'void', label: 'Envelope voided by admin', at: now() });
  mutate((d) => {
    const t = d.envelopes.find((x) => x.id === id);
    if (t) Object.assign(t, e);
  });
  return e;
}

export interface VerifyResult {
  ok: boolean;
  stored: string | null;
  recomputed: string;
}

export async function verifyEnvelope(id: string): Promise<VerifyResult | undefined> {
  const e = getDB().envelopes.find((x) => x.id === id);
  if (!e) return;
  const recomputed = await sha256(`${e.body}|${e.id}|${e.signerEmail}`);
  return { ok: recomputed === e.docHash, stored: e.docHash, recomputed };
}
