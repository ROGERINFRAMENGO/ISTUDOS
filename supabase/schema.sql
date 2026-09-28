create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Estudante',
  xp integer not null default 0,
  streak_days integer not null default 0,
  study_minutes integer not null default 0,
  accuracy_percent integer not null default 0,
  general_progress integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  xp integer not null default 0,
  level integer not null default 1,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  questions_answered integer not null default 0,
  questions_correct integer not null default 0,
  questions_wrong integer not null default 0,
  study_minutes integer not null default 0,
  study_seconds integer not null default 0,
  lessons_completed integer not null default 0,
  modules_completed integer not null default 0,
  reviews_completed integer not null default 0,
  overall_progress numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.study_days (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  study_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, study_date)
);

create table if not exists public.study_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null default 'Estudo',
  minutes integer not null default 0,
  duration_seconds integer not null default 0,
  lesson_id text,
  started_at timestamptz,
  session_date timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.xp_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  reference_id text,
  xp integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, event_type, reference_id)
);

create table if not exists public.question_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  subject text,
  topic text,
  difficulty text,
  selected_answer text,
  correct boolean not null default false,
  time_spent integer default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.lesson_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  primary key (user_id, lesson_id)
);

create table if not exists public.module_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id text not null,
  progress integer not null default 0,
  completed boolean not null default false,
  completed_at timestamptz,
  primary key (user_id, module_id)
);

create table if not exists public.daily_missions (
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_date date not null,
  mission_id text not null,
  progress integer not null default 0,
  target integer not null default 1,
  completed boolean not null default false,
  primary key (user_id, mission_date, mission_id)
);

create table if not exists public.achievements (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_key text not null,
  unlocked_at timestamptz not null default now(),
  unique (user_id, achievement_key)
);

create table if not exists public.simulation_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  total_questions integer not null default 0,
  correct_answers integer not null default 0,
  wrong_answers integer not null default 0,
  score integer not null default 0,
  duration_seconds integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.activity_feed (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.student_progress enable row level security;
alter table public.study_days enable row level security;
alter table public.study_sessions enable row level security;
alter table public.xp_events enable row level security;
alter table public.question_attempts enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.module_progress enable row level security;
alter table public.daily_missions enable row level security;
alter table public.achievements enable row level security;
alter table public.simulation_attempts enable row level security;
alter table public.activity_feed enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_delete_own" on public.profiles for delete using (auth.uid() = id);

create policy "student_progress_select_own" on public.student_progress for select using (auth.uid() = user_id);
create policy "student_progress_insert_own" on public.student_progress for insert with check (auth.uid() = user_id);
create policy "student_progress_update_own" on public.student_progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "student_progress_delete_own" on public.student_progress for delete using (auth.uid() = user_id);

create policy "study_days_select_own" on public.study_days for select using (auth.uid() = user_id);
create policy "study_days_insert_own" on public.study_days for insert with check (auth.uid() = user_id);
create policy "study_days_delete_own" on public.study_days for delete using (auth.uid() = user_id);

create policy "study_sessions_select_own" on public.study_sessions for select using (auth.uid() = user_id);
create policy "study_sessions_insert_own" on public.study_sessions for insert with check (auth.uid() = user_id);
create policy "study_sessions_delete_own" on public.study_sessions for delete using (auth.uid() = user_id);

create policy "xp_events_select_own" on public.xp_events for select using (auth.uid() = user_id);
create policy "xp_events_insert_own" on public.xp_events for insert with check (auth.uid() = user_id);
create policy "xp_events_delete_own" on public.xp_events for delete using (auth.uid() = user_id);

create policy "question_attempts_select_own" on public.question_attempts for select using (auth.uid() = user_id);
create policy "question_attempts_insert_own" on public.question_attempts for insert with check (auth.uid() = user_id);
create policy "question_attempts_delete_own" on public.question_attempts for delete using (auth.uid() = user_id);

create policy "lesson_progress_select_own" on public.lesson_progress for select using (auth.uid() = user_id);
create policy "lesson_progress_insert_own" on public.lesson_progress for insert with check (auth.uid() = user_id);
create policy "lesson_progress_update_own" on public.lesson_progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lesson_progress_delete_own" on public.lesson_progress for delete using (auth.uid() = user_id);

create policy "module_progress_select_own" on public.module_progress for select using (auth.uid() = user_id);
create policy "module_progress_insert_own" on public.module_progress for insert with check (auth.uid() = user_id);
create policy "module_progress_update_own" on public.module_progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "module_progress_delete_own" on public.module_progress for delete using (auth.uid() = user_id);

create policy "daily_missions_select_own" on public.daily_missions for select using (auth.uid() = user_id);
create policy "daily_missions_insert_own" on public.daily_missions for insert with check (auth.uid() = user_id);
create policy "daily_missions_update_own" on public.daily_missions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "daily_missions_delete_own" on public.daily_missions for delete using (auth.uid() = user_id);

create policy "achievements_select_own" on public.achievements for select using (auth.uid() = user_id);
create policy "achievements_insert_own" on public.achievements for insert with check (auth.uid() = user_id);
create policy "achievements_delete_own" on public.achievements for delete using (auth.uid() = user_id);

create policy "simulation_attempts_select_own" on public.simulation_attempts for select using (auth.uid() = user_id);
create policy "simulation_attempts_insert_own" on public.simulation_attempts for insert with check (auth.uid() = user_id);
create policy "simulation_attempts_delete_own" on public.simulation_attempts for delete using (auth.uid() = user_id);

create policy "activity_feed_select_own" on public.activity_feed for select using (auth.uid() = user_id);
create policy "activity_feed_insert_own" on public.activity_feed for insert with check (auth.uid() = user_id);
create policy "activity_feed_delete_own" on public.activity_feed for delete using (auth.uid() = user_id);

create index if not exists idx_study_days_user_date on public.study_days (user_id, study_date);
create index if not exists idx_student_progress_user_id on public.student_progress (user_id);
create index if not exists idx_activity_feed_user_id on public.activity_feed (user_id, created_at desc);
