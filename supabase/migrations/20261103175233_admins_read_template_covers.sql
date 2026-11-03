-- Hand-written (made with `npm run db:custom`).
-- Storage only overwrites (upsert) or deletes files the user can also select through the API. Visitors see
-- covers through public URLs, which skip RLS; admins need this to save, replace and remove them.
create policy "admins read template covers" on storage.objects for select to authenticated
  using (bucket_id = 'templates' and (select public.is_admin()));
