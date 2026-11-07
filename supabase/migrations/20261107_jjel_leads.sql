-- Quote requests from the jjel.se form (applied to project eeasibbhydlpoaomjwsn on 2026-11-07).
create table public.jjel_leads (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 120),
  phone text check (char_length(phone) <= 40),
  email text not null check (char_length(email) between 3 and 160 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  city text check (char_length(city) <= 80),
  service text check (char_length(service) <= 80),
  message text not null check (char_length(message) between 1 and 4000),
  page text check (char_length(page) <= 80),
  handled boolean not null default false
);
alter table public.jjel_leads enable row level security;
create policy "jjel leads: anyone can send" on public.jjel_leads for insert to anon, authenticated with check (handled = false);
create policy "jjel leads: admins read" on public.jjel_leads for select to authenticated using (public.jjel_is_admin());
create policy "jjel leads: admins update" on public.jjel_leads for update to authenticated using (public.jjel_is_admin()) with check (public.jjel_is_admin());
create policy "jjel leads: admins delete" on public.jjel_leads for delete to authenticated using (public.jjel_is_admin());
revoke all on public.jjel_leads from anon, authenticated;
grant insert (name, phone, email, city, service, message, page) on public.jjel_leads to anon, authenticated;
grant select, update (handled), delete on public.jjel_leads to authenticated;

-- At most 20 requests per 10 minutes, against spam floods.
create or replace function private.jjel_leads_throttle() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.jjel_leads where created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'För många förfrågningar just nu. Försök igen om en stund.';
  end if;
  return new;
end $$;
create trigger jjel_leads_throttle before insert on public.jjel_leads for each row execute function private.jjel_leads_throttle();
create index jjel_leads_created_at on public.jjel_leads (created_at desc);
