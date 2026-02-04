-- Auto-create UserProfile rows for new auth users
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public."UserProfile" ("userId", "entitlementTier", "isAdmin")
  values (new.id, 'FREE', false)
  on conflict ("userId") do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user_profile() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.handle_new_user_profile() to supabase_auth_admin;
  end if;
end $$;

drop trigger if exists on_auth_user_profile_created on auth.users;

create trigger on_auth_user_profile_created
after insert on auth.users
for each row
execute function public.handle_new_user_profile();
