-- Worksheets table, bucket, and RLS policies
-- Run in Supabase SQL editor

-- 1) Table
create table if not exists public.worksheets (
  id bigserial primary key,
  title text not null,
  description text,
  file_path text not null,
  is_protected boolean not null default false,
  is_answer_key boolean not null default false,
  grade_level text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists worksheets_file_path_idx
  on public.worksheets (file_path);

-- 2) Bucket (private by default; use signed URLs for protected files)
insert into storage.buckets (id, name, public)
values ('worksheets', 'worksheets', false)
on conflict (id) do nothing;

-- 3) Helper function to determine protected access
create or replace function public.has_worksheet_access()
returns boolean
language sql
stable
as $$
  select
    auth.uid() is not null
    and (
      coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'parent', 'subscriber')
      or coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') in ('admin', 'parent', 'subscriber')
      or coalesce((auth.jwt() -> 'app_metadata' ->> 'is_subscriber'), 'false') = 'true'
      or coalesce((auth.jwt() -> 'user_metadata' ->> 'is_subscriber'), 'false') = 'true'
      or coalesce((auth.jwt() -> 'user_metadata' ->> 'subscription'), '') = 'active'
    );
$$;

-- 4) RLS for worksheets table
alter table public.worksheets enable row level security;

drop policy if exists "public_read_worksheets" on public.worksheets;
create policy "public_read_worksheets"
on public.worksheets
for select
using (is_protected = false and is_answer_key = false);

drop policy if exists "protected_read_worksheets" on public.worksheets;
create policy "protected_read_worksheets"
on public.worksheets
for select
using (public.has_worksheet_access());

-- 5) RLS for storage objects (bucket: worksheets)
alter table storage.objects enable row level security;

drop policy if exists "public_read_worksheet_files" on storage.objects;
create policy "public_read_worksheet_files"
on storage.objects
for select
using (
  bucket_id = 'worksheets'
  and exists (
    select 1
    from public.worksheets w
    where w.file_path = storage.objects.name
      and w.is_protected = false
      and w.is_answer_key = false
  )
);

drop policy if exists "protected_read_worksheet_files" on storage.objects;
create policy "protected_read_worksheet_files"
on storage.objects
for select
using (
  bucket_id = 'worksheets'
  and public.has_worksheet_access()
);
