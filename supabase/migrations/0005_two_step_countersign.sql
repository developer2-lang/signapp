-- =============================================================================
-- IUOVA SIGN — Two-step completion: client signs, THEN company counter-signs
-- -----------------------------------------------------------------------------
-- BUG: sign_envelope set the envelope to 'completed' the moment the client
-- signed, even though the company/admin counter-signature is still required.
-- That made the dashboard report "Completed" before the second party had acted.
--
-- FIX:
--   * Client signing now leaves the envelope in 'signed' (the existing
--     "Counter-signature pending" state). It NEVER auto-completes.
--   * A separate admin action, admin_countersign, is the ONLY path that moves
--     'signed' -> 'completed' and persists the company countersignature.
--   * Add countersignature + countersigned_at columns so the company sign is
--     stored and surfaced in the chain of custody.
--
-- No new status values are introduced and the CHECK constraint is untouched:
-- the existing vocabulary (draft / sent / viewed / signed / completed / declined
-- / failed / voided) already carries 'signed' for the awaiting-counter-sign
-- state, matching the frontend label. Reusing it avoids duplicate statuses.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Persist the company countersignature on the envelope.
-- -----------------------------------------------------------------------------
alter table envelopes
  add column if not exists countersignature jsonb,
  add column if not exists countersigned_at timestamptz;

-- -----------------------------------------------------------------------------
-- 2. envelope_to_json — expose the new columns.
-- -----------------------------------------------------------------------------
create or replace function envelope_to_json(e envelopes)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', e.id,
    'template_id', e.template_id,
    'subject', e.subject,
    'status', e.status,
    'title', e.title,
    'template_name', e.template_name,
    'recipient_id', e.recipient_id,
    'signer_id', e.signer_id,
    'signer_name', e.signer_name,
    'signer_email', e.signer_email,
    'body', e.body,
    'fields', e.fields,
    'letterhead', e.letterhead,
    'signing_token', e.signing_token,
    'access_code', e.access_code,
    'created_at', e.created_at,
    'updated_at', e.updated_at,
    'sent_at', e.sent_at,
    'completed_at', e.completed_at,
    'expires_at', e.expires_at,
    'viewed_at', e.viewed_at,
    'email_sent', e.email_sent,
    'reminders', e.reminders,
    'doc_hash', e.doc_hash,
    'countersignature', e.countersignature,
    'countersigned_at', e.countersigned_at,
    'signers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id,
        'envelope_id', s.envelope_id,
        'person_id', s.person_id,
        'signer_name', s.signer_name,
        'signer_email', s.signer_email,
        'status', s.status,
        'signing_token', s.signing_token,
        'access_code', s.access_code,
        'signature', s.signature,
        'signed_at', s.signed_at,
        'role', s.role,
        'order_idx', s.order_idx,
        'declined_at', s.declined_at,
        'decline_reason', s.decline_reason
      ) order by s.order_idx), '[]'::jsonb)
      from envelope_signers s
      where s.envelope_id = e.id
    )
  );
$$;

-- -----------------------------------------------------------------------------
-- 3. sign_envelope — client signing seals the signature but does NOT complete.
--    The envelope always transitions to 'signed' (awaiting counter-signature).
--    Completion happens ONLY via admin_countersign below.
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
begin
  select * into v_env from envelopes where signing_token = p_token;
  if not found then raise exception 'invalid_token'; end if;
  if lower(v_env.access_code) is distinct from lower(p_access_code) then
    raise exception 'invalid_access_code';
  end if;
  if v_env.status = 'declined' then raise exception 'envelope_declined'; end if;
  if v_env.status in ('completed') then raise exception 'already_completed'; end if;

  select * into v_signer
    from envelope_signers
    where envelope_id = v_env.id
      and (signing_token = p_token or access_code = p_access_code)
    limit 1;
  if not found then raise exception 'signer_not_found'; end if;
  if v_signer.status = 'signed' then raise exception 'already_signed'; end if;

  update envelope_signers
    set status = 'signed', signed_at = now(), signature = p_signature, updated_at = now()
    where id = v_signer.id;

  -- Client signed: wait for the company counter-signature before completing.
  update envelopes set status = 'signed', updated_at = now() where id = v_env.id;

  select * into v_env from envelopes where id = v_env.id;
  return envelope_to_json(v_env);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. admin_countersign — the ONLY path to 'completed'.
--    Stores the company countersignature and is rejected unless the client has
--    already signed (status = 'signed').
-- -----------------------------------------------------------------------------
create or replace function admin_countersign(
  p_id uuid,
  p_signature jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_env envelopes;
begin
  select * into v_env from envelopes where id = p_id;
  if not found then raise exception 'not_found'; end if;
  if v_env.status = 'completed' then raise exception 'already_completed'; end if;
  if v_env.status = 'declined' then raise exception 'envelope_declined'; end if;
  if v_env.status <> 'signed' then raise exception 'client_not_signed'; end if;

  update envelopes
    set status = 'completed',
        completed_at = now(),
        countersignature = p_signature,
        countersigned_at = now(),
        updated_at = now()
    where id = p_id
  returning * into v_env;

  return envelope_to_json(v_env);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Grants (replacing sign_envelope revoked nothing, but admin_countersign is
--    new and must be callable by the admin browser context like the other
--    admin RPCs).
-- -----------------------------------------------------------------------------
grant execute on function envelope_to_json(envelopes) to anon, authenticated;
grant execute on function sign_envelope(text, text, jsonb) to anon, authenticated;
grant execute on function admin_countersign(uuid, jsonb) to anon, authenticated;
