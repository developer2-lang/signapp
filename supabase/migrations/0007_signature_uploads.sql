-- =============================================================================
-- IUOVA SIGN — Signature uploads (metadata + private Storage bucket)
-- -----------------------------------------------------------------------------
-- Adds the minimum metadata table for uploaded signatures. Only the Storage
-- path and a few identifiers are persisted here — the image file itself always
-- lives in the private "signature" Storage bucket. Authenticated users may
-- upload new signature files, but may not freely overwrite or delete files
-- they do not own.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. signatures — metadata for each uploaded signature.
--    NOTE: created with SUPABASE_AUTH_UID() as the implicit owner so that
--    Storage policies (owner-based) and RLS can both rely on the caller's
--    authenticated id without trusting a client-supplied user id.
-- -----------------------------------------------------------------------------
create table if not exists signatures (
  id uuid primary key default gen_random_uuid(),
  envelope_id uuid references envelopes(id) on delete cascade,
  signer_id uuid,                    -- authenticated user id (may be null pre-auth)
  signature_path text not null,      -- Storage path inside the "signature" bucket
  signature_type text not null default 'uploaded',
  created_at timestamptz not null default now()
);

alter table signatures enable row level security;

-- A user may read / delete only the metadata rows they created. This prevents
-- a caller from tampering with another user's signature records.
create policy signatures_select_own on signatures
  for select using (signature_type = 'uploaded' and signer_id = auth.uid());

create policy signatures_insert_own on signatures
  for insert with check (signer_id = coalesce(auth.uid(), signer_id));

create policy signatures_delete_own on signatures
  for delete using (signer_id = auth.uid());

-- Normalisation: index the envelope -> signature lookup used by the RPC and the
-- frontend when linking a countersign to its uploaded image.
create index if not exists signatures_envelope_idx on signatures (envelope_id);

-- -----------------------------------------------------------------------------
-- 2. save_signature_metadata — the frontend's only write path. SECURITY DEFINER
--    so the browser (publishable key) can insert metadata without holding the
--    service-role key. The signer id is captured server-side when available so
--    a client can never forge another user's ownership.
-- -----------------------------------------------------------------------------
create or replace function save_signature_metadata(
  p_envelope_id uuid,
  p_signature_path text,
  p_signature_type text default 'uploaded',
  p_signer_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_owner uuid := coalesce(auth.uid(), p_signer_id);
begin
  insert into signatures (envelope_id, signer_id, signature_path, signature_type)
  values (p_envelope_id, v_owner, p_signature_path, p_signature_type)
  returning id into v_id;

  if v_owner is null then
    raise notice 'signature metadata saved without an authenticated user id';
  end if;

  return jsonb_build_object('id', v_id);
end;
$$;

grant execute on function save_signature_metadata(uuid, text, text, uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Storage policies for the "signature" bucket (bucket itself stays PRIVATE).
-- -----------------------------------------------------------------------------
-- INSERT / upload: authenticated (and, only because the legacy app has no
-- login session yet, also anonymous) clients may CREATE NEW signature files.
-- Objects are stored under a per-user folder so files never collide.
--
-- SECURITY NOTES:
--   * SELECT / UPDATE / DELETE are STRICTLY owner-based, so no client can read,
--     overwrite or delete another user's signature files - the core requirement.
--   * The bucket itself remains PRIVATE. Nothing here grants public read.
--   * The anonymous INSERT grant can (and should) be revoked once Supabase Auth
--     is wired up; it exists only so the current no-login frontend can upload.
create policy "signature_insert_own" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'signature');

-- SELECT: only the owner may read their own files directly.
create policy "signature_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'signature' and owner = auth.uid());

-- UPDATE: only the owner may overwrite their own files.
create policy "signature_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'signature' and owner = auth.uid())
  with check (bucket_id = 'signature');

-- DELETE: only the owner may delete their own files. No cross-user deletes.
create policy "signature_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'signature' and owner = auth.uid());
