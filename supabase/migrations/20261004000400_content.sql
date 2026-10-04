-- Content: gallery and blog.
-- Design: docs/DATABASE-DESIGN.md §4.4, §5

create table public.gallery_items (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 120),
  caption_tag  text check (char_length(caption_tag) <= 40),
  media_type   public.media_type not null,
  storage_path text not null check (char_length(storage_path) <= 300),
  poster_path  text check (char_length(poster_path) <= 300),
  alt_text     text not null check (char_length(alt_text) between 1 and 200),
  tags         public.gallery_tag[] not null default '{}',
  width        integer check (width > 0),
  height       integer check (height > 0),
  sort_order   integer not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint gallery_video_needs_poster check (media_type = 'image' or poster_path is not null)
);
create index gallery_items_published_sort_idx on public.gallery_items (is_published, sort_order);

create table public.blog_posts (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title        text not null check (char_length(title) between 1 and 160),
  excerpt      text not null check (char_length(excerpt) between 1 and 400),
  content_md   text not null check (char_length(content_md) between 1 and 50000),
  topic        text not null check (char_length(topic) between 1 and 40),
  cover_emoji  text check (char_length(cover_emoji) <= 8),
  cover_theme  public.card_theme not null default 'honey',
  is_featured  boolean not null default false,
  status       public.post_status not null default 'draft',
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint blog_published_needs_date check (status = 'draft' or published_at is not null)
);
create index blog_posts_status_published_idx on public.blog_posts (status, published_at desc);
create unique index blog_posts_single_featured_idx on public.blog_posts (is_featured) where is_featured;

create trigger gallery_items_set_updated_at before update on public.gallery_items
  for each row execute function extensions.moddatetime (updated_at);
create trigger blog_posts_set_updated_at before update on public.blog_posts
  for each row execute function extensions.moddatetime (updated_at);

alter table public.gallery_items enable row level security;
alter table public.blog_posts enable row level security;

grant select on public.gallery_items, public.blog_posts to anon, authenticated;
grant insert, update, delete on public.gallery_items, public.blog_posts to authenticated;

-- gallery_items -----------------------------------------------------------------------
create policy "gallery: public read published" on public.gallery_items
  for select to anon, authenticated using (is_published);
create policy "gallery: admin read all" on public.gallery_items
  for select to authenticated using ((select private.is_admin()));
create policy "gallery: admin insert" on public.gallery_items
  for insert to authenticated with check ((select private.is_admin()));
create policy "gallery: admin update" on public.gallery_items
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "gallery: admin delete" on public.gallery_items
  for delete to authenticated using ((select private.is_admin()));

-- blog_posts --------------------------------------------------------------------------
create policy "blog: public read published" on public.blog_posts
  for select to anon, authenticated using (status = 'published' and published_at <= now());
create policy "blog: admin read all" on public.blog_posts
  for select to authenticated using ((select private.is_admin()));
create policy "blog: admin insert" on public.blog_posts
  for insert to authenticated with check ((select private.is_admin()));
create policy "blog: admin update" on public.blog_posts
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "blog: admin delete" on public.blog_posts
  for delete to authenticated using ((select private.is_admin()));
