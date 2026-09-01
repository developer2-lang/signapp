-- =============================================================================
-- IUOVA SIGN — Multi-recipient envelopes with signing order
-- -----------------------------------------------------------------------------
-- Enables ONE envelope to contain MULTIPLE recipients (signer / countersigner)
-- with an enforced signing order and per-recipient security.
--
-- What changes and WHY:
--   * envelope_signers already had the columns (role, order_idx, signing_order,
--     per-signer signing_token / access_code). The previous app only ever created
--     a single signer and shared the envelope token with it. This migration wires
--     the multi-signer scaffolding into the RPCs and the UI.
--   * Each recipient gets its OWN signing_token + access_code. Lookups are routed
--     through the recipient's token so no recipient can access another's session.
--   * A new signing_mode ('sequential' | 'simultaneous') is stored on the
--     envelope. Sequential enforces order: only the currently-active recipient
--     may sign; the next recipient is activated (and emailed) automatically.
--   * Recipient statuses: pending -> active -> signed (or declined). order 1 is
--     active on creation; the rest pending.
--   * New envelopes complete when EVERY recipient has status 'signed'.
--   * Legacy envelopes (signing_mode IS NULL) keep the existing two-step
--     behaviour (client signs -> 'signed' -> admin_countersign -> 'completed'),
--     so existing data and the current countersign flow are preserved.
--
-- Backward compatibility is preserved: every existing RPC name is kept, now
-- routed through per-recipient security while still working for the legacy
-- single-signer envelopes (their signer token equals the envelope token).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. signing_mode on envelopes (NULL => legacy two-step behaviour)
-- -----------------------------------------------------------------------------
alter table envelopes
  add column if not exists signing_mode text;

-- -----------------------------------------------------------------------------
-- 2. envelope_to_json — expose signing_mode + signing_order + signed_at so the
--    admin UI can render all recipients and their progress. (Admin view: tokens
--    are intentionally included, matching existing admin RPC behaviour.)
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
    'signing_mode', e.signing_mode,
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
        'signing_order', s.signing_order,
        'declined_at', s.declined_at,
        'decline_reason', s.decline_reason
      ) order by s.order_idx), '[]'::jsonb)
      from envelope_signers s
      where s.envelope_id = e.id
    )
  );
$$;

-- -----------------------------------------------------------------------------
-- 3. signer_view — the shape returned to a RECIPIENT in the signer portal.
--    CRITICAL SECURITY: this NEVER exposes another recipient's signing_token or
--    access_code. Each recipient only ever sees their own credentials (top level)
--    and the neutral metadata (name/role/status/order) of the other recipients.
-- -----------------------------------------------------------------------------
create or replace function signer_view(e envelopes, s envelope_signers)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', e.id,
    'title', e.title,
    'template_name', e.template_name,
    'status', e.status,
    'signer_id', s.id,
    'signer_name', s.signer_name,
    'signer_email', s.signer_email,
    'role', s.role,
    'order_idx', s.order_idx,
    'signing_order', s.signing_order,
    'signing_mode', e.signing_mode,
    'body', e.body,
    'fields', e.fields,
    'letterhead', e.letterhead,
    'signing_token', s.signing_token,
    'access_code', s.access_code,
    'created_at', e.created_at,
    'updated_at', e.updated_at,
    'sent_at', e.sent_at,
    'completed_at', e.completed_at,
    'expires_at', e.expires_at,
    'viewed_at', e.viewed_at,
    'email_sent', e.email_sent,
    'doc_hash', e.doc_hash,
    'countersignature', e.countersignature,
    'countersigned_at', e.countersigned_at,
    'recipients', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id,
        'person_id', r.person_id,
        'name', r.signer_name,
        'email', r.signer_email,
        'role', r.role,
        'order_idx', r.order_idx,
        'signing_order', r.signing_order,
        'status', r.status,
        'signature', r.signature,
        'signed_at', r.signed_at,
        'declined_at', r.declined_at,
        'decline_reason', r.decline_reason
      ) order by r.order_idx), '[]'::jsonb)
      from envelope_signers r
      where r.envelope_id = e.id
    )
  );
$$;

-- -----------------------------------------------------------------------------
-- 4. create_envelope — NEW signature. Accepts an ordered array of recipients and
--    a signing mode, creating a row in envelope_signers for each recipient with
--    its own secure token/code. The first (lowest order) recipient is ACTIVATED;
--    the rest stay PENDING (so only they can progress once it is their turn).
--
--    BREAKING-ISH: the old 12-param signature (single person) is replaced. The
--    frontend is updated to send recipients. Nothing else in the codebase calls
--    this RPC directly.
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

