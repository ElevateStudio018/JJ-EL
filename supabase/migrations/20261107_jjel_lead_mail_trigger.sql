-- Mail every new quote request through the jjel-lead-mail edge function.
-- The shared secret lives in Vault (name: jjel_hook_secret) and as the function secret JJEL_HOOK_SECRET;
-- its value is not stored in git. Function secrets: GMAIL_USER, GMAIL_APP_PASSWORD, LEAD_TO.
create extension if not exists pg_net;
-- select vault.create_secret('<random secret>', 'jjel_hook_secret', 'Shared secret for the jjel-lead-mail edge function');
create or replace function private.jjel_lead_mail() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://eeasibbhydlpoaomjwsn.supabase.co/functions/v1/jjel-lead-mail',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'jjel_hook_secret')),
    body := jsonb_build_object('record', to_jsonb(new))
  );
  return new;
end $$;
create trigger jjel_lead_mail after insert on public.jjel_leads for each row execute function private.jjel_lead_mail();
