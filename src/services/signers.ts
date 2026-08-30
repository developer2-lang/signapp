import { supabase } from '../lib/supabaseClient';
import type { Envelope } from '../types/envelope';
import type { Signature } from '../types/signature';
import { dbRowToEnvelope } from './envelopes';
import { toErrorMessage } from '../lib/utils';

export interface SignerMeta {
  id: string;
  title: string;
  signerName: string;
  signerEmail: string;
  status: Envelope['status'];
  expiresAt: string | null;
  createdAt: string;
  alreadySigned: boolean;
}

function friendly(err: unknown, fallback: string): Error {
  // supabase.rpc returns a plain object ({ code, message, details, hint }), NOT an
  // Error instance. Extract the real message explicitly so it is never hidden
  // behind "[object Object]".
  const msg = toErrorMessage(err, fallback);

  // Log the real error so it is never hidden from the console.
  console.error('[signers]', err);

  if (msg.includes('invalid_access_code')) return new Error('Invalid access code');
  if (msg.includes('invalid_token')) return new Error('Signing link is invalid or expired');
  if (msg.includes('envelope_declined')) return new Error('This envelope has been declined');
  if (msg.includes('already_signed')) return new Error('This envelope has already been signed');
  if (msg.includes('already_completed')) return new Error('This envelope is already completed');
  if (msg.includes('client_not_signed')) return new Error('The client has not signed yet');
  if (msg.includes('already_closed')) return new Error('This envelope is already closed');
  if (msg.includes('signer_not_found')) return new Error('Signer record not found');
  if (msg.includes('not_found')) return new Error('Envelope not found');
  if (msg.includes('envelopes_status_check')) {
    return new Error('This envelope is in a state that can no longer be opened. Contact the sender.');
  }
  return new Error(msg || fallback);
}

export async function getEnvelopeMeta(token: string): Promise<SignerMeta | null> {
  const { data, error } = await supabase.rpc('get_envelope_meta', { p_token: token });
  if (error) throw friendly(error, 'Could not load envelope');
  if (!data) return null;
  return data as SignerMeta;
}

export async function unlockEnvelope(token: string, code: string): Promise<Envelope> {
  const { data, error } = await supabase.rpc('unlock_envelope', {
    p_token: token,
    p_access_code: code,
  });
  if (error) throw friendly(error, 'Could not open document');
  if (!data) throw new Error('Could not open document');
  return dbRowToEnvelope(data as Parameters<typeof dbRowToEnvelope>[0]);
}

export async function signEnvelope(
  token: string,
  code: string,
  signature: Signature,
): Promise<Envelope> {
  const { data, error } = await supabase.rpc('sign_envelope', {
    p_token: token,
    p_access_code: code,
    p_signature: signature as unknown as Record<string, unknown>,
  });
  if (error) throw friendly(error, 'Could not sign document');
  if (!data) throw new Error('Could not sign document');
  return dbRowToEnvelope(data as Parameters<typeof dbRowToEnvelope>[0]);
}

export async function declineEnvelope(
  token: string,
  code: string,
  reason: string,
): Promise<Envelope> {
  const { data, error } = await supabase.rpc('decline_envelope', {
    p_token: token,
    p_access_code: code,
    p_reason: reason,
  });
  if (error) throw friendly(error, 'Could not decline document');
  if (!data) throw new Error('Could not decline document');
  return dbRowToEnvelope(data as Parameters<typeof dbRowToEnvelope>[0]);
}