create or replace function create_envelope(
  p_template_id uuid,
  p_subject text,
  p_body text,
  p_fields jsonb,
  p_title text,
  p_template_name text,
  p_expires_at timestamptz,
  p_doc_hash text,
  p_letterhead text,
  p_recipients jsonb,
  p_signing_mode text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_env     envelopes;
  rec       record;
  v_token   text;
  v_code    text;
  v_active  boolean;
  v_idx     int default 0;
begin
  if p_recipients is null or jsonb_array_length(p_recipients) = 0 then
    raise exception 'recipients_required';
  end if;
  if p_signing_mode is null or p_signing_mode not in ('sequential', 'simultaneous') then
    p_signing_mode := 'sequential';
  end if;

  insert into envelopes (
    template_id, subject, body, fields, status, title, template_name,
    expires_at, doc_hash, letterhead, signing_mode, created_at, updated_at
  ) values (
    p_template_id, p_subject, p_body, p_fields, 'draft', p_title, p_template_name,
    p_expires_at, p_doc_hash, p_letterhead, p_signing_mode, now(), now()
  )
  returning * into v_env;

  for rec in
    select r.value->>'name'           as name,
           r.value->>'email'          as email,
           coalesce(r.value->>'person_id', null) as person_id,
           coalesce(r.value->>'role', 'signer')  as role,
           coalesce((r.value->>'order')::int, 0) as ord
    from jsonb_array_elements(p_recipients) r
    order by ((r.value->>'order')::int)
  loop
    v_idx := v_idx + 1;
    v_token := replace(gen_random_uuid()::text, '-', '');
    v_code  := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
    -- Sequential: only the FIRST recipient is active; the rest stay pending.
    -- Simultaneous: everyone is active from the start.
    v_active := (p_signing_mode <> 'sequential') or (v_idx = 1);

    insert into envelope_signers (
      envelope_id, person_id, signer_name, signer_email, status,
      signing_token, access_code, role, order_idx, signing_order, created_at, updated_at
    ) values (
      v_env.id,
      nullif(rec.person_id, '')::uuid,
      rec.name,
      rec.email,
      case when v_active then 'active' else 'pending' end,
      v_token, v_code, rec.role, v_idx, rec.ord, now(), now()
    );

    if v_idx = 1 then
      -- Mirror the first recipient onto the envelope columns for backward
      -- compatibility with admin display + the legacy single-recipient fields.
      update envelopes
        set recipient_id = nullif(rec.person_id, '')::uuid,
            signer_id     = nullif(rec.person_id, '')::uuid,
            signer_name   = rec.name,
            signer_email  = rec.email,
            signing_token = v_token,
            access_code   = v_code
        where id = v_env.id;
    end if;
  end loop;

  select * into v_env from envelopes where id = v_env.id;
  return envelope_to_json(v_env);
end;
$$;

grant execute on function create_envelope(
  uuid, text, text, jsonb, text, text, timestamptz, text, text, jsonb, text
) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. get_envelope_meta — now recipient-aware. Looks the recipient up by their
--    OWN token and returns WHO they are, their role, and whether it is their turn.
-- -----------------------------------------------------------------------------
create or replace function get_envelope_meta(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', e.id,
    'title', e.title,
    'template_name', e.template_name,
    'signer_name', s.signer_name,
    'signer_email', s.signer_email,
    'role', s.role,
    'status', e.status,
    'expires_at', e.expires_at,
    'created_at', e.created_at,
    'signing_mode', e.signing_mode,
    'already_signed', (s.status = 'signed'),
    'is_active', (
      s.status = 'active'
      or not exists (
        select 1 from envelope_signers o
        where o.envelope_id = e.id and o.id <> s.id and o.status = 'active'
      )
    )
  )
  from envelope_signers s
  join envelopes e on e.id = s.envelope_id
  where s.signing_token = p_token;
$$;

-- -----------------------------------------------------------------------------
-- 6. helper: resolve the recipient signing this token (handles the legacy case
--    where the signer row shares the envelope token).
-- -----------------------------------------------------------------------------
create or replace function resolve_signer(p_token text)
returns envelope_signers
language sql
security definer
set search_path = public
as $$
  select * from envelope_signers where signing_token = p_token
  union all
  select s.* from envelopes e
    join envelope_signers s on s.envelope_id = e.id
    where e.signing_token = p_token and s.signing_token = e.signing_token
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- 7. unlock_envelope — validate the recipient's own access code and that it is
--    their turn; return the restricted signer view (no other tokens).
-- -----------------------------------------------------------------------------
create or replace function unlock_envelope(p_token text, p_access_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_env    envelopes;
  v_signer envelope_signers;
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
  if v_env.signing_mode = 'sequential' and v_signer.status not in ('signed') and
     exists (select 1 from envelope_signers o
             where o.envelope_id = v_env.id and o.id <> v_signer.id and o.status = 'active')
  then
    raise exception 'not_your_turn';
  end if;

  if v_env.status = 'sent' then
    update envelopes set status = 'viewed', viewed_at = now(), updated_at = now()
      where id = v_env.id;
  else
    update envelopes set viewed_at = coalesce(viewed_at, now()), updated_at = now()
      where id = v_env.id;
  end if;

  select * into v_env from envelopes where id = v_env.id;
  return signer_view(v_env, v_signer);
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. sign_envelope — recipient signs. Enforces order server-side, seals the
--    signature, then:
--      * legacy (no signing_mode): stays 'signed' awaiting admin countersign.
--      * new sequential: activates the next recipient (so they can sign & be
--        emailed) without exposing any other tokens.
--      * completes when every recipient has signed.
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
      -- Keep envelope in an in-progress state (do not move to 'signed' so we do
      -- not trigger the legacy admin countersign path).
      update envelopes
        set status = case when v_env.status = 'draft' then 'sent' else v_env.status end,
            updated_at = now()
        where id = v_env.id;
    end if;
  end if;

  select * into v_env from envelopes where id = v_env.id;
  select * into v_signer from envelope_signers where id = v_signer.id;
  return signer_view(v_env, v_signer);
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. decline_envelope — recipient declines: record it and decline the envelope.
-- -----------------------------------------------------------------------------
create or replace function decline_envelope(
  p_token text,
  p_access_code text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_env    envelopes;
  v_signer envelope_signers;
begin
  select * into v_signer from resolve_signer(p_token);
  if not found then raise exception 'invalid_token'; end if;
  select * into v_env from envelopes where id = v_signer.envelope_id;
  if not found then raise exception 'invalid_token'; end if;

  if lower(coalesce(v_signer.access_code, v_env.access_code)) is distinct from lower(p_access_code) then
    raise exception 'invalid_access_code';
  end if;
  if v_env.status in ('completed', 'declined') then raise exception 'already_closed'; end if;

  update envelope_signers
    set status = 'declined', declined_at = now(), decline_reason = p_reason, updated_at = now()
    where id = v_signer.id;
  update envelopes set status = 'declined', updated_at = now() where id = v_env.id;

  select * into v_env from envelopes where id = v_env.id;
  return signer_view(v_env, v_signer);
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. mark_envelope_sent — called by the Edge Function after an email dispatch.
--     Now only marks the envelope as 'sent' (recipients keep their own status;
--     the first/active one is already 'active'). Idempotent for re-sends.
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
  update envelopes
    set status = 'sent', sent_at = coalesce(sent_at, now()), email_sent = true, updated_at = now()
    where id = p_id
  returning * into v_env;
  if not found then raise exception 'not_found'; end if;
  return envelope_to_json(v_env);
end;
$$;

-- -----------------------------------------------------------------------------
-- 11. active_recipient — admin helper: return the recipient currently awaiting
--     action (used by the UI + Edge Function to know who to notify next).
-- -----------------------------------------------------------------------------
create or replace function active_recipient(p_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', s.id,
    'name', s.signer_name,
    'email', s.signer_email,
    'role', s.role,
    'signing_order', s.signing_order,
    'signing_token', s.signing_token,
    'access_code', s.access_code
  )
  from envelope_signers s
  where s.envelope_id = p_id
    and s.status in ('active', 'pending', 'sent')
  order by s.order_idx
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- 12. Grants (recreate after dropping/overwriting the functions)
-- -----------------------------------------------------------------------------
grant execute on function envelope_to_json(envelopes) to anon, authenticated;
grant execute on function signer_view(envelopes, envelope_signers) to anon, authenticated;
grant execute on function resolve_signer(text) to anon, authenticated;
grant execute on function get_envelope_meta(text) to anon, authenticated;
grant execute on function unlock_envelope(text, text) to anon, authenticated;
grant execute on function sign_envelope(text, text, jsonb) to anon, authenticated;
grant execute on function decline_envelope(text, text, text) to anon, authenticated;
grant execute on function mark_envelope_sent(uuid) to anon, authenticated;
grant execute on function active_recipient(uuid) to anon, authenticated;
