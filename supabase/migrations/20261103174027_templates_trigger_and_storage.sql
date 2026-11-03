-- Hand-written (made with `npm run db:custom`): what Drizzle doesn't model for the templates table.

create trigger templates_touch before update on public.templates
  for each row execute function public.touch_updated_at();

-- Template covers: public read (the gallery shows them to anyone), only admins write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('templates', 'templates', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "admins add template covers" on storage.objects for insert to authenticated
  with check (bucket_id = 'templates' and (select public.is_admin()));
create policy "admins change template covers" on storage.objects for update to authenticated
  using (bucket_id = 'templates' and (select public.is_admin()))
  with check (bucket_id = 'templates' and (select public.is_admin()));
create policy "admins delete template covers" on storage.objects for delete to authenticated
  using (bucket_id = 'templates' and (select public.is_admin()));
