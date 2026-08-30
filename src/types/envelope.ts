import type { Signature } from './signature';
import type { EnvelopeEvent } from './event';

/**
 * Stored envelope statuses. `expired` is a derived display status and never
 * persisted — it is computed from a `sent`/`viewed` envelope whose `expiresAt`
 * has passed.
 */
export type EnvelopeStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'signed'
  | 'completed'
  | 'declined'
  | 'failed';

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
  /** access code shown to admin / signer (NOT the URL token) */
  token: string;
  /** secure URL token used in /sign/<token> */
  signingToken?: string;
  emailSent?: boolean;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  completedAt: string | null;
  viewedAt: string | null;
  reminders: number;
  expiresAt: string | null;
  docHash: string | null;
  signature: Signature | null;
  countersignature: Signature | null;
  countersignedAt: string | null;
  events: EnvelopeEvent[];
}
