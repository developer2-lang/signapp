-- =============================================================================
-- IUOVA SIGN — Envelope / Signer workflow migration
-- -----------------------------------------------------------------------------
-- Idempotent: only adds columns that are missing, creates SECURITY DEFINER
-- functions and locks down direct anon access (the browser may only call the
-- RPC functions, never read/write the tables directly).
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend the envelopes table (reuse existing columns where present)
-- -----------------------------------------------------------------------------
alter table envelopes
  add column if not exists body text,
  add column if not exists fields jsonb,
  add column if not exists signing_token text,
  add column if not exists access_code text,
  add column if not exists template_name text,
  add column if not exists recipient_id uuid,
  add column if not exists signer_id uuid,
  add column if not exists signer_name text,
  add column if not exists signer_email text,
  add column if not exists expires_at timestamptz,
  add column if not exists doc_hash text,
  add column if not exists letterhead text,
  add column if not exists reminders integer default 0,
  add column if not exists email_sent boolean default false,
  add column if not exists viewed_at timestamptz;

-- -----------------------------------------------------------------------------
-- 2. Extend the envelope_signers table
-- -----------------------------------------------------------------------------
alter table envelope_signers
  add column if not exists signing_token text,
  add column if not exists access_code text,
  add column if not exists signature jsonb,
  add column if not exists role text default 'signer',
  add column if not exists declined_at timestamptz,
  add column if not exists decline_reason text,
  add column if not exists order_idx integer default 0;

-- -----------------------------------------------------------------------------
-- 3. Unique indexes for fast / secure token lookups
-- -----------------------------------------------------------------------------
create unique index if not exists envelopes_signing_token_idx
  on envelopes (signing_token) where signing_token is not null;

create unique index if not exists envelope_signers_signing_token_idx
  on envelope_signers (signing_token) where signing_token is not null;

-- -----------------------------------------------------------------------------
-- 4. Helper: shape an envelope + its signers as JSON (used by every RPC)
--    NOTE: this deliberately exposes signing_token / access_code because it is
--    only ever called by admin RPCs that run as the owner (postgres).
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
-- 5. create_envelope — generate secure tokens server-side, insert envelope + signer
-- -----------------------------------------------------------------------------
-- Drop any pre-existing create_envelope overloads so we always end up with a
-- single, unambiguous function matching the frontend RPC call below.
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
    signing_token, access_code, role, order_idx, created_at, updated_at
  ) values (
    v_env.id, p_recipient_id, p_signer_name, p_signer_email, 'pending',
    v_token, v_code, 'signer', 0, now(), now()
  );

  return envelope_to_json(v_env);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. list_envelopes — admin: every envelope + signers (token/code included)
-- -----------------------------------------------------------------------------
create or replace function list_envelopes()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(envelope_to_json(e) order by e.created_at desc),
    '[]'::jsonb
  )
  from envelopes e;
$$;

