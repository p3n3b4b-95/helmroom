-- Postgres 14+. Access rules: data-layer checks (every owner query filters by user_id), no RLS.
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null default '',
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_email_key on users (lower(email));

create table auth_sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on auth_sessions (user_id);

create table quizzes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  subject text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on quizzes (owner_id, updated_at desc);

create table questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  position int not null check (position >= 0),
  type text not null check (type in ('mcq','multi','poll','fill','open')),
  prompt text not null check (length(prompt) between 1 and 1000),
  image_url text,
  options jsonb not null default '[]',   -- mcq/multi/poll: ["a","b",...]
  correct jsonb not null default '[]',   -- mcq/multi: [indexes]; fill: ["accepted",...]; poll/open: []
  points int not null default 1000 check (points between 0 and 10000),
  time_limit_s int not null default 20 check (time_limit_s between 5 and 300),
  created_at timestamptz not null default now(),
  unique (quiz_id, position) deferrable initially deferred
);

create table game_sessions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid references quizzes(id) on delete set null,
  host_id uuid not null references users(id) on delete cascade,
  code text not null,
  title text not null,
  snapshot jsonb not null,                -- questions frozen at start, so edits never corrupt a run
  kind text not null check (kind in ('live','homework')),
  pacing text not null check (pacing in ('teacher','student')),
  mode text not null default 'classic' check (mode in ('classic','test','team','mastery')),
  deadline timestamptz,                   -- homework only
  attempts_allowed int not null default 1 check (attempts_allowed between 1 and 10),
  status text not null default 'lobby' check (status in ('lobby','running','ended')),
  current_index int not null default -1,  -- teacher-paced: question on screen
  question_started_at timestamptz,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check (kind <> 'homework' or deadline is not null)
);
-- a join code is unique among sessions still open
create unique index game_sessions_open_code on game_sessions (code) where status <> 'ended';
create index on game_sessions (host_id, created_at desc);

create table participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references game_sessions(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 40),
  token_hash text not null,
  team text,
  attempt int not null default 1,
  score int not null default 0,
  finished boolean not null default false,
  current_index int not null default 0,   -- student-paced: next question for this participant
  question_started_at timestamptz,        -- student-paced: when that question was first shown
  joined_at timestamptz not null default now()
);
create unique index participants_name_key on participants (session_id, lower(display_name));
create index on participants (token_hash);

create table responses (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  q_index int not null check (q_index >= 0),
  attempt int not null default 1,
  answer jsonb not null,
  correct boolean,                        -- null for poll/open (not scored)
  time_ms int not null check (time_ms >= 0),
  points int not null default 0,
  created_at timestamptz not null default now(),
  -- double submit cannot score twice
  unique (participant_id, q_index, attempt)
);

-- Supabase exposes the public schema over its REST API. Deny it all: RLS on, no policies.
-- The app connects as the database owner through DATABASE_URL, which bypasses RLS.
alter table users enable row level security;
alter table auth_sessions enable row level security;
alter table quizzes enable row level security;
alter table questions enable row level security;
alter table game_sessions enable row level security;
alter table participants enable row level security;
alter table responses enable row level security;
