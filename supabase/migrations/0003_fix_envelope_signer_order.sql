-- =============================================================================
-- IUOVA SIGN — Fix envelope_signers insert in create_envelope
-- -----------------------------------------------------------------------------
-- The live public.envelope_signers table has a NOT NULL column `signing_order`
-- that the create_envelope RPC never populated, so the very first signer insert
-- failed with:
--   null value in column 'signing_order' of relation 'envelope_signers'
--   violates not-null constraint
--
-- The fix:
--   * Explicitly insert signing_order = 1 for the (first) signer.
--   * Keep the column NOT NULL (constraint is preserved, not removed).
--   * Add a DEFAULT of 1 as a safety net so no insert path can ever leave it
--     null (the constraint stays NOT NULL).
--   * Preserve the exact frontend RPC signature (12 params, same names/types).
--   * Replace (not overload) create_envelope so only one definition remains.
--
-- Other NOT NULL columns on envelope_signers already satisfied by the insert:
--   envelope_id  -> v_env.id        (provided)
--   status       -> 'pending'       (provided)
--   signing_order-> 1               (FIXED here)
--   id / created_at / updated_at    -> have defaults in the base table
-- Columns added by 0001 (role, order_idx, signing_token, access_code, signature,
-- declined_at, decline_reason) all have defaults or are nullable.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Defensive: ensure signing_order keeps its NOT NULL constraint but gets a
--    default of 1, so the column can never be left null by any code path.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'envelope_signers'
      and column_name = 'signing_order'
  ) then
    alter table envelope_signers alter column signing_order set default 1;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Drop every existing create_envelope overload so we end with exactly ONE
--    unambiguous function (no overloaded versions).
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
-- 3. Recreate create_envelope with the SAME signature the frontend calls, now
--    inserting signing_order = 1 for the first signer.
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
-- 4. Re-grant execute (dropping the function revoked the previous grant).
-- -----------------------------------------------------------------------------
grant execute on function create_envelope(
  uuid, text, text, jsonb, text, text, uuid, text, text, timestamptz, text, text
) to anon, authenticated;
