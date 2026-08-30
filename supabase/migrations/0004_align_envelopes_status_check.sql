-- =============================================================================
-- IUOVA SIGN — Align envelopes.status check constraint with the app lifecycle
-- -----------------------------------------------------------------------------
-- The application (RPCs in 0001/0002/0003 + the frontend EnvelopeStatus type in
-- src/types/envelope.ts) uses these envelope statuses:
--
--     draft   -> created via create_envelope (0001/0002/0003)
--     sent    -> set by mark_envelope_sent after the email is dispatched
--     viewed  -> set by unlock_envelope when the recipient opens the document
--     signed  -> set by sign_envelope when at least one signer still remains
--     completed -> set by sign_envelope when every signer has signed
--     declined -> set by admin_void / decline_envelope
--
-- The pre-existing envelopes_status_check constraint (defined on the base
-- `envelopes` table, NOT in this repo's earlier migrations) did not allow
-- 'viewed'. Because unlock_envelope writes 'viewed' the moment a recipient
-- enters their access code, the very first "Open document" click failed with:
--
--   new row for relation "envelopes" violates check constraint
--   "envelopes_status_check"
--
-- Fix: replace the outdated constraint with one that permits the full, intended
-- lifecycle. The new constraint is a SUPERSET of the old one, so every existing
-- row still validates — no rows are modified, deleted, or recreated, and the
-- table itself is never dropped.
--
-- 'failed' and 'voided' are tolerated as well so older/edge data keeps
-- validating and future-proofing the lifecycle does not require another
-- migration.
-- =============================================================================

-- 1. Remove the outdated constraint (named in the error above).
alter table envelopes
  drop constraint if exists envelopes_status_check;

-- 2. Recreate it allowing every status the application reads or writes.
alter table envelopes
  add constraint envelopes_status_check
  check (
    status in (
      'draft',
      'sent',
      'viewed',
      'signed',
      'completed',
      'declined',
      'failed',
      'voided'
    )
  );
