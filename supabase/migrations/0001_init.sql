-- Personal AI DAW - initial schema
--
-- NOT APPLIED to any Supabase project. This file is prepared so a project
-- can be provisioned and migrated when the user decides where it should
-- live. See ARCHITECTURE.md section "Supabase" for context.
--
-- Design: only metadata lives in Postgres (projects, tracks, clip
-- references, presets, AI chain configs). Raw audio bytes go in Supabase
-- Storage (bucket "audio-samples"), never as bytea columns.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled Project',
  bpm numeric not null default 140,
  time_signature_num int not null default 4,
  time_signature_den int not null default 4,
  loop_enabled boolean not null default false,
  loop_start numeric not null default 0,
  loop_end numeric not null default 8,
  metronome_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  track_order int not null default 0,
  color text not null default '#38bdf8',
  volume_db numeric not null default 0,
  pan numeric not null default 0,
  muted boolean not null default false,
  solo boolean not null default false,
  created_at timestamptz not null default now()
);

-- One row per imported/recorded audio source. The file itself lives in
-- Supabase Storage at storage_path; this row just carries decode metadata.
create table if not exists public.samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  storage_path text not null,
  duration_sec numeric not null,
  sample_rate int not null,
  channels int not null,
  created_at timestamptz not null default now()
);

create table if not exists public.clips (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks(id) on delete cascade,
  sample_id uuid not null references public.samples(id) on delete restrict,
  name text not null,
  start_time numeric not null,
  duration numeric not null,
  source_offset numeric not null default 0,
  gain_db numeric not null default 0,
  fade_in_sec numeric not null default 0,
  fade_out_sec numeric not null default 0,
  color text not null default '#38bdf8'
);

-- Vocal chain / effect chain presets (Phase 3+). Params are freeform JSON
-- because the effect parameter set will grow a lot before it stabilizes.
create table if not exists public.presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  category text not null, -- e.g. 'vocal_character', 'genre_chain', 'mix_bus'
  is_system boolean not null default false,
  chain jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.projects enable row level security;
alter table public.tracks enable row level security;
alter table public.samples enable row level security;
alter table public.clips enable row level security;
alter table public.presets enable row level security;

create policy "own projects" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own samples" on public.samples
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "tracks via own project" on public.tracks
  for all using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "clips via own track" on public.clips
  for all using (exists (
    select 1 from public.tracks t join public.projects p on p.id = t.project_id
    where t.id = track_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.tracks t join public.projects p on p.id = t.project_id
    where t.id = track_id and p.user_id = auth.uid()
  ));

create policy "own or system presets" on public.presets
  for select using (is_system or auth.uid() = user_id);
create policy "manage own presets" on public.presets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id and is_system = false);
