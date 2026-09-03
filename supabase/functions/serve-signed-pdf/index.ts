// supabase/functions/serve-signed-pdf/index.ts
// -----------------------------------------------------------------------------
// Serves the final signed PDF directly to the browser / PDF viewer so the
// completion email's "View completed document" button opens the PDF itself
// (Content-Type: application/pdf) — NOT the signing page, access-code page, or
// an intermediate HTML document page.
//
// The browser generated the PDF client-side (getPDFBytes), uploaded it to the
// private "signed-pdf" bucket at {envelopeId}/final.pdf, and attached the SAME
// bytes to the completion email. This function looks up the envelope by its
// signing token (service-role key), downloads the stored PDF, and returns it
// as an inline application/pdf document.
//
// Access is guarded by the envelope's signing token: only someone holding a
// valid token can retrieve the final document. No storage paths are exposed
// and no access code is required.
// -----------------------------------------------------------------------------

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BUCKET = 'signed-pdf';
const FILE_NAME = 'final.pdf';

Deno.serve(async (req: Request) => {
  // CORS is not strictly required for a top-level browser navigation (opening a
  // PDF in a new tab), but including it keeps the endpoint usable via fetch.
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = (url.searchParams.get('token') ?? '').trim();

    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: 'token is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Resolve the envelope (and its id + title) from the signing token. The
    // token is unguessable and unique per recipient/envelope, so possession of
    // the URL is the access check. We intentionally do NOT accept an access
    // code here — the document is already fully executed.
    const { data: env, error: envErr } = await supabase
      .from('envelopes')
      .select('id, title, signing_token, status')
      .eq('signing_token', token)
      .maybeSingle();

    if (envErr || !env) {
      console.error(`[serve-signed-pdf] envelope lookup failed: ${envErr?.message ?? 'not found'}`);
      return new Response(JSON.stringify({ ok: false, error: 'document not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Download the stored final signed PDF.
    const { data: pdfBlob, error: dlErr } = await supabase.storage
      .from(BUCKET)
      .download(`${env.id}/${FILE_NAME}`);

    if (dlErr || !pdfBlob) {
      console.error(`[serve-signed-pdf] download failed for ${env.id}: ${dlErr?.message ?? 'not found'}`);
      return new Response(JSON.stringify({ ok: false, error: 'document not available' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const bytes = new Uint8Array(await pdfBlob.arrayBuffer());
    const safeTitle = (env.title ?? 'Document').replace(/[^\w\- ]/g, '');

    console.log(
      `[serve-signed-pdf] served ${bytes.length} bytes for envelope ${env.id}`,
    );

    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${safeTitle}.pdf"`,
        'Content-Length': String(bytes.length),
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[serve-signed-pdf] ERROR — request failed', err);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
