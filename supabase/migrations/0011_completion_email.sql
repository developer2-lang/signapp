-- =============================================================================
-- IUOVA SIGN — Final completion email
-- -----------------------------------------------------------------------------
-- Adds a flag that guarantees the completion email is dispatched exactly once
-- per envelope, even if the signing request is retried or the page is
-- refreshed, by atomically claiming the right to send.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Add the completion-email claim flag to envelopes.
-- -----------------------------------------------------------------------------
alter table envelopes
  add column if not exists completion_email_sent boolean not null default false;

-- -----------------------------------------------------------------------------
-- 2. claim_completion_email — atomically flip the flag from false to true and
--    return true only for the caller that won the claim (the first dispatch).
--    Concurrent or repeated attempts get false and skip sending.
-- -----------------------------------------------------------------------------
create or replace function claim_completion_email(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v boolean;
begin
  update envelopes
    set completion_email_sent = true,
        updated_at = now()
    where id = p_id
      and completion_email_sent = false
  returning completion_email_sent into v;

  -- found = a row was updated (was false -> flipped true): this caller wins.
  return found;
end;
$$;

grant execute on function claim_completion_email(uuid) to anon, authenticated;
