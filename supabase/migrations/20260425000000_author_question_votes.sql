-- Author questions and per-user votes.

create table if not exists public.author_questions (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  question_text text not null,
  option_1_text text not null,
  option_2_text text not null,
  option_3_text text not null,
  chapter_id bigint not null
);

create index if not exists author_questions_chapter_id_created_at_idx
  on public.author_questions (chapter_id, created_at desc);

create table if not exists public.author_question_votes (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  question_id bigint not null references public.author_questions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  chosen_option smallint not null check (chosen_option between 1 and 3)
);

create unique index if not exists author_question_votes_question_user_uidx
  on public.author_question_votes (question_id, user_id);

create index if not exists author_question_votes_question_option_idx
  on public.author_question_votes (question_id, chosen_option);

alter table public.author_questions enable row level security;
alter table public.author_question_votes enable row level security;

drop policy if exists "author_questions_read_all" on public.author_questions;
create policy "author_questions_read_all"
  on public.author_questions
  for select
  using (true);

drop policy if exists "author_question_votes_read_all" on public.author_question_votes;
create policy "author_question_votes_read_all"
  on public.author_question_votes
  for select
  using (true);

drop policy if exists "author_question_votes_insert_own" on public.author_question_votes;
create policy "author_question_votes_insert_own"
  on public.author_question_votes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- The current app prevents vote changes. If that behavior changes later,
-- add an update policy constrained to auth.uid() = user_id.
