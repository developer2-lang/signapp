export type SignatureMode = 'draw' | 'typed' | 'upload';

export interface Signature {
  mode: SignatureMode;
  /** data URL for draw / upload signatures */
  dataURL?: string;
  /** text for typed signatures */
  text?: string;
  at: string;
  hash: string;
}
