-- Hand-written (made with `npm run db:custom`): helpers the RLS policies in the next migration use.
-- plpgsql, so it can be created before profiles.role exists (the body is only checked when it runs).

-- Whether the signed-in user is an admin (profiles.role). security definer: it reads profiles
-- without going through RLS, so policies on profiles itself can call it without recursion.
create function public.is_admin() returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
end $$;

-- Whether the signed-in user has a real account (email), not an anonymous browser session.
create function public.has_account() returns boolean
language sql stable as $$
  select coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true) = false
$$;
