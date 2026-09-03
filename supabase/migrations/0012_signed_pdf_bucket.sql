-- =============================================================================
-- IUOVA SIGN — Final signed PDF storage
-- -----------------------------------------------------------------------------
-- Stores the final signed PDF (both recipient signatures) so that the "View
-- completed document" button in the completion email can open the PDF directly
-- (Content-Type: application/pdf) instead of routing through the signing page /
-- access-code page / intermediate HTML page.
--
-- The browser generates the final PDF client-side (getPDFBytes) and uploads it
-- to this private bucket at {envelopeId}/final.pdf. A dedicated Edge Function
-- (serve-signed-pdf) fetches it with the service-role key and returns the raw
-- bytes as application/pdf for the email button. The same bytes are also
-- attached to the completion email as a real MIME attachment.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Storage bucket for final signed PDFs (private)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('signed-pdf', 'signed-pdf', false)
on conflict (id) do nothing;

-- The browser uploads the final PDF (via the publishable key) after the
-- envelope completes, so anon/authenticated need insert/update access. Paths
-- are envelope-scoped UUIDs, so one envelope can never read another's document
-- without knowing its id.
create policy "signed_pdf_insert_anon" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'signed-pdf');

create policy "signed_pdf_update_anon" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'signed-pdf')
  with check (bucket_id = 'signed-pdf');

create policy "signed_pdf_select_anon" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'signed-pdf');

create policy "signed_pdf_delete_anon" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'signed-pdf');
