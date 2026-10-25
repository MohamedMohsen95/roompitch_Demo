-- Hand-written (made with `npm run db:custom`).
-- Storage only deletes or overwrites files the user can also select through the API. Visitors read the
-- public "catalog" bucket through public URLs, which skip RLS; admins also need this to remove or replace files.
create policy "admins read catalog files" on storage.objects for select to authenticated
  using (bucket_id = 'catalog' and (select public.is_admin()));
