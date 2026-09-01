-- =============================================================================
-- IUOVA SIGN — Email attachments for envelopes
-- -----------------------------------------------------------------------------
-- Adds the ability to attach files to an envelope. Attachments are stored in a
-- private Supabase Storage bucket and their metadata is recorded in a new
-- envelope_attachments table. The send-envelope-email Edge Function reads these
-- records, downloads the files from Storage, and includes them as real MIME
-- email attachments.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Storage bucket for envelope attachments (private)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- Allow anonymous + authenticated uploads (the app has no Supabase Auth yet).
-- The Edge Function uses the service-role key to read files for email dispatch.
create policy "attachments_insert_anon" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'attachments');

create policy "attachments_select_anon" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'attachments');

-- Allow anon/authenticated to remove attachment objects (the app has no
-- Supabase Auth yet). Paths are envelope-scoped UUIDs so cross-envelope access
-- is not possible without knowing another envelope's id/storage_path.
create policy "attachments_delete_anon" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'attachments');

-- -----------------------------------------------------------------------------
-- 2. envelope_attachments — metadata for each uploaded attachment
-- -----------------------------------------------------------------------------
create table if not exists envelope_attachments (
  id          uuid primary key default gen_random_uuid(),
  envelope_id uuid not null references envelopes(id) on delete cascade,
  file_name   text not null,
  storage_path text not null,
  mime_type   text not null default 'application/octet-stream',
  file_size   bigint not null default 0,
  created_at  timestamptz not null default now()
);

alter table envelope_attachments enable row level security;

create index if not exists envelope_attachments_env_idx
  on envelope_attachments (envelope_id);

-- RLS: allow anon/authenticated to read/write (no Supabase Auth yet).
create policy envelope_attachments_select on envelope_attachments
  for select to anon, authenticated using (true);

create policy envelope_attachments_insert on envelope_attachments
  for insert to anon, authenticated with check (true);

create policy envelope_attachments_delete on envelope_attachments
  for delete to anon, authenticated using (true);

-- -----------------------------------------------------------------------------
-- 3. save_attachment_metadata — RPC to insert attachment metadata
--    SECURITY DEFINER so the browser (publishable key) can insert without the
--    service-role key.
-- -----------------------------------------------------------------------------
create or replace function save_attachment_metadata(
  p_envelope_id  uuid,
  p_file_name    text,
  p_storage_path text,
  p_mime_type    text,
  p_file_size    bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into envelope_attachments (envelope_id, file_name, storage_path, mime_type, file_size)
  values (p_envelope_id, p_file_name, p_storage_path, p_mime_type, p_file_size)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function save_attachment_metadata(uuid, text, text, text, bigint) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Update admin_delete_envelope to also clean up attachment metadata before
--    deleting the envelope row. (Storage objects are removed by the frontend
--    deleteEnvelope service, which holds the paths via envelope_to_json.)
-- -----------------------------------------------------------------------------
create or replace function admin_delete_envelope(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_env envelopes;
begin
  select * into v_env from envelopes where id = p_id;
  if not found then
    raise exception 'not_found';
  end if;

  -- Delete attachment metadata rows.
  delete from envelope_attachments where envelope_id = p_id;

  -- Delete signer records.
  delete from envelope_signers where envelope_id = p_id;

  -- Delete the envelope.
  delete from envelopes where id = p_id;

  return jsonb_build_object(
    'ok', true,
    'id', p_id,
    'title', v_env.title,
    'deleted_at', now()
  );
end;
$$;

grant execute on function admin_delete_envelope(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Update envelope_to_json to include attachment count and file names
--    so the admin UI can display attachment summaries.
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
    'attachments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id,
        'file_name', a.file_name,
        'storage_path', a.storage_path,
        'mime_type', a.mime_type,
        'file_size', a.file_size,
        'created_at', a.created_at
      ) order by a.created_at), '[]'::jsonb)
      from envelope_attachments a
      where a.envelope_id = e.id
    ),
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
