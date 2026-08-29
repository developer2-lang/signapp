export interface Settings {
  /** countersigning authority name */
  signerName: string;
  signerTitle: string;
  company: string;
  address: string;
  /** company default letterhead (data URL) */
  letterhead: string | null;
  /** sha-256 of the admin PIN, or null when PIN lock is disabled */
  pinHash: string | null;
}
