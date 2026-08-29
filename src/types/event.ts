export type EnvelopeEventType =
  | 'created'
  | 'sent'
  | 'viewed'
  | 'consent'
  | 'signed'
  | 'countersigned'
  | 'completed'
  | 'reminder'
  | 'extended'
  | 'void'
  | 'declined';

export interface EnvelopeEvent {
  type: EnvelopeEventType;
  label: string;
  at: string;
  /** sha-256 fingerprint sealed at the time of the action */
  hash?: string;
  /** user agent / device recorded for the audit trail */
  ua?: string;
}
