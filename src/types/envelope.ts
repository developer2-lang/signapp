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

/** Recipient role on an envelope. A countersigner signs like a signer but the
 *  UI/email identify the action as a countersign. */
export type RecipientRole = 'signer' | 'countersigner';

/** Signing mode for a multi-recipient envelope. */
export type SigningMode = 'sequential' | 'simultaneous';

/** Status of a single recipient within an envelope. */
export type RecipientStatus =
  | 'pending'
  | 'active'
  | 'sent'
  | 'viewed'
  | 'signed'
  | 'declined'
  | 'expired';

export interface EnvelopeRecipient {
  id: string;
  personId: string | null;
  name: string;
  email: string;
  role: RecipientRole;
  order: number;
  signingOrder: number;
  status: RecipientStatus;
  signature: Signature | null;
  signedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
}

export interface EnvelopeAttachment {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

export interface Envelope {
  id: string;
  title: string;
  templateName: string;
  body: string;
  fields: Record<string, string>;
  letterhead: string | null;
  /** The primary (first / currently-active) recipient id. */
  signerId: string | null;
  /** Name/email of the primary recipient (first for admin, the acting one for the signer). */
  signerName: string;
  signerEmail: string;
  /** Role of the recipient who loaded this view (signer context) / primary recipient. */
  role?: RecipientRole;
  signingMode?: SigningMode | null;
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
  recipients: EnvelopeRecipient[];
  events: EnvelopeEvent[];
  attachments: EnvelopeAttachment[];
}
