-- Foundation: extensions, private helper schema, deny-by-default privileges, enums.
-- Design: docs/DATABASE-DESIGN.md §4.1

create extension if not exists moddatetime with schema extensions;

-- Helper schema for security-definer functions. It is NOT listed in the API's exposed
-- schemas, so nothing in it is callable over the Data API.
create schema if not exists private;
revoke all on schema private from public;

-- Deny by default: objects created by migrations (role postgres) are not usable by the
-- API roles until a later migration grants exactly what is needed.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema private revoke execute on functions from public, anon, authenticated;

-- Application roles. A single role today; new roles are added with
-- `alter type public.app_role add value '…'` plus policies, without restructuring.
create type public.app_role as enum ('admin');

create type public.card_theme as enum ('honey', 'green', 'lilac', 'rose', 'blue', 'brown');
create type public.product_badge as enum ('new', 'popular');
create type public.delivery_region as enum ('pune', 'maharashtra');
create type public.delivery_type as enum ('quick', 'scheduled');
create type public.delivery_slot as enum ('morning', 'afternoon', 'evening');
create type public.request_status as enum ('pending', 'confirmed', 'completed', 'cancelled');
create type public.enquiry_type as enum ('custom_cake', 'product', 'delivery', 'general', 'bulk');
create type public.enquiry_status as enum ('open', 'closed');
create type public.cake_size as enum ('bento_300g', 'half_kg', 'one_kg', 'one_and_half_kg', 'two_kg', 'custom');
create type public.media_type as enum ('image', 'video');
create type public.gallery_tag as enum ('custom', 'kids', 'celebration', 'healthy', 'store');
create type public.post_status as enum ('draft', 'published');

-- Shared "today in India" helper used by the submission functions for lead-time rules.
create function private.india_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Kolkata')::date;
$$;
