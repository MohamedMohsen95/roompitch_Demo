-- Hand-written (made with `npm run db:custom`).

-- Users can't make themselves admins: through the API (signed-in users and anonymous sessions) a new
-- profile is always a designer and role can't change. The secret key (`npm run admin`) and SQL in the
-- dashboard are not limited.
create function public.guard_profile_role() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.role := 'designer';
    elsif new.role is distinct from old.role then
      raise exception 'role can only be changed by an admin of the project' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_guard_role before insert or update on public.profiles
  for each row execute function public.guard_profile_role();

-- Admins upload shared models to the public "catalog" bucket (uploads/<item id>.glb); everyone reads it.
create policy "admins add catalog files" on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog' and (select public.is_admin()));
create policy "admins change catalog files" on storage.objects for update to authenticated
  using (bucket_id = 'catalog' and (select public.is_admin()))
  with check (bucket_id = 'catalog' and (select public.is_admin()));
create policy "admins delete catalog files" on storage.objects for delete to authenticated
  using (bucket_id = 'catalog' and (select public.is_admin()));
