-- =============================================================================
-- IUOVA SIGN — Fix create_envelope RPC signature
-- -----------------------------------------------------------------------------
-- The browser calls supabase.rpc('create_envelope', { p_template_id, p_subject,
-- p_body, p_fields, p_title, p_template_name, p_recipient_id, p_signer_name,
-- p_signer_email, p_expires_at, p_doc_hash, p_letterhead }).
--
-- If the live database has an OLDER create_envelope (fewer/different params) or
-- several overloads, PostgREST cannot resolve the call and returns:
--   "Could not find the function public.create_envelope(...) in the schema cache"
--
-- This migration makes the signature UNAMBIGUOUS: it drops EVERY create_envelope
-- overload in public, then recreates exactly ONE with the 12 parameters sent by
-- the frontend. Idempotent and safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Drop every existing create_envelope overload (regardless of argument types)
--    so we are left with a single, unambiguous function.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_envelope'
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Recreate create_envelope with the exact signature the frontend sends.
--    Column names/types mirror public.envelopes:
--      template_id uuid, subject text, body text, fields jsonb,
--      title text, template_name text, recipient_id uuid,
--      signer_name text, signer_email text, expires_at timestamptz,
--      doc_hash text, letterhead text
-- -----------------------------------------------------------------------------
create or replace function create_envelope(
  p_template_id uuid,
  p_subject text,
  p_body text,
  p_fields jsonb,
  p_title text,
  p_template_name text,
  p_recipient_id uuid,
  p_signer_name text,
  p_signer_email text,
  p_expires_at timestamptz,
  p_doc_hash text,
  p_letterhead text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '');
  v_code  text := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
  v_env   envelopes;
begin
  insert into envelopes (
    template_id, subject, body, fields, status, title, template_name,
    recipient_id, signer_id, signer_name, signer_email, expires_at, doc_hash, letterhead,
    signing_token, access_code, created_at, updated_at
  ) values (
    p_template_id, p_subject, p_body, p_fields, 'draft', p_title, p_template_name,
    p_recipient_id, p_recipient_id, p_signer_name, p_signer_email, p_expires_at, p_doc_hash, p_letterhead,
    v_token, v_code, now(), now()
  )
  returning * into v_env;

  insert into envelope_signers (
    envelope_id, person_id, signer_name, signer_email, status,
    signing_token, access_code, role, order_idx, signing_order, created_at, updated_at
  ) values (
    v_env.id, p_recipient_id, p_signer_name, p_signer_email, 'pending',
    v_token, v_code, 'signer', 0, 1, now(), now()
  );

  return envelope_to_json(v_env);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Re-grant execute (dropping the function revoked the previous grant).
-- -----------------------------------------------------------------------------
grant execute on function create_envelope(
  uuid, text, text, jsonb, text, text, uuid, text, text, timestamptz, text, text
) to anon, authenticated;
