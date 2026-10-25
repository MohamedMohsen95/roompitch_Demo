-- Drizzle does not model triggers, so this one is hand-written (made with `npm run db:custom`).
-- Keep updated_at current on every change.
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
