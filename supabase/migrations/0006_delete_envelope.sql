-- =============================================================================
-- IUOVA SIGN — Delete an envelope (admin)
-- -----------------------------------------------------------------------------
-- Adds a SECURITY DEFINER RPC that permanently deletes ONE envelope and all of
-- its related records, identified STRICTLY by the envelope UUID (never by
-- title or signer email).
--
-- Related data lives on two tables only:
--   * envelopes           -> one row per envelope (holds access_code,
--                            signing_token, signatures/fields, countersignature,
--                            audit timestamps such as viewed_at / sent_at /
--                            completed_at, doc_hash, etc.)
--   * envelope_signers    -> child rows keyed by envelope_id (holds signer
--                            access_code, signing_token, signature, decline
--                            records, signing_order, etc.)
--
-- There are no separate event / audit / access-code tables — the audit trail,
-- access codes and signatures are all columns on the two tables above.
--
-- Deletion is transactional: the child envelope_signers rows are deleted first,
-- then the envelope row. This is correct regardless of the on-delete behaviour
-- of the envelope_id foreign key and never touches other envelopes or contacts.
--
-- Safe for every envelope status (draft / sent / viewed / signed / completed /
-- declined / failed / voided) — no status guards.
-- =============================================================================

create or replace function admin_delete_envelope(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_env envelopes;
begin
  -- 1. Look up the envelope BY ID so we can fail cleanly if it does not exist
  --    and raise a friendly, catchable error (never delete anything else).
  select * into v_env from envelopes where id = p_id;
  if not found then
    raise exception 'not_found';
  end if;

  -- 2. Delete every child signer record for THIS envelope (by envelope UUID).
  delete from envelope_signers where envelope_id = p_id;

  -- 3. Delete the envelope itself (by its UUID).
  delete from envelopes where id = p_id;

  return jsonb_build_object(
    'ok', true,
    'id', p_id,
    'title', v_env.title,
    'deleted_at', now()
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Grant execute to the anon / authenticated roles so the frontend (which holds
-- only the publishable key and cannot touch the tables directly) may call it.
-- The service-role key is never exposed to the browser.
-- -----------------------------------------------------------------------------
grant execute on function admin_delete_envelope(uuid) to anon, authenticated;
