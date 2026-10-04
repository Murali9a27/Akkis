-- RUNBOOK (manual): grant admin access to an existing Supabase Auth user.
-- Run in the SQL editor of the intended project only (staging OR production).
-- The user must already exist (Authentication → Users → Invite / Add user).
-- Replace the email below before running. Not a migration: user ids differ per project.

insert into public.admin_users (user_id, role)
select id, 'admin'
from auth.users
where email = lower('owner@example.com')
on conflict (user_id) do nothing
returning user_id;

-- To revoke:
-- delete from public.admin_users
-- where user_id = (select id from auth.users where email = lower('owner@example.com'));