-- -----------------------------------------------------------------------------
-- 7. get_envelope_admin — admin: single envelope by id
-- -----------------------------------------------------------------------------
create or replace function get_envelope_admin(p_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select envelope_to_json(e) from envelopes e where e.id = p_id;
$$;

-- -----------------------------------------------------------------------------
-- 8. admin_void — admin: void/decline an envelope (stops signing)
-- -----------------------------------------------------------------------------
create or replace function admin_void(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_env envelopes;
begin
  update envelopes set status = 'declined', updated_at = now() where id = p_id returning * into v_env;
  if not found then raise exception 'not_found'; end if;
  update envelope_signers set status = 'declined', declined_at = now()
    where envelope_id = p_id and status <> 'signed';
  return envelope_to_json(v_env);
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. mark_sent — called by the Edge Function after a successful email send
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
    set status = 'sent', sent_at = now(), email_sent = true, updated_at = now()
    where id = p_id
  returning * into v_env;
  if not found then raise exception 'not_found'; end if;
  update envelope_signers set status = 'sent', updated_at = now()
    where envelope_id = p_id and status = 'pending';
  return envelope_to_json(v_env);
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. get_envelope_meta — signer: envelope metadata WITHOUT the document body
--     (token alone must never reveal the document)
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
    'signer_name', e.signer_name,
    'signer_email', e.signer_email,
    'status', e.status,
    'expires_at', e.expires_at,
    'created_at', e.created_at,
    'already_signed', (
      exists (select 1 from envelope_signers s where s.envelope_id = e.id and s.status = 'signed')
    )
  )
  from envelopes e
  where e.signing_token = p_token;
$$;

-- -----------------------------------------------------------------------------
-- 11. unlock_envelope — signer: validate access code, return full document
-- -----------------------------------------------------------------------------
create or replace function unlock_envelope(p_token text, p_access_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_env envelopes;
begin
  select * into v_env from envelopes where signing_token = p_token;
  if not found then raise exception 'invalid_token'; end if;
  if lower(v_env.access_code) is distinct from lower(p_access_code) then
    raise exception 'invalid_access_code';
  end if;
  if v_env.status = 'declined' then raise exception 'envelope_declined'; end if;

  if v_env.status = 'sent' then
    update envelopes set status = 'viewed', viewed_at = now(), updated_at = now()
      where id = v_env.id;
  else
    update envelopes set viewed_at = coalesce(viewed_at, now()), updated_at = now()
      where id = v_env.id;
  end if;

  select * into v_env from envelopes where id = v_env.id;
  return envelope_to_json(v_env);
end;
$$;

-- -----------------------------------------------------------------------------
-- 12. sign_envelope — signer: validate, seal signature, complete if last signer
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

  if not exists (
    select 1 from envelope_signers where envelope_id = v_env.id and status <> 'signed'
  ) then
    update envelopes set status = 'completed', completed_at = now(), updated_at = now()
      where id = v_env.id;
  else
    update envelopes set status = 'signed', updated_at = now() where id = v_env.id;
  end if;

  select * into v_env from envelopes where id = v_env.id;
  return envelope_to_json(v_env);
end;
$$;

-- -----------------------------------------------------------------------------
-- 13. decline_envelope — signer: record a decline
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
  select * into v_env from envelopes where signing_token = p_token;
  if not found then raise exception 'invalid_token'; end if;
  if lower(v_env.access_code) is distinct from lower(p_access_code) then
    raise exception 'invalid_access_code';
  end if;
  if v_env.status in ('completed', 'declined') then raise exception 'already_closed'; end if;

  select * into v_signer
    from envelope_signers
    where envelope_id = v_env.id and (signing_token = p_token or access_code = p_access_code)
    limit 1;
  if not found then raise exception 'signer_not_found'; end if;

  update envelope_signers
    set status = 'declined', declined_at = now(), decline_reason = p_reason, updated_at = now()
    where id = v_signer.id;
  update envelopes set status = 'declined', updated_at = now() where id = v_env.id;

  select * into v_env from envelopes where id = v_env.id;
  return envelope_to_json(v_env);
end;
$$;

-- -----------------------------------------------------------------------------
-- 13b. admin_extend — admin: push the expiry forward by N days
-- -----------------------------------------------------------------------------
create or replace function admin_extend(p_id uuid, p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_env envelopes;
begin
  update envelopes
    set expires_at = coalesce(expires_at, now()) + (p_days || ' days')::interval,
        updated_at = now()
    where id = p_id
  returning * into v_env;
  if not found then raise exception 'not_found'; end if;
  return envelope_to_json(v_env);
end;
$$;

-- -----------------------------------------------------------------------------
-- 14. Lock down direct table access; only the RPC functions are callable by anon
-- -----------------------------------------------------------------------------
alter table envelopes enable row level security;
alter table envelope_signers enable row level security;

revoke all on envelopes from anon, authenticated;
revoke all on envelope_signers from anon, authenticated;

grant execute on function envelope_to_json(envelopes) to anon, authenticated;
grant execute on function create_envelope(uuid, text, text, jsonb, text, text, uuid, text, text, timestamptz, text, text) to anon, authenticated;
grant execute on function list_envelopes() to anon, authenticated;
grant execute on function get_envelope_admin(uuid) to anon, authenticated;
grant execute on function admin_void(uuid) to anon, authenticated;
grant execute on function admin_extend(uuid, integer) to anon, authenticated;
grant execute on function mark_envelope_sent(uuid) to anon, authenticated;
grant execute on function get_envelope_meta(text) to anon, authenticated;
grant execute on function unlock_envelope(text, text) to anon, authenticated;
grant execute on function sign_envelope(text, text, jsonb) to anon, authenticated;
grant execute on function decline_envelope(text, text, text) to anon, authenticated;
