import { supabase } from '../lib/supabaseClient';
import { sha256, now, toErrorMessage } from '../lib/utils';
import type { Signature, SignatureMode } from '../types/signature';

export interface SignatureInput {
  mode: SignatureMode;
  /** data URL for draw / upload signatures */
  dataURL?: string;
  /** text for typed signatures */
  text?: string;
}

/** Storage bucket that holds uploaded signature images (stays PRIVATE). */
export const SIGNATURE_BUCKET = 'signature';

/** Uploaded images are restricted to these MIME types. */
const ALLOWED_TYPES = ['image/png', 'image/jpeg'];
const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

/** Maximum accepted file size (2 MB). */
const MAX_SIZE = 2 * 1024 * 1024;

export interface SignatureUploadResult {
  /** Storage path, e.g. signature/<envelope>/<user>/<unique>.png */
  path: string;
  signature_type: string;
}

/**
 * Validate a selected image file (type + size) BEFORE anything is uploaded.
 * Throws a clear, user-friendly Error on failure.
 */
export function validateSignatureFile(file: File): void {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Please choose a PNG or JPG signature image.');
  }
  if (file.size > MAX_SIZE) {
    throw new Error('Signature image must be 2 MB or smaller.');
  }
}

/**
 * Upload a signature image for the CURRENT envelope to the private "signature"
 * bucket and persist its metadata. Never embeds the image bytes in the DB -
 * only the Storage path and identifiers are stored.
 *
 * Path: signature/{envelopeId}/{userId}/{unique}.png
 */
export async function uploadSignatureImage(
  file: File,
  envelopeId: string,
  userId?: string | null,
): Promise<SignatureUploadResult> {
  validateSignatureFile(file);

  const ext = EXT_BY_TYPE[file.type] || 'png';
  const unique = generateUniqueId();
  const pathForUser = userId || generateUniqueId();
  const path = `${SIGNATURE_BUCKET}/${envelopeId}/${pathForUser}/${unique}-signature.${ext}`;

  // 1. Upload to Storage FIRST. No database change happens until this succeeds.
  const { error: uploadError } = await supabase.storage
    .from(SIGNATURE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    throw new Error(`Upload failed: ${toErrorMessage(uploadError)}`);
  }

  // 2. Persist metadata. If this fails, remove the orphaned file from Storage so
  //    we never leave a stray object with no matching database record.
  const { error: dbError } = await supabase.rpc('save_signature_metadata', {
    p_envelope_id: envelopeId,
    p_signature_path: path,
    p_signature_type: 'uploaded',
    p_signer_id: userId ?? null,
  });

  if (dbError) {
    // Roll back the Storage object we just created before re-throwing.
    await supabase.storage.from(SIGNATURE_BUCKET).remove([path]);
    throw new Error(`Failed to save signature: ${toErrorMessage(dbError)}`);
  }

  return { path, signature_type: 'uploaded' };
}

/** Build a readily disposable private read URL for a stored signature path. */
export async function signatureSignedUrl(path: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from(SIGNATURE_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) throw new Error(`Could not load signature: ${toErrorMessage(error)}`);
  return data.signedUrl;
}

function generateUniqueId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
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
