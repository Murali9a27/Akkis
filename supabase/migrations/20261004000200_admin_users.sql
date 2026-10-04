-- Admin membership and authorization helpers.
-- Design: docs/DATABASE-DESIGN.md §4.2, docs/SUPABASE-ARCHITECTURE.md §D

create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       public.app_role not null default 'admin',
  created_at timestamptz not null default now()
);

comment on table public.admin_users is
  'Users allowed into /admin. Rows are managed with supabase/snippets/grant-admin.sql, never via the API.';

alter table public.admin_users enable row level security;

-- True when the current request's user holds the given application role.
create function private.has_role(required public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users au
    where au.user_id = (select auth.uid())
      and au.role = required
  );
$$;

-- Today every admin capability maps to the single 'admin' role. Policies call this
-- wrapper so adding roles later means editing one function, not every policy.
create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('admin');
$$;

revoke all on function private.has_role(public.app_role) from public, anon, authenticated;
revoke all on function private.is_admin() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.has_role(public.app_role) to authenticated;
grant execute on function private.is_admin() to authenticated;

grant select on public.admin_users to authenticated;

create policy "admin_users: read own row"
  on public.admin_users for select
  to authenticated
  using (user_id = (select auth.uid()));
