import { supabase } from '../lib/supabaseClient';

export interface SendEmailResult {
  ok: boolean;
  error?: string;
}

/**
 * Invoke the server-side Edge Function that sends the signer email.
 * The frontend never sees SMTP credentials — they live only inside the
 * Supabase Edge Function (set via `supabase secrets set`).
 */
export async function sendEnvelopeEmail(envelopeId: string): Promise<SendEmailResult> {
  const { error } = await supabase.functions.invoke('send-envelope-email', {
    body: { envelopeId },
  });
  if (error) {
    return { ok: false, error: error.message || 'Email could not be sent' };
  }
  return { ok: true };
}
