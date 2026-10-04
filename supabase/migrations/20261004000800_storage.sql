-- Storage: a single public bucket for admin-managed media (product photos, gallery
-- images/videos, posters, blog images). Files are publicly readable by URL; only admins
-- can upload, replace, delete or list objects.
-- Design: docs/DATABASE-DESIGN.md §7

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  20971520, -- 20 MiB (compressed gallery videos); images are further limited to 5 MB by the app
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm']
);

create policy "media: admin read" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and (select private.is_admin()));

create policy "media: admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (select private.is_admin()));

create policy "media: admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (select private.is_admin()))
  with check (bucket_id = 'media' and (select private.is_admin()));

create policy "media: admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (select private.is_admin()));
