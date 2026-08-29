import type { Signature } from './signature';
import type { EnvelopeEvent } from './event';

/**
 * Stored envelope statuses. `expired` is a derived display status and never
 * persisted — it is computed from a `sent` envelope whose `expiresAt` has passed.
 */
export type EnvelopeStatus = 'draft' | 'sent' | 'signed' | 'completed' | 'declined';

export type DisplayStatus = EnvelopeStatus | 'expired';

export interface Envelope {
  id: string;
  title: string;
  templateName: string;
  body: string;
  fields: Record<string, string>;
  letterhead: string | null;
  signerId: string | null;
  signerName: string;
  signerEmail: string;
  status: EnvelopeStatus;
  token: string;
  createdAt: string;
  updatedAt: string;
  reminders: number;
  expiresAt: string | null;
  docHash: string | null;
  signature: Signature | null;
  countersignature: Signature | null;
  events: EnvelopeEvent[];
}
