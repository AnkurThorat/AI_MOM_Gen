-- Schema for ekvity-mom, matching types/database.types.ts
-- Run in Supabase SQL editor.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row when a new auth user signs up
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.moms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  meeting_title text not null,
  meeting_date date not null,
  start_time time,
  end_time time,
  mode text,
  objective text,
  participants jsonb not null default '[]',
  raw_notes text not null,
  status text not null default 'draft',
  ai_generated boolean not null default false,
  executive_summary text[],
  client_deliverables jsonb,
  eia_deliverables jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by text not null
);

alter table public.moms enable row level security;

create policy "Users can manage their own MoMs"
  on public.moms for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Migration: constrain status to the generation lifecycle so a typo status can never
-- silently bypass the atomic claim in POST /api/ai/generate-mom.
alter table public.moms
  add constraint moms_status_check
  check (status in ('draft', 'generating', 'failed', 'final'));
