-- Helmroom with no server of its own: a static site talks to Supabase directly.
--
-- Teachers sign in with Supabase Auth. Students use anonymous sign-in, so they get an identity
-- without an account. Every table is locked (row level security on, no policies, no grants). The
-- app can only call the functions below, which run with the owner's rights, check who is asking,
-- and never hand a student a right answer early.
--
-- THIS DROPS the tables from the earlier migrations. They held no real data: nothing was deployed.
-- If you ran real games on the old schema, export them before applying.

drop table if exists responses, participants, game_sessions, questions, quizzes, auth_sessions, users cascade;

create table quizzes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
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
  options jsonb not null default '[]',
  correct jsonb not null default '[]',
  points int not null default 1000 check (points between 0 and 10000),
  time_limit_s int not null default 20 check (time_limit_s between 5 and 300),
  created_at timestamptz not null default now(),
  unique (quiz_id, position) deferrable initially deferred
);

create table game_sessions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid references quizzes(id) on delete set null,
  host_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  title text not null,
  snapshot jsonb not null,                -- questions frozen at start
  kind text not null check (kind in ('live','homework')),
  pacing text not null check (pacing in ('teacher','student')),
  mode text not null default 'classic' check (mode in ('classic','test','team','mastery')),
  deadline timestamptz,
  attempts_allowed int not null default 1 check (attempts_allowed between 1 and 10),
  status text not null default 'lobby' check (status in ('lobby','running','ended')),
  settings jsonb not null default '{}',
  current_index int not null default -1,
  question_started_at timestamptz,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check (kind <> 'homework' or deadline is not null)
);
create unique index game_sessions_open_code on game_sessions (code) where status <> 'ended';
create index on game_sessions (host_id, created_at desc);

create table participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references game_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,  -- the anonymous user
  display_name text not null check (length(display_name) between 1 and 40),
  attempt int not null default 1,
  score int not null default 0,
  finished boolean not null default false,
  current_index int not null default 0,
  question_started_at timestamptz,
  joined_at timestamptz not null default now(),
  unique (session_id, user_id)
);
create unique index participants_name_key on participants (session_id, lower(display_name));

create table responses (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  q_index int not null check (q_index >= 0),
  attempt int not null default 1,
  answer jsonb not null,
  correct boolean,
  time_ms int not null check (time_ms >= 0),
  points int not null default 0,
  created_at timestamptz not null default now(),
  unique (participant_id, q_index, attempt)
);

