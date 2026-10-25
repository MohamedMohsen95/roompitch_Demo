-- Hand-written (made with `npm run db:custom`): what Drizzle doesn't model.

-- updated_at stays current on every change (touch_updated_at comes from *_touch_updated_at.sql).
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger prices_touch before update on public.prices
  for each row execute function public.touch_updated_at();
create trigger clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();
create trigger catalogs_touch before update on public.catalogs
  for each row execute function public.touch_updated_at();
create trigger catalog_items_touch before update on public.catalog_items
  for each row execute function public.touch_updated_at();

-- Every new user (anonymous ones too) gets a profile row; users who signed up before this get one now.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, email) select id, email from auth.users on conflict (id) do nothing;

-- Storage. "files": private, one folder per user (<user id>/...). "catalog": public read, so three.js
-- loads built-in models straight from the CDN; only the secret key (npm run catalog:sync) writes to it.
-- 50 MB is the largest file the Supabase free plan accepts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('files', 'files', false, 52428800,
    array['image/png', 'image/jpeg', 'image/webp', 'application/pdf',
          'model/gltf-binary', 'model/gltf+json', 'application/octet-stream']),
  ('catalog', 'catalog', true, 52428800,
    array['image/png', 'image/jpeg', 'image/webp', 'model/gltf-binary', 'model/gltf+json', 'application/octet-stream'])
on conflict (id) do nothing;

create policy "read own files" on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "add own files" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "change own files" on storage.objects for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete own files" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
