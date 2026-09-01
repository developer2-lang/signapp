-- =============================================================================
-- IUOVA SIGN — Fix sequential signing status + auto-notify next recipient
-- -----------------------------------------------------------------------------
-- Problem: When the first signer signs in sequential mode, the envelope status
-- stays at 'sent'/'viewed' instead of moving to 'signed'. This means the admin
-- sees "Awaiting signer" instead of "Counter-signature pending".
--
-- Fix: After a recipient signs and NOT all recipients have signed yet, set the
-- envelope status to 'signed' so the admin UI shows "Counter-signature pending".
--
-- Also ensures mark_envelope_sent is idempotent and doesn't regress status.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Replace sign_envelope — properly set envelope status to 'signed' when
--    more recipients still need to sign (multi-recipient flow).
-- -----------------------------------------------------------------------------
create or replace function sign_envelope(
  p_token text,
  p_access_code text,
  p_signature jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_env     envelopes;
  v_signer  envelope_signers;
  v_total   int;
  v_signed  int;
begin
  select * into v_signer from resolve_signer(p_token);
  if not found then raise exception 'invalid_token'; end if;
  select * into v_env from envelopes where id = v_signer.envelope_id;
  if not found then raise exception 'invalid_token'; end if;

  if lower(coalesce(v_signer.access_code, v_env.access_code)) is distinct from lower(p_access_code) then
    raise exception 'invalid_access_code';
  end if;
  if v_env.status = 'declined' then raise exception 'envelope_declined'; end if;
  if v_signer.status = 'declined' then raise exception 'envelope_declined'; end if;
  if v_env.status = 'completed' then raise exception 'already_completed'; end if;
  if v_signer.status = 'signed' then raise exception 'already_signed'; end if;

  -- Sequential order enforcement: block if a DIFFERENT recipient is active.
  if v_env.signing_mode = 'sequential' and v_signer.status not in ('signed') and
     exists (select 1 from envelope_signers o
             where o.envelope_id = v_env.id and o.id <> v_signer.id and o.status = 'active')
  then
    raise exception 'not_your_turn';
  end if;

  update envelope_signers
    set status = 'signed', signed_at = now(), signature = p_signature, updated_at = now()
    where id = v_signer.id;

  -- Completion / progression
  if v_env.signing_mode is null then
    -- Legacy two-step: client signs, company counter-signs later.
    update envelopes set status = 'signed', updated_at = now() where id = v_env.id;
  else
    select count(*) into v_total from envelope_signers where envelope_id = v_env.id;
    select count(*) into v_signed from envelope_signers
      where envelope_id = v_env.id and status = 'signed';
    if v_signed >= v_total then
      update envelopes
        set status = 'completed', completed_at = now(), updated_at = now()
        where id = v_env.id;
    else
      if v_env.signing_mode = 'sequential' then
        -- Activate the next pending recipient (lowest signing_order not signed).
        update envelope_signers
          set status = 'active', updated_at = now()
          where envelope_id = v_env.id and status in ('pending', 'sent')
            and signing_order = (
              select min(o.signing_order) from envelope_signers o
              where o.envelope_id = v_env.id
                and o.status in ('pending', 'sent')
            );
      end if;
      -- Set envelope to 'signed' so the admin UI shows "Counter-signature
      -- pending". This replaces the old logic that kept the status at
      -- 'sent'/'viewed', which was incorrect for multi-recipient envelopes.
      -- The 'signed' status does NOT trigger the legacy admin countersign
      -- path because that path only shows when signing_mode IS NULL.
      update envelopes
        set status = 'signed', updated_at = now()
        where id = v_env.id;
    end if;
  end if;

  select * into v_env from envelopes where id = v_env.id;
  select * into v_signer from envelope_signers where id = v_signer.id;
  return signer_view(v_env, v_signer);
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Replace mark_envelope_sent — only advance status from 'draft' → 'sent'
--    on the initial dispatch. Never regress a status that has already moved
--    past 'sent' (e.g. 'viewed', 'signed', 'completed').
-- -----------------------------------------------------------------------------
create or replace function mark_envelope_sent(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_env envelopes;
begin
  -- First try: advance from 'draft' to 'sent' (initial send only).
  update envelopes
    set status = 'sent',
        sent_at = coalesce(sent_at, now()),
        email_sent = true,
        updated_at = now()
    where id = p_id and status = 'draft'
  returning * into v_env;

  if not found then
    -- Either not found or already past 'draft'. For re-sends, just update
    -- the email_sent flag without touching the status at all.
    update envelopes
      set email_sent = true, updated_at = now()
      where id = p_id
    returning * into v_env;
    if not found then raise exception 'not_found'; end if;
  end if;

  return envelope_to_json(v_env);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Grants
-- -----------------------------------------------------------------------------
grant execute on function sign_envelope(text, text, jsonb) to anon, authenticated;
grant execute on function mark_envelope_sent(uuid) to anon, authenticated;
