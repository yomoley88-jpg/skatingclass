create schema if not exists app_private;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

create or replace function app_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false)
    or exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
    );
$$;

grant usage on schema app_private to authenticated;
grant execute on function app_private.is_admin() to authenticated;

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  current_lesson_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  class_date date not null,
  proof_photo_urls jsonb not null default '[]'::jsonb,
  proof_notes text,
  marked_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  present boolean not null default false,
  lesson_count_before integer not null,
  lesson_count_after integer not null,
  student_proof_photo_url text,
  proof_notes text,
  check_in_time timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (session_id, student_id)
);

create index if not exists attendance_sessions_class_date_idx
  on public.attendance_sessions (class_date desc, created_at desc);

create index if not exists attendance_records_student_id_idx
  on public.attendance_records (student_id, created_at desc);

create index if not exists attendance_records_session_id_idx
  on public.attendance_records (session_id);

insert into storage.buckets (id, name, public)
values ('attendance-proof', 'attendance-proof', false)
on conflict (id) do update set public = false;

alter table public.students enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;

drop policy if exists "Admins can view admin users" on public.admin_users;
create policy "Admins can view admin users"
on public.admin_users
for select
to authenticated
using (app_private.is_admin());

drop policy if exists "Admins can manage students" on public.students;
create policy "Admins can manage students"
on public.students
for all
to authenticated
using (app_private.is_admin())
with check (app_private.is_admin());

drop policy if exists "Admins can manage attendance sessions" on public.attendance_sessions;
create policy "Admins can manage attendance sessions"
on public.attendance_sessions
for all
to authenticated
using (app_private.is_admin())
with check (app_private.is_admin());

drop policy if exists "Admins can manage attendance records" on public.attendance_records;
create policy "Admins can manage attendance records"
on public.attendance_records
for all
to authenticated
using (app_private.is_admin())
with check (app_private.is_admin());

drop policy if exists "Admins can read attendance proof" on storage.objects;
create policy "Admins can read attendance proof"
on storage.objects
for select
to authenticated
using (bucket_id = 'attendance-proof' and app_private.is_admin());

drop policy if exists "Admins can upload attendance proof" on storage.objects;
create policy "Admins can upload attendance proof"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'attendance-proof' and app_private.is_admin());

drop policy if exists "Admins can update attendance proof" on storage.objects;
create policy "Admins can update attendance proof"
on storage.objects
for update
to authenticated
using (bucket_id = 'attendance-proof' and app_private.is_admin())
with check (bucket_id = 'attendance-proof' and app_private.is_admin());

drop policy if exists "Admins can delete attendance proof" on storage.objects;
create policy "Admins can delete attendance proof"
on storage.objects
for delete
to authenticated
using (bucket_id = 'attendance-proof' and app_private.is_admin());
