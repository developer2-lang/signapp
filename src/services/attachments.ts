import { supabase } from '../lib/supabaseClient';
import { toErrorMessage } from '../lib/utils';

export const ATTACHMENT_BUCKET = 'attachments';

/** MIME types accepted for envelope email attachments. */
const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

/** Maximum accepted file size (10 MB). */
const MAX_SIZE = 10 * 1024 * 1024;

export interface EnvelopeAttachment {
  id: string;
  envelopeId: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

export interface AttachmentUploadResult {
  id: string;
  fileName: string;
  storagePath: string;
}

/**
 * Validate a file before upload. Throws a clear Error on failure.
 */
export function validateAttachmentFile(file: File): void {
  if (!ALLOWED_TYPES[file.type]) {
    const allowed = Object.values(ALLOWED_TYPES)
      .map((e) => e.toUpperCase())
      .join(', ');
    throw new Error(`Unsupported file type "${file.type}". Allowed: ${allowed}`);
  }
  if (file.size > MAX_SIZE) {
    throw new Error(`File "${file.name}" is too large (${formatSize(file.size)}). Maximum is 10 MB.`);
  }
}

/**
 * Upload a single attachment to the private "attachments" bucket and record
 * its metadata via the save_attachment_metadata RPC.
 *
 * Storage path: attachments/{envelopeId}/attachments/{unique}-{sanitized_name}
 */
export async function uploadAttachment(
  file: File,
  envelopeId: string,
): Promise<AttachmentUploadResult> {
  validateAttachmentFile(file);

  const unique = generateUniqueId();
  const safeName = sanitizeFileName(file.name);
  const storagePath = `${envelopeId}/attachments/${unique}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    throw new Error(`Upload failed: ${toErrorMessage(uploadError)}`);
  }

  const { data: attId, error: dbError } = await supabase.rpc('save_attachment_metadata', {
    p_envelope_id: envelopeId,
    p_file_name: file.name,
    p_storage_path: storagePath,
    p_mime_type: file.type,
    p_file_size: file.size,
  });

  if (dbError) {
    // Roll back the Storage object.
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([storagePath]);
    throw new Error(`Failed to save attachment metadata: ${toErrorMessage(dbError)}`);
  }

  return { id: attId as string, fileName: file.name, storagePath };
}

/**
 * Upload multiple attachments for a given envelope.
 * Returns the results for all successful uploads.
 * Throws on the FIRST failure — caller should handle partial state.
 */
export async function uploadAttachments(
  files: File[],
  envelopeId: string,
): Promise<AttachmentUploadResult[]> {
  const results: AttachmentUploadResult[] = [];
  for (const file of files) {
    const result = await uploadAttachment(file, envelopeId);
    results.push(result);
  }
  return results;
}

/** Format bytes as a human-readable string. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizeFileName(name: string): string {
  // Replace path-traversal and unsafe characters. Keep extension intact.
  return name
    .replace(/[/\\]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);
}

function generateUniqueId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  }
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