create table join_failures (
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
create index on join_failures (user_id, at);

alter table quizzes enable row level security;
alter table questions enable row level security;
alter table game_sessions enable row level security;
alter table participants enable row level security;
alter table responses enable row level security;
alter table join_failures enable row level security;
revoke all on quizzes, questions, game_sessions, participants, responses, join_failures from anon, authenticated;

-- ---------------------------------------------------------------- helpers (not callable from the app)

create or replace function _uid() returns uuid language plpgsql stable as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Log in first'; end if;
  return u;
end $$;

create or replace function _teacher() returns uuid language plpgsql stable as $$
declare u uuid := _uid();
begin
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Log in with a teacher account first';
  end if;
  return u;
end $$;

-- deterministic permutation of 0..n-1 from a seed: a student sees the same order on every call
create or replace function _perm(n int, seed text) returns int[] language sql immutable as $$
  select coalesce(array_agg(i order by md5(seed || ':' || i)), '{}'::int[]) from generate_series(0, n - 1) i
$$;

create or replace function _settings(stored jsonb) returns jsonb language sql immutable as $$
  select '{"timer":"on","extra_time":1,"allow_change":true,"shuffle_questions":false,"shuffle_answers":false,"show_correct":true,"show_leaderboard":true}'::jsonb
    || case when jsonb_typeof(stored) = 'object' then stored else '{}'::jsonb end
$$;

create or replace function _parse_settings(raw jsonb) returns jsonb language plpgsql immutable as $$
declare out jsonb := _settings(null); k text;
begin
  if raw is null or jsonb_typeof(raw) = 'null' then return out; end if;
  if jsonb_typeof(raw) <> 'object' then raise exception 'settings must be an object'; end if;
  if raw ? 'timer' then
    if raw->>'timer' not in ('on', 'off') then raise exception 'timer must be on or off'; end if;
    out := out || jsonb_build_object('timer', raw->'timer');
  end if;
  if raw ? 'extra_time' then
    if jsonb_typeof(raw->'extra_time') <> 'number' or (raw->>'extra_time')::numeric not in (1, 1.5, 2, 3) then
      raise exception 'extra_time must be 1, 1.5, 2 or 3';
    end if;
    out := out || jsonb_build_object('extra_time', raw->'extra_time');
  end if;
  foreach k in array array['allow_change', 'shuffle_questions', 'shuffle_answers', 'show_correct', 'show_leaderboard'] loop
    if raw ? k then
      if jsonb_typeof(raw->k) <> 'boolean' then raise exception '% must be true or false', k; end if;
      out := out || jsonb_build_object(k, raw->k);
    end if;
  end loop;
  return out;
end $$;

-- seconds a question stays open, null when the timer is off
create or replace function _limit(q jsonb, st jsonb) returns int language sql immutable as $$
  select case when st->>'timer' = 'off' then null
              else ceil((q->>'time_limit_s')::numeric * (st->>'extra_time')::numeric)::int end
$$;

create or replace function _clamp(v jsonb, lo int, hi int, d int) returns int language sql immutable as $$
  select case when jsonb_typeof(v) = 'number' then least(hi, greatest(lo, round((v #>> '{}')::numeric)))::int else d end
$$;

create or replace function _is_idx(v jsonb, n int) returns boolean language sql immutable as $$
  select jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric = floor((v #>> '{}')::numeric)
         and (v #>> '{}')::numeric >= 0 and (v #>> '{}')::numeric < n
$$;

create or replace function _parse_question(raw jsonb, n int) returns jsonb language plpgsql immutable as $$
declare
  lbl text := 'Question ' || (n + 1);
  t text := raw->>'type';
  prompt text := left(btrim(coalesce(raw->>'prompt', '')), 1000);
  image text := left(btrim(coalesce(raw->>'image_url', '')), 500);
  opts jsonb := '[]'; corr jsonb := '[]'; o jsonb; c jsonb; idx int[];
  cnt int;
begin
  if jsonb_typeof(raw) <> 'object' or t is null or t not in ('mcq','multi','poll','fill','open') then
    raise exception '%: unknown type', lbl;
  end if;
  if prompt = '' then raise exception '%: write the question', lbl; end if;
  if image <> '' and image !~* '^https://' then raise exception '%: image must be an https link', lbl; end if;
  if t in ('mcq', 'multi', 'poll') then
    if jsonb_typeof(raw->'options') <> 'array' then raise exception '%: give 2 to 6 answers, none empty', lbl; end if;
    select coalesce(jsonb_agg(to_jsonb(left(btrim(e #>> '{}'), 200))), '[]') into opts
      from jsonb_array_elements(raw->'options') e where jsonb_typeof(e) = 'string';
    cnt := jsonb_array_length(raw->'options');
    if jsonb_array_length(opts) <> cnt or cnt < 2 or cnt > 6
       or exists (select 1 from jsonb_array_elements_text(opts) x where x = '') then
      raise exception '%: give 2 to 6 answers, none empty', lbl;
    end if;
    if t <> 'poll' then
      select coalesce(array_agg(distinct (e #>> '{}')::int order by (e #>> '{}')::int), '{}') into idx
        from jsonb_array_elements(case when jsonb_typeof(raw->'correct') = 'array' then raw->'correct' else '[]' end) e
        where _is_idx(e, cnt);
      if coalesce(array_length(idx, 1), 0) = 0 or (t = 'mcq' and array_length(idx, 1) <> 1) then
        raise exception '%: mark % correct answer', lbl, case when t = 'mcq' then 'exactly one' else 'at least one' end;
      end if;
      corr := to_jsonb(idx);
    end if;
  elsif t = 'fill' then
    select coalesce(jsonb_agg(to_jsonb(s)), '[]') into corr from (
      select left(btrim(e #>> '{}'), 200) s
        from jsonb_array_elements(case when jsonb_typeof(raw->'correct') = 'array' then raw->'correct' else '[]' end) e
        where jsonb_typeof(e) = 'string' and btrim(e #>> '{}') <> '' limit 20) z;
    if jsonb_array_length(corr) = 0 then raise exception '%: add at least one accepted answer', lbl; end if;
  end if;
  return jsonb_build_object(
    'type', t, 'prompt', prompt, 'image_url', nullif(image, ''), 'options', opts, 'correct', corr,
    'points', _clamp(raw->'points', 0, 10000, 1000), 'time_limit_s', _clamp(raw->'time_limit_s', 5, 300, 20));
end $$;

create or replace function _norm(s text) returns text language sql immutable as $$
  select lower(regexp_replace(btrim(s), '\s+', ' ', 'g'))
$$;

-- stored answer and whether it was right (null = not scored); raises on a bad shape
create or replace function _grade(q jsonb, ans jsonb, out stored jsonb, out correct boolean) language plpgsql immutable as $$
declare t text := q->>'type'; n int := jsonb_array_length(q->'options'); a jsonb;
begin
  if t in ('mcq', 'poll') then
    if not _is_idx(ans, n) then raise exception 'Invalid answer'; end if;
    stored := ans;
    correct := case when t = 'mcq' then (q->'correct'->0) = ans else null end;
  elsif t = 'multi' then
    if jsonb_typeof(ans) <> 'array' or jsonb_array_length(ans) = 0
       or exists (select 1 from jsonb_array_elements(ans) e where not _is_idx(e, n)) then
      raise exception 'Invalid answer';
    end if;
    select jsonb_agg(v order by v) into a from (select distinct (e #>> '{}')::int v from jsonb_array_elements(ans) e) z;
    stored := a;
    correct := a = (q->'correct');
  elsif t = 'fill' then
    if jsonb_typeof(ans) <> 'string' or btrim(ans #>> '{}') = '' or length(ans #>> '{}') > 200 then
      raise exception 'Invalid answer';
    end if;
    stored := to_jsonb(btrim(ans #>> '{}'));
    correct := exists (select 1 from jsonb_array_elements_text(q->'correct') c where _norm(c) = _norm(ans #>> '{}'));
  else
    if jsonb_typeof(ans) <> 'string' or btrim(ans #>> '{}') = '' or length(ans #>> '{}') > 500 then
      raise exception 'Invalid answer';
    end if;
    stored := to_jsonb(btrim(ans #>> '{}'));
    correct := null;
  end if;
end $$;

-- full points for an instant answer, down to half for the last second. No timer: flat points
create or replace function _score(q jsonb, correct boolean, elapsed_ms numeric, limit_s int) returns int language sql immutable as $$
  select case when not coalesce(correct, false) then 0
              when limit_s is null then (q->>'points')::int
              else round((q->>'points')::numeric * (0.5 + 0.5 * greatest(0, 1 - elapsed_ms / (limit_s * 1000.0))))::int end
$$;

create or replace function _closed(s game_sessions) returns boolean language sql stable as $$
  select s.status = 'ended' or (s.deadline is not null and s.deadline <= now())
$$;

create or replace function _ident(n int) returns int[] language sql immutable as $$
  select coalesce(array_agg(i order by i), '{}'::int[]) from generate_series(0, n - 1) i
$$;

-- displayed option position -> real option index
create or replace function _opt_order(pid uuid, att int, real_idx int, n int, st jsonb) returns int[] language sql immutable as $$
  select case when (st->>'shuffle_answers')::boolean then _perm(n, pid || ':' || att || ':' || real_idx || ':o') else _ident(n) end
$$;

-- student-paced games may give every student their own question order; a teacher-paced order is shared
-- and was shuffled once into the snapshot when the game was made
create or replace function _q_order(pid uuid, att int, total int, st jsonb, teacher_paced boolean) returns int[] language sql immutable as $$
  select case when not teacher_paced and (st->>'shuffle_questions')::boolean
              then _perm(total, pid || ':' || att || ':q') else _ident(total) end
$$;

-- answer as sent (displayed positions) -> real indexes; bad shapes pass through so _grade rejects them
create or replace function _to_real(q jsonb, ans jsonb, ord int[]) returns jsonb language plpgsql immutable as $$
declare n int := jsonb_array_length(q->'options'); t text := q->>'type';
begin
  if t in ('mcq', 'poll') and _is_idx(ans, n) then
    return to_jsonb(ord[(ans #>> '{}')::int + 1]);
  elsif t = 'multi' and jsonb_typeof(ans) = 'array'
        and not exists (select 1 from jsonb_array_elements(ans) e where not _is_idx(e, n)) then
    return (select coalesce(jsonb_agg(to_jsonb(ord[(e #>> '{}')::int + 1])), '[]') from jsonb_array_elements(ans) e);
  end if;
  return ans;
end $$;

-- real indexes -> displayed positions, for showing a stored or right answer back to the student
create or replace function _to_shown(q jsonb, rv jsonb, ord int[]) returns jsonb language plpgsql immutable as $$
declare t text := q->>'type';
begin
  if t in ('mcq', 'poll') and jsonb_typeof(rv) = 'number' then
    return to_jsonb(array_position(ord, (rv #>> '{}')::int) - 1);
  elsif t = 'multi' and jsonb_typeof(rv) = 'array' then
    return (select coalesce(jsonb_agg(to_jsonb(array_position(ord, (e #>> '{}')::int) - 1)
                                      order by array_position(ord, (e #>> '{}')::int)), '[]')
            from jsonb_array_elements(rv) e);
  end if;
  return rv;
end $$;

-- the right answer as the student's screen counts it
create or replace function _shown_correct(q jsonb, ord int[]) returns jsonb language plpgsql immutable as $$
begin
  if q->>'type' = 'mcq' then return jsonb_build_array(_to_shown(q, q->'correct'->0, ord)); end if;
  if q->>'type' = 'multi' then return _to_shown(q, q->'correct', ord); end if;
  return q->'correct';
end $$;

-- ---------------------------------------------------------------- teacher: quizzes

create or replace function quiz_list(p_q text default '') returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := _teacher(); pat text := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  return (select coalesce(jsonb_agg(to_jsonb(r) order by r.updated_at desc), '[]') from (
    select z.id, z.title, z.subject, z.updated_at, (select count(*)::int from questions where quiz_id = z.id) as question_count
    from quizzes z where z.owner_id = me and (coalesce(p_q, '') = '' or z.title ilike pat)
    order by z.updated_at desc limit 200) r);
end $$;

create or replace function quiz_get(p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := _teacher(); z quizzes;
begin
  select * into z from quizzes where id = p_id and owner_id = me;
  if not found then raise exception 'Quiz not found'; end if;
  return jsonb_build_object('id', z.id, 'title', z.title, 'subject', z.subject, 'questions',
    (select coalesce(jsonb_agg(jsonb_build_object('type', type, 'prompt', prompt, 'image_url', image_url, 'options', options,
       'correct', correct, 'points', points, 'time_limit_s', time_limit_s) order by position), '[]')
     from questions where quiz_id = z.id));
end $$;

-- create (p_id null) or replace a quiz and its questions
create or replace function quiz_save(p_id uuid, p_quiz jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := _teacher(); v_title text := left(btrim(coalesce(p_quiz->>'title', '')), 200);
  v_subject text := left(btrim(coalesce(p_quiz->>'subject', '')), 100);
  qs jsonb; qid uuid := p_id; i int; q jsonb;
begin
  if v_title = '' then raise exception 'Give the quiz a title'; end if;
  if jsonb_typeof(p_quiz->'questions') <> 'array' or jsonb_array_length(p_quiz->'questions') = 0 then
    raise exception 'Add at least one question';
  end if;
  if jsonb_array_length(p_quiz->'questions') > 100 then raise exception 'At most 100 questions'; end if;
  select jsonb_agg(_parse_question(e, (ord - 1)::int) order by ord) into qs
    from jsonb_array_elements(p_quiz->'questions') with ordinality as t(e, ord);
  if p_id is null then
    insert into quizzes (owner_id, title, subject) values (me, v_title, v_subject) returning id into qid;
  else
    update quizzes set title = v_title, subject = v_subject, updated_at = now() where id = p_id and owner_id = me;
    if not found then raise exception 'Quiz not found'; end if;
    delete from questions where quiz_id = p_id;
  end if;
  for i in 0 .. jsonb_array_length(qs) - 1 loop
    q := qs->i;
    insert into questions (quiz_id, position, type, prompt, image_url, options, correct, points, time_limit_s)
      values (qid, i, q->>'type', q->>'prompt', q->>'image_url', q->'options', q->'correct',
              (q->>'points')::int, (q->>'time_limit_s')::int);
  end loop;
  return qid;
end $$;

create or replace function quiz_rename(p_id uuid, p_title text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := _teacher(); t text := left(btrim(coalesce(p_title, '')), 200);
begin
  if t = '' then raise exception 'Give the quiz a title'; end if;
  update quizzes set title = t, updated_at = now() where id = p_id and owner_id = me;
  if not found then raise exception 'Quiz not found'; end if;
  return jsonb_build_object('id', p_id, 'title', t);
end $$;

create or replace function quiz_duplicate(p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := _teacher(); n quizzes;
begin
  insert into quizzes (owner_id, title, subject)
    select owner_id, left('Copy of ' || title, 200), subject from quizzes where id = p_id and owner_id = me
    returning * into n;
  if n.id is null then raise exception 'Quiz not found'; end if;
  insert into questions (quiz_id, position, type, prompt, image_url, options, correct, points, time_limit_s)
    select n.id, position, type, prompt, image_url, options, correct, points, time_limit_s from questions where quiz_id = p_id;
  return jsonb_build_object('id', n.id, 'title', n.title);
end $$;

create or replace function quiz_delete(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := _teacher();
begin
  delete from quizzes where id = p_id and owner_id = me;
  if not found then raise exception 'Quiz not found'; end if;
end $$;

-- ---------------------------------------------------------------- teacher: games

create or replace function session_create(p_quiz uuid, p_opts jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := _teacher(); z quizzes; v_kind text := p_opts->>'kind'; v_pacing text; dl timestamptz; att int := 1;
  st jsonb; snap jsonb; n int; v_code text; sid uuid; ms numeric;
begin
  if v_kind is null or v_kind not in ('live', 'homework') then raise exception 'kind must be live or homework'; end if;
  if p_opts ? 'mode' and p_opts->>'mode' <> 'classic' then raise exception 'Only classic mode is available'; end if;
  v_pacing := case when v_kind = 'homework' or p_opts->>'pacing' = 'student' then 'student' else 'teacher' end;
  st := _parse_settings(p_opts->'settings');
  if v_kind = 'homework' then
    begin
      dl := (p_opts->>'deadline')::timestamptz;
    exception when others then dl := null;
    end;
    if dl is null then raise exception 'Pick a deadline in the future'; end if;
    ms := extract(epoch from (dl - now())) * 1000;
    if ms < 60000 then raise exception 'Pick a deadline in the future'; end if;
    if ms > 2592000000 then raise exception 'Deadline can be at most 30 days away'; end if;
    att := _clamp(p_opts->'attempts', 1, 10, 1);
  end if;
  select * into z from quizzes where id = p_quiz and owner_id = me;
  if not found then raise exception 'Quiz not found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('type', type, 'prompt', prompt, 'image_url', image_url, 'options', options,
           'correct', correct, 'points', points, 'time_limit_s', time_limit_s) order by position), '[]') into snap
    from questions where quiz_id = z.id;
  n := jsonb_array_length(snap);
  if n = 0 then raise exception 'Quiz has no questions'; end if;
  if v_pacing = 'teacher' and (st->>'shuffle_questions')::boolean then
    select jsonb_agg(snap->(o) order by ord) into snap
      from unnest(_perm(n, gen_random_uuid()::text)) with ordinality as t(o, ord);
  end if;
  for i in 1 .. 10 loop
    v_code := (100000 + (('x' || substr(md5(gen_random_uuid()::text), 1, 7))::bit(28)::int % 900000))::text;
    begin
      insert into game_sessions (quiz_id, host_id, code, title, snapshot, kind, pacing, deadline, attempts_allowed, status, settings)
        values (z.id, me, v_code, z.title, snap, v_kind, v_pacing, dl, att,
                case when v_kind = 'homework' then 'running' else 'lobby' end, st)
        returning id into sid;
      return jsonb_build_object('id', sid, 'code', v_code);
    exception when unique_violation then null;
    end;
  end loop;
  raise exception 'Could not allocate a join code, try again';
end $$;

create or replace function session_host_state(p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := _teacher(); s game_sessions; st jsonb; total int; live boolean; cur jsonb;
  lim int; left_s int; v_counts jsonb := null; v_texts jsonb := '[]'; players jsonb; n int;
begin
  select * into s from game_sessions where id = p_id and host_id = me;
  if not found then raise exception 'Session not found'; end if;
  st := _settings(s.settings);
  total := jsonb_array_length(s.snapshot);
  live := s.pacing = 'teacher' and s.status = 'running' and s.current_index >= 0;
  if live then cur := s.snapshot->s.current_index; end if;

  if live then
    lim := _limit(cur, st);
    left_s := case when lim is null or s.question_started_at is null then null
                   else greatest(0, ceil(lim - extract(epoch from (now() - s.question_started_at))))::int end;
    n := jsonb_array_length(cur->'options');
    if cur->>'type' in ('mcq', 'multi', 'poll') then
      select jsonb_agg(c order by i) into v_counts from (
        select i, (select count(*) from responses r join participants p on p.id = r.participant_id
                   where p.session_id = s.id and r.q_index = s.current_index and r.attempt = p.attempt
                     and (r.answer = to_jsonb(i) or (jsonb_typeof(r.answer) = 'array' and r.answer @> to_jsonb(i)))) c
        from generate_series(0, n - 1) i) z;
    else
      select coalesce(jsonb_agg(a), '[]') into v_texts from (
        select r.answer a from responses r join participants p on p.id = r.participant_id
        where p.session_id = s.id and r.q_index = s.current_index and r.attempt = p.attempt limit 100) z;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('name', display_name, 'score', score, 'finished', finished,
           'attempt', attempt, 'answered', answered, 'answered_current', answered_current)
           order by score desc, joined_at), '[]') into players from (
    select p.display_name, p.score, p.finished, p.attempt, p.joined_at,
      (select count(*)::int from responses r where r.participant_id = p.id and r.attempt = p.attempt) as answered,
      exists (select 1 from responses r where r.participant_id = p.id and r.attempt = p.attempt and r.q_index = s.current_index) as answered_current
    from participants p where p.session_id = s.id order by p.score desc, p.joined_at limit 500) z;

  return jsonb_build_object(
    'session', jsonb_build_object('id', s.id, 'code', s.code, 'title', s.title, 'kind', s.kind, 'pacing', s.pacing,
       'status', s.status, 'closed', _closed(s), 'deadline', s.deadline, 'attempts_allowed', s.attempts_allowed,
       'current_index', s.current_index, 'total', total),
    'question', case when live then cur else null end,
    'secondsLeft', left_s,
    'settings', st,
    'counts', v_counts,
    'texts', v_texts,
    'players', players);
end $$;

-- start, next or end a game. p_index is the question the host was looking at, so a double click advances once
create or replace function session_action(p_id uuid, p_action text, p_index int default null) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := _teacher(); s game_sessions; total int; expected int;
begin
  select * into s from game_sessions where id = p_id and host_id = me for update;
  if not found then raise exception 'Session not found'; end if;
  total := jsonb_array_length(s.snapshot);
  if p_action = 'start' then
    if s.status <> 'lobby' then raise exception 'Already started'; end if;
    if s.pacing = 'teacher' then
      update game_sessions set status = 'running', current_index = 0, question_started_at = now() where id = s.id;
    else
      update game_sessions set status = 'running' where id = s.id;
    end if;
  elsif p_action = 'next' then
    if s.pacing <> 'teacher' or s.status <> 'running' then raise exception 'Not running'; end if;
    expected := coalesce(p_index, s.current_index);
    if expected <> s.current_index then return; end if;
    if expected = total - 1 then
      update game_sessions set status = 'ended', ended_at = now() where id = s.id;
    else
      update game_sessions set current_index = current_index + 1, question_started_at = now() where id = s.id;
    end if;
  elsif p_action = 'end' then
    update game_sessions set status = 'ended', ended_at = now() where id = s.id and status <> 'ended';
  else
    raise exception 'Unknown action';
  end if;
end $$;

create or replace function session_report(p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := _teacher(); s game_sessions; students jsonb; qs jsonb;
begin
  select * into s from game_sessions where id = p_id and host_id = me;
  if not found then raise exception 'Session not found'; end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.score desc, r.joined_at), '[]') into students from (
    select p.display_name as name, p.score, p.attempt, p.finished, p.joined_at,
           count(r.id)::int as answered, (count(*) filter (where r.correct))::int as correct
    from participants p left join responses r on r.participant_id = p.id and r.attempt = p.attempt
    where p.session_id = s.id group by p.id) r;
  select coalesce(jsonb_agg(jsonb_build_object(
      'index', i - 1, 'type', q->>'type', 'prompt', q->>'prompt', 'options', q->'options', 'correct', q->'correct',
      'answered', a.answered, 'correct_pct', a.pct, 'avg_time_s', a.avg_s,
      'counts', case when jsonb_array_length(q->'options') = 0 then '[]'::jsonb else (
          select jsonb_agg((select count(*) from responses r join participants p on p.id = r.participant_id
                            where p.session_id = s.id and r.q_index = i - 1 and r.attempt = p.attempt
                              and (r.answer = to_jsonb(o) or (jsonb_typeof(r.answer) = 'array' and r.answer @> to_jsonb(o)))) order by o)
          from generate_series(0, jsonb_array_length(q->'options') - 1) o) end,
      'texts', case when q->>'type' in ('open', 'fill') then (
          select coalesce(jsonb_agg(x.answer), '[]') from (
            select r.answer from responses r join participants p on p.id = r.participant_id
            where p.session_id = s.id and r.q_index = i - 1 and r.attempt = p.attempt limit 200) x) else '[]'::jsonb end)
    order by i), '[]') into qs
  from jsonb_array_elements(s.snapshot) with ordinality as t(q, i)
  cross join lateral (
    select count(*)::int as answered,
           case when count(*) filter (where r.correct is not null) = 0 then null
                else round(100.0 * count(*) filter (where r.correct) / count(*) filter (where r.correct is not null))::int end as pct,
           case when count(*) = 0 then null else round(avg(r.time_ms) / 100.0) / 10 end as avg_s
    from responses r join participants p on p.id = r.participant_id
    where p.session_id = s.id and r.q_index = i - 1 and r.attempt = p.attempt) a;
  return jsonb_build_object(
    'session', jsonb_build_object('id', s.id, 'title', s.title, 'kind', s.kind, 'status', s.status, 'code', s.code,
       'total', jsonb_array_length(s.snapshot), 'created_at', s.created_at),
    'students', students, 'questions', qs);
end $$;

create or replace function session_list() returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := _teacher();
begin
  return (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]') from (
    select s.id, s.title, s.code, s.kind, s.status, s.deadline, s.attempts_allowed, s.created_at,
      (select count(*)::int from participants p where p.session_id = s.id) as players,
      _closed(s) as closed
    from game_sessions s where s.host_id = me order by s.created_at desc limit 100) r);
end $$;

-- removes the account, and with it every quiz, game, student and answer (all cascade from auth.users)
create or replace function account_delete(p_confirm text) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := _teacher(); mail text := coalesce(auth.jwt() ->> 'email', '');
begin
  if mail = '' or lower(btrim(coalesce(p_confirm, ''))) <> lower(mail) then
    raise exception 'Type your email address to confirm';
  end if;
  delete from auth.users where id = me;
end $$;

-- ---------------------------------------------------------------- students

create or replace function game_join(p_code text, p_name text) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := _uid(); v_code text := regexp_replace(coalesce(p_code, ''), '\s', '', 'g');
  nm text := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 40);
  s game_sessions; p participants;
begin
  delete from join_failures where at < now() - interval '1 minute';
  if (select count(*) from join_failures where user_id = me) >= 10 then
    return jsonb_build_object('error', 'Too many wrong codes, wait a minute');
  end if;
  -- failures are returned, not raised: a raise would roll back the row that counts them
  if v_code !~ '^\d{6}$' then
    insert into join_failures (user_id) values (me);
    return jsonb_build_object('error', 'Codes are 6 digits');
  end if;
  if nm = '' then raise exception 'Enter your name'; end if;
  select * into s from game_sessions where code = v_code and status <> 'ended';
  if not found or _closed(s) then
    insert into join_failures (user_id) values (me);
    return jsonb_build_object('error', 'No open game with that code');
  end if;

  select * into p from participants where session_id = s.id and user_id = me for update;
  if found then
    -- the same person coming back: resume, or start the next attempt of a finished homework
    if s.kind = 'homework' and p.finished and p.attempt < s.attempts_allowed then
      update participants set attempt = attempt + 1, score = 0, finished = false, current_index = 0, question_started_at = null
        where id = p.id;
    end if;
  else
    if exists (select 1 from participants where session_id = s.id and lower(display_name) = lower(nm)) then
      raise exception 'That name is taken in this game';
    end if;
    insert into participants (session_id, user_id, display_name) values (s.id, me, nm) returning * into p;
  end if;
  return jsonb_build_object('sessionId', s.id, 'participantId', p.id, 'title', s.title);
end $$;

create or replace function game_state(p_session uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := _uid(); s game_sessions; p participants; st jsonb; total int; is_closed boolean; teacher boolean;
  pos int := -1; started timestamptz := null; ord int[]; ri int := -1; q jsonb; lim int; left_s int; opts int[];
  r responses; open_q boolean; hold boolean := false; answered jsonb := null; shown jsonb; v_rank int; board jsonb := '[]';
  show_board boolean; sc int;
begin
  select * into s from game_sessions where id = p_session;
  if not found then raise exception 'Join the game first'; end if;
  select * into p from participants where session_id = s.id and user_id = me;
  if not found then raise exception 'Join the game first'; end if;
  st := _settings(s.settings);
  total := jsonb_array_length(s.snapshot);
  is_closed := _closed(s);
  teacher := s.pacing = 'teacher';
  show_board := (st->>'show_leaderboard')::boolean;

  if s.status = 'running' and not is_closed and not p.finished then
    if teacher then
      pos := s.current_index; started := s.question_started_at;
    else
      pos := p.current_index;
      if pos < total and p.question_started_at is null then
        update participants set question_started_at = now() where id = p.id returning question_started_at into started;
      else
        started := p.question_started_at;
      end if;
    end if;
  end if;

  ord := _q_order(p.id, p.attempt, total, st, teacher);
  if pos >= 0 and pos < total then ri := ord[pos + 1]; end if;
  if ri >= 0 then
    q := s.snapshot->ri;
    lim := _limit(q, st);
    left_s := case when lim is null or started is null then null
                   else greatest(0, ceil(lim - extract(epoch from (now() - started))))::int end;
    opts := _opt_order(p.id, p.attempt, ri, jsonb_array_length(q->'options'), st);
    select * into r from responses where participant_id = p.id and attempt = p.attempt and q_index = ri;
  end if;

  -- while a changeable answer is still open, say "saved" and nothing about right or wrong
  open_q := teacher and q is not null and (lim is null or coalesce(left_s, 0) > 0);
  hold := r.id is not null and (st->>'allow_change')::boolean and open_q;
  if r.id is not null then
    shown := _to_shown(q, r.answer, opts);
    answered := case when hold then jsonb_build_object('saved', true, 'answer', shown)
      else jsonb_build_object('saved', false, 'correct', r.correct, 'points', r.points, 'answer', shown,
             'correctAnswer', case when (st->>'show_correct')::boolean then _shown_correct(q, opts) else null end) end;
  end if;

  sc := p.score - case when hold then r.points else 0 end;
  select count(*)::int + 1 into v_rank from participants where session_id = s.id and score > p.score;
  if show_board then
    select coalesce(jsonb_agg(jsonb_build_object('name', display_name, 'score', score) order by score desc, joined_at), '[]')
      into board from (select display_name, score, joined_at from participants where session_id = s.id
                       order by score desc, joined_at limit 5) z;
  end if;

  return jsonb_build_object(
    'session', jsonb_build_object('title', s.title, 'kind', s.kind, 'pacing', s.pacing, 'status', s.status, 'closed', is_closed,
       'total', total, 'deadline', s.deadline, 'allow_change', (st->>'allow_change')::boolean, 'show_leaderboard', show_board),
    'me', jsonb_build_object('name', p.display_name, 'score', sc, 'attempt', p.attempt, 'finished', p.finished,
       'rank', case when show_board and not hold then to_jsonb(v_rank) else null end),
    'index', pos,
    'question', case when q is null then null else jsonb_build_object(
       'type', q->>'type', 'prompt', q->>'prompt', 'image_url', q->'image_url', 'points', q->'points',
       'time_limit_s', lim,
       'options', (select coalesce(jsonb_agg(q->'options'->(o) order by ord_i), '[]') from unnest(opts) with ordinality as t(o, ord_i))) end,
    'secondsLeft', left_s,
    'timerOff', st->>'timer' = 'off',
    'answered', answered,
    'leaderboard', board);
end $$;

create or replace function game_answer(p_session uuid, p_index int, p_answer jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := _uid(); s game_sessions; p participants; st jsonb; total int; teacher boolean; pos int; started timestamptz;
  ord int[]; ri int; q jsonb; opts int[]; lim int; g record; elapsed numeric; late boolean; can_change boolean; closed_q boolean;
  old responses; pts int; right_ boolean;
begin
  select * into s from game_sessions where id = p_session;
  if not found then raise exception 'Join the game first'; end if;
  select * into p from participants where session_id = s.id and user_id = me for update; -- one answer at a time
  if not found then raise exception 'Join the game first'; end if;
  st := _settings(s.settings);
  if s.status <> 'running' or _closed(s) then raise exception 'This game is not accepting answers'; end if;
  total := jsonb_array_length(s.snapshot);
  teacher := s.pacing = 'teacher';
  pos := case when teacher then s.current_index else p.current_index end;
  if p_index is distinct from pos or pos < 0 or pos >= total then raise exception 'That question is not open'; end if;
  started := case when teacher then s.question_started_at else p.question_started_at end;
  if started is null then raise exception 'That question is not open'; end if;

  ord := _q_order(p.id, p.attempt, total, st, teacher);
  ri := ord[pos + 1];
  q := s.snapshot->ri;
  opts := _opt_order(p.id, p.attempt, ri, jsonb_array_length(q->'options'), st);
  lim := _limit(q, st);
  select * into g from _grade(q, _to_real(q, p_answer, opts));
  elapsed := greatest(0, extract(epoch from (now() - started)) * 1000);
  late := lim is not null and elapsed > lim * 1000 + 2000;     -- a first answer gets slack for a slow network
  can_change := teacher and (st->>'allow_change')::boolean;
  closed_q := lim is not null and elapsed >= lim * 1000;       -- a change must land before the verdict shows

  select * into old from responses where participant_id = p.id and q_index = ri and attempt = p.attempt;
  if old.id is not null and (not can_change or closed_q) then
    pts := old.points; right_ := old.correct;
  else
    right_ := case when late and g.correct is not null then false else g.correct end;
    pts := case when late then 0 else _score(q, g.correct, elapsed, lim) end;
    if old.id is null then
      insert into responses (participant_id, q_index, attempt, answer, correct, time_ms, points)
        values (p.id, ri, p.attempt, g.stored, right_, least(elapsed, 2000000)::int, pts);
      if teacher then
        update participants set score = score + pts where id = p.id;
      else
        update participants set score = score + pts, current_index = pos + 1, question_started_at = null,
          finished = (pos + 1 >= total) where id = p.id;
      end if;
    else
      update responses set answer = g.stored, correct = right_, time_ms = least(elapsed, 2000000)::int, points = pts
        where id = old.id;
      update participants set score = score + pts - old.points where id = p.id;
    end if;
    -- a changeable answer says "saved" until the question closes; no hint of right or wrong
    if can_change and not late then return jsonb_build_object('saved', true); end if;
  end if;

  return jsonb_build_object(
    'saved', false, 'correct', right_, 'points', pts, 'timedOut', late,
    'correctAnswer', case when (st->>'show_correct')::boolean then _shown_correct(q, opts) else null end,
    'done', not teacher and pos + 1 >= total);
end $$;

-- ---------------------------------------------------------------- who may call what

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  quiz_list(text), quiz_get(uuid), quiz_save(uuid, jsonb), quiz_rename(uuid, text), quiz_duplicate(uuid), quiz_delete(uuid),
  session_create(uuid, jsonb), session_host_state(uuid), session_action(uuid, text, int), session_report(uuid), session_list(),
  account_delete(text), game_join(text, text), game_state(uuid), game_answer(uuid, int, jsonb)
to authenticated;
