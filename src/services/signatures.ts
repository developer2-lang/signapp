import { sha256, now } from '../lib/utils';
import type { Signature, SignatureMode } from '../types/signature';

export interface SignatureInput {
  mode: SignatureMode;
  /** data URL for draw / upload signatures */
  dataURL?: string;
  /** text for typed signatures */
  text?: string;
}

/**
 * Compute the hash-sealed Signature object from raw signer input. The hash binds
 * the signature to the document fingerprint and the timestamp, mirroring the
 * original `applySignature` logic so it can later be verified independently.
 */
export async function finalizeSignature(
  input: SignatureInput,
  docHash: string | null,
): Promise<Signature> {
  const at = now();
  const base = input.dataURL || input.text || '';
  const hash = await sha256(`${base}|${docHash ?? ''}|${at}`);
  const sig: Signature = { mode: input.mode, at, hash };
  if (input.dataURL) sig.dataURL = input.dataURL;
  if (input.text) sig.text = input.text;
  return sig;
}
