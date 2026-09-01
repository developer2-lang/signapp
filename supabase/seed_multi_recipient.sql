-- =============================================================================
-- IUOVA SIGN — Optional demo: multi-recipient "Appointment Letter" envelope
-- -----------------------------------------------------------------------------
-- Run this in the Supabase SQL Editor AFTER applying migration 0008.
-- It creates ONE envelope with 3 recipients (Client -> Manager -> HR) in
-- sequential mode so you can test the ordering workflow. The first recipient is
-- ACTIVE (waiting to sign), the other two are PENDING.
--
-- It uses external recipients (person_id = NULL) so it does not depend on any
-- existing People records, and looks up the "Appointment Letter" template by
-- name. Each run creates a NEW draft envelope.
--
-- To drive the workflow end-to-end, open this envelope in the Envelopes tab and
-- click "Send for signature" (which emails only Recipient 1).
-- =============================================================================

do $$
declare
  v_tpl_id  uuid;
  v_env_id  uuid;
  v_token   text;
  v_code    text;
  rec       record;
begin
  select id into v_tpl_id
    from templates
    where lower(name) like '%appointment%'
    limit 1;

  if v_tpl_id is null then
    raise notice 'No "Appointment Letter" template found — demo envelope skipped.';
    return;
  end if;

  -- Create the envelope as a draft awaiting Recipient 1.
  insert into envelopes (
    template_id, subject, status, title, template_name,
    signing_mode, created_at, updated_at
  ) values (
    v_tpl_id,
    'Appointment Letter',
    'draft',
    'Appointment Letter — Roshni',
    'Appointment Letter',
    'sequential',
    now(), now()
  ) returning id into v_env_id;

  -- Recipients: signer (1) -> countersigner (2) -> signer (3)
  for rec in
    select * from (values
      ('Roshni'::text,        'roshni@example.com'::text,  'signer'::text,        1::int),
      ('Manager Name',        'manager@example.com',        'countersigner',       2),
      ('HR Name',             'hr@example.com',             'signer',              3)
    ) as t(name, email, role, ord)
    order by t.ord
  loop
    v_token := replace(gen_random_uuid()::text, '-', '');
    v_code  := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));

    insert into envelope_signers (
      envelope_id, person_id, signer_name, signer_email, status,
      signing_token, access_code, role, order_idx, signing_order, created_at, updated_at
    ) values (
      v_env_id, NULL, rec.name, rec.email,
      case when rec.ord = 1 then 'active' else 'pending' end,
      v_token, v_code, rec.role, rec.ord, rec.ord, now(), now()
    );

    if rec.ord = 1 then
      update envelopes
        set recipient_id = NULL,
            signer_id    = NULL,
            signer_name  = rec.name,
            signer_email = rec.email,
            signing_token = v_token,
            access_code   = v_code
        where id = v_env_id;
    end if;
  end loop;

  raise notice 'Created demo envelope % with 3 recipients (sequential).', v_env_id;
end;
$$;
