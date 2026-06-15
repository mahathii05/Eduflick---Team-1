-- ============================================================
-- EduFlick AI — LMS Automation Engine
-- Member 1 schema — Auth & Onboarding
--
-- Owns: profiles, tracks, mentors, modules, lessons, lesson_progress
-- Run this in the Supabase SQL Editor on a fresh project.
-- Requires the pgcrypto extension for gen_random_uuid() (enabled
-- by default on Supabase).
-- ============================================================

-- ------------------------------------------------------------
-- 1. tracks
--    The catalogue of learning tracks shown on the track
--    selection screen. Shared with Members 2 & 3.
-- ------------------------------------------------------------
create table if not exists tracks (
  id          bigint generated always as identity primary key,
  name        text not null,
  type        text not null check (type in ('course', 'bootcamp')),
  description text
);

-- ------------------------------------------------------------
-- 2. mentors
--    Lightweight mentor directory used on the mentor selection
--    screen. Kept separate from auth so mentors can be seeded
--    without creating login accounts.
-- ------------------------------------------------------------
create table if not exists mentors (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  specialty text,
  bio       text
);

-- ------------------------------------------------------------
-- 3. profiles
--    One row per learner. id mirrors auth.users.id (see the
--    handle_new_user trigger in 03_automation_triggers.sql).
--    This is the "users" table from the shared contract,
--    minus the password column (handled by Supabase Auth).
-- ------------------------------------------------------------
create table if not exists profiles (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  email               text not null unique,
  role                text not null default 'student'
                        check (role in ('student', 'mentor')),
  track_id            bigint references tracks(id),
  mentor_id           uuid references mentors(id),
  onboarding_complete boolean not null default false,
  created_at          timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 4. modules
--    Curriculum structure per track. Shared with Member 2
--    (assessments hang off these too).
-- ------------------------------------------------------------
create table if not exists modules (
  id       bigint generated always as identity primary key,
  track_id bigint not null references tracks(id) on delete cascade,
  title    text not null,
  "order"  int not null,
  unique (track_id, "order")
);

-- ------------------------------------------------------------
-- 5. lessons
--    Curriculum content per module. This table is the global
--    template — it does NOT carry per-student state.
-- ------------------------------------------------------------
create table if not exists lessons (
  id        bigint generated always as identity primary key,
  module_id bigint not null references modules(id) on delete cascade,
  title     text not null,
  "order"   int not null,
  unique (module_id, "order")
);

-- ------------------------------------------------------------
-- 6. lesson_progress
--    Per-student lesson state. This is what Member 1's
--    automation reads/writes for requirements #2 and #3.
--    Member 2's progress-tracking system (req #4) aggregates
--    over this table.
-- ------------------------------------------------------------
create table if not exists lesson_progress (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references profiles(id) on delete cascade,
  lesson_id    bigint not null references lessons(id) on delete cascade,
  is_unlocked  boolean not null default false,
  is_completed boolean not null default false,
  completed_at timestamptz,
  unique (user_id, lesson_id)
);
-- Add role column to profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'student'
  CHECK (role IN ('student', 'mentor'));
